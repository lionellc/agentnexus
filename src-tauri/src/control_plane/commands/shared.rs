use std::collections::HashMap;

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    domain::models::Workspace,
    error::AppError,
    utils::now_rfc3339,
};

pub(super) fn bool_to_int(value: bool) -> i64 {
    if value {
        1
    } else {
        0
    }
}

pub(super) fn workspace_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Workspace> {
    let overrides_raw: String = row.get(4)?;
    let platform_overrides: HashMap<String, String> =
        serde_json::from_str(&overrides_raw).unwrap_or_default();

    Ok(Workspace {
        id: row.get(0)?,
        name: row.get(1)?,
        root_path: row.get(2)?,
        install_mode: row.get(3)?,
        platform_overrides,
        active: row.get::<_, i64>(5)? == 1,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

pub(super) fn get_workspace(conn: &Connection, id: &str) -> Result<Workspace, AppError> {
    conn.query_row(
        "SELECT id, name, root_path, install_mode, platform_overrides, active, created_at, updated_at
         FROM workspaces
         WHERE id = ?1",
        params![id],
        workspace_from_row,
    )
    .optional()?
    .ok_or_else(AppError::workspace_not_found)
}

pub(super) fn append_audit_event(
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
