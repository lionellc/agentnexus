use std::fs;

use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;
use uuid::Uuid;

use crate::{
    db::AppState,
    error::AppError,
    security::validate_absolute_root_dir,
    utils::now_rfc3339,
};

use super::{
    normalize::{
        bool_to_int, default_agent_root_dir, default_rule_file_name, normalize_agent_type,
        normalize_rule_file, resolve_rule_file_path, validate_enabled_root_dir,
    },
    AgentConnectionDeleteInput, AgentConnectionDto, AgentConnectionToggleInput,
    AgentConnectionUpsertInput, AgentRulePreviewInput, AgentRulePreviewResult, ConnectionRow,
    AGENT_CLAUDE, AGENT_CODEX,
};

#[tauri::command]
pub fn agent_connection_list(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<AgentConnectionDto>, AppError> {
    let conn = state.open()?;
    ensure_workspace_exists(&conn, &workspace_id)?;
    ensure_default_agent_connections(&conn, &workspace_id)?;
    list_agent_connections(&conn, &workspace_id)
}

#[tauri::command]
pub fn agent_connection_upsert(
    state: State<'_, AppState>,
    input: AgentConnectionUpsertInput,
) -> Result<AgentConnectionDto, AppError> {
    let conn = state.open()?;
    ensure_workspace_exists(&conn, &input.workspace_id)?;
    ensure_default_agent_connections(&conn, &input.workspace_id)?;

    let agent_type = normalize_agent_type(&input.agent_type)?;
    let root_dir = input.root_dir.trim().to_string();
    let rule_file = normalize_rule_file(input.rule_file.as_deref(), &agent_type)?;
    if input.enabled {
        validate_enabled_root_dir(&root_dir)?;
    } else if !root_dir.is_empty() {
        validate_absolute_root_dir(&root_dir)?;
    }

    let now = now_rfc3339();
    let existing_id = conn
        .query_row(
            "SELECT id FROM agent_connections WHERE workspace_id = ?1 AND agent_type = ?2",
            params![input.workspace_id, agent_type],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    let id = existing_id.unwrap_or_else(|| Uuid::new_v4().to_string());

    conn.execute(
        "INSERT INTO agent_connections(id, workspace_id, agent_type, root_dir, rule_file, enabled, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(workspace_id, agent_type) DO UPDATE SET
            root_dir = excluded.root_dir,
            rule_file = excluded.rule_file,
            enabled = excluded.enabled,
            updated_at = excluded.updated_at",
        params![
            id,
            input.workspace_id,
            agent_type,
            root_dir,
            rule_file,
            bool_to_int(input.enabled),
            now,
            now,
        ],
    )?;

    get_agent_connection(&conn, &input.workspace_id, &agent_type)
}

#[tauri::command]
pub fn agent_connection_toggle(
    state: State<'_, AppState>,
    input: AgentConnectionToggleInput,
) -> Result<AgentConnectionDto, AppError> {
    let conn = state.open()?;
    ensure_workspace_exists(&conn, &input.workspace_id)?;
    ensure_default_agent_connections(&conn, &input.workspace_id)?;

    let agent_type = normalize_agent_type(&input.agent_type)?;
    let connection = get_agent_connection(&conn, &input.workspace_id, &agent_type)?;

    if input.enabled {
        validate_enabled_root_dir(&connection.root_dir)?;
    }

    conn.execute(
        "UPDATE agent_connections SET enabled = ?3, updated_at = ?4 WHERE workspace_id = ?1 AND agent_type = ?2",
        params![
            input.workspace_id,
            agent_type,
            bool_to_int(input.enabled),
            now_rfc3339(),
        ],
    )?;

    get_agent_connection(&conn, &input.workspace_id, &agent_type)
}

#[tauri::command]
pub fn agent_connection_delete(
    state: State<'_, AppState>,
    input: AgentConnectionDeleteInput,
) -> Result<Vec<AgentConnectionDto>, AppError> {
    let conn = state.open()?;
    ensure_workspace_exists(&conn, &input.workspace_id)?;
    ensure_default_agent_connections(&conn, &input.workspace_id)?;

    let agent_type = normalize_agent_type(&input.agent_type)?;
    if matches!(agent_type.as_str(), AGENT_CODEX | AGENT_CLAUDE) {
        return Err(AppError::invalid_argument(
            "codex/claude 为内置连接，禁止删除",
        ));
    }

    let affected = conn.execute(
        "DELETE FROM agent_connections WHERE workspace_id = ?1 AND agent_type = ?2",
        params![input.workspace_id, agent_type],
    )?;
    if affected == 0 {
        return Err(AppError::invalid_argument("Agent 连接不存在"));
    }

    list_agent_connections(&conn, &input.workspace_id)
}

#[tauri::command]
pub fn agent_connection_preview(
    state: State<'_, AppState>,
    input: AgentRulePreviewInput,
) -> Result<AgentRulePreviewResult, AppError> {
    let conn = state.open()?;
    ensure_workspace_exists(&conn, &input.workspace_id)?;
    ensure_default_agent_connections(&conn, &input.workspace_id)?;

    let agent_type = normalize_agent_type(&input.agent_type)?;
    let connection = get_agent_connection(&conn, &input.workspace_id, &agent_type)?;
    validate_enabled_root_dir(&connection.root_dir)?;

    let resolved_path = resolve_rule_file_path(
        &connection.root_dir,
        &connection.rule_file,
        &connection.agent_type,
    )?;
    let resolved_path_str = resolved_path.to_string_lossy().to_string();

    match fs::read_to_string(&resolved_path) {
        Ok(content) => Ok(AgentRulePreviewResult {
            agent_type,
            resolved_path: resolved_path_str,
            status: "ok".to_string(),
            content: Some(content),
            message: None,
        }),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(AgentRulePreviewResult {
            agent_type,
            resolved_path: resolved_path_str,
            status: "not_found".to_string(),
            content: None,
            message: Some("target file not found".to_string()),
        }),
        Err(err) if err.kind() == std::io::ErrorKind::PermissionDenied => {
            Ok(AgentRulePreviewResult {
                agent_type,
                resolved_path: resolved_path_str,
                status: "permission_denied".to_string(),
                content: None,
                message: Some("permission denied".to_string()),
            })
        }
        Err(err) => Err(AppError::internal(format!("读取规则文件失败: {err}"))),
    }
}

pub(super) fn ensure_workspace_exists(conn: &Connection, workspace_id: &str) -> Result<(), AppError> {
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

pub(super) fn ensure_default_agent_connections(
    conn: &Connection,
    workspace_id: &str,
) -> Result<(), AppError> {
    let now = now_rfc3339();
    for agent_type in [AGENT_CODEX, AGENT_CLAUDE] {
        let default_root = default_agent_root_dir(agent_type);
        let default_rule_file = default_rule_file_name(agent_type);
        conn.execute(
            "INSERT INTO agent_connections(id, workspace_id, agent_type, root_dir, rule_file, enabled, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7)
             ON CONFLICT(workspace_id, agent_type) DO UPDATE SET
               root_dir = CASE
                 WHEN trim(COALESCE(agent_connections.root_dir, '')) = ''
                 THEN excluded.root_dir
                 ELSE agent_connections.root_dir
               END,
               rule_file = CASE
                 WHEN trim(COALESCE(agent_connections.rule_file, '')) = ''
                 THEN excluded.rule_file
                 ELSE agent_connections.rule_file
               END,
               updated_at = CASE
                 WHEN trim(COALESCE(agent_connections.root_dir, '')) = ''
                   OR trim(COALESCE(agent_connections.rule_file, '')) = ''
                 THEN excluded.updated_at
                 ELSE agent_connections.updated_at
               END",
            params![
                Uuid::new_v4().to_string(),
                workspace_id,
                agent_type,
                default_root,
                default_rule_file,
                now,
                now
            ],
        )?;
    }
    Ok(())
}

fn connection_row_to_dto(row: ConnectionRow) -> AgentConnectionDto {
    let normalized_rule_file = normalize_rule_file(Some(&row.rule_file), &row.agent_type)
        .unwrap_or_else(|_| default_rule_file_name(&row.agent_type));
    let resolved_path = if row.root_dir.trim().is_empty() {
        None
    } else {
        resolve_rule_file_path(&row.root_dir, &normalized_rule_file, &row.agent_type)
            .ok()
            .map(|path| path.to_string_lossy().to_string())
    };

    AgentConnectionDto {
        id: row.id,
        workspace_id: row.workspace_id,
        agent_type: row.agent_type,
        root_dir: row.root_dir,
        rule_file: normalized_rule_file,
        enabled: row.enabled,
        resolved_path,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

pub(super) fn list_agent_connections(
    conn: &Connection,
    workspace_id: &str,
) -> Result<Vec<AgentConnectionDto>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, agent_type, root_dir, rule_file, enabled, created_at, updated_at
         FROM agent_connections
         WHERE workspace_id = ?1
         ORDER BY agent_type ASC",
    )?;

    let rows = stmt.query_map(params![workspace_id], |row| {
        Ok(ConnectionRow {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            agent_type: row.get(2)?,
            root_dir: row.get(3)?,
            rule_file: row.get(4)?,
            enabled: row.get::<_, i64>(5)? == 1,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    })?;

    let mut list = Vec::new();
    for row in rows {
        list.push(connection_row_to_dto(row?));
    }
    Ok(list)
}

pub(super) fn get_agent_connection(
    conn: &Connection,
    workspace_id: &str,
    agent_type: &str,
) -> Result<AgentConnectionDto, AppError> {
    let row = conn
        .query_row(
            "SELECT id, workspace_id, agent_type, root_dir, rule_file, enabled, created_at, updated_at
             FROM agent_connections
             WHERE workspace_id = ?1 AND agent_type = ?2",
            params![workspace_id, agent_type],
            |row| {
                Ok(ConnectionRow {
                    id: row.get(0)?,
                    workspace_id: row.get(1)?,
                    agent_type: row.get(2)?,
                    root_dir: row.get(3)?,
                    rule_file: row.get(4)?,
                    enabled: row.get::<_, i64>(5)? == 1,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            },
        )
        .optional()?
        .ok_or_else(|| AppError::invalid_argument("Agent 连接不存在"))?;

    Ok(connection_row_to_dto(row))
}
