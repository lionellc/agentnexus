use std::{
    fs::{self, OpenOptions},
    path::{Path, PathBuf},
};

use tauri::State;
use uuid::Uuid;

use crate::{db::AppState, domain::models::APP_SCOPE_ID, error::AppError, utils::now_rfc3339};

use super::{
    api::{ensure_default_agent_connections, ensure_workspace_exists},
    apply::list_enabled_connections,
    normalize::resolve_rule_file_path,
    AgentRuleAccessCheckDto, AgentRuleAccessCheckInput, AgentRuleAccessTargetDto, ConnectionRow,
};

#[tauri::command]
pub fn agent_rule_access_check(
    state: State<'_, AppState>,
    input: AgentRuleAccessCheckInput,
) -> Result<AgentRuleAccessCheckDto, AppError> {
    let conn = state.open()?;
    ensure_workspace_exists(&conn, APP_SCOPE_ID)?;
    ensure_default_agent_connections(&conn, APP_SCOPE_ID)?;

    let targets = list_enabled_connections(&conn, APP_SCOPE_ID, input.agent_types.as_deref())?
        .iter()
        .map(check_target_access)
        .collect::<Vec<_>>();
    let blocked = targets.iter().filter(|item| item.status != "ready").count();
    let summary = if targets.is_empty() {
        "暂无启用的 Agent 规则目标".to_string()
    } else if blocked == 0 {
        String::new()
    } else {
        format!("{blocked} 个 Agent 规则目录需要处理")
    };

    Ok(AgentRuleAccessCheckDto {
        ok: blocked == 0,
        checked_at: now_rfc3339(),
        summary,
        targets,
    })
}

pub(super) fn check_target_access(target: &ConnectionRow) -> AgentRuleAccessTargetDto {
    let resolved = resolve_rule_file_path(&target.root_dir, &target.rule_file, &target.agent_type);
    let root_path = PathBuf::from(target.root_dir.trim());
    let hidden_path = is_hidden_path(&root_path);

    let resolved_path = match resolved {
        Ok(path) => path,
        Err(err) => {
            return AgentRuleAccessTargetDto {
                agent_type: target.agent_type.clone(),
                root_dir: target.root_dir.clone(),
                rule_file: target.rule_file.clone(),
                resolved_path: String::new(),
                parent_dir: target.root_dir.clone(),
                root_dir_exists: root_path.exists(),
                parent_dir_exists: root_path.exists(),
                hidden_path,
                prepared_dir: false,
                can_create_file: false,
                file_writable: false,
                status: "invalid".to_string(),
                message: err.message,
                advice: Some(
                    "请在设置中选择一个可访问的绝对目录，并确认规则文件是相对路径。".to_string(),
                ),
            };
        }
    };

    let parent_path = resolved_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| root_path.clone());
    let hidden_path = hidden_path || is_hidden_path(&resolved_path);

    let mut prepared_dir = false;
    if !parent_path.exists() {
        match fs::create_dir_all(&parent_path) {
            Ok(_) => {
                prepared_dir = true;
            }
            Err(err) => {
                return build_access_target(
                    target,
                    &root_path,
                    &resolved_path,
                    &parent_path,
                    hidden_path,
                    false,
                    false,
                    false,
                    "needs_user_action",
                    format!("无法创建规则目录：{err}"),
                    Some(permission_advice(&parent_path, &resolved_path, hidden_path)),
                );
            }
        }
    }

    if parent_path.exists() && !parent_path.is_dir() {
        return build_access_target(
            target,
            &root_path,
            &resolved_path,
            &parent_path,
            hidden_path,
            prepared_dir,
            false,
            false,
            "invalid",
            "规则文件的父路径不是目录".to_string(),
            Some("请在设置中重新选择 Agent 的 Global Config 目录。".to_string()),
        );
    }

    if resolved_path.exists() && resolved_path.is_dir() {
        return build_access_target(
            target,
            &root_path,
            &resolved_path,
            &parent_path,
            hidden_path,
            prepared_dir,
            false,
            false,
            "invalid",
            "规则文件路径指向了目录".to_string(),
            Some("请把规则文件改成具体文件名，例如 AGENTS.md 或 CLAUDE.md。".to_string()),
        );
    }

    let (can_create_file, create_error) = can_create_probe_file(&parent_path);
    let file_writable = can_open_file_for_write(&resolved_path);
    let target_exists = resolved_path.exists();
    let ready = if target_exists {
        file_writable
    } else {
        can_create_file
    };

    if ready {
        let message = if prepared_dir {
            "已创建缺失目录，规则文件可写".to_string()
        } else if hidden_path {
            "隐藏规则目录可写".to_string()
        } else {
            "规则目录可写".to_string()
        };
        let advice = if hidden_path {
            Some(hidden_path_advice())
        } else {
            None
        };
        return build_access_target(
            target,
            &root_path,
            &resolved_path,
            &parent_path,
            hidden_path,
            prepared_dir,
            can_create_file,
            file_writable,
            "ready",
            message,
            advice,
        );
    }

    let message = if target_exists && !file_writable {
        "规则文件不可写".to_string()
    } else if let Some(err) = create_error {
        format!("规则目录不可写：{err}")
    } else {
        "规则目录不可写".to_string()
    };
    build_access_target(
        target,
        &root_path,
        &resolved_path,
        &parent_path,
        hidden_path,
        prepared_dir,
        can_create_file,
        file_writable,
        "needs_user_action",
        message,
        Some(permission_advice(&parent_path, &resolved_path, hidden_path)),
    )
}

pub(super) fn apply_blocked_message(check: &AgentRuleAccessTargetDto) -> String {
    match &check.advice {
        Some(advice) if !advice.trim().is_empty() => {
            format!("{}：{}。{}", check.agent_type, check.message, advice)
        }
        _ => format!("{}：{}", check.agent_type, check.message),
    }
}

pub(super) fn is_permission_like_error(message: &str) -> bool {
    let lower = message.to_lowercase();
    lower.contains("permission denied")
        || lower.contains("operation not permitted")
        || lower.contains("access is denied")
}

pub(super) fn write_failure_advice(target_path: &Path) -> String {
    let parent = target_path.parent().unwrap_or_else(|| Path::new(""));
    permission_advice(parent, target_path, is_hidden_path(target_path))
}

fn build_access_target(
    target: &ConnectionRow,
    root_path: &Path,
    resolved_path: &Path,
    parent_path: &Path,
    hidden_path: bool,
    prepared_dir: bool,
    can_create_file: bool,
    file_writable: bool,
    status: &str,
    message: String,
    advice: Option<String>,
) -> AgentRuleAccessTargetDto {
    AgentRuleAccessTargetDto {
        agent_type: target.agent_type.clone(),
        root_dir: target.root_dir.clone(),
        rule_file: target.rule_file.clone(),
        resolved_path: path_to_string(resolved_path),
        parent_dir: path_to_string(parent_path),
        root_dir_exists: root_path.exists(),
        parent_dir_exists: parent_path.exists(),
        hidden_path,
        prepared_dir,
        can_create_file,
        file_writable,
        status: status.to_string(),
        message,
        advice,
    }
}

fn can_create_probe_file(parent_path: &Path) -> (bool, Option<String>) {
    if !parent_path.is_dir() {
        return (false, Some("父目录不存在或不是目录".to_string()));
    }

    let probe_path = parent_path.join(format!(".agentnexus-write-check-{}", Uuid::new_v4()));
    match OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe_path)
    {
        Ok(_) => {
            let _ = fs::remove_file(&probe_path);
            (true, None)
        }
        Err(err) => (false, Some(err.to_string())),
    }
}

fn can_open_file_for_write(path: &Path) -> bool {
    path.exists() && OpenOptions::new().write(true).open(path).is_ok()
}

fn is_hidden_path(path: &Path) -> bool {
    path.components().any(|component| {
        component
            .as_os_str()
            .to_str()
            .map(|value| value.starts_with('.') && value.len() > 1)
            .unwrap_or(false)
    })
}

fn permission_advice(parent_path: &Path, target_path: &Path, hidden_path: bool) -> String {
    let mut parts = Vec::new();
    if hidden_path {
        parts.push(hidden_path_advice());
    }
    parts.push("请确认 AgentNexus 有权访问该目录，或在设置中重新选择一个可写目录。".to_string());
    parts.push(format!(
        "可复制命令：mkdir -p {} && chmod u+rwx {} && touch {} && chmod u+rw {}",
        shell_quote(&path_to_string(parent_path)),
        shell_quote(&path_to_string(parent_path)),
        shell_quote(&path_to_string(target_path)),
        shell_quote(&path_to_string(target_path)),
    ));
    parts.join(" ")
}

fn hidden_path_advice() -> String {
    "这是隐藏目录；在 Finder 中可按 Command+Shift+. 显示隐藏文件。".to_string()
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}
