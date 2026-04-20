use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};

use rusqlite::params;
use serde_json::json;
use tauri::State;
use uuid::Uuid;

use crate::{
    control_plane::agent_presets::{
        all_builtin_agent_presets, default_agent_enabled, default_agent_root_dir,
        default_agent_rule_file,
    },
    db::{load_runtime_flags, AppState},
    domain::models::{
        RuntimeFlags, RuntimeFlagsInput, Workspace, WorkspaceActivateInput, WorkspaceCreateInput,
        WorkspaceUpdateInput,
    },
    error::AppError,
    security::{ensure_safe_target_path, validate_install_mode, validate_workspace_root},
    utils::now_rfc3339,
};

use super::shared::{append_audit_event, bool_to_int, get_workspace, workspace_from_row};

#[tauri::command]
pub fn workspace_create(
    state: State<'_, AppState>,
    input: WorkspaceCreateInput,
) -> Result<Workspace, AppError> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err(AppError::invalid_argument("workspace 名称不能为空"));
    }

    let root = validate_workspace_root(&input.root_path)?;
    let now = now_rfc3339();
    let workspace = Workspace {
        id: Uuid::new_v4().to_string(),
        name: name.to_string(),
        root_path: root.to_string_lossy().to_string(),
        install_mode: "copy".to_string(),
        platform_overrides: HashMap::new(),
        active: false,
        created_at: now.clone(),
        updated_at: now.clone(),
    };

    let conn = state.open()?;
    conn.execute(
        "INSERT INTO workspaces(id, name, root_path, install_mode, platform_overrides, active, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            workspace.id,
            workspace.name,
            workspace.root_path,
            workspace.install_mode,
            serde_json::to_string(&workspace.platform_overrides)
                .map_err(|err| AppError::internal(err.to_string()))?,
            0,
            workspace.created_at,
            workspace.updated_at,
        ],
    )?;
    for preset in all_builtin_agent_presets() {
        let agent_type = preset.id;
        let default_root = default_agent_root_dir(agent_type);
        let default_rule_file = default_agent_rule_file(agent_type);
        let enabled = if default_agent_enabled(agent_type) { 1 } else { 0 };
        conn.execute(
            "INSERT INTO agent_connections(id, workspace_id, agent_type, root_dir, rule_file, enabled, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(workspace_id, agent_type) DO NOTHING",
            params![
                Uuid::new_v4().to_string(),
                workspace.id.clone(),
                agent_type,
                default_root,
                default_rule_file,
                enabled,
                workspace.created_at.clone(),
                workspace.updated_at.clone()
            ],
        )?;
    }

    append_audit_event(
        &conn,
        Some(&workspace.id),
        "workspace_create",
        "system",
        json!({
            "workspaceId": workspace.id,
            "rootPath": workspace.root_path,
        }),
    )?;

    Ok(workspace)
}

#[tauri::command]
pub fn workspace_update(
    state: State<'_, AppState>,
    input: WorkspaceUpdateInput,
) -> Result<Workspace, AppError> {
    let mut conn = state.open()?;
    let tx = conn.transaction()?;

    let mut workspace = get_workspace(&tx, &input.id)?;

    if let Some(name) = input.name {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err(AppError::invalid_argument("workspace 名称不能为空"));
        }
        workspace.name = trimmed.to_string();
    }

    if let Some(root_path) = input.root_path {
        let canonical = validate_workspace_root(&root_path)?;
        workspace.root_path = canonical.to_string_lossy().to_string();
    }

    if let Some(install_mode) = input.install_mode {
        validate_install_mode(&install_mode)?;
        workspace.install_mode = install_mode;
    }

    if let Some(overrides) = input.platform_overrides {
        let root = PathBuf::from(&workspace.root_path);
        for target_path in overrides.values() {
            ensure_safe_target_path(&root, Path::new(target_path))?;
        }
        workspace.platform_overrides = overrides;
    }

    workspace.updated_at = now_rfc3339();

    tx.execute(
        "UPDATE workspaces
         SET name = ?2, root_path = ?3, install_mode = ?4, platform_overrides = ?5, updated_at = ?6
         WHERE id = ?1",
        params![
            workspace.id,
            workspace.name,
            workspace.root_path,
            workspace.install_mode,
            serde_json::to_string(&workspace.platform_overrides)
                .map_err(|err| AppError::internal(err.to_string()))?,
            workspace.updated_at,
        ],
    )?;

    append_audit_event(
        &tx,
        Some(&workspace.id),
        "workspace_update",
        "system",
        json!({
            "workspaceId": workspace.id,
            "installMode": workspace.install_mode,
            "platformOverrides": workspace.platform_overrides,
        }),
    )?;

    tx.commit()?;
    Ok(workspace)
}

#[tauri::command]
pub fn workspace_activate(
    state: State<'_, AppState>,
    input: WorkspaceActivateInput,
) -> Result<Workspace, AppError> {
    let mut conn = state.open()?;
    let tx = conn.transaction()?;

    let mut workspace = get_workspace(&tx, &input.id)?;

    tx.execute("UPDATE workspaces SET active = 0", [])?;
    tx.execute(
        "UPDATE workspaces SET active = 1, updated_at = ?2 WHERE id = ?1",
        params![workspace.id, now_rfc3339()],
    )?;

    workspace.active = true;
    workspace.updated_at = now_rfc3339();

    append_audit_event(
        &tx,
        Some(&workspace.id),
        "workspace_activate",
        "system",
        json!({ "workspaceId": workspace.id }),
    )?;

    tx.commit()?;
    Ok(workspace)
}

#[tauri::command]
pub fn workspace_list(state: State<'_, AppState>) -> Result<Vec<Workspace>, AppError> {
    let conn = state.open()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, root_path, install_mode, platform_overrides, active, created_at, updated_at
         FROM workspaces ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([], workspace_from_row)?;

    let mut list = Vec::new();
    for row in rows {
        list.push(row?);
    }

    Ok(list)
}

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
