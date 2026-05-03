use rusqlite::params;
use serde_json::json;
use tauri::State;

use crate::{
    db::{load_runtime_flags, AppState},
    domain::models::{RuntimeFlags, RuntimeFlagsInput},
    error::AppError,
    utils::now_rfc3339,
};

use super::shared::{append_audit_event, bool_to_int};

#[tauri::command]
pub fn runtime_flags_get(state: State<'_, AppState>) -> Result<RuntimeFlags, AppError> {
    let conn = state.open()?;
    load_runtime_flags(&conn)
}

#[tauri::command]
pub fn runtime_flags_update(
    state: State<'_, AppState>,
    input: RuntimeFlagsInput,
) -> Result<RuntimeFlags, AppError> {
    let conn = state.open()?;
    conn.execute(
        "UPDATE runtime_config
         SET local_mode = ?1, external_sources_enabled = ?2, experimental_enabled = ?3, updated_at = ?4
         WHERE id = 1",
        params![
            bool_to_int(input.local_mode),
            bool_to_int(input.external_sources_enabled),
            bool_to_int(input.experimental_enabled),
            now_rfc3339()
        ],
    )?;

    let flags = load_runtime_flags(&conn)?;

    append_audit_event(
        &conn,
        None,
        "runtime_flags_update",
        "system",
        json!({
            "localMode": flags.local_mode,
            "externalSourcesEnabled": flags.external_sources_enabled,
            "experimentalEnabled": flags.experimental_enabled,
        }),
    )?;

    Ok(flags)
}
