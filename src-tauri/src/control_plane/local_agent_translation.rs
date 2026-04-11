use std::{
    collections::HashMap,
    io::{BufReader, Read, Write},
    process::{Command, Stdio},
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{Emitter, State};
use uuid::Uuid;

use crate::{
    db::AppState,
    error::AppError,
    utils::{now_rfc3339, sha256_hex},
};

const BUILTIN_CODEX: &str = "codex";
const BUILTIN_CLAUDE: &str = "claude";
const CODEX_SKIP_GIT_REPO_CHECK_FLAG: &str = "--skip-git-repo-check";
const CODEX_JSON_MODE_FLAG: &str = "--json";
const DEFAULT_TIMEOUT_SECONDS: u64 = 30 * 60;
const MAX_STD_STREAM_BYTES: usize = 32 * 1024;
const FORMAT_PRESERVATION_RULE: &str =
    "Preserve the original content format exactly, including line breaks, indentation, markdown syntax, lists, tables, and code blocks.";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAgentProfileDto {
    pub id: String,
    pub workspace_id: String,
    pub profile_key: String,
    pub name: String,
    pub executable: String,
    pub args_template: Vec<String>,
    pub is_builtin: bool,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationConfigDto {
    pub workspace_id: String,
    pub default_profile_key: String,
    pub prompt_template: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptTranslationDto {
    pub id: String,
    pub workspace_id: String,
    pub prompt_id: String,
    pub prompt_version: i64,
    pub target_language: String,
    pub variant_no: i64,
    pub variant_label: String,
    pub translated_text: String,
    pub source_text_hash: String,
    pub profile_key: String,
    pub apply_mode: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationExecutionResult {
    pub translated_text: String,
    pub target_language: String,
    pub stdout_preview: String,
    pub stderr_preview: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalAgentTranslationStreamEvent {
    request_id: String,
    stream: String,
    chunk: String,
    done: bool,
    ts: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAgentProfileUpsertInput {
    pub workspace_id: String,
    pub profile_key: Option<String>,
    pub name: String,
    pub executable: String,
    pub args_template: Vec<String>,
    pub enabled: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAgentProfileDeleteInput {
    pub workspace_id: String,
    pub profile_key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationConfigUpdateInput {
    pub workspace_id: String,
    pub default_profile_key: String,
    pub prompt_template: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAgentTranslationTestInput {
    pub workspace_id: String,
    pub profile_key: String,
    pub source_text: String,
    pub target_language: String,
    pub timeout_seconds: Option<u64>,
    pub request_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptTranslationListInput {
    pub workspace_id: String,
    pub prompt_id: String,
    pub prompt_version: Option<i64>,
    pub target_language: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PromptTranslationRunInput {
    pub workspace_id: String,
    pub prompt_id: String,
    pub prompt_version: Option<i64>,
    pub source_text: Option<String>,
    pub target_language: String,
    pub profile_key: Option<String>,
    pub strategy: Option<String>,
    pub apply_mode: Option<String>,
    pub timeout_seconds: Option<u64>,
    pub request_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptTranslationRetranslateInput {
    pub workspace_id: String,
    pub translation_id: String,
    pub source_text: Option<String>,
    pub profile_key: Option<String>,
    pub strategy: Option<String>,
    pub timeout_seconds: Option<u64>,
}

#[tauri::command]
pub fn local_agent_profile_list(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<LocalAgentProfileDto>, AppError> {
    let conn = state.open()?;
    ensure_workspace_exists(&conn, &workspace_id)?;
    ensure_default_profiles(&conn, &workspace_id)?;
    list_profiles(&conn, &workspace_id)
}

#[tauri::command]
pub fn local_agent_profile_upsert(
    state: State<'_, AppState>,
    input: LocalAgentProfileUpsertInput,
) -> Result<LocalAgentProfileDto, AppError> {
    let conn = state.open()?;
    ensure_workspace_exists(&conn, &input.workspace_id)?;
    ensure_default_profiles(&conn, &input.workspace_id)?;

    let normalized_key = normalize_profile_key(
        input
            .profile_key
            .as_deref()
            .unwrap_or(input.name.as_str()),
    )?;
    validate_profile_name(&input.name)?;
    validate_executable(&input.executable)?;
    validate_args_template(&input.args_template)?;

    let is_builtin = matches!(normalized_key.as_str(), BUILTIN_CODEX | BUILTIN_CLAUDE);
    let enabled = input.enabled.unwrap_or(true);
    let now = now_rfc3339();

    let existing_id = conn
        .query_row(
            "SELECT id FROM local_agent_profiles WHERE workspace_id = ?1 AND profile_key = ?2",
            params![input.workspace_id, normalized_key],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    let profile_id = existing_id.unwrap_or_else(|| Uuid::new_v4().to_string());

    conn.execute(
        "INSERT INTO local_agent_profiles(
            id, workspace_id, profile_key, name, executable, args_template, is_builtin, enabled, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(workspace_id, profile_key) DO UPDATE SET
            name = excluded.name,
            executable = excluded.executable,
            args_template = excluded.args_template,
            enabled = excluded.enabled,
            updated_at = excluded.updated_at",
        params![
            profile_id,
            input.workspace_id,
            normalized_key,
            input.name.trim(),
            input.executable.trim(),
            serde_json::to_string(&input.args_template)
                .map_err(|err| AppError::internal(err.to_string()))?,
            bool_to_int(is_builtin),
            bool_to_int(enabled),
            now,
            now,
        ],
    )?;

    profile_by_key(&conn, &input.workspace_id, &normalized_key)
}

#[tauri::command]
pub fn local_agent_profile_delete(
    state: State<'_, AppState>,
    input: LocalAgentProfileDeleteInput,
) -> Result<Vec<LocalAgentProfileDto>, AppError> {
    let conn = state.open()?;
    ensure_workspace_exists(&conn, &input.workspace_id)?;

    let profile_key = normalize_profile_key(&input.profile_key)?;
    if matches!(profile_key.as_str(), BUILTIN_CODEX | BUILTIN_CLAUDE) {
        return Err(AppError::invalid_argument(
            "内置 profile 不能删除，可禁用或修改模板",
        ));
    }

    let affected = conn.execute(
        "DELETE FROM local_agent_profiles WHERE workspace_id = ?1 AND profile_key = ?2",
        params![input.workspace_id, profile_key],
    )?;

    if affected == 0 {
        return Err(AppError::invalid_argument("profile 不存在"));
    }

    list_profiles(&conn, &input.workspace_id)
}

#[tauri::command]
pub fn translation_config_get(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<TranslationConfigDto, AppError> {
    let conn = state.open()?;
    ensure_workspace_exists(&conn, &workspace_id)?;
    ensure_default_profiles(&conn, &workspace_id)?;
    ensure_default_translation_config(&conn, &workspace_id)?;
    get_translation_config(&conn, &workspace_id)
}

#[tauri::command]
pub fn translation_config_update(
    state: State<'_, AppState>,
    input: TranslationConfigUpdateInput,
) -> Result<TranslationConfigDto, AppError> {
    let conn = state.open()?;
    ensure_workspace_exists(&conn, &input.workspace_id)?;
    ensure_default_profiles(&conn, &input.workspace_id)?;

    let profile_key = normalize_profile_key(&input.default_profile_key)?;
    validate_translation_template(&input.prompt_template)?;
    profile_by_key(&conn, &input.workspace_id, &profile_key)?;

    let now = now_rfc3339();
    conn.execute(
        "INSERT INTO translation_configs(workspace_id, default_profile_key, prompt_template, updated_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(workspace_id) DO UPDATE SET
            default_profile_key = excluded.default_profile_key,
            prompt_template = excluded.prompt_template,
            updated_at = excluded.updated_at",
        params![
            input.workspace_id,
            profile_key,
            input.prompt_template.trim(),
            now,
        ],
    )?;

    get_translation_config(&conn, &input.workspace_id)
}

#[tauri::command]
pub async fn local_agent_translation_test(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    input: LocalAgentTranslationTestInput,
) -> Result<Value, AppError> {
    let app_state = state.inner().clone();
    let (profile_key, profile, target_language, payload) = {
        let conn = app_state.open()?;
        ensure_workspace_exists(&conn, &input.workspace_id)?;
        ensure_default_profiles(&conn, &input.workspace_id)?;
        ensure_default_translation_config(&conn, &input.workspace_id)?;

        let profile_key = normalize_profile_key(&input.profile_key)?;
        let profile = profile_by_key(&conn, &input.workspace_id, &profile_key)?;
        if !profile.enabled {
            return Err(AppError::new("AGENT_UNAVAILABLE", "当前 profile 已禁用，请先启用"));
        }

        let target_language = normalize_target_language(&input.target_language)?;
        let source_text = normalize_source_text(&input.source_text)?;
        let config = get_translation_config(&conn, &input.workspace_id)?;

        let payload = build_translation_payload(
            &config.prompt_template,
            &source_text,
            &target_language,
        );
        (profile_key, profile, target_language, payload)
    };
    let request_id = input
        .request_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let stream_sink = StreamSink {
        app,
        request_id: request_id.clone(),
    };
    let timeout_seconds = clamp_timeout(input.timeout_seconds.unwrap_or(DEFAULT_TIMEOUT_SECONDS));
    let result = tauri::async_runtime::spawn_blocking(move || {
        execute_translation(
            &profile,
            &payload,
            timeout_seconds,
            &target_language,
            Some(&stream_sink),
        )
    })
    .await
    .map_err(|err| AppError::internal(format!("本地 Agent 执行线程异常: {err}")))??;

    let conn = app_state.open()?;
    append_audit_event(
        &conn,
        Some(&input.workspace_id),
        "local_agent_translation_test",
        "system",
        json!({
            "triggeredAt": now_rfc3339(),
            "profileKey": profile_key,
            "targetLanguage": result.target_language,
            "status": "success"
        }),
    )?;

    Ok(json!({
        "ok": true,
        "requestId": request_id,
        "profileKey": profile_key,
        "targetLanguage": result.target_language,
        "translatedText": result.translated_text,
        "stdoutPreview": result.stdout_preview,
        "stderrPreview": result.stderr_preview,
    }))
}

#[tauri::command]
pub fn prompt_translation_list(
    state: State<'_, AppState>,
    input: PromptTranslationListInput,
) -> Result<Vec<PromptTranslationDto>, AppError> {
    let conn = state.open()?;
    ensure_workspace_exists(&conn, &input.workspace_id)?;
    ensure_prompt_exists(&conn, &input.prompt_id)?;

    let mut sql = String::from(
        "SELECT id, workspace_id, prompt_id, prompt_version, target_language, variant_no, variant_label,
                translated_text, source_text_hash, profile_key, apply_mode, created_at, updated_at
         FROM prompt_translations
         WHERE workspace_id = ?1 AND prompt_id = ?2",
    );

    let mut params_vec: Vec<Value> = vec![
        Value::String(input.workspace_id.clone()),
        Value::String(input.prompt_id.clone()),
    ];

    if let Some(version) = input.prompt_version {
        sql.push_str(" AND prompt_version = ?3");
        params_vec.push(Value::Number(version.into()));
    }

    if let Some(language) = input.target_language.as_ref() {
        let trimmed = language.trim();
        if !trimmed.is_empty() {
            let idx = params_vec.len() + 1;
            sql.push_str(&format!(" AND target_language = ?{idx}"));
            params_vec.push(Value::String(trimmed.to_string()));
        }
    }

    sql.push_str(" ORDER BY updated_at DESC");
    let limit = input.limit.unwrap_or(50).clamp(1, 200);
    let idx = params_vec.len() + 1;
    sql.push_str(&format!(" LIMIT ?{idx}"));
    params_vec.push(Value::Number(limit.into()));

    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query(rusqlite::params_from_iter(
        params_vec.iter().map(json_to_sql_value),
    ))?;

    let mut list = Vec::new();
    while let Some(row) = rows.next()? {
        list.push(prompt_translation_from_row(row)?);
    }

    Ok(list)
}

#[tauri::command]
pub async fn prompt_translation_run(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    input: PromptTranslationRunInput,
) -> Result<Value, AppError> {
    let app_state = state.inner().clone();
    let request_id = input
        .request_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let stream_sink = StreamSink { app, request_id };
    let run_input = input.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let conn = app_state.open()?;
        run_prompt_translation(&conn, &run_input, Some(&stream_sink))
    })
    .await
    .map_err(|err| AppError::internal(format!("本地 Agent 执行线程异常: {err}")))??;
    Ok(json!(result))
}

#[tauri::command]
pub fn prompt_translation_retranslate(
    state: State<'_, AppState>,
    input: PromptTranslationRetranslateInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    let base = conn
        .query_row(
            "SELECT prompt_id, prompt_version, target_language
             FROM prompt_translations
             WHERE workspace_id = ?1 AND id = ?2",
            params![input.workspace_id, input.translation_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| AppError::invalid_argument("译文记录不存在"))?;

    let run_input = PromptTranslationRunInput {
        workspace_id: input.workspace_id,
        prompt_id: base.0,
        prompt_version: Some(base.1),
        source_text: input.source_text,
        target_language: base.2,
        profile_key: input.profile_key,
        strategy: input.strategy,
        apply_mode: Some("immersive".to_string()),
        timeout_seconds: input.timeout_seconds,
        request_id: None,
    };

    let result = run_prompt_translation(&conn, &run_input, None)?;
    Ok(json!(result))
}

fn run_prompt_translation(
    conn: &Connection,
    input: &PromptTranslationRunInput,
    stream_sink: Option<&StreamSink>,
) -> Result<PromptTranslationDto, AppError> {
    ensure_workspace_exists(conn, &input.workspace_id)?;
    ensure_default_profiles(conn, &input.workspace_id)?;
    ensure_default_translation_config(conn, &input.workspace_id)?;
    ensure_prompt_exists(conn, &input.prompt_id)?;

    let prompt_version = resolve_prompt_version(conn, &input.prompt_id, input.prompt_version)?;
    let source_text = resolve_source_text(conn, &input.prompt_id, prompt_version, input.source_text.as_deref())?;
    let target_language = normalize_target_language(&input.target_language)?;

    let config = get_translation_config(conn, &input.workspace_id)?;
    let profile_key = if let Some(value) = input.profile_key.as_ref() {
        normalize_profile_key(value)?
    } else {
        config.default_profile_key.clone()
    };
    let profile = profile_by_key(conn, &input.workspace_id, &profile_key)?;
    if !profile.enabled {
        return Err(AppError::new("AGENT_UNAVAILABLE", "当前 profile 已禁用，请先启用"));
    }

    let payload = build_translation_payload(&config.prompt_template, &source_text, &target_language);
    let timeout_seconds = clamp_timeout(input.timeout_seconds.unwrap_or(DEFAULT_TIMEOUT_SECONDS));
    let execution = execute_translation(
        &profile,
        &payload,
        timeout_seconds,
        &target_language,
        stream_sink,
    )?;

    let strategy = normalize_strategy(input.strategy.as_deref())?;
    let apply_mode = normalize_apply_mode(input.apply_mode.as_deref());

    let existing = list_prompt_translations_by_identity(
        conn,
        &input.workspace_id,
        &input.prompt_id,
        prompt_version,
        &target_language,
    )?;

    if !existing.is_empty() && strategy.is_none() {
        return Err(AppError::new(
            "TRANSLATION_CONFLICT",
            "同版本同语言已存在译文，请选择覆盖或另存新译文",
        ));
    }

    let source_hash = sha256_hex(&source_text);
    let now = now_rfc3339();

    let record = if existing.is_empty() {
        insert_prompt_translation(
            conn,
            PromptTranslationInsert {
                id: Uuid::new_v4().to_string(),
                workspace_id: input.workspace_id.clone(),
                prompt_id: input.prompt_id.clone(),
                prompt_version,
                target_language: target_language.clone(),
                variant_no: 1,
                variant_label: format!("{} · 译文 #1", target_language),
                translated_text: execution.translated_text,
                source_text_hash: source_hash,
                profile_key: profile.profile_key.clone(),
                apply_mode: apply_mode.clone(),
                created_at: now.clone(),
                updated_at: now.clone(),
            },
        )?
    } else {
        match strategy.unwrap_or(TranslationConflictStrategy::SaveAs) {
            TranslationConflictStrategy::Overwrite => {
                let latest = existing
                    .first()
                    .ok_or_else(|| AppError::internal("读取冲突记录失败"))?;
                conn.execute(
                    "UPDATE prompt_translations
                     SET translated_text = ?2,
                         source_text_hash = ?3,
                         profile_key = ?4,
                         apply_mode = ?5,
                         updated_at = ?6
                     WHERE id = ?1",
                    params![
                        latest.id,
                        execution.translated_text,
                        source_hash,
                        profile.profile_key,
                        apply_mode,
                        now,
                    ],
                )?;
                prompt_translation_by_id(conn, &latest.id)?
            }
            TranslationConflictStrategy::SaveAs => {
                let next_variant = existing.iter().map(|item| item.variant_no).max().unwrap_or(0) + 1;
                insert_prompt_translation(
                    conn,
                    PromptTranslationInsert {
                        id: Uuid::new_v4().to_string(),
                        workspace_id: input.workspace_id.clone(),
                        prompt_id: input.prompt_id.clone(),
                        prompt_version,
                        target_language: target_language.clone(),
                        variant_no: next_variant,
                        variant_label: format!("{} · 译文 #{}", target_language, next_variant),
                        translated_text: execution.translated_text,
                        source_text_hash: source_hash,
                        profile_key: profile.profile_key.clone(),
                        apply_mode: apply_mode.clone(),
                        created_at: now.clone(),
                        updated_at: now.clone(),
                    },
                )?
            }
        }
    };

    let event_type = match strategy {
        Some(TranslationConflictStrategy::Overwrite) => "prompt_translation_conflict_overwrite",
        Some(TranslationConflictStrategy::SaveAs) if !existing.is_empty() => {
            "prompt_translation_conflict_save_as"
        }
        _ => "prompt_translation_run",
    };

    append_audit_event(
        conn,
        Some(&input.workspace_id),
        event_type,
        "system",
        json!({
            "triggeredAt": now_rfc3339(),
            "promptId": input.prompt_id,
            "promptVersion": prompt_version,
            "targetLanguage": target_language,
            "agentType": profile.profile_key,
            "status": "success"
        }),
    )?;

    Ok(record)
}

fn ensure_workspace_exists(conn: &Connection, workspace_id: &str) -> Result<(), AppError> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(1) FROM workspaces WHERE id = ?1",
        params![workspace_id],
        |row| row.get(0),
    )?;

    if exists == 0 {
        return Err(AppError::workspace_not_found());
    }

    Ok(())
}

fn ensure_prompt_exists(conn: &Connection, prompt_id: &str) -> Result<(), AppError> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(1) FROM prompts_assets WHERE id = ?1",
        params![prompt_id],
        |row| row.get(0),
    )?;

    if exists == 0 {
        return Err(AppError::invalid_argument("prompt 不存在"));
    }

    Ok(())
}

fn default_prompt_template() -> String {
    format!(
        "You are a strict translation engine.\nTranslate source text into target language.\n{FORMAT_PRESERVATION_RULE}\nYou MUST output exactly one valid JSON object and nothing else.\nDo not wrap JSON in markdown code fences.\nDo not output explanation text.\n\nTarget language:\n{{target_language}}\n\nSource text:\n{{source_text}}\n\nSchema:\n{{output_schema_json}}"
    )
}

fn default_profile_templates(profile_key: &str) -> (&'static str, Vec<String>) {
    match profile_key {
        BUILTIN_CODEX => (
            "codex",
            vec![
                "exec".to_string(),
                CODEX_SKIP_GIT_REPO_CHECK_FLAG.to_string(),
            ],
        ),
        BUILTIN_CLAUDE => (
            "claude",
            vec![
                "-p".to_string(),
                "{{system_prompt}}".to_string(),
                "--output-format".to_string(),
                "json".to_string(),
            ],
        ),
        _ => ("", Vec::new()),
    }
}

fn ensure_default_profiles(conn: &Connection, workspace_id: &str) -> Result<(), AppError> {
    let now = now_rfc3339();

    for key in [BUILTIN_CODEX, BUILTIN_CLAUDE] {
        let (executable, args_template) = default_profile_templates(key);
        conn.execute(
            "INSERT INTO local_agent_profiles(
                id, workspace_id, profile_key, name, executable, args_template, is_builtin, enabled, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, 1, ?7, ?8)
             ON CONFLICT(workspace_id, profile_key) DO UPDATE SET
                is_builtin = 1,
                updated_at = CASE
                    WHEN local_agent_profiles.is_builtin = 1 THEN excluded.updated_at
                    ELSE local_agent_profiles.updated_at
                END",
            params![
                Uuid::new_v4().to_string(),
                workspace_id,
                key,
                key,
                executable,
                serde_json::to_string(&args_template)
                    .map_err(|err| AppError::internal(err.to_string()))?,
                now,
                now,
            ],
        )?;
    }

    Ok(())
}

fn ensure_default_translation_config(conn: &Connection, workspace_id: &str) -> Result<(), AppError> {
    let now = now_rfc3339();
    conn.execute(
        "INSERT INTO translation_configs(workspace_id, default_profile_key, prompt_template, updated_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(workspace_id) DO NOTHING",
        params![
            workspace_id,
            BUILTIN_CODEX,
            default_prompt_template(),
            now,
        ],
    )?;
    Ok(())
}

fn get_translation_config(
    conn: &Connection,
    workspace_id: &str,
) -> Result<TranslationConfigDto, AppError> {
    conn.query_row(
        "SELECT workspace_id, default_profile_key, prompt_template, updated_at
         FROM translation_configs WHERE workspace_id = ?1",
        params![workspace_id],
        |row| {
            Ok(TranslationConfigDto {
                workspace_id: row.get(0)?,
                default_profile_key: row.get(1)?,
                prompt_template: row.get(2)?,
                updated_at: row.get(3)?,
            })
        },
    )
    .optional()?
    .ok_or_else(|| AppError::internal("翻译配置不存在"))
}

fn list_profiles(conn: &Connection, workspace_id: &str) -> Result<Vec<LocalAgentProfileDto>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, profile_key, name, executable, args_template, is_builtin, enabled, created_at, updated_at
         FROM local_agent_profiles
         WHERE workspace_id = ?1
         ORDER BY is_builtin DESC, profile_key ASC",
    )?;

    let rows = stmt.query_map(params![workspace_id], profile_from_row)?;

    let mut list = Vec::new();
    for row in rows {
        list.push(row?);
    }

    Ok(list)
}

fn profile_by_key(
    conn: &Connection,
    workspace_id: &str,
    profile_key: &str,
) -> Result<LocalAgentProfileDto, AppError> {
    conn.query_row(
        "SELECT id, workspace_id, profile_key, name, executable, args_template, is_builtin, enabled, created_at, updated_at
         FROM local_agent_profiles
         WHERE workspace_id = ?1 AND profile_key = ?2",
        params![workspace_id, profile_key],
        profile_from_row,
    )
    .optional()?
    .ok_or_else(|| AppError::invalid_argument("profile 不存在"))
}

fn profile_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<LocalAgentProfileDto> {
    let args_raw: String = row.get(5)?;
    let args_template = serde_json::from_str::<Vec<String>>(&args_raw).unwrap_or_default();
    Ok(LocalAgentProfileDto {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        profile_key: row.get(2)?,
        name: row.get(3)?,
        executable: row.get(4)?,
        args_template,
        is_builtin: row.get::<_, i64>(6)? == 1,
        enabled: row.get::<_, i64>(7)? == 1,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

struct StreamSink {
    app: tauri::AppHandle,
    request_id: String,
}

impl StreamSink {
    fn emit(&self, stream: &str, chunk: impl Into<String>, done: bool) {
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

fn execute_translation(
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

    let mut command = Command::new(profile.executable.trim());
    for arg in &args {
        command.arg(arg);
    }

    let safe_env = collect_safe_env();
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
    let mut handle_stream_chunk = |chunk: StreamChunk| {
        match chunk {
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

    let mut parsed = parse_translation_protocol(&stdout, target_language, &stderr).map_err(|err| {
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

fn parse_translation_protocol(
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
            format!(
                "本地 Agent 输出不是合法 JSON。stdout 预览:\n{}",
                preview
            ),
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

fn build_translation_payload(
    prompt_template: &str,
    source_text: &str,
    target_language: &str,
) -> String {
    let mut vars = HashMap::new();
    vars.insert("source_text", source_text.to_string());
    vars.insert("target_language", target_language.to_string());
    vars.insert("system_prompt", "Translate text and return JSON only".to_string());
    vars.insert(
        "output_schema_json",
        "{\"translatedText\":\"string\",\"targetLanguage\":\"string\"}".to_string(),
    );

    let rendered = render_template(prompt_template, &vars);
    format!("{FORMAT_PRESERVATION_RULE}\n\n{rendered}")
}

fn render_args_template(args_template: &[String], payload: &str, target_language: &str) -> Vec<String> {
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

fn apply_execution_compatibility(profile_key: &str, mut args: Vec<String>) -> Vec<String> {
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

fn resolve_prompt_version(
    conn: &Connection,
    prompt_id: &str,
    provided: Option<i64>,
) -> Result<i64, AppError> {
    if let Some(version) = provided {
        if version <= 0 {
            return Err(AppError::invalid_argument("promptVersion 必须大于 0"));
        }
        let exists: i64 = conn.query_row(
            "SELECT COUNT(1) FROM prompts_versions WHERE asset_id = ?1 AND version = ?2",
            params![prompt_id, version],
            |row| row.get(0),
        )?;
        if exists == 0 {
            return Err(AppError::invalid_argument("指定的 promptVersion 不存在"));
        }
        return Ok(version);
    }

    conn.query_row(
        "SELECT active_version FROM prompts_assets WHERE id = ?1",
        params![prompt_id],
        |row| row.get::<_, i64>(0),
    )
    .optional()?
    .ok_or_else(|| AppError::invalid_argument("prompt 不存在"))
}

fn resolve_source_text(
    conn: &Connection,
    prompt_id: &str,
    prompt_version: i64,
    provided: Option<&str>,
) -> Result<String, AppError> {
    if let Some(source_text) = provided {
        if !source_text.trim().is_empty() {
            return Ok(source_text.to_string());
        }
    }

    conn.query_row(
        "SELECT content FROM prompts_versions WHERE asset_id = ?1 AND version = ?2",
        params![prompt_id, prompt_version],
        |row| row.get::<_, String>(0),
    )
    .optional()?
    .ok_or_else(|| AppError::invalid_argument("无法读取指定版本原文"))
}

fn insert_prompt_translation(
    conn: &Connection,
    input: PromptTranslationInsert,
) -> Result<PromptTranslationDto, AppError> {
    conn.execute(
        "INSERT INTO prompt_translations(
            id, workspace_id, prompt_id, prompt_version, target_language, variant_no, variant_label,
            translated_text, source_text_hash, profile_key, apply_mode, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            input.id,
            input.workspace_id,
            input.prompt_id,
            input.prompt_version,
            input.target_language,
            input.variant_no,
            input.variant_label,
            input.translated_text,
            input.source_text_hash,
            input.profile_key,
            input.apply_mode,
            input.created_at,
            input.updated_at,
        ],
    )?;

    prompt_translation_by_id(conn, &input.id)
}

fn prompt_translation_by_id(conn: &Connection, id: &str) -> Result<PromptTranslationDto, AppError> {
    conn.query_row(
        "SELECT id, workspace_id, prompt_id, prompt_version, target_language, variant_no, variant_label,
                translated_text, source_text_hash, profile_key, apply_mode, created_at, updated_at
         FROM prompt_translations
         WHERE id = ?1",
        params![id],
        prompt_translation_from_row,
    )
    .optional()?
    .ok_or_else(|| AppError::internal("译文记录不存在"))
}

fn list_prompt_translations_by_identity(
    conn: &Connection,
    workspace_id: &str,
    prompt_id: &str,
    prompt_version: i64,
    target_language: &str,
) -> Result<Vec<PromptTranslationDto>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, prompt_id, prompt_version, target_language, variant_no, variant_label,
                translated_text, source_text_hash, profile_key, apply_mode, created_at, updated_at
         FROM prompt_translations
         WHERE workspace_id = ?1 AND prompt_id = ?2 AND prompt_version = ?3 AND target_language = ?4
         ORDER BY updated_at DESC",
    )?;

    let rows = stmt.query_map(
        params![workspace_id, prompt_id, prompt_version, target_language],
        prompt_translation_from_row,
    )?;

    let mut list = Vec::new();
    for row in rows {
        list.push(row?);
    }

    Ok(list)
}

fn prompt_translation_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<PromptTranslationDto> {
    Ok(PromptTranslationDto {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        prompt_id: row.get(2)?,
        prompt_version: row.get(3)?,
        target_language: row.get(4)?,
        variant_no: row.get(5)?,
        variant_label: row.get(6)?,
        translated_text: row.get(7)?,
        source_text_hash: row.get(8)?,
        profile_key: row.get(9)?,
        apply_mode: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

struct PromptTranslationInsert {
    id: String,
    workspace_id: String,
    prompt_id: String,
    prompt_version: i64,
    target_language: String,
    variant_no: i64,
    variant_label: String,
    translated_text: String,
    source_text_hash: String,
    profile_key: String,
    apply_mode: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Copy)]
enum TranslationConflictStrategy {
    Overwrite,
    SaveAs,
}

fn normalize_strategy(input: Option<&str>) -> Result<Option<TranslationConflictStrategy>, AppError> {
    let Some(raw) = input else {
        return Ok(None);
    };

    match raw.trim().to_lowercase().as_str() {
        "overwrite" => Ok(Some(TranslationConflictStrategy::Overwrite)),
        "save_as" | "saveas" => Ok(Some(TranslationConflictStrategy::SaveAs)),
        _ => Err(AppError::invalid_argument(
            "strategy 仅支持 overwrite / save_as",
        )),
    }
}

fn normalize_apply_mode(input: Option<&str>) -> String {
    match input
        .unwrap_or("immersive")
        .trim()
        .to_lowercase()
        .as_str()
    {
        "overwrite" => "overwrite".to_string(),
        _ => "immersive".to_string(),
    }
}

fn normalize_profile_key(value: &str) -> Result<String, AppError> {
    let key = value.trim().to_lowercase();
    if key.is_empty() {
        return Err(AppError::invalid_argument("profileKey 不能为空"));
    }
    if !key.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-') {
        return Err(AppError::invalid_argument(
            "profileKey 仅支持字母、数字、-、_",
        ));
    }
    Ok(key)
}

fn normalize_target_language(value: &str) -> Result<String, AppError> {
    let language = value.trim();
    if language.is_empty() {
        return Err(AppError::invalid_argument("目标语言不能为空"));
    }
    if language.chars().count() > 64 {
        return Err(AppError::invalid_argument("目标语言长度不能超过 64"));
    }
    Ok(language.to_string())
}

fn normalize_source_text(value: &str) -> Result<String, AppError> {
    if value.trim().is_empty() {
        return Err(AppError::invalid_argument("原文不能为空"));
    }
    Ok(value.to_string())
}

fn validate_profile_name(value: &str) -> Result<(), AppError> {
    let name = value.trim();
    if name.is_empty() {
        return Err(AppError::invalid_argument("profile 名称不能为空"));
    }
    if name.chars().count() > 128 {
        return Err(AppError::invalid_argument("profile 名称长度不能超过 128"));
    }
    Ok(())
}

fn validate_executable(value: &str) -> Result<(), AppError> {
    let executable = value.trim();
    if executable.is_empty() {
        return Err(AppError::invalid_argument("可执行程序不能为空"));
    }
    if contains_forbidden_exec_pattern(executable) {
        return Err(AppError::new(
            "AGENT_EXEC_FORBIDDEN",
            "可执行程序命中安全策略，禁止执行",
        ));
    }
    Ok(())
}

fn validate_args_template(args_template: &[String]) -> Result<(), AppError> {
    if args_template.len() > 40 {
        return Err(AppError::invalid_argument("参数模板过长，最多 40 项"));
    }

    for arg in args_template {
        let trimmed = arg.trim();
        if trimmed.is_empty() {
            return Err(AppError::invalid_argument("参数模板中包含空项"));
        }

        if contains_forbidden_exec_pattern(trimmed) {
            return Err(AppError::new(
                "AGENT_EXEC_FORBIDDEN",
                "参数模板命中安全策略，禁止执行",
            ));
        }
    }

    Ok(())
}

fn validate_translation_template(template: &str) -> Result<(), AppError> {
    let trimmed = template.trim();
    if trimmed.is_empty() {
        return Err(AppError::invalid_argument("翻译 Prompt 模板不能为空"));
    }

    if !trimmed.contains("{{source_text}}") || !trimmed.contains("{{target_language}}") {
        return Err(AppError::invalid_argument(
            "翻译模板必须包含 {{source_text}} 与 {{target_language}} 占位符",
        ));
    }

    Ok(())
}

fn contains_forbidden_exec_pattern(input: &str) -> bool {
    let value = input.trim();
    if value.is_empty() {
        return false;
    }

    if value.contains('|')
        || value.contains('>')
        || value.contains('<')
        || value.contains(';')
        || value.contains("`")
        || value.contains("$(")
    {
        return true;
    }

    let lower = value.to_lowercase();
    lower.contains("--output")
        || lower == "-o"
        || lower.starts_with("-o=")
        || lower.contains("--file")
        || lower.contains("--path")
        || lower.contains("--tool")
        || lower.contains("--tools")
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
        _ => AppError::new(
            "AGENT_EXEC_FAILED",
            format!("启动本地 Agent 失败: {err}"),
        ),
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

fn truncate_text(value: &str, limit: usize) -> String {
    if value.len() <= limit {
        return value.to_string();
    }

    let mut end = limit;
    while !value.is_char_boundary(end) {
        end -= 1;
    }

    value[..end].to_string()
}

fn clamp_timeout(value: u64) -> u64 {
    value.clamp(5, 30 * 60)
}

fn format_running_duration(elapsed: Duration) -> String {
    let total_seconds = elapsed.as_secs();
    let minutes = total_seconds / 60;
    let seconds = total_seconds % 60;
    format!("running:{minutes} min {seconds} s")
}

fn append_audit_event(
    conn: &Connection,
    workspace_id: Option<&str>,
    event_type: &str,
    operator: &str,
    payload: Value,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO audit_events(id, workspace_id, event_type, operator, payload, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            Uuid::new_v4().to_string(),
            workspace_id,
            event_type,
            operator,
            payload.to_string(),
            now_rfc3339(),
        ],
    )?;

    Ok(())
}

fn bool_to_int(value: bool) -> i64 {
    if value {
        1
    } else {
        0
    }
}

fn json_to_sql_value(value: &Value) -> rusqlite::types::Value {
    match value {
        Value::Null => rusqlite::types::Value::Null,
        Value::Bool(boolean) => rusqlite::types::Value::Integer(i64::from(*boolean)),
        Value::Number(number) => {
            if let Some(int) = number.as_i64() {
                rusqlite::types::Value::Integer(int)
            } else if let Some(float) = number.as_f64() {
                rusqlite::types::Value::Real(float)
            } else {
                rusqlite::types::Value::Null
            }
        }
        Value::String(text) => rusqlite::types::Value::Text(text.clone()),
        Value::Array(_) | Value::Object(_) => rusqlite::types::Value::Text(value.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        apply_execution_compatibility, contains_forbidden_exec_pattern, normalize_profile_key,
        parse_translation_protocol, format_running_duration,
    };
    use std::time::Duration;

    #[test]
    fn forbidden_patterns_are_detected() {
        assert!(contains_forbidden_exec_pattern("cat a | cat b"));
        assert!(contains_forbidden_exec_pattern("--output=/tmp/a.txt"));
        assert!(contains_forbidden_exec_pattern("$(whoami)"));
        assert!(!contains_forbidden_exec_pattern("--json"));
    }

    #[test]
    fn profile_key_is_normalized() {
        assert_eq!(normalize_profile_key(" Codex ").expect("normalize"), "codex");
        assert!(normalize_profile_key("bad key").is_err());
    }

    #[test]
    fn codex_args_auto_append_skip_git_repo_check() {
        let args = apply_execution_compatibility(
            "codex",
            vec!["exec".to_string(), "--json".to_string()],
        );
        assert!(args.iter().any(|arg| arg == "--skip-git-repo-check"));
        assert!(!args.iter().any(|arg| arg == "--json"));

        let args_again = apply_execution_compatibility(
            "codex",
            vec![
                "exec".to_string(),
                "--json".to_string(),
                "--skip-git-repo-check".to_string(),
            ],
        );
        let count = args_again
            .iter()
            .filter(|arg| arg.as_str() == "--skip-git-repo-check")
            .count();
        assert_eq!(count, 1);
    }

    #[test]
    fn protocol_requires_translated_text() {
        let result = parse_translation_protocol("{\"foo\":\"bar\"}", "中文", "");
        assert!(result.is_err());

        let ok = parse_translation_protocol(
            "{\"translatedText\":\"hello\",\"targetLanguage\":\"English\"}",
            "中文",
            "",
        )
        .expect("protocol");
        assert_eq!(ok.translated_text, "hello");
        assert_eq!(ok.target_language, "English");
    }

    #[test]
    fn running_duration_is_formatted_as_min_sec() {
        assert_eq!(
            format_running_duration(Duration::from_millis(29_554)),
            "running:0 min 29 s"
        );
        assert_eq!(
            format_running_duration(Duration::from_secs(125)),
            "running:2 min 5 s"
        );
    }
}
