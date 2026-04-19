use rusqlite::params;
use serde_json::{json, Value};
use tauri::State;

use crate::{
    db::AppState,
    domain::models::{AuditQueryInput, ExternalSourceCheckInput},
    error::AppError,
    security::validate_external_source,
};

#[tauri::command]
pub fn audit_query(
    state: State<'_, AppState>,
    input: AuditQueryInput,
) -> Result<Vec<Value>, AppError> {
    let conn = state.open()?;
    let limit = input.limit.unwrap_or(50).clamp(1, 500);

    let mut list = Vec::new();
    if let Some(workspace_id) = input.workspace_id {
        let mut stmt = conn.prepare(
            "SELECT id, workspace_id, event_type, operator, payload, created_at
             FROM audit_events
             WHERE workspace_id = ?1
             ORDER BY created_at DESC
             LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![workspace_id, limit], audit_row_to_json)?;
        for row in rows {
            list.push(row?);
        }
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, workspace_id, event_type, operator, payload, created_at
             FROM audit_events
             ORDER BY created_at DESC
             LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit], audit_row_to_json)?;
        for row in rows {
            list.push(row?);
        }
    }

    Ok(list)
}

#[tauri::command]
pub fn security_check_external_source(input: ExternalSourceCheckInput) -> Result<Value, AppError> {
    let parsed = validate_external_source(&input.url)?;
    Ok(json!({
        "ok": true,
        "normalizedUrl": parsed.to_string(),
    }))
}

fn audit_row_to_json(row: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    let payload: String = row.get(4)?;
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "workspaceId": row.get::<_, Option<String>>(1)?,
        "eventType": row.get::<_, String>(2)?,
        "operator": row.get::<_, String>(3)?,
        "payload": serde_json::from_str::<Value>(&payload).unwrap_or(Value::String(payload)),
        "createdAt": row.get::<_, String>(5)?,
    }))
}
