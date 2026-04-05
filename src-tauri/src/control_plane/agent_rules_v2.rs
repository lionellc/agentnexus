use std::{
    fs,
    path::{Component, Path, PathBuf},
};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::{
    db::AppState,
    error::AppError,
    execution_plane::distribution::distribute_agents,
    security::validate_absolute_root_dir,
    utils::{now_rfc3339, sha256_file, sha256_hex},
};

const AGENT_CODEX: &str = "codex";
const AGENT_CLAUDE: &str = "claude";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConnectionDto {
    pub id: String,
    pub workspace_id: String,
    pub agent_type: String,
    pub root_dir: String,
    pub rule_file: String,
    pub enabled: bool,
    pub resolved_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleTagDto {
    pub agent_type: String,
    pub drift_status: String,
    pub drift_reason: String,
    pub last_checked_at: Option<String>,
    pub resolved_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleAssetDto {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub latest_version: i64,
    pub latest_content_hash: String,
    pub created_at: String,
    pub updated_at: String,
    pub tags: Vec<AgentRuleTagDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleVersionDto {
    pub id: String,
    pub asset_id: String,
    pub version: i64,
    pub content: String,
    pub content_hash: String,
    pub operator: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleApplyRecordDto {
    pub id: String,
    pub agent_type: String,
    pub resolved_path: String,
    pub status: String,
    pub message: String,
    pub expected_hash: String,
    pub actual_hash: String,
    pub used_mode: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleApplyJobDto {
    pub id: String,
    pub workspace_id: String,
    pub asset_id: Option<String>,
    pub release_version: String,
    pub mode: String,
    pub status: String,
    pub retry_of_job_id: Option<String>,
    pub operator: String,
    pub records: Vec<AgentRuleApplyRecordDto>,
    pub tags: Vec<AgentRuleTagDto>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRulePreviewResult {
    pub agent_type: String,
    pub resolved_path: String,
    pub status: String,
    pub content: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConnectionUpsertInput {
    pub workspace_id: String,
    pub agent_type: String,
    pub root_dir: String,
    pub rule_file: Option<String>,
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConnectionToggleInput {
    pub workspace_id: String,
    pub agent_type: String,
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConnectionDeleteInput {
    pub workspace_id: String,
    pub agent_type: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRulePreviewInput {
    pub workspace_id: String,
    pub agent_type: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleAssetCreateInput {
    pub workspace_id: String,
    pub name: String,
    pub content: String,
    pub operator: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleAssetPublishInput {
    pub asset_id: String,
    pub content: String,
    pub operator: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleAssetDeleteInput {
    pub workspace_id: String,
    pub asset_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleAssetRenameInput {
    pub workspace_id: String,
    pub asset_id: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleAssetRollbackInput {
    pub asset_id: String,
    pub version: i64,
    pub operator: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleApplyInput {
    pub workspace_id: String,
    pub asset_id: String,
    pub agent_types: Option<Vec<String>>,
    pub operator: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleRetryInput {
    pub job_id: String,
    pub operator: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleRefreshInput {
    pub workspace_id: String,
    pub asset_id: String,
}

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

#[tauri::command]
pub fn agent_rule_apply(
    state: State<'_, AppState>,
    input: AgentRuleApplyInput,
) -> Result<AgentRuleApplyJobDto, AppError> {
    let conn = state.open()?;
    ensure_workspace_exists(&conn, &input.workspace_id)?;
    ensure_default_agent_connections(&conn, &input.workspace_id)?;

    let bundle = get_asset_latest_bundle(&conn, &input.workspace_id, &input.asset_id)?;
    let targets =
        list_enabled_connections(&conn, &input.workspace_id, input.agent_types.as_deref())?;
    if targets.is_empty() {
        return Err(AppError::invalid_argument("未找到可应用的 Agent 连接"));
    }

    run_apply_job(
        &conn,
        &bundle,
        targets,
        "apply",
        None,
        input.operator.as_deref().unwrap_or("system"),
    )
}

#[tauri::command]
pub fn agent_rule_status(
    state: State<'_, AppState>,
    workspace_id: String,
    limit: Option<i64>,
) -> Result<Vec<AgentRuleApplyJobDto>, AppError> {
    let conn = state.open()?;
    ensure_workspace_exists(&conn, &workspace_id)?;

    let max = limit.unwrap_or(20).clamp(1, 200);
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, asset_id, release_version, mode, status, retry_of_job_id, operator, created_at
         FROM global_rule_apply_jobs
         WHERE workspace_id = ?1
         ORDER BY created_at DESC
         LIMIT ?2",
    )?;

    let rows = stmt.query_map(params![workspace_id, max], |row| {
        Ok(AgentRuleApplyJobDto {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            asset_id: row.get(2)?,
            release_version: row.get(3)?,
            mode: row.get(4)?,
            status: row.get(5)?,
            retry_of_job_id: row.get(6)?,
            operator: row.get(7)?,
            records: Vec::new(),
            tags: Vec::new(),
            created_at: row.get(8)?,
        })
    })?;

    let mut jobs = Vec::new();
    for row in rows {
        let mut job = row?;
        job.records = list_apply_records(&conn, &job.id)?;
        jobs.push(job);
    }

    Ok(jobs)
}

#[tauri::command]
pub fn agent_rule_retry(
    state: State<'_, AppState>,
    input: AgentRuleRetryInput,
) -> Result<AgentRuleApplyJobDto, AppError> {
    let conn = state.open()?;

    let source = conn
        .query_row(
            "SELECT id, workspace_id, asset_id, release_version
             FROM global_rule_apply_jobs
             WHERE id = ?1",
            params![input.job_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| AppError::invalid_argument("原始应用任务不存在"))?;

    let asset_id = source
        .2
        .clone()
        .ok_or_else(|| AppError::invalid_argument("原始任务缺少 asset_id"))?;

    let mut failed_stmt = conn.prepare(
        "SELECT agent_type
         FROM global_rule_apply_records
         WHERE job_id = ?1 AND status <> 'success'",
    )?;
    let failed_rows = failed_stmt.query_map(params![source.0], |row| row.get::<_, String>(0))?;
    let mut failed_agents = Vec::new();
    for row in failed_rows {
        failed_agents.push(row?);
    }
    if failed_agents.is_empty() {
        return Err(AppError::invalid_argument("没有可重试的失败目标"));
    }

    let version = source
        .3
        .parse::<i64>()
        .map_err(|_| AppError::invalid_argument("原始任务 release_version 非法，无法重试"))?;

    let bundle = get_asset_version_bundle(&conn, &source.1, &asset_id, version)?;
    let targets = list_enabled_connections(&conn, &source.1, Some(failed_agents.as_slice()))?;
    if targets.is_empty() {
        return Err(AppError::invalid_argument("失败目标连接不可用"));
    }

    run_apply_job(
        &conn,
        &bundle,
        targets,
        "retry",
        Some(&input.job_id),
        input.operator.as_deref().unwrap_or("system"),
    )
}

#[tauri::command]
pub fn agent_rule_refresh(
    state: State<'_, AppState>,
    input: AgentRuleRefreshInput,
) -> Result<AgentRuleApplyJobDto, AppError> {
    let conn = state.open()?;
    ensure_workspace_exists(&conn, &input.workspace_id)?;

    let bundle = get_asset_latest_bundle(&conn, &input.workspace_id, &input.asset_id)?;

    let mut tag_stmt = conn.prepare(
        "SELECT agent_type, last_applied_hash
         FROM global_rule_agent_tags
         WHERE workspace_id = ?1 AND asset_id = ?2",
    )?;
    let tag_rows = tag_stmt.query_map(params![input.workspace_id, input.asset_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    let mut tagged: Vec<(String, String)> = Vec::new();
    for row in tag_rows {
        tagged.push(row?);
    }
    if tagged.is_empty() {
        return Err(AppError::invalid_argument("当前规则没有可刷新的标签"));
    }

    let job_id = Uuid::new_v4().to_string();
    let now = now_rfc3339();
    conn.execute(
        "INSERT INTO global_rule_apply_jobs(id, workspace_id, asset_id, release_version, mode, status, retry_of_job_id, operator, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'refresh', 'running', NULL, 'system', ?5, ?6)",
        params![
            job_id,
            bundle.workspace_id,
            bundle.asset_id,
            bundle.version.to_string(),
            now,
            now,
        ],
    )?;

    let mut records = Vec::new();
    for (agent_type, expected_hash) in tagged {
        let connection = get_agent_connection(&conn, &bundle.workspace_id, &agent_type)?;
        let (status, message, actual_hash, resolved_path) =
            match validate_enabled_root_dir(&connection.root_dir).and_then(|_| {
                resolve_rule_file_path(
                    &connection.root_dir,
                    &connection.rule_file,
                    &connection.agent_type,
                )
            }) {
                Ok(path) => {
                    let resolved_path = path.to_string_lossy().to_string();
                    match sha256_file(&path) {
                        Ok(current_hash) => {
                            if current_hash == expected_hash {
                                (
                                    "clean".to_string(),
                                    "ok".to_string(),
                                    current_hash,
                                    resolved_path,
                                )
                            } else {
                                (
                                    "drifted".to_string(),
                                    "content_mismatch".to_string(),
                                    current_hash,
                                    resolved_path,
                                )
                            }
                        }
                        Err(err) => {
                            let message = if err.message.contains("No such file") {
                                "not_found".to_string()
                            } else if err.message.contains("Permission denied") {
                                "permission_denied".to_string()
                            } else {
                                err.message
                            };
                            ("error".to_string(), message, String::new(), resolved_path)
                        }
                    }
                }
                Err(err) => (
                    "error".to_string(),
                    err.message,
                    String::new(),
                    String::new(),
                ),
            };

        update_tag_status(
            &conn,
            &bundle.workspace_id,
            &agent_type,
            &status,
            &message,
            &now,
        )?;

        let record = AgentRuleApplyRecordDto {
            id: Uuid::new_v4().to_string(),
            agent_type,
            resolved_path,
            status,
            message,
            expected_hash,
            actual_hash,
            used_mode: "refresh".to_string(),
        };
        insert_apply_record(&conn, &job_id, &record)?;
        records.push(record);
    }

    let final_status = summarize_refresh_status(&records);
    conn.execute(
        "UPDATE global_rule_apply_jobs SET status = ?2, updated_at = ?3 WHERE id = ?1",
        params![job_id, final_status, now_rfc3339()],
    )?;

    let tags = list_asset_tags(&conn, &bundle.workspace_id, &bundle.asset_id)?;

    Ok(AgentRuleApplyJobDto {
        id: job_id,
        workspace_id: bundle.workspace_id,
        asset_id: Some(bundle.asset_id),
        release_version: bundle.version.to_string(),
        mode: "refresh".to_string(),
        status: final_status,
        retry_of_job_id: None,
        operator: "system".to_string(),
        records,
        tags,
        created_at: now,
    })
}

#[derive(Debug, Clone)]
struct ConnectionRow {
    id: String,
    workspace_id: String,
    agent_type: String,
    root_dir: String,
    rule_file: String,
    enabled: bool,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone)]
struct VersionBundle {
    workspace_id: String,
    asset_id: String,
    version: i64,
    content: String,
    content_hash: String,
}

fn ensure_workspace_exists(conn: &Connection, workspace_id: &str) -> Result<(), AppError> {
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

fn ensure_default_agent_connections(conn: &Connection, workspace_id: &str) -> Result<(), AppError> {
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

fn normalize_agent_type(agent_type: &str) -> Result<String, AppError> {
    let normalized = agent_type.trim().to_lowercase();
    if normalized.is_empty() {
        return Err(AppError::invalid_argument("agent_type 不能为空"));
    }
    let valid = normalized
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-');
    if !valid {
        return Err(AppError::invalid_argument("agent_type 仅允许字母/数字/-/_"));
    }
    Ok(normalized)
}

fn default_rule_file_name(agent_type: &str) -> String {
    match agent_type.trim().to_lowercase().as_str() {
        AGENT_CODEX => "AGENTS.md".to_string(),
        AGENT_CLAUDE => "CLAUDE.md".to_string(),
        _ => "AGENTS.md".to_string(),
    }
}

fn default_agent_root_dir(agent_type: &str) -> String {
    let suffix = match agent_type.trim().to_lowercase().as_str() {
        AGENT_CODEX => Some(".codex"),
        AGENT_CLAUDE => Some(".claude"),
        _ => None,
    };
    if let Some(suffix) = suffix {
        if let Some(home) = dirs::home_dir() {
            return home.join(suffix).to_string_lossy().to_string();
        }
    }
    String::new()
}

fn normalize_rule_file(rule_file: Option<&str>, agent_type: &str) -> Result<String, AppError> {
    let candidate = rule_file
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| default_rule_file_name(agent_type));
    let path = Path::new(&candidate);
    if path.is_absolute() {
        return Err(AppError::invalid_argument("rule_file 必须是相对路径"));
    }
    for component in path.components() {
        if matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        ) {
            return Err(AppError::invalid_argument("rule_file 路径不合法"));
        }
    }
    Ok(candidate)
}

fn validate_enabled_root_dir(root_dir: &str) -> Result<(), AppError> {
    if root_dir.trim().is_empty() {
        return Err(AppError::invalid_argument(
            "启用 Agent 时 root_dir 不能为空",
        ));
    }
    validate_absolute_root_dir(root_dir)?;
    Ok(())
}

fn resolve_rule_file_path(
    root_dir: &str,
    rule_file: &str,
    agent_type: &str,
) -> Result<PathBuf, AppError> {
    let root = validate_absolute_root_dir(root_dir)?;
    let normalized_rule_file = normalize_rule_file(Some(rule_file), agent_type)?;
    Ok(root.join(normalized_rule_file))
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

fn list_agent_connections(
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

fn get_agent_connection(
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

fn get_asset_workspace_and_next_version(
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

fn get_asset_summary(conn: &Connection, asset_id: &str) -> Result<AgentRuleAssetDto, AppError> {
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

fn get_asset_version(
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

fn get_asset_latest_bundle(
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

fn get_asset_version_bundle(
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

fn list_asset_tags(
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

fn list_enabled_connections(
    conn: &Connection,
    workspace_id: &str,
    agent_types: Option<&[String]>,
) -> Result<Vec<ConnectionRow>, AppError> {
    let mut rows = Vec::new();
    let normalized_filter = if let Some(types) = agent_types {
        let mut normalized = Vec::new();
        for item in types {
            normalized.push(normalize_agent_type(item)?);
        }
        Some(normalized)
    } else {
        None
    };

    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, agent_type, root_dir, rule_file, enabled, created_at, updated_at
         FROM agent_connections
         WHERE workspace_id = ?1 AND enabled = 1
         ORDER BY agent_type ASC",
    )?;

    let query_rows = stmt.query_map(params![workspace_id], |row| {
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

    for row in query_rows {
        let item = row?;
        if let Some(filter) = &normalized_filter {
            let current = item.agent_type.to_lowercase();
            if !filter.contains(&current) {
                continue;
            }
        }
        rows.push(item);
    }

    Ok(rows)
}

fn run_apply_job(
    conn: &Connection,
    bundle: &VersionBundle,
    targets: Vec<ConnectionRow>,
    mode: &str,
    retry_of_job_id: Option<&str>,
    operator: &str,
) -> Result<AgentRuleApplyJobDto, AppError> {
    let job_id = Uuid::new_v4().to_string();
    let created_at = now_rfc3339();

    conn.execute(
        "INSERT INTO global_rule_apply_jobs(id, workspace_id, asset_id, release_version, mode, status, retry_of_job_id, operator, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'running', ?6, ?7, ?8, ?9)",
        params![
            job_id,
            bundle.workspace_id,
            bundle.asset_id,
            bundle.version.to_string(),
            mode,
            retry_of_job_id,
            operator,
            created_at,
            created_at,
        ],
    )?;

    let mut records = Vec::new();
    for target in targets {
        let resolved =
            resolve_rule_file_path(&target.root_dir, &target.rule_file, &target.agent_type);
        let mut record = AgentRuleApplyRecordDto {
            id: Uuid::new_v4().to_string(),
            agent_type: target.agent_type.clone(),
            resolved_path: String::new(),
            status: "failed".to_string(),
            message: String::new(),
            expected_hash: bundle.content_hash.clone(),
            actual_hash: String::new(),
            used_mode: "copy".to_string(),
        };

        match resolved {
            Ok(path) => {
                record.resolved_path = path.to_string_lossy().to_string();
                match distribute_agents(&bundle.content, &bundle.content_hash, &path, "copy", true)
                {
                    Ok(exec) => {
                        record.status = exec.status;
                        record.message = exec.message;
                        record.used_mode = exec.used_mode;
                        record.actual_hash = exec.actual_hash;
                    }
                    Err(err) => {
                        record.message = err.message;
                    }
                }
            }
            Err(err) => {
                record.message = err.message;
            }
        }

        if record.status == "success" {
            upsert_tag_binding(
                conn,
                &bundle.workspace_id,
                &target.agent_type,
                &bundle.asset_id,
                bundle.version,
                &bundle.content_hash,
            )?;
        }

        insert_apply_record(conn, &job_id, &record)?;
        records.push(record);
    }

    let status = summarize_apply_status(&records);
    conn.execute(
        "UPDATE global_rule_apply_jobs SET status = ?2, updated_at = ?3 WHERE id = ?1",
        params![job_id, status, now_rfc3339()],
    )?;

    Ok(AgentRuleApplyJobDto {
        id: job_id,
        workspace_id: bundle.workspace_id.clone(),
        asset_id: Some(bundle.asset_id.clone()),
        release_version: bundle.version.to_string(),
        mode: mode.to_string(),
        status,
        retry_of_job_id: retry_of_job_id.map(str::to_string),
        operator: operator.to_string(),
        records,
        tags: Vec::new(),
        created_at,
    })
}

fn upsert_tag_binding(
    conn: &Connection,
    workspace_id: &str,
    agent_type: &str,
    asset_id: &str,
    version: i64,
    content_hash: &str,
) -> Result<(), AppError> {
    let now = now_rfc3339();
    conn.execute(
        "INSERT INTO global_rule_agent_tags(id, workspace_id, agent_type, asset_id, last_applied_version, last_applied_hash, drift_status, drift_reason, last_checked_at, updated_at)
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

fn update_tag_status(
    conn: &Connection,
    workspace_id: &str,
    agent_type: &str,
    drift_status: &str,
    drift_reason: &str,
    ts: &str,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE global_rule_agent_tags
         SET drift_status = ?3,
             drift_reason = ?4,
             last_checked_at = ?5,
             updated_at = ?6
         WHERE workspace_id = ?1 AND agent_type = ?2",
        params![workspace_id, agent_type, drift_status, drift_reason, ts, ts],
    )?;
    Ok(())
}

fn insert_apply_record(
    conn: &Connection,
    job_id: &str,
    record: &AgentRuleApplyRecordDto,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO global_rule_apply_records(id, job_id, agent_type, resolved_path, status, message, expected_hash, actual_hash, used_mode, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            record.id,
            job_id,
            record.agent_type,
            record.resolved_path,
            record.status,
            record.message,
            record.expected_hash,
            record.actual_hash,
            record.used_mode,
            now_rfc3339(),
            now_rfc3339(),
        ],
    )?;
    Ok(())
}

fn list_apply_records(
    conn: &Connection,
    job_id: &str,
) -> Result<Vec<AgentRuleApplyRecordDto>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, agent_type, resolved_path, status, message, expected_hash, actual_hash, used_mode
         FROM global_rule_apply_records
         WHERE job_id = ?1
         ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map(params![job_id], |row| {
        Ok(AgentRuleApplyRecordDto {
            id: row.get(0)?,
            agent_type: row.get(1)?,
            resolved_path: row.get(2)?,
            status: row.get(3)?,
            message: row.get(4)?,
            expected_hash: row.get(5)?,
            actual_hash: row.get(6)?,
            used_mode: row.get(7)?,
        })
    })?;

    let mut list = Vec::new();
    for row in rows {
        list.push(row?);
    }
    Ok(list)
}

fn summarize_apply_status(records: &[AgentRuleApplyRecordDto]) -> String {
    if records.is_empty() {
        return "failed".to_string();
    }

    let success = records
        .iter()
        .filter(|record| record.status == "success")
        .count();
    if success == records.len() {
        return "success".to_string();
    }
    if success == 0 {
        return "failed".to_string();
    }
    "partial_failed".to_string()
}

fn summarize_refresh_status(records: &[AgentRuleApplyRecordDto]) -> String {
    if records.is_empty() {
        return "failed".to_string();
    }

    let clean = records
        .iter()
        .filter(|record| record.status == "clean")
        .count();
    let drifted = records
        .iter()
        .filter(|record| record.status == "drifted")
        .count();
    let error = records
        .iter()
        .filter(|record| record.status == "error")
        .count();

    if clean == records.len() {
        return "success".to_string();
    }
    if drifted > 0 && error == 0 {
        return "drifted".to_string();
    }
    if clean > 0 {
        return "partial_failed".to_string();
    }
    "failed".to_string()
}

fn bool_to_int(value: bool) -> i64 {
    if value {
        1
    } else {
        0
    }
}

#[cfg(test)]
mod tests {
    use super::{
        normalize_agent_type, normalize_rule_file, resolve_rule_file_path, summarize_apply_status,
        summarize_refresh_status, AgentRuleApplyRecordDto,
    };

    fn record(agent_type: &str, status: &str) -> AgentRuleApplyRecordDto {
        AgentRuleApplyRecordDto {
            id: format!("{agent_type}-{status}"),
            agent_type: agent_type.to_string(),
            resolved_path: format!("/tmp/{agent_type}.md"),
            status: status.to_string(),
            message: String::new(),
            expected_hash: "expected".to_string(),
            actual_hash: "actual".to_string(),
            used_mode: "copy".to_string(),
        }
    }

    #[test]
    fn normalize_agent_type_works() {
        assert_eq!(normalize_agent_type("codex").expect("codex"), "codex");
        assert_eq!(normalize_agent_type("CLAUDE").expect("claude"), "claude");
        assert_eq!(
            normalize_agent_type("  CoDeX  ").expect("trim+case"),
            "codex"
        );
        assert_eq!(normalize_agent_type(" claude ").expect("trim"), "claude");
        assert_eq!(normalize_agent_type("cursor").expect("custom"), "cursor");
        assert!(normalize_agent_type("").is_err());
        assert!(normalize_agent_type("cursor role").is_err());
    }

    #[test]
    fn normalize_rule_file_works() {
        assert_eq!(
            normalize_rule_file(Some("AGENTS.md"), "codex").expect("codex"),
            "AGENTS.md"
        );
        assert_eq!(
            normalize_rule_file(Some("roles/CURSOR.md"), "cursor").expect("custom"),
            "roles/CURSOR.md"
        );
        assert_eq!(
            normalize_rule_file(None, "claude").expect("default"),
            "CLAUDE.md"
        );
        assert!(normalize_rule_file(Some("../bad.md"), "codex").is_err());
        assert!(normalize_rule_file(Some("/abs/path.md"), "codex").is_err());
    }

    #[test]
    fn resolve_rule_file_path_handles_root_boundary() {
        let codex_path = resolve_rule_file_path("/tmp/workspace/.codex", "AGENTS.md", "codex")
            .expect("codex path should resolve");
        assert_eq!(
            codex_path.to_string_lossy(),
            "/tmp/workspace/.codex/AGENTS.md"
        );

        let claude_path = resolve_rule_file_path("/tmp/workspace/.claude", "CLAUDE.md", "claude")
            .expect("claude path should resolve");
        assert_eq!(
            claude_path.to_string_lossy(),
            "/tmp/workspace/.claude/CLAUDE.md"
        );

        assert!(resolve_rule_file_path("relative/path", "AGENTS.md", "codex").is_err());
        assert!(resolve_rule_file_path("/tmp/workspace", "../escape.md", "codex").is_err());
    }

    #[test]
    fn summarize_apply_status_success_failed_partial() {
        let all_success = vec![record("codex", "success"), record("claude", "success")];
        assert_eq!(summarize_apply_status(&all_success), "success");

        let all_failed = vec![record("codex", "failed"), record("claude", "failed")];
        assert_eq!(summarize_apply_status(&all_failed), "failed");

        let partial = vec![record("codex", "success"), record("claude", "failed")];
        assert_eq!(summarize_apply_status(&partial), "partial_failed");
    }

    #[test]
    fn summarize_refresh_status_clean_drifted_error_partial() {
        let clean = vec![record("codex", "clean"), record("claude", "clean")];
        assert_eq!(summarize_refresh_status(&clean), "success");

        let drifted = vec![record("codex", "drifted"), record("claude", "drifted")];
        assert_eq!(summarize_refresh_status(&drifted), "drifted");

        let error = vec![record("codex", "error"), record("claude", "error")];
        assert_eq!(summarize_refresh_status(&error), "failed");

        let records = vec![
            record("codex", "clean"),
            record("claude", "error"),
            record("codex", "drifted"),
        ];
        assert_eq!(summarize_refresh_status(&records), "partial_failed");
    }
}
