use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use tauri::State;
use uuid::Uuid;

use crate::{
    db::AppState,
    domain::models::{DistributionTarget, TargetDeleteInput, TargetUpsertInput},
    error::AppError,
    security::{resolve_distribution_target_path, validate_install_mode},
    utils::now_rfc3339,
};

use super::shared::{append_audit_event, get_workspace};

#[tauri::command]
pub fn target_upsert(
    state: State<'_, AppState>,
    input: TargetUpsertInput,
) -> Result<Value, AppError> {
    let mut conn = state.open()?;
    let tx = conn.transaction()?;

    let workspace = get_workspace(&tx, &input.workspace_id)?;
    let root = PathBuf::from(&workspace.root_path);

    let install_mode = input
        .install_mode
        .unwrap_or_else(|| workspace.install_mode.clone());
    validate_install_mode(&install_mode)?;

    let safe_target = resolve_distribution_target_path(&root, Path::new(&input.target_path))?;

    let default_skills = safe_target.join("skills");
    let candidate_skills_path = input
        .skills_path
        .unwrap_or_else(|| default_skills.to_string_lossy().to_string());
    let safe_skills = resolve_distribution_target_path(&root, Path::new(&candidate_skills_path))?;

    let now = now_rfc3339();
    let target_id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());

    tx.execute(
        "INSERT INTO distribution_targets(id, workspace_id, platform, target_path, skills_path, install_mode, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET
            platform = excluded.platform,
            target_path = excluded.target_path,
            skills_path = excluded.skills_path,
            install_mode = excluded.install_mode,
            updated_at = excluded.updated_at",
        params![
            target_id,
            workspace.id,
            input.platform,
            safe_target.to_string_lossy().to_string(),
            safe_skills.to_string_lossy().to_string(),
            install_mode,
            now,
            now,
        ],
    )?;

    let record = get_target(&tx, &target_id)?;

    append_audit_event(
        &tx,
        Some(&workspace.id),
        "distribution_target_upsert",
        "system",
        json!({
            "targetId": record.id,
            "platform": record.platform,
            "installMode": record.install_mode,
        }),
    )?;

    tx.commit()?;
    Ok(json!(record))
}

#[tauri::command]
pub fn target_delete(
    state: State<'_, AppState>,
    input: TargetDeleteInput,
) -> Result<Value, AppError> {
    let mut conn = state.open()?;
    let tx = conn.transaction()?;

    let workspace = get_workspace(&tx, &input.workspace_id)?;
    let target = get_target(&tx, &input.id)?;
    if target.workspace_id != workspace.id {
        return Err(AppError::invalid_argument("target 不存在"));
    }

    tx.execute(
        "DELETE FROM distribution_targets
         WHERE id = ?1 AND workspace_id = ?2",
        params![target.id, workspace.id],
    )?;

    append_audit_event(
        &tx,
        Some(&workspace.id),
        "distribution_target_delete",
        "system",
        json!({
            "targetId": target.id,
            "platform": target.platform,
            "installMode": target.install_mode,
        }),
    )?;

    tx.commit()?;
    Ok(json!({
        "workspaceId": workspace.id,
        "targetId": input.id,
        "deleted": true,
    }))
}

#[tauri::command]
pub fn target_list(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<Value>, AppError> {
    let conn = state.open()?;
    let workspace = get_workspace(&conn, &workspace_id)?;
    ensure_default_skills_distribution_targets(&conn, &workspace)?;
    let targets = list_targets(&conn, &workspace_id, None)?;
    Ok(targets
        .into_iter()
        .map(|target| serde_json::to_value(target).unwrap_or(Value::Null))
        .collect())
}

fn ensure_default_skills_distribution_targets(
    conn: &Connection,
    workspace: &crate::domain::models::Workspace,
) -> Result<(), AppError> {
    let home = match dirs::home_dir() {
        Some(path) => path,
        None => return Ok(()),
    };

    let defaults = [
        (".codex", home.join(".codex")),
        (".claude", home.join(".claude")),
    ];
    let now = now_rfc3339();

    for (platform, target_root) in defaults {
        if !target_root.exists() || !target_root.is_dir() {
            continue;
        }
        let skills_root = target_root.join("skills");
        let target_root_value = target_root.to_string_lossy().to_string();
        let skills_root_value = skills_root.to_string_lossy().to_string();
        let existing_target_id: Option<String> = conn
            .query_row(
                "SELECT id
                 FROM distribution_targets
                 WHERE workspace_id = ?1
                   AND (
                     lower(platform) = lower(?2)
                     OR target_path = ?3
                     OR skills_path = ?4
                   )
                 LIMIT 1",
                params![
                    workspace.id.as_str(),
                    platform,
                    target_root_value.as_str(),
                    skills_root_value.as_str()
                ],
                |row| row.get(0),
            )
            .optional()?;
        if existing_target_id.is_some() {
            continue;
        }
        conn.execute(
            "INSERT INTO distribution_targets(id, workspace_id, platform, target_path, skills_path, install_mode, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(workspace_id, platform) DO NOTHING",
            params![
                Uuid::new_v4().to_string(),
                workspace.id.as_str(),
                platform,
                target_root_value,
                skills_root_value,
                "symlink",
                now.clone(),
                now.clone(),
            ],
        )?;
    }

    Ok(())
}

pub(super) fn get_target(
    conn: &Connection,
    target_id: &str,
) -> Result<DistributionTarget, AppError> {
    conn.query_row(
        "SELECT id, workspace_id, platform, target_path, skills_path, install_mode, created_at, updated_at
         FROM distribution_targets
         WHERE id = ?1",
        params![target_id],
        |row| {
            Ok(DistributionTarget {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                platform: row.get(2)?,
                target_path: row.get(3)?,
                skills_path: row.get(4)?,
                install_mode: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        },
    )
    .optional()?
    .ok_or_else(|| AppError::invalid_argument("target 不存在"))
}

pub(super) fn list_targets(
    conn: &Connection,
    workspace_id: &str,
    target_ids: Option<&[String]>,
) -> Result<Vec<DistributionTarget>, AppError> {
    if let Some(ids) = target_ids {
        if ids.is_empty() {
            return Ok(Vec::new());
        }

        let mut targets = Vec::new();
        for target_id in ids {
            let target = conn
                .query_row(
                    "SELECT id, workspace_id, platform, target_path, skills_path, install_mode, created_at, updated_at
                     FROM distribution_targets
                     WHERE workspace_id = ?1 AND id = ?2",
                    params![workspace_id, target_id],
                    |row| {
                        Ok(DistributionTarget {
                            id: row.get(0)?,
                            workspace_id: row.get(1)?,
                            platform: row.get(2)?,
                            target_path: row.get(3)?,
                            skills_path: row.get(4)?,
                            install_mode: row.get(5)?,
                            created_at: row.get(6)?,
                            updated_at: row.get(7)?,
                        })
                    },
                )
                .optional()?;

            if let Some(item) = target {
                targets.push(item);
            }
        }
        return Ok(targets);
    }

    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, platform, target_path, skills_path, install_mode, created_at, updated_at
         FROM distribution_targets
         WHERE workspace_id = ?1
         ORDER BY created_at ASC",
    )?;

    let rows = stmt.query_map(params![workspace_id], |row| {
        Ok(DistributionTarget {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            platform: row.get(2)?,
            target_path: row.get(3)?,
            skills_path: row.get(4)?,
            install_mode: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    })?;

    let mut targets = Vec::new();
    for row in rows {
        targets.push(row?);
    }
    Ok(targets)
}
