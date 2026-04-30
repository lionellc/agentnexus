use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;
use uuid::Uuid;

use crate::{db::AppState, error::AppError, utils::now_rfc3339};

use super::{
    validation::{
        bool_to_int, normalize_profile_key, validate_args_template, validate_executable,
        validate_profile_name,
    },
    LocalAgentProfileDeleteInput, LocalAgentProfileDto, LocalAgentProfileUpsertInput,
    BUILTIN_CLAUDE, BUILTIN_CODEX,
};

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

    let normalized_key =
        normalize_profile_key(input.profile_key.as_deref().unwrap_or(input.name.as_str()))?;
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

pub(super) fn ensure_prompt_exists(conn: &Connection, prompt_id: &str) -> Result<(), AppError> {
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

fn default_profile_templates(profile_key: &str) -> (&'static str, Vec<String>) {
    match profile_key {
        BUILTIN_CODEX => (
            "codex",
            vec![
                "exec".to_string(),
                super::CODEX_SKIP_GIT_REPO_CHECK_FLAG.to_string(),
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

pub(super) fn ensure_default_profiles(
    conn: &Connection,
    workspace_id: &str,
) -> Result<(), AppError> {
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

pub(super) fn list_profiles(
    conn: &Connection,
    workspace_id: &str,
) -> Result<Vec<LocalAgentProfileDto>, AppError> {
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

pub(super) fn profile_by_key(
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
