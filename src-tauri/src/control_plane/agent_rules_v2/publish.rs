use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;
use uuid::Uuid;

use crate::{
    db::AppState,
    error::AppError,
    utils::{now_rfc3339, sha256_hex},
};

use super::{
    api::{ensure_default_agent_connections, ensure_workspace_exists},
    normalize::resolve_rule_file_path,
    AgentRuleAssetCreateInput, AgentRuleAssetDeleteInput, AgentRuleAssetDto,
    AgentRuleAssetPublishInput, AgentRuleAssetRenameInput, AgentRuleAssetRollbackInput,
    AgentRuleTagDto, AgentRuleVersionDto, VersionBundle,
};

#[tauri::command]
pub fn agent_rule_asset_list(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<AgentRuleAssetDto>, AppError> {
    let conn = state.open()?;
    ensure_workspace_exists(&conn, &workspace_id)?;
    ensure_default_agent_connections(&conn, &workspace_id)?;

    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, name, latest_version, created_at, updated_at
         FROM global_rule_assets
         WHERE workspace_id = ?1
         ORDER BY updated_at DESC",
    )?;

    let rows = stmt.query_map(params![workspace_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, i64>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
        ))
    })?;

    let mut assets = Vec::new();
    for row in rows {
        let (id, workspace_id, name, latest_version, created_at, updated_at) = row?;
        let latest_content_hash = conn
            .query_row(
                "SELECT content_hash FROM global_rule_versions WHERE asset_id = ?1 AND version = ?2",
                params![id, latest_version],
                |r| r.get::<_, String>(0),
            )
            .optional()?
            .unwrap_or_default();
        let tags = list_asset_tags(&conn, &workspace_id, &id)?;
        assets.push(AgentRuleAssetDto {
            id,
            workspace_id,
            name,
            latest_version,
            latest_content_hash,
            created_at,
            updated_at,
            tags,
        });
    }

    Ok(assets)
}

#[tauri::command]
pub fn agent_rule_asset_create(
    state: State<'_, AppState>,
    input: AgentRuleAssetCreateInput,
) -> Result<AgentRuleAssetDto, AppError> {
    let mut conn = state.open()?;
    ensure_workspace_exists(&conn, &input.workspace_id)?;

    let name = input.name.trim();
    if name.is_empty() {
        return Err(AppError::invalid_argument("规则名称不能为空"));
    }

    let now = now_rfc3339();
    let operator = input.operator.unwrap_or_else(|| "system".to_string());
    let asset_id = Uuid::new_v4().to_string();
    let content_hash = sha256_hex(&input.content);

    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO global_rule_assets(id, workspace_id, name, latest_version, created_at, updated_at)
         VALUES (?1, ?2, ?3, 1, ?4, ?5)",
        params![asset_id, input.workspace_id, name, now, now],
    )?;

    tx.execute(
        "INSERT INTO global_rule_versions(id, asset_id, version, content, content_hash, operator, created_at)
         VALUES (?1, ?2, 1, ?3, ?4, ?5, ?6)",
        params![
            Uuid::new_v4().to_string(),
            asset_id,
            input.content,
            content_hash,
            operator,
            now
        ],
    )?;
    tx.commit()?;

    get_asset_summary(&conn, &asset_id)
}

#[tauri::command]
pub fn agent_rule_asset_delete(
    state: State<'_, AppState>,
    input: AgentRuleAssetDeleteInput,
) -> Result<(), AppError> {
    let conn = state.open()?;
    ensure_workspace_exists(&conn, &input.workspace_id)?;
    get_asset_latest_bundle(&conn, &input.workspace_id, &input.asset_id)?;

    conn.execute(
        "DELETE FROM global_rule_assets WHERE id = ?1 AND workspace_id = ?2",
        params![input.asset_id, input.workspace_id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn agent_rule_asset_rename(
    state: State<'_, AppState>,
    input: AgentRuleAssetRenameInput,
) -> Result<AgentRuleAssetDto, AppError> {
    let conn = state.open()?;
    ensure_workspace_exists(&conn, &input.workspace_id)?;
    get_asset_latest_bundle(&conn, &input.workspace_id, &input.asset_id)?;
    let name = input.name.trim();
    if name.is_empty() {
        return Err(AppError::invalid_argument("规则名称不能为空"));
    }
    let now = now_rfc3339();
    conn.execute(
        "UPDATE global_rule_assets
         SET name = ?3, updated_at = ?4
         WHERE id = ?1 AND workspace_id = ?2",
        params![input.asset_id, input.workspace_id, name, now],
    )?;
    get_asset_summary(&conn, &input.asset_id)
}

#[tauri::command]
pub fn agent_rule_publish_version(
    state: State<'_, AppState>,
    input: AgentRuleAssetPublishInput,
) -> Result<AgentRuleVersionDto, AppError> {
    let mut conn = state.open()?;
    let (workspace_id, next_version) =
        get_asset_workspace_and_next_version(&conn, &input.asset_id)?;
    ensure_workspace_exists(&conn, &workspace_id)?;

    let now = now_rfc3339();
    let operator = input.operator.unwrap_or_else(|| "system".to_string());
    let content_hash = sha256_hex(&input.content);

    let tx = conn.transaction()?;
    let version_id = Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO global_rule_versions(id, asset_id, version, content, content_hash, operator, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            version_id,
            input.asset_id,
            next_version,
            input.content,
            content_hash,
            operator,
            now
        ],
    )?;

    tx.execute(
        "UPDATE global_rule_assets SET latest_version = ?2, updated_at = ?3 WHERE id = ?1",
        params![input.asset_id, next_version, now],
    )?;
    tx.commit()?;

    get_asset_version(&conn, &input.asset_id, next_version)
}

#[tauri::command]
pub fn agent_rule_versions(
    state: State<'_, AppState>,
    asset_id: String,
) -> Result<Vec<AgentRuleVersionDto>, AppError> {
    let conn = state.open()?;
    let mut stmt = conn.prepare(
        "SELECT id, asset_id, version, content, content_hash, operator, created_at
         FROM global_rule_versions
         WHERE asset_id = ?1
         ORDER BY version DESC",
    )?;
    let rows = stmt.query_map(params![asset_id], |row| {
        Ok(AgentRuleVersionDto {
            id: row.get(0)?,
            asset_id: row.get(1)?,
            version: row.get(2)?,
            content: row.get(3)?,
            content_hash: row.get(4)?,
            operator: row.get(5)?,
            created_at: row.get(6)?,
        })
    })?;

    let mut versions = Vec::new();
    for row in rows {
        versions.push(row?);
    }
    Ok(versions)
}

#[tauri::command]
pub fn agent_rule_rollback(
    state: State<'_, AppState>,
    input: AgentRuleAssetRollbackInput,
) -> Result<AgentRuleVersionDto, AppError> {
    let conn = state.open()?;
    let source = get_asset_version(&conn, &input.asset_id, input.version)?;
    agent_rule_publish_version(
        state,
        AgentRuleAssetPublishInput {
            asset_id: input.asset_id,
            content: source.content,
            operator: input.operator,
        },
    )
}

pub(super) fn get_asset_workspace_and_next_version(
    conn: &Connection,
    asset_id: &str,
) -> Result<(String, i64), AppError> {
    conn.query_row(
        "SELECT workspace_id, latest_version FROM global_rule_assets WHERE id = ?1",
        params![asset_id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? + 1)),
    )
    .optional()?
    .ok_or_else(|| AppError::invalid_argument("规则资产不存在"))
}

pub(super) fn get_asset_summary(
    conn: &Connection,
    asset_id: &str,
) -> Result<AgentRuleAssetDto, AppError> {
    let row = conn
        .query_row(
            "SELECT id, workspace_id, name, latest_version, created_at, updated_at
             FROM global_rule_assets
             WHERE id = ?1",
            params![asset_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| AppError::invalid_argument("规则资产不存在"))?;

    let latest_content_hash = conn
        .query_row(
            "SELECT content_hash FROM global_rule_versions WHERE asset_id = ?1 AND version = ?2",
            params![row.0, row.3],
            |r| r.get::<_, String>(0),
        )
        .optional()?
        .unwrap_or_default();
    let tags = list_asset_tags(conn, &row.1, &row.0)?;

    Ok(AgentRuleAssetDto {
        id: row.0,
        workspace_id: row.1,
        name: row.2,
        latest_version: row.3,
        latest_content_hash,
        created_at: row.4,
        updated_at: row.5,
        tags,
    })
}

pub(super) fn get_asset_version(
    conn: &Connection,
    asset_id: &str,
    version: i64,
) -> Result<AgentRuleVersionDto, AppError> {
    conn.query_row(
        "SELECT id, asset_id, version, content, content_hash, operator, created_at
         FROM global_rule_versions
         WHERE asset_id = ?1 AND version = ?2",
        params![asset_id, version],
        |row| {
            Ok(AgentRuleVersionDto {
                id: row.get(0)?,
                asset_id: row.get(1)?,
                version: row.get(2)?,
                content: row.get(3)?,
                content_hash: row.get(4)?,
                operator: row.get(5)?,
                created_at: row.get(6)?,
            })
        },
    )
    .optional()?
    .ok_or_else(|| AppError::invalid_argument("规则版本不存在"))
}

pub(super) fn get_asset_latest_bundle(
    conn: &Connection,
    workspace_id: &str,
    asset_id: &str,
) -> Result<VersionBundle, AppError> {
    let latest = conn
        .query_row(
            "SELECT latest_version FROM global_rule_assets WHERE id = ?1 AND workspace_id = ?2",
            params![asset_id, workspace_id],
            |row| row.get::<_, i64>(0),
        )
        .optional()?
        .ok_or_else(|| AppError::invalid_argument("规则资产不存在"))?;

    get_asset_version_bundle(conn, workspace_id, asset_id, latest)
}

pub(super) fn get_asset_version_bundle(
    conn: &Connection,
    workspace_id: &str,
    asset_id: &str,
    version: i64,
) -> Result<VersionBundle, AppError> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(1) FROM global_rule_assets WHERE id = ?1 AND workspace_id = ?2",
        params![asset_id, workspace_id],
        |row| row.get(0),
    )?;
    if exists == 0 {
        return Err(AppError::invalid_argument("规则资产不存在"));
    }

    let version_row = get_asset_version(conn, asset_id, version)?;
    Ok(VersionBundle {
        workspace_id: workspace_id.to_string(),
        asset_id: asset_id.to_string(),
        version,
        content: version_row.content,
        content_hash: version_row.content_hash,
    })
}

pub(super) fn list_asset_tags(
    conn: &Connection,
    workspace_id: &str,
    asset_id: &str,
) -> Result<Vec<AgentRuleTagDto>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT t.agent_type, t.drift_status, t.drift_reason, t.last_checked_at, c.root_dir, c.rule_file
         FROM global_rule_agent_tags t
         LEFT JOIN agent_connections c
           ON c.workspace_id = t.workspace_id AND c.agent_type = t.agent_type
         WHERE t.workspace_id = ?1 AND t.asset_id = ?2
         ORDER BY t.agent_type ASC",
    )?;

    let rows = stmt.query_map(params![workspace_id, asset_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, Option<String>>(4)?.unwrap_or_default(),
            row.get::<_, Option<String>>(5)?.unwrap_or_default(),
        ))
    })?;

    let mut tags = Vec::new();
    for row in rows {
        let (agent_type, drift_status, drift_reason, last_checked_at, root_dir, rule_file) = row?;
        let resolved_path = if root_dir.trim().is_empty() {
            None
        } else {
            resolve_rule_file_path(&root_dir, &rule_file, &agent_type)
                .ok()
                .map(|path| path.to_string_lossy().to_string())
        };
        tags.push(AgentRuleTagDto {
            agent_type,
            drift_status,
            drift_reason,
            last_checked_at,
            resolved_path,
        });
    }

    Ok(tags)
}
