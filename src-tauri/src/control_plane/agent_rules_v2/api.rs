use std::fs;

use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;
use uuid::Uuid;

use crate::{
    control_plane::agent_presets::{
        all_builtin_agent_presets, default_agent_enabled, is_builtin_agent_preset,
    },
    db::AppState,
    error::AppError,
    security::validate_absolute_root_dir,
    utils::{now_rfc3339, sha256_hex},
};

use super::{
    normalize::{
        bool_to_int, default_agent_root_dir, default_rule_file_name, normalize_agent_type,
        normalize_rule_file, resolve_rule_file_path, validate_enabled_root_dir,
    },
    AgentConnectionDeleteInput, AgentConnectionDto, AgentConnectionPresetActionInput,
    AgentConnectionSearchDirDto, AgentConnectionToggleInput, AgentConnectionUpsertInput,
    AgentRulePreviewInput, AgentRulePreviewResult, ConnectionRow,
};

const SOURCE_MANUAL: &str = "manual";
const SOURCE_INFERRED: &str = "inferred";

const DETECTION_DETECTED: &str = "detected";
const DETECTION_UNDETECTED: &str = "undetected";
const DETECTION_PERMISSION_DENIED: &str = "permission_denied";

#[tauri::command]
pub fn agent_connection_list(
    state: State<'_, AppState>,
) -> Result<Vec<AgentConnectionDto>, AppError> {
    let conn = state.open()?;
    let workspace_id = crate::domain::models::APP_SCOPE_ID;
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
    ensure_workspace_exists(&conn, crate::domain::models::APP_SCOPE_ID)?;
    ensure_default_agent_connections(&conn, crate::domain::models::APP_SCOPE_ID)?;

    let agent_type = normalize_agent_type(&input.agent_type)?;
    let root_dir = input.root_dir.trim().to_string();
    let rule_file = normalize_rule_file(input.rule_file.as_deref(), &agent_type)?;
    if input.enabled {
        validate_enabled_root_dir(&root_dir)?;
    } else if !root_dir.is_empty() {
        validate_absolute_root_dir(&root_dir)?;
    }

    let root_dir_source = normalize_path_source(input.root_dir_source.as_deref(), SOURCE_MANUAL);
    let rule_file_source = normalize_path_source(input.rule_file_source.as_deref(), SOURCE_MANUAL);
    let detection_status = normalize_detection_status(
        input.detection_status.as_deref(),
        infer_detection_status(&root_dir),
    );
    let detected_at = Some(now_rfc3339());

    let now = now_rfc3339();
    let existing_row = get_connection_row(&conn, crate::domain::models::APP_SCOPE_ID, &agent_type)?;
    let id = existing_row
        .as_ref()
        .map(|row| row.id.clone())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let _ignored_skill_search_dirs = input.skill_search_dirs.as_ref();
    let next_search_dirs = normalize_search_dirs(&agent_type, &root_dir, &root_dir_source)?;

    if input.enabled {
        validate_enabled_search_dirs(&next_search_dirs)?;
    }

    conn.execute(
        "INSERT INTO agent_connections(
            id, workspace_id, agent_type, root_dir, rule_file, root_dir_source, rule_file_source,
            detection_status, detected_at, enabled, created_at, updated_at
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
         ON CONFLICT(workspace_id, agent_type) DO UPDATE SET
            root_dir = excluded.root_dir,
            rule_file = excluded.rule_file,
            root_dir_source = excluded.root_dir_source,
            rule_file_source = excluded.rule_file_source,
            detection_status = excluded.detection_status,
            detected_at = excluded.detected_at,
            enabled = excluded.enabled,
            updated_at = excluded.updated_at",
        params![
            id,
            crate::domain::models::APP_SCOPE_ID.to_string(),
            agent_type,
            root_dir,
            rule_file,
            root_dir_source,
            rule_file_source,
            detection_status,
            detected_at,
            bool_to_int(input.enabled),
            now,
            now,
        ],
    )?;

    replace_search_dirs(&conn, &id, &next_search_dirs)?;
    if input.enabled {
        sync_global_rule_binding_for_connection(
            &conn,
            crate::domain::models::APP_SCOPE_ID,
            &agent_type,
            &root_dir,
            &rule_file,
        )?;
    } else {
        remove_global_rule_tag(&conn, crate::domain::models::APP_SCOPE_ID, &agent_type)?;
    }
    get_agent_connection(&conn, crate::domain::models::APP_SCOPE_ID, &agent_type)
}

#[tauri::command]
pub fn agent_connection_toggle(
    state: State<'_, AppState>,
    input: AgentConnectionToggleInput,
) -> Result<AgentConnectionDto, AppError> {
    let conn = state.open()?;
    ensure_workspace_exists(&conn, crate::domain::models::APP_SCOPE_ID)?;
    ensure_default_agent_connections(&conn, crate::domain::models::APP_SCOPE_ID)?;

    let agent_type = normalize_agent_type(&input.agent_type)?;
    let connection = get_agent_connection(&conn, crate::domain::models::APP_SCOPE_ID, &agent_type)?;

    if input.enabled {
        validate_enabled_root_dir(&connection.root_dir)?;
        validate_enabled_search_dirs(&connection.skill_search_dirs)?;
    }

    conn.execute(
        "UPDATE agent_connections SET enabled = ?3, updated_at = ?4 WHERE workspace_id = ?1 AND agent_type = ?2",
        params![
            crate::domain::models::APP_SCOPE_ID.to_string(),
            agent_type,
            bool_to_int(input.enabled),
            now_rfc3339(),
        ],
    )?;

    if input.enabled {
        sync_global_rule_binding_for_connection(
            &conn,
            crate::domain::models::APP_SCOPE_ID,
            &connection.agent_type,
            &connection.root_dir,
            &connection.rule_file,
        )?;
    } else {
        remove_global_rule_tag(&conn, crate::domain::models::APP_SCOPE_ID, &agent_type)?;
    }

    get_agent_connection(&conn, crate::domain::models::APP_SCOPE_ID, &agent_type)
}

#[tauri::command]
pub fn agent_connection_delete(
    state: State<'_, AppState>,
    input: AgentConnectionDeleteInput,
) -> Result<Vec<AgentConnectionDto>, AppError> {
    let conn = state.open()?;
    ensure_workspace_exists(&conn, crate::domain::models::APP_SCOPE_ID)?;
    ensure_default_agent_connections(&conn, crate::domain::models::APP_SCOPE_ID)?;

    let agent_type = normalize_agent_type(&input.agent_type)?;
    if is_builtin_agent_preset(&agent_type) {
        return Err(AppError::invalid_argument("内置连接禁止删除，请使用停用"));
    }

    remove_global_rule_tag(&conn, crate::domain::models::APP_SCOPE_ID, &agent_type)?;

    let affected = conn.execute(
        "DELETE FROM agent_connections WHERE workspace_id = ?1 AND agent_type = ?2",
        params![crate::domain::models::APP_SCOPE_ID.to_string(), agent_type],
    )?;
    if affected == 0 {
        return Err(AppError::invalid_argument("Agent 连接不存在"));
    }

    list_agent_connections(&conn, crate::domain::models::APP_SCOPE_ID)
}

#[tauri::command]
pub fn agent_connection_redetect(
    state: State<'_, AppState>,
    input: AgentConnectionPresetActionInput,
) -> Result<AgentConnectionDto, AppError> {
    let conn = state.open()?;
    ensure_workspace_exists(&conn, crate::domain::models::APP_SCOPE_ID)?;
    ensure_default_agent_connections(&conn, crate::domain::models::APP_SCOPE_ID)?;

    let agent_type = normalize_agent_type(&input.agent_type)?;
    if !is_builtin_agent_preset(&agent_type) {
        return Err(AppError::invalid_argument("仅内置 Agent 支持重新检测"));
    }

    let existing =
        get_connection_row_required(&conn, crate::domain::models::APP_SCOPE_ID, &agent_type)?;
    let default_root = default_agent_root_dir(&agent_type);
    let default_rule = default_rule_file_name(&agent_type);
    let (detected_root, status) = detect_candidate_root(&candidate_root_dirs(&agent_type));

    let mut next_root = existing.root_dir.clone();
    let mut next_rule = existing.rule_file.clone();
    let mut next_root_source = existing.root_dir_source.clone();
    let mut next_rule_source = existing.rule_file_source.clone();
    let mut next_dirs = default_search_dirs(&agent_type, &next_root, SOURCE_MANUAL)?;

    if let Some(path) = detected_root {
        next_root = path;
        next_rule = default_rule;
        next_root_source = SOURCE_INFERRED.to_string();
        next_rule_source = SOURCE_INFERRED.to_string();
        next_dirs = default_search_dirs(&agent_type, &next_root, SOURCE_INFERRED)?;
    } else if !is_manual_overridden(&existing) {
        next_root = default_root;
        next_rule = default_rule;
        next_root_source = SOURCE_INFERRED.to_string();
        next_rule_source = SOURCE_INFERRED.to_string();
        next_dirs = default_search_dirs(&agent_type, &next_root, SOURCE_INFERRED)?;
    }

    conn.execute(
        "UPDATE agent_connections
         SET root_dir = ?3,
             rule_file = ?4,
             root_dir_source = ?5,
             rule_file_source = ?6,
             detection_status = ?7,
             detected_at = ?8,
             updated_at = ?9
         WHERE workspace_id = ?1 AND agent_type = ?2",
        params![
            crate::domain::models::APP_SCOPE_ID.to_string(),
            agent_type,
            next_root,
            next_rule,
            next_root_source,
            next_rule_source,
            status,
            now_rfc3339(),
            now_rfc3339(),
        ],
    )?;

    replace_search_dirs(&conn, &existing.id, &next_dirs)?;
    get_agent_connection(&conn, crate::domain::models::APP_SCOPE_ID, &agent_type)
}

#[tauri::command]
pub fn agent_connection_restore_defaults(
    state: State<'_, AppState>,
    input: AgentConnectionPresetActionInput,
) -> Result<AgentConnectionDto, AppError> {
    let conn = state.open()?;
    ensure_workspace_exists(&conn, crate::domain::models::APP_SCOPE_ID)?;
    ensure_default_agent_connections(&conn, crate::domain::models::APP_SCOPE_ID)?;

    let agent_type = normalize_agent_type(&input.agent_type)?;
    if !is_builtin_agent_preset(&agent_type) {
        return Err(AppError::invalid_argument("仅内置 Agent 支持恢复默认配置"));
    }

    let existing =
        get_connection_row_required(&conn, crate::domain::models::APP_SCOPE_ID, &agent_type)?;
    let default_root = default_agent_root_dir(&agent_type);
    let default_rule = default_rule_file_name(&agent_type);
    let detection_status = infer_detection_status(&default_root);
    let default_dirs = default_search_dirs(&agent_type, &default_root, SOURCE_INFERRED)?;

    conn.execute(
        "UPDATE agent_connections
         SET root_dir = ?3,
             rule_file = ?4,
             root_dir_source = ?5,
             rule_file_source = ?6,
             detection_status = ?7,
             detected_at = ?8,
             enabled = ?9,
             updated_at = ?10
         WHERE workspace_id = ?1 AND agent_type = ?2",
        params![
            crate::domain::models::APP_SCOPE_ID.to_string(),
            agent_type,
            default_root,
            default_rule,
            SOURCE_INFERRED,
            SOURCE_INFERRED,
            detection_status,
            now_rfc3339(),
            if default_agent_enabled(&agent_type) {
                1
            } else {
                0
            },
            now_rfc3339(),
        ],
    )?;

    replace_search_dirs(&conn, &existing.id, &default_dirs)?;
    if default_agent_enabled(&agent_type) {
        sync_global_rule_binding_for_connection(
            &conn,
            crate::domain::models::APP_SCOPE_ID,
            &agent_type,
            &default_root,
            &default_rule,
        )?;
    } else {
        remove_global_rule_tag(&conn, crate::domain::models::APP_SCOPE_ID, &agent_type)?;
    }
    get_agent_connection(&conn, crate::domain::models::APP_SCOPE_ID, &agent_type)
}

#[tauri::command]
pub fn agent_connection_preview(
    state: State<'_, AppState>,
    input: AgentRulePreviewInput,
) -> Result<AgentRulePreviewResult, AppError> {
    let conn = state.open()?;
    ensure_workspace_exists(&conn, crate::domain::models::APP_SCOPE_ID)?;
    ensure_default_agent_connections(&conn, crate::domain::models::APP_SCOPE_ID)?;

    let agent_type = normalize_agent_type(&input.agent_type)?;
    let connection = get_agent_connection(&conn, crate::domain::models::APP_SCOPE_ID, &agent_type)?;
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

pub(super) fn ensure_workspace_exists(
    conn: &Connection,
    workspace_id: &str,
) -> Result<(), AppError> {
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
    for preset in all_builtin_agent_presets() {
        let agent_type = preset.id;
        let default_root = default_agent_root_dir(agent_type);
        let default_rule_file = default_rule_file_name(agent_type);
        let default_enabled = if default_agent_enabled(agent_type) {
            1
        } else {
            0
        };
        let detection_status = infer_detection_status(&default_root);
        let detected_at = if detection_status == DETECTION_DETECTED {
            Some(now.clone())
        } else {
            None
        };

        conn.execute(
            "INSERT INTO agent_connections(
                id, workspace_id, agent_type, root_dir, rule_file, root_dir_source, rule_file_source,
                detection_status, detected_at, enabled, created_at, updated_at
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
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
               root_dir_source = CASE
                 WHEN trim(COALESCE(agent_connections.root_dir_source, '')) = ''
                 THEN excluded.root_dir_source
                 ELSE agent_connections.root_dir_source
               END,
               rule_file_source = CASE
                 WHEN trim(COALESCE(agent_connections.rule_file_source, '')) = ''
                 THEN excluded.rule_file_source
                 ELSE agent_connections.rule_file_source
               END,
               detection_status = CASE
                 WHEN trim(COALESCE(agent_connections.detection_status, '')) = ''
                 THEN excluded.detection_status
                 ELSE agent_connections.detection_status
               END,
               detected_at = CASE
                 WHEN agent_connections.detected_at IS NULL
                 THEN excluded.detected_at
                 ELSE agent_connections.detected_at
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
                SOURCE_INFERRED,
                SOURCE_INFERRED,
                detection_status,
                detected_at,
                default_enabled,
                now,
                now
            ],
        )?;

        if let Some(row) = get_connection_row(conn, workspace_id, agent_type)? {
            ensure_default_search_dirs(conn, &row.id, agent_type, &row.root_dir)?;
        }
    }
    Ok(())
}

fn connection_row_to_dto(
    _conn: &Connection,
    row: ConnectionRow,
) -> Result<AgentConnectionDto, AppError> {
    let normalized_rule_file = normalize_rule_file(Some(&row.rule_file), &row.agent_type)
        .unwrap_or_else(|_| default_rule_file_name(&row.agent_type));
    let resolved_path = if row.root_dir.trim().is_empty() {
        None
    } else {
        resolve_rule_file_path(&row.root_dir, &normalized_rule_file, &row.agent_type)
            .ok()
            .map(|path| path.to_string_lossy().to_string())
    };
    let search_dirs = normalize_search_dirs(&row.agent_type, &row.root_dir, &row.root_dir_source)?;

    Ok(AgentConnectionDto {
        id: row.id,
        workspace_id: row.workspace_id,
        agent_type: row.agent_type,
        root_dir: row.root_dir,
        rule_file: normalized_rule_file,
        root_dir_source: normalize_path_source(Some(&row.root_dir_source), SOURCE_INFERRED),
        rule_file_source: normalize_path_source(Some(&row.rule_file_source), SOURCE_INFERRED),
        detection_status: normalize_detection_status(
            Some(&row.detection_status),
            DETECTION_UNDETECTED,
        ),
        detected_at: row.detected_at,
        skill_search_dirs: search_dirs,
        enabled: row.enabled,
        resolved_path,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

pub(super) fn list_agent_connections(
    conn: &Connection,
    workspace_id: &str,
) -> Result<Vec<AgentConnectionDto>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, agent_type, root_dir, rule_file, root_dir_source, rule_file_source,
                detection_status, detected_at, enabled, created_at, updated_at
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
            root_dir_source: row.get(5)?,
            rule_file_source: row.get(6)?,
            detection_status: row.get(7)?,
            detected_at: row.get(8)?,
            enabled: row.get::<_, i64>(9)? == 1,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
        })
    })?;

    let mut list = Vec::new();
    for row in rows {
        list.push(connection_row_to_dto(conn, row?)?);
    }
    Ok(list)
}

pub(super) fn get_agent_connection(
    conn: &Connection,
    workspace_id: &str,
    agent_type: &str,
) -> Result<AgentConnectionDto, AppError> {
    let row = get_connection_row(conn, workspace_id, agent_type)?
        .ok_or_else(|| AppError::invalid_argument("Agent 连接不存在"))?;
    connection_row_to_dto(conn, row)
}

#[allow(dead_code)]
pub(super) fn load_enabled_search_dirs_by_agent(
    conn: &Connection,
    workspace_id: &str,
) -> Result<std::collections::HashMap<String, Vec<AgentConnectionSearchDirDto>>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT agent_type, root_dir, root_dir_source
         FROM agent_connections
         WHERE workspace_id = ?1 AND enabled = 1",
    )?;
    let rows = stmt.query_map(params![workspace_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;

    let mut map = std::collections::HashMap::new();
    for row in rows {
        let (agent_type, root_dir, root_dir_source) = row?;
        let dirs = normalize_search_dirs(&agent_type, &root_dir, &root_dir_source)?
            .into_iter()
            .filter(|item| item.enabled)
            .collect::<Vec<_>>();
        map.insert(agent_type, dirs);
    }
    Ok(map)
}

fn get_connection_row_required(
    conn: &Connection,
    workspace_id: &str,
    agent_type: &str,
) -> Result<ConnectionRow, AppError> {
    get_connection_row(conn, workspace_id, agent_type)?
        .ok_or_else(|| AppError::invalid_argument("Agent 连接不存在"))
}

fn get_connection_row(
    conn: &Connection,
    workspace_id: &str,
    agent_type: &str,
) -> Result<Option<ConnectionRow>, AppError> {
    conn.query_row(
        "SELECT id, workspace_id, agent_type, root_dir, rule_file, root_dir_source, rule_file_source,
                detection_status, detected_at, enabled, created_at, updated_at
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
                root_dir_source: row.get(5)?,
                rule_file_source: row.get(6)?,
                detection_status: row.get(7)?,
                detected_at: row.get(8)?,
                enabled: row.get::<_, i64>(9)? == 1,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        },
    )
    .optional()
    .map_err(Into::into)
}

#[allow(dead_code)]
fn load_search_dirs(
    conn: &Connection,
    connection_id: &str,
) -> Result<Vec<AgentConnectionSearchDirDto>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT path, enabled, priority, source
         FROM agent_connection_search_dirs
         WHERE connection_id = ?1
         ORDER BY priority ASC, path ASC",
    )?;
    let rows = stmt.query_map(params![connection_id], |row| {
        Ok(AgentConnectionSearchDirDto {
            path: row.get(0)?,
            enabled: row.get::<_, i64>(1)? == 1,
            priority: row.get(2)?,
            source: row.get(3)?,
        })
    })?;

    let mut dirs = Vec::new();
    for row in rows {
        dirs.push(row?);
    }
    Ok(dirs)
}

fn replace_search_dirs(
    conn: &Connection,
    connection_id: &str,
    dirs: &[AgentConnectionSearchDirDto],
) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM agent_connection_search_dirs WHERE connection_id = ?1",
        params![connection_id],
    )?;

    for (index, dir) in dirs.iter().enumerate() {
        conn.execute(
            "INSERT INTO agent_connection_search_dirs(
                id, connection_id, path, enabled, priority, source, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                Uuid::new_v4().to_string(),
                connection_id,
                dir.path,
                bool_to_int(dir.enabled),
                if dir.priority >= 0 {
                    dir.priority
                } else {
                    index as i64
                },
                normalize_path_source(Some(&dir.source), SOURCE_INFERRED),
                now_rfc3339(),
                now_rfc3339(),
            ],
        )?;
    }

    Ok(())
}

fn ensure_default_search_dirs(
    conn: &Connection,
    connection_id: &str,
    agent_type: &str,
    root_dir: &str,
) -> Result<(), AppError> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(1) FROM agent_connection_search_dirs WHERE connection_id = ?1",
        params![connection_id],
        |row| row.get(0),
    )?;
    if exists > 0 {
        return Ok(());
    }

    let defaults = default_search_dirs(agent_type, root_dir, SOURCE_INFERRED)?;
    replace_search_dirs(conn, connection_id, &defaults)
}

fn normalize_search_dirs(
    agent_type: &str,
    root_dir: &str,
    root_dir_source: &str,
) -> Result<Vec<AgentConnectionSearchDirDto>, AppError> {
    default_search_dirs(
        agent_type,
        root_dir,
        if root_dir_source == SOURCE_MANUAL {
            SOURCE_MANUAL
        } else {
            SOURCE_INFERRED
        },
    )
}

fn default_search_dirs(
    _agent_type: &str,
    root_dir: &str,
    source: &str,
) -> Result<Vec<AgentConnectionSearchDirDto>, AppError> {
    let trimmed = root_dir.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let normalized_path = normalize_search_dir_path(trimmed)?;
    Ok(vec![AgentConnectionSearchDirDto {
        path: normalized_path,
        enabled: true,
        priority: 0,
        source: normalize_path_source(Some(source), SOURCE_INFERRED),
    }])
}

fn normalize_search_dir_path(path: &str) -> Result<String, AppError> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(AppError::invalid_argument("skillSearchDirs.path 不能为空"));
    }
    validate_absolute_root_dir(trimmed)?;
    Ok(trimmed.to_string())
}

fn remove_global_rule_tag(
    conn: &Connection,
    workspace_id: &str,
    agent_type: &str,
) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM global_rule_agent_tags
         WHERE workspace_id = ?1 AND agent_type = ?2",
        params![workspace_id, agent_type],
    )?;
    Ok(())
}

fn sync_global_rule_binding_for_connection(
    conn: &Connection,
    workspace_id: &str,
    agent_type: &str,
    root_dir: &str,
    rule_file: &str,
) -> Result<(), AppError> {
    let resolved_path = match resolve_rule_file_path(root_dir, rule_file, agent_type) {
        Ok(path) => path,
        Err(_) => {
            remove_global_rule_tag(conn, workspace_id, agent_type)?;
            return Ok(());
        }
    };

    let content = match fs::read_to_string(&resolved_path) {
        Ok(value) => value,
        Err(err)
            if err.kind() == std::io::ErrorKind::NotFound
                || err.kind() == std::io::ErrorKind::PermissionDenied =>
        {
            remove_global_rule_tag(conn, workspace_id, agent_type)?;
            return Ok(());
        }
        Err(err) => return Err(AppError::internal(format!("读取 Agent 规则失败: {err}"))),
    };

    let content_hash = sha256_hex(&content);
    let (asset_id, version) =
        match find_matching_rule_asset(conn, workspace_id, &content_hash, &content)? {
            Some(found) => found,
            None => create_rule_asset_from_content(
                conn,
                workspace_id,
                agent_type,
                rule_file,
                &content,
                &content_hash,
            )?,
        };
    upsert_global_rule_tag(
        conn,
        workspace_id,
        agent_type,
        &asset_id,
        version,
        &content_hash,
    )?;
    Ok(())
}

fn find_matching_rule_asset(
    conn: &Connection,
    workspace_id: &str,
    content_hash: &str,
    content: &str,
) -> Result<Option<(String, i64)>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT a.id, v.version, v.content
         FROM global_rule_assets a
         JOIN global_rule_versions v ON v.asset_id = a.id
         WHERE a.workspace_id = ?1 AND v.content_hash = ?2
         ORDER BY a.updated_at DESC, v.version DESC",
    )?;
    let rows = stmt.query_map(params![workspace_id, content_hash], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    for row in rows {
        let (asset_id, version, existing_content) = row?;
        if existing_content == content {
            return Ok(Some((asset_id, version)));
        }
    }
    Ok(None)
}

fn create_rule_asset_from_content(
    conn: &Connection,
    workspace_id: &str,
    agent_type: &str,
    rule_file: &str,
    content: &str,
    content_hash: &str,
) -> Result<(String, i64), AppError> {
    let now = now_rfc3339();
    let asset_id = Uuid::new_v4().to_string();
    let safe_rule_file = rule_file.replace(['/', '\\', ' '], "_");
    let hash_short = content_hash.chars().take(8).collect::<String>();
    let random_suffix = Uuid::new_v4()
        .to_string()
        .chars()
        .take(6)
        .collect::<String>();
    let name = format!(
        "auto:{agent_type}:{safe_rule_file}:{hash_short}:{}",
        random_suffix
    );

    conn.execute(
        "INSERT INTO global_rule_assets(id, workspace_id, name, latest_version, created_at, updated_at)
         VALUES (?1, ?2, ?3, 1, ?4, ?5)",
        params![asset_id, workspace_id, name, now, now],
    )?;
    conn.execute(
        "INSERT INTO global_rule_versions(id, asset_id, version, content, content_hash, operator, created_at)
         VALUES (?1, ?2, 1, ?3, ?4, 'system', ?5)",
        params![Uuid::new_v4().to_string(), asset_id, content, content_hash, now],
    )?;
    Ok((asset_id, 1))
}

fn upsert_global_rule_tag(
    conn: &Connection,
    workspace_id: &str,
    agent_type: &str,
    asset_id: &str,
    version: i64,
    content_hash: &str,
) -> Result<(), AppError> {
    let now = now_rfc3339();
    conn.execute(
        "INSERT INTO global_rule_agent_tags(
            id, workspace_id, agent_type, asset_id, last_applied_version, last_applied_hash,
            drift_status, drift_reason, last_checked_at, updated_at
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'clean', '', ?7, ?8)
         ON CONFLICT(workspace_id, agent_type) DO UPDATE SET
            asset_id = excluded.asset_id,
            last_applied_version = excluded.last_applied_version,
            last_applied_hash = excluded.last_applied_hash,
            drift_status = 'clean',
            drift_reason = '',
            last_checked_at = excluded.last_checked_at,
            updated_at = excluded.updated_at",
        params![
            Uuid::new_v4().to_string(),
            workspace_id,
            agent_type,
            asset_id,
            version,
            content_hash,
            now,
            now,
        ],
    )?;
    Ok(())
}

fn normalize_path_source(source: Option<&str>, fallback: &str) -> String {
    match source.map(|item| item.trim().to_ascii_lowercase()) {
        Some(value) if value == SOURCE_MANUAL => SOURCE_MANUAL.to_string(),
        Some(value) if value == SOURCE_INFERRED => SOURCE_INFERRED.to_string(),
        _ => fallback.to_string(),
    }
}

fn normalize_detection_status(status: Option<&str>, fallback: &str) -> String {
    match status.map(|item| item.trim().to_ascii_lowercase()) {
        Some(value) if value == DETECTION_DETECTED => DETECTION_DETECTED.to_string(),
        Some(value) if value == DETECTION_UNDETECTED => DETECTION_UNDETECTED.to_string(),
        Some(value) if value == DETECTION_PERMISSION_DENIED => {
            DETECTION_PERMISSION_DENIED.to_string()
        }
        _ => fallback.to_string(),
    }
}

fn validate_enabled_search_dirs(dirs: &[AgentConnectionSearchDirDto]) -> Result<(), AppError> {
    let has_enabled = dirs.iter().any(|item| item.enabled);
    if !has_enabled {
        return Err(AppError::invalid_argument(
            "启用 Agent 时至少需要一个有效的 skillSearchDirs",
        ));
    }

    for dir in dirs.iter().filter(|item| item.enabled) {
        validate_absolute_root_dir(&dir.path)?;
    }
    Ok(())
}

fn infer_detection_status(root_dir: &str) -> &'static str {
    let trimmed = root_dir.trim();
    if trimmed.is_empty() {
        return DETECTION_UNDETECTED;
    }
    match fs::metadata(trimmed) {
        Ok(metadata) => {
            if metadata.is_dir() {
                DETECTION_DETECTED
            } else {
                DETECTION_UNDETECTED
            }
        }
        Err(err) if err.kind() == std::io::ErrorKind::PermissionDenied => {
            DETECTION_PERMISSION_DENIED
        }
        Err(_) => DETECTION_UNDETECTED,
    }
}

fn candidate_root_dirs(agent_type: &str) -> Vec<String> {
    let default_root = default_agent_root_dir(agent_type);
    if default_root.trim().is_empty() {
        return Vec::new();
    }
    vec![default_root]
}

fn detect_candidate_root(candidates: &[String]) -> (Option<String>, String) {
    let mut saw_permission_denied = false;
    for candidate in candidates {
        let status = infer_detection_status(candidate);
        if status == DETECTION_DETECTED {
            return (Some(candidate.clone()), DETECTION_DETECTED.to_string());
        }
        if status == DETECTION_PERMISSION_DENIED {
            saw_permission_denied = true;
        }
    }
    (
        None,
        if saw_permission_denied {
            DETECTION_PERMISSION_DENIED.to_string()
        } else {
            DETECTION_UNDETECTED.to_string()
        },
    )
}

fn is_manual_overridden(connection: &ConnectionRow) -> bool {
    connection.root_dir_source == SOURCE_MANUAL || connection.rule_file_source == SOURCE_MANUAL
}
