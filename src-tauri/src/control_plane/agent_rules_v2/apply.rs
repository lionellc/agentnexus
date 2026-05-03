use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;
use uuid::Uuid;

use crate::{
    db::AppState,
    error::AppError,
    execution_plane::distribution::distribute_agents,
    utils::{now_rfc3339, sha256_file},
};

use super::{
    api::{ensure_default_agent_connections, ensure_workspace_exists, get_agent_connection},
    normalize::{normalize_agent_type, resolve_rule_file_path, validate_enabled_root_dir},
    permissions::{
        apply_blocked_message, check_target_access, is_permission_like_error, write_failure_advice,
    },
    publish::{get_asset_latest_bundle, get_asset_version_bundle, list_asset_tags},
    status_summary::{summarize_apply_status, summarize_refresh_status},
    AgentRuleApplyInput, AgentRuleApplyJobDto, AgentRuleApplyRecordDto, AgentRuleRefreshInput,
    AgentRuleRetryInput, ConnectionRow, VersionBundle,
};

#[tauri::command]
pub fn agent_rule_apply(
    state: State<'_, AppState>,
    input: AgentRuleApplyInput,
) -> Result<AgentRuleApplyJobDto, AppError> {
    let conn = state.open()?;
    ensure_workspace_exists(&conn, crate::domain::models::APP_SCOPE_ID)?;
    ensure_default_agent_connections(&conn, crate::domain::models::APP_SCOPE_ID)?;

    let bundle =
        get_asset_latest_bundle(&conn, crate::domain::models::APP_SCOPE_ID, &input.asset_id)?;
    let targets = list_enabled_connections(
        &conn,
        crate::domain::models::APP_SCOPE_ID,
        input.agent_types.as_deref(),
    )?;
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
    limit: Option<i64>,
) -> Result<Vec<AgentRuleApplyJobDto>, AppError> {
    let conn = state.open()?;
    let workspace_id = crate::domain::models::APP_SCOPE_ID;
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
    ensure_workspace_exists(&conn, crate::domain::models::APP_SCOPE_ID)?;

    let bundle =
        get_asset_latest_bundle(&conn, crate::domain::models::APP_SCOPE_ID, &input.asset_id)?;

    let mut tag_stmt = conn.prepare(
        "SELECT agent_type, last_applied_hash
         FROM global_rule_agent_tags
         WHERE workspace_id = ?1 AND asset_id = ?2",
    )?;
    let tag_rows = tag_stmt.query_map(
        params![
            crate::domain::models::APP_SCOPE_ID.to_string(),
            input.asset_id
        ],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    )?;

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

pub(super) fn list_enabled_connections(
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
        "SELECT id, workspace_id, agent_type, root_dir, rule_file, root_dir_source, rule_file_source, detection_status, detected_at, enabled, created_at, updated_at
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
            root_dir_source: row.get(5)?,
            rule_file_source: row.get(6)?,
            detection_status: row.get(7)?,
            detected_at: row.get(8)?,
            enabled: row.get::<_, i64>(9)? == 1,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
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

        let access = check_target_access(&target);
        record.resolved_path = access.resolved_path.clone();
        if access.status != "ready" {
            record.message = apply_blocked_message(&access);
        } else {
            let resolved =
                resolve_rule_file_path(&target.root_dir, &target.rule_file, &target.agent_type);
            match resolved {
                Ok(path) => {
                    record.resolved_path = path.to_string_lossy().to_string();
                    match distribute_agents(
                        &bundle.content,
                        &bundle.content_hash,
                        &path,
                        "copy",
                        true,
                    ) {
                        Ok(exec) => {
                            record.status = exec.status;
                            record.message = exec.message;
                            record.used_mode = exec.used_mode;
                            record.actual_hash = exec.actual_hash;
                        }
                        Err(err) => {
                            record.message = if is_permission_like_error(&err.message) {
                                format!(
                                    "规则文件不可写：{}。{}",
                                    record.resolved_path,
                                    write_failure_advice(&path)
                                )
                            } else {
                                err.message
                            };
                        }
                    }
                }
                Err(err) => {
                    record.message = err.message;
                }
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
