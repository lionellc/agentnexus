use std::{
    collections::HashMap,
    io::{BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::{error::AppError, utils::now_rfc3339};

use super::{
    validation::{contains_forbidden_exec_pattern, truncate_text, validate_args_template},
    LocalAgentProfileDto, TranslationExecutionResult, BUILTIN_CODEX, CODEX_JSON_MODE_FLAG,
    CODEX_SKIP_GIT_REPO_CHECK_FLAG, FORMAT_PRESERVATION_RULE, MAX_STD_STREAM_BYTES,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalAgentTranslationStreamEvent {
    request_id: String,
    stream: String,
    chunk: String,
    done: bool,
    ts: String,
}

#[derive(Clone)]
pub(super) struct StreamSink {
    app: AppHandle,
    request_id: String,
}

impl StreamSink {
    pub(super) fn new(app: AppHandle, request_id: String) -> Self {
        Self { app, request_id }
    }

    pub(super) fn emit(&self, stream: &str, chunk: impl Into<String>, done: bool) {
        let payload = LocalAgentTranslationStreamEvent {
            request_id: self.request_id.clone(),
            stream: stream.to_string(),
            chunk: chunk.into(),
            done,
            ts: now_rfc3339(),
        };
        let _ = self.app.emit("local-agent-translation-stream", payload);
    }
}

enum StreamChunk {
    Stdout(String),
    Stderr(String),
}

fn spawn_stream_reader<R: Read + Send + 'static>(
    stream_name: &'static str,
    reader: R,
    tx: mpsc::Sender<StreamChunk>,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let mut reader = BufReader::new(reader);
        let mut buffer = [0_u8; 1024];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(size) => {
                    let chunk = String::from_utf8_lossy(&buffer[..size]).to_string();
                    let payload = match stream_name {
                        "stdout" => StreamChunk::Stdout(chunk),
                        _ => StreamChunk::Stderr(chunk),
                    };
                    if tx.send(payload).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    })
}

fn append_capped(buffer: &mut String, chunk: &str, limit: usize) {
    if chunk.is_empty() || buffer.len() >= limit {
        return;
    }
    let remaining = limit - buffer.len();
    if remaining == 0 {
        return;
    }
    buffer.push_str(&truncate_text(chunk, remaining));
}

pub(super) fn execute_translation(
    profile: &LocalAgentProfileDto,
    payload: &str,
    timeout_seconds: u64,
    target_language: &str,
    stream_sink: Option<&StreamSink>,
) -> Result<TranslationExecutionResult, AppError> {
    validate_args_template(&profile.args_template)?;

    let args = apply_execution_compatibility(
        &profile.profile_key,
        render_args_template(&profile.args_template, payload, target_language),
    );
    for arg in &args {
        if contains_forbidden_exec_pattern(arg) {
            return Err(AppError::new(
                "AGENT_EXEC_FORBIDDEN",
                "参数模板命中安全策略，已拒绝执行",
            ));
        }
    }

    let mut safe_env = collect_safe_env();
    append_cli_path_fallbacks(&mut safe_env);
    let resolved_executable = resolve_executable_path(profile.executable.trim(), &safe_env);
    let mut command = Command::new(&resolved_executable);
    for arg in &args {
        command.arg(arg);
    }
    prepend_executable_parent_to_path(&mut safe_env, profile.executable.trim());
    prepend_executable_parent_to_path(&mut safe_env, &resolved_executable);
    command
        .current_dir(std::env::temp_dir())
        .env_clear()
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    for (key, value) in safe_env {
        command.env(key, value);
    }

    let mut child = command.spawn().map_err(map_spawn_error)?;
    if let Some(sink) = stream_sink {
        sink.emit("lifecycle", "started", false);
    }

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(payload.as_bytes())
            .map_err(|err| AppError::new("AGENT_EXEC_FAILED", format!("写入 stdin 失败: {err}")))?;
    }

    let stdout_pipe = child.stdout.take();
    let stderr_pipe = child.stderr.take();
    let (tx, rx) = mpsc::channel::<StreamChunk>();
    let mut stdout_join = stdout_pipe.map(|pipe| spawn_stream_reader("stdout", pipe, tx.clone()));
    let mut stderr_join = stderr_pipe.map(|pipe| spawn_stream_reader("stderr", pipe, tx.clone()));
    drop(tx);

    let mut stdout = String::new();
    let mut stderr = String::new();
    let mut handle_stream_chunk = |chunk: StreamChunk| match chunk {
        StreamChunk::Stdout(text) => {
            append_capped(&mut stdout, &text, MAX_STD_STREAM_BYTES);
            if let Some(sink) = stream_sink {
                sink.emit("stdout", text, false);
            }
        }
        StreamChunk::Stderr(text) => {
            append_capped(&mut stderr, &text, MAX_STD_STREAM_BYTES);
            if let Some(sink) = stream_sink {
                sink.emit("stderr", text, false);
            }
        }
    };

    let started = Instant::now();
    let mut last_progress_emit = Instant::now();
    let status = loop {
        while let Ok(chunk) = rx.try_recv() {
            handle_stream_chunk(chunk);
        }
        if let Some(sink) = stream_sink {
            if last_progress_emit.elapsed() >= Duration::from_millis(500) {
                sink.emit(
                    "lifecycle",
                    format_running_duration(started.elapsed()),
                    false,
                );
                last_progress_emit = Instant::now();
            }
        }

        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {
                if started.elapsed() >= Duration::from_secs(timeout_seconds) {
                    let _ = child.kill();
                    let _ = child.wait();
                    while let Ok(chunk) = rx.try_recv() {
                        handle_stream_chunk(chunk);
                    }
                    if let Some(join) = stdout_join.take() {
                        let _ = join.join();
                    }
                    if let Some(join) = stderr_join.take() {
                        let _ = join.join();
                    }
                    while let Ok(chunk) = rx.try_recv() {
                        handle_stream_chunk(chunk);
                    }
                    if let Some(sink) = stream_sink {
                        sink.emit("lifecycle", "timeout", true);
                    }
                    return Err(AppError::new("AGENT_TIMEOUT", "本地 Agent 执行超时"));
                }
                thread::sleep(Duration::from_millis(25));
            }
            Err(err) => {
                if let Some(sink) = stream_sink {
                    sink.emit("lifecycle", format!("wait-error: {err}"), true);
                }
                return Err(AppError::new(
                    "AGENT_EXEC_FAILED",
                    format!("等待执行结果失败: {err}"),
                ));
            }
        }
    };
    if let Some(join) = stdout_join.take() {
        let _ = join.join();
    }
    if let Some(join) = stderr_join.take() {
        let _ = join.join();
    }
    while let Ok(chunk) = rx.try_recv() {
        handle_stream_chunk(chunk);
    }

    if !status.success() {
        let lower_stderr = stderr.to_lowercase();
        if lower_stderr.contains("login")
            || lower_stderr.contains("auth")
            || lower_stderr.contains("unauthorized")
            || lower_stderr.contains("not logged")
        {
            if let Some(sink) = stream_sink {
                sink.emit("lifecycle", "auth-required", true);
            }
            return Err(AppError::new(
                "AGENT_AUTH_REQUIRED",
                "本地 Agent 需要登录，请先在终端完成登录后重试",
            ));
        }

        if let Some(sink) = stream_sink {
            sink.emit("lifecycle", "exec-failed", true);
        }
        return Err(AppError::new(
            "AGENT_EXEC_FAILED",
            if stderr.is_empty() {
                "本地 Agent 执行失败，请检查命令模板与安装状态".to_string()
            } else {
                format!("本地 Agent 执行失败: {stderr}")
            },
        ));
    }

    let mut parsed =
        parse_translation_protocol(&stdout, target_language, &stderr).map_err(|err| {
            if let Some(sink) = stream_sink {
                sink.emit("lifecycle", "protocol-invalid", true);
            }
            err
        })?;
    if let Some(sink) = stream_sink {
        sink.emit("lifecycle", "completed", true);
    }
    parsed.stdout_preview = stdout;
    Ok(parsed)
}

pub(super) fn parse_translation_protocol(
    stdout: &str,
    fallback_target_language: &str,
    stderr_preview: &str,
) -> Result<TranslationExecutionResult, AppError> {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Err(AppError::new(
            "AGENT_PROTOCOL_INVALID",
            "本地 Agent 输出为空，无法解析 JSON",
        ));
    }

    let payload = serde_json::from_str::<Value>(trimmed).map_err(|_| {
        let preview = truncate_text(trimmed, 2048);
        AppError::new(
            "AGENT_PROTOCOL_INVALID",
            format!("本地 Agent 输出不是合法 JSON。stdout 预览:\n{}", preview),
        )
    })?;

    let translated_text = payload
        .get("translatedText")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
        .ok_or_else(|| {
            let preview = truncate_text(trimmed, 2048);
            AppError::new(
                "AGENT_PROTOCOL_INVALID",
                format!(
                    "本地 Agent JSON 缺少 translatedText。stdout 预览:\n{}",
                    preview
                ),
            )
        })?;

    let target_language = payload
        .get("targetLanguage")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(fallback_target_language)
        .to_string();

    Ok(TranslationExecutionResult {
        translated_text,
        target_language,
        stdout_preview: String::new(),
        stderr_preview: stderr_preview.to_string(),
    })
}

pub(super) fn build_translation_payload(
    prompt_template: &str,
    source_text: &str,
    target_language: &str,
) -> String {
    let mut vars = HashMap::new();
    vars.insert("source_text", source_text.to_string());
    vars.insert("target_language", target_language.to_string());
    vars.insert(
        "system_prompt",
        "Translate text and return JSON only".to_string(),
    );
    vars.insert(
        "output_schema_json",
        "{\"translatedText\":\"string\",\"targetLanguage\":\"string\"}".to_string(),
    );

    let rendered = render_template(prompt_template, &vars);
    format!("{FORMAT_PRESERVATION_RULE}\n\n{rendered}")
}

fn render_args_template(
    args_template: &[String],
    payload: &str,
    target_language: &str,
) -> Vec<String> {
    let mut vars = HashMap::new();
    vars.insert("source_text", payload.to_string());
    vars.insert("target_language", target_language.to_string());
    vars.insert("system_prompt", payload.to_string());
    vars.insert(
        "output_schema_json",
        "{\"translatedText\":\"string\",\"targetLanguage\":\"string\"}".to_string(),
    );

    args_template
        .iter()
        .map(|item| render_template(item, &vars))
        .collect()
}

pub(super) fn apply_execution_compatibility(
    profile_key: &str,
    mut args: Vec<String>,
) -> Vec<String> {
    if profile_key.trim().eq_ignore_ascii_case(BUILTIN_CODEX) {
        args.retain(|arg| arg.trim() != CODEX_JSON_MODE_FLAG);
        let already_present = args.iter().any(|arg| {
            let trimmed = arg.trim();
            trimmed == CODEX_SKIP_GIT_REPO_CHECK_FLAG
                || trimmed.starts_with(&format!("{CODEX_SKIP_GIT_REPO_CHECK_FLAG}="))
        });
        if !already_present {
            args.push(CODEX_SKIP_GIT_REPO_CHECK_FLAG.to_string());
        }
    }
    args
}

fn render_template(template: &str, variables: &HashMap<&str, String>) -> String {
    let mut output = template.to_string();
    for (key, value) in variables {
        output = output.replace(&format!("{{{{{key}}}}}"), value);
    }
    output
}

fn map_spawn_error(err: std::io::Error) -> AppError {
    match err.kind() {
        std::io::ErrorKind::NotFound => AppError::new(
            "AGENT_UNAVAILABLE",
            "本地 Agent 未安装或不可执行，请检查 executable 配置",
        ),
        std::io::ErrorKind::PermissionDenied => AppError::new(
            "AGENT_UNAVAILABLE",
            "本地 Agent 无执行权限，请检查可执行文件权限",
        ),
        _ => AppError::new("AGENT_EXEC_FAILED", format!("启动本地 Agent 失败: {err}")),
    }
}

fn collect_safe_env() -> Vec<(String, String)> {
    [
        "PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TMP", "TMPDIR", "TEMP",
    ]
    .iter()
    .filter_map(|key| {
        std::env::var(key)
            .ok()
            .filter(|value| !value.trim().is_empty())
            .map(|value| ((*key).to_string(), value))
    })
    .collect()
}

pub(super) fn append_cli_path_fallbacks(env_pairs: &mut Vec<(String, String)>) {
    let home_dir = resolve_home_dir_for_exec(env_pairs);
    let fallback_dirs = cli_fallback_dirs(home_dir.as_ref());
    if fallback_dirs.is_empty() {
        return;
    }

    let mut merged: Vec<PathBuf> = if let Some(path_value) = env_pairs
        .iter()
        .find(|(key, _)| key == "PATH")
        .map(|(_, value)| value.as_str())
    {
        std::env::split_paths(path_value).collect()
    } else {
        Vec::new()
    };

    for dir in fallback_dirs {
        if !merged.iter().any(|existing| existing == &dir) {
            merged.push(dir);
        }
    }

    let next_path = match std::env::join_paths(merged.iter()) {
        Ok(value) => value.to_string_lossy().to_string(),
        Err(_) => return,
    };

    if let Some((_, current)) = env_pairs.iter_mut().find(|(key, _)| key == "PATH") {
        *current = next_path;
    } else {
        env_pairs.push(("PATH".to_string(), next_path));
    }
}

pub(super) fn resolve_executable_path(executable: &str, env_pairs: &[(String, String)]) -> String {
    let executable = executable.trim();
    if executable.is_empty() {
        return String::new();
    }

    let home_dir = resolve_home_dir_for_exec(env_pairs);
    let expanded = expand_home_path(executable, home_dir.as_ref());
    let expanded_path = PathBuf::from(&expanded);
    if expanded_path.is_absolute() || expanded.contains(std::path::MAIN_SEPARATOR) {
        return expanded;
    }

    let mut search_dirs: Vec<PathBuf> = if let Some(path_value) = env_pairs
        .iter()
        .find(|(key, _)| key == "PATH")
        .map(|(_, value)| value.as_str())
    {
        std::env::split_paths(path_value).collect()
    } else {
        Vec::new()
    };

    for dir in cli_fallback_dirs(home_dir.as_ref()) {
        if !search_dirs.iter().any(|existing| existing == &dir) {
            search_dirs.push(dir);
        }
    }

    for dir in search_dirs {
        let candidate = dir.join(&expanded);
        if candidate.is_file() {
            return candidate.to_string_lossy().to_string();
        }
    }

    expanded
}

fn resolve_home_dir_for_exec(env_pairs: &[(String, String)]) -> Option<PathBuf> {
    env_pairs
        .iter()
        .find(|(key, _)| key == "HOME")
        .map(|(_, value)| value.trim())
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(dirs::home_dir)
}

fn expand_home_path(executable: &str, home_dir: Option<&PathBuf>) -> String {
    if executable == "~" {
        if let Some(home) = home_dir {
            return home.to_string_lossy().to_string();
        }
        return executable.to_string();
    }
    if let Some(rest) = executable.strip_prefix("~/") {
        if let Some(home) = home_dir {
            return home.join(rest).to_string_lossy().to_string();
        }
    }
    executable.to_string()
}

fn cli_fallback_dirs(home_dir: Option<&PathBuf>) -> Vec<PathBuf> {
    let mut dirs = vec![
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/usr/bin"),
        PathBuf::from("/bin"),
    ];

    if let Some(home) = home_dir {
        dirs.push(home.join(".deskclaw/node/bin"));
        dirs.push(home.join(".local/bin"));
        dirs.push(home.join(".npm-global/bin"));
        dirs.push(home.join(".volta/bin"));
        dirs.push(home.join(".pnpm"));
        dirs.push(home.join(".yarn/bin"));
        dirs.push(home.join(".cargo/bin"));
        dirs.push(home.join("bin"));
    }

    dirs
}

pub(super) fn prepend_executable_parent_to_path(
    env_pairs: &mut Vec<(String, String)>,
    executable: &str,
) {
    let executable = executable.trim();
    if executable.is_empty() {
        return;
    }

    let Some(parent_dir) = Path::new(executable)
        .parent()
        .filter(|dir| !dir.as_os_str().is_empty())
    else {
        return;
    };

    let parent_dir = parent_dir.to_path_buf();
    if let Some((_, path_value)) = env_pairs.iter_mut().find(|(key, _)| key == "PATH") {
        if path_list_contains(path_value, &parent_dir) {
            return;
        }
        let merged = std::env::join_paths(
            std::iter::once(parent_dir.clone()).chain(std::env::split_paths(path_value)),
        );
        match merged {
            Ok(next) => *path_value = next.to_string_lossy().to_string(),
            Err(_) => *path_value = format!("{}:{}", parent_dir.to_string_lossy(), path_value),
        }
        return;
    }

    env_pairs.push(("PATH".to_string(), parent_dir.to_string_lossy().to_string()));
}

fn path_list_contains(path_value: &str, candidate: &PathBuf) -> bool {
    std::env::split_paths(path_value).any(|path| path == *candidate)
}

pub(super) fn format_running_duration(elapsed: Duration) -> String {
    let total_seconds = elapsed.as_secs();
    let minutes = total_seconds / 60;
    let seconds = total_seconds % 60;
    format!("running:{minutes} min {seconds} s")
}

pub(super) fn new_request_id(request_id: Option<&str>) -> String {
    request_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string())
}
