use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use tauri::State;
use uuid::Uuid;

use crate::{
    db::AppState,
    domain::models::{
        AgentDocRelease, AgentDocSaveInput, DistributionJobResult, DistributionRecordResult,
        DistributionRetryInput, DistributionRunInput, DriftDetectInput, ReleaseCreateInput,
        ReleaseRollbackInput, Workspace,
    },
    error::AppError,
    execution_plane::distribution::{detect_drift, distribute_agents},
    security::{resolve_distribution_target_path, validate_install_mode},
    utils::{now_rfc3339, sha256_hex},
};

use super::{
    shared::{append_audit_event, get_workspace},
    target_commands::list_targets,
};

#[tauri::command]
pub fn agent_doc_read(state: State<'_, AppState>) -> Result<Value, AppError> {
    let conn = state.open()?;
    let workspace_id = crate::domain::models::APP_SCOPE_ID;
    get_workspace(&conn, &workspace_id)?;

    let draft = conn
        .query_row(
            "SELECT content, content_hash, updated_at FROM agent_doc WHERE workspace_id = ?1",
            params![workspace_id],
            |row| {
                Ok(json!({
                    "content": row.get::<_, String>(0)?,
                    "contentHash": row.get::<_, String>(1)?,
                    "updatedAt": row.get::<_, String>(2)?,
                }))
            },
        )
        .optional()?
        .ok_or_else(AppError::agent_doc_not_found)?;

    Ok(draft)
}

#[tauri::command]
pub fn agent_doc_save(
    state: State<'_, AppState>,
    input: AgentDocSaveInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    get_workspace(&conn, crate::domain::models::APP_SCOPE_ID)?;

    let hash = sha256_hex(&input.content);
    let now = now_rfc3339();

    conn.execute(
        "INSERT INTO agent_doc(workspace_id, content, content_hash, updated_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(workspace_id) DO UPDATE SET
            content = excluded.content,
            content_hash = excluded.content_hash,
            updated_at = excluded.updated_at",
        params![
            crate::domain::models::APP_SCOPE_ID.to_string(),
            input.content,
            hash,
            now
        ],
    )?;

    Ok(json!({
        "workspaceId": crate::domain::models::APP_SCOPE_ID.to_string(),
        "contentHash": hash,
        "updatedAt": now,
    }))
}

#[tauri::command]
pub fn agent_doc_hash(state: State<'_, AppState>) -> Result<Value, AppError> {
    let conn = state.open()?;
    let workspace_id = crate::domain::models::APP_SCOPE_ID;
    let hash = conn
        .query_row(
            "SELECT content_hash FROM agent_doc WHERE workspace_id = ?1",
            params![workspace_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .ok_or_else(AppError::agent_doc_not_found)?;

    Ok(json!({ "contentHash": hash }))
}

#[tauri::command]
pub fn release_create(
    state: State<'_, AppState>,
    input: ReleaseCreateInput,
) -> Result<AgentDocRelease, AppError> {
    let mut conn = state.open()?;
    let tx = conn.transaction()?;

    get_workspace(&tx, crate::domain::models::APP_SCOPE_ID)?;

    let (content, content_hash) = tx
        .query_row(
            "SELECT content, content_hash FROM agent_doc WHERE workspace_id = ?1",
            params![crate::domain::models::APP_SCOPE_ID.to_string()],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()?
        .ok_or_else(AppError::agent_doc_not_found)?;

    tx.execute(
        "UPDATE agent_doc_versions SET active = 0 WHERE workspace_id = ?1",
        params![crate::domain::models::APP_SCOPE_ID.to_string()],
    )?;

    let version = next_release_version(&tx, crate::domain::models::APP_SCOPE_ID)?;
    let now = now_rfc3339();
    let release = AgentDocRelease {
        id: Uuid::new_v4().to_string(),
        workspace_id: crate::domain::models::APP_SCOPE_ID.to_string(),
        version: version.clone(),
        title: input.title,
        notes: input.notes.unwrap_or_default(),
        content_hash: content_hash.clone(),
        operator: input.operator.unwrap_or_else(|| "system".to_string()),
        active: true,
        created_at: now.clone(),
    };

    tx.execute(
        "INSERT INTO agent_doc_versions(
            id, workspace_id, version, title, notes, content, content_hash, operator, active, created_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9)",
        params![
            release.id,
            release.workspace_id,
            release.version,
            release.title,
            release.notes,
            content,
            release.content_hash,
            release.operator,
            release.created_at,
        ],
    )?;

    append_audit_event(
        &tx,
        Some(&release.workspace_id),
        "release_create",
        &release.operator,
        json!({
            "releaseVersion": release.version,
            "contentHash": release.content_hash,
        }),
    )?;

    tx.commit()?;
    Ok(release)
}

#[tauri::command]
pub fn release_list(state: State<'_, AppState>) -> Result<Vec<AgentDocRelease>, AppError> {
    let conn = state.open()?;
    let workspace_id = crate::domain::models::APP_SCOPE_ID;
    get_workspace(&conn, &workspace_id)?;

    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, version, title, notes, content_hash, operator, active, created_at
         FROM agent_doc_versions
         WHERE workspace_id = ?1
         ORDER BY created_at DESC",
    )?;

    let rows = stmt.query_map(params![workspace_id], |row| {
        Ok(AgentDocRelease {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            version: row.get(2)?,
            title: row.get(3)?,
            notes: row.get(4)?,
            content_hash: row.get(5)?,
            operator: row.get(6)?,
            active: row.get::<_, i64>(7)? == 1,
            created_at: row.get(8)?,
        })
    })?;

    let mut releases = Vec::new();
    for row in rows {
        releases.push(row?);
    }

    Ok(releases)
}

#[tauri::command]
pub fn release_rollback(
    state: State<'_, AppState>,
    input: ReleaseRollbackInput,
) -> Result<AgentDocRelease, AppError> {
    let mut conn = state.open()?;
    let tx = conn.transaction()?;

    get_workspace(&tx, crate::domain::models::APP_SCOPE_ID)?;

    let (content, content_hash, title) = tx
        .query_row(
            "SELECT content, content_hash, title
             FROM agent_doc_versions
             WHERE workspace_id = ?1 AND version = ?2",
            params![
                crate::domain::models::APP_SCOPE_ID.to_string(),
                input.release_version
            ],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(AppError::release_not_found)?;

    tx.execute(
        "UPDATE agent_doc_versions SET active = 0 WHERE workspace_id = ?1",
        params![crate::domain::models::APP_SCOPE_ID.to_string()],
    )?;

    let next_version = next_release_version(&tx, crate::domain::models::APP_SCOPE_ID)?;
    let now = now_rfc3339();
    let operator = input.operator.unwrap_or_else(|| "system".to_string());
    let release = AgentDocRelease {
        id: Uuid::new_v4().to_string(),
        workspace_id: crate::domain::models::APP_SCOPE_ID.to_string(),
        version: next_version,
        title: format!("rollback:{}", title),
        notes: format!("rollback from {}", input.release_version),
        content_hash: content_hash.clone(),
        operator: operator.clone(),
        active: true,
        created_at: now.clone(),
    };

    tx.execute(
        "INSERT INTO agent_doc_versions(
            id, workspace_id, version, title, notes, content, content_hash, operator, active, created_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9)",
        params![
            release.id,
            release.workspace_id,
            release.version,
            release.title,
            release.notes,
            content,
            release.content_hash,
            release.operator,
            release.created_at,
        ],
    )?;

    tx.execute(
        "INSERT INTO agent_doc(workspace_id, content, content_hash, updated_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(workspace_id) DO UPDATE
         SET content = excluded.content, content_hash = excluded.content_hash, updated_at = excluded.updated_at",
        params![release.workspace_id, content, content_hash, now],
    )?;

    append_audit_event(
        &tx,
        Some(&release.workspace_id),
        "release_rollback",
        &operator,
        json!({
            "fromVersion": input.release_version,
            "toVersion": release.version,
        }),
    )?;

    tx.commit()?;
    Ok(release)
}

#[tauri::command]
pub fn distribution_run(
    state: State<'_, AppState>,
    input: DistributionRunInput,
) -> Result<DistributionJobResult, AppError> {
    let conn = state.open()?;
    let workspace = get_workspace(&conn, crate::domain::models::APP_SCOPE_ID)?;
    let release = get_release_with_content(&conn, &workspace.id, &input.release_version)?;

    if input.release_version.trim().is_empty() {
        return Err(AppError::invalid_argument("release_version 不能为空"));
    }

    let mode = input.mode.as_deref();
    if let Some(selected_mode) = mode {
        validate_install_mode(selected_mode)?;
    }

    run_distribution_job(
        &conn,
        &workspace,
        &release,
        mode,
        input.allow_fallback.unwrap_or(true),
        input.target_ids.as_deref(),
        None,
        input.operator.as_deref().unwrap_or("system"),
        "distribution_run",
    )
}

#[tauri::command]
pub fn distribution_status(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<DistributionJobResult>, AppError> {
    let conn = state.open()?;
    let workspace_id = crate::domain::models::APP_SCOPE_ID;
    get_workspace(&conn, &workspace_id)?;

    let max = limit.unwrap_or(20).clamp(1, 200);
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, release_version, mode, status, retry_of_job_id, created_at
         FROM distribution_jobs
         WHERE workspace_id = ?1
         ORDER BY created_at DESC
         LIMIT ?2",
    )?;

    let rows = stmt.query_map(params![workspace_id, max], |row| {
        Ok(DistributionJobResult {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            release_version: row.get(2)?,
            mode: row.get(3)?,
            status: row.get(4)?,
            retry_of_job_id: row.get(5)?,
            records: Vec::new(),
            created_at: row.get(6)?,
        })
    })?;

    let mut jobs = Vec::new();
    for row in rows {
        let mut job = row?;
        job.records = list_distribution_records(&conn, &job.id)?;
        jobs.push(job);
    }

    Ok(jobs)
}

#[tauri::command]
pub fn distribution_retry_failed(
    state: State<'_, AppState>,
    input: DistributionRetryInput,
) -> Result<DistributionJobResult, AppError> {
    let conn = state.open()?;

    let source_job = conn
        .query_row(
            "SELECT id, workspace_id, release_version, mode
             FROM distribution_jobs
             WHERE id = ?1",
            params![input.job_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| AppError::invalid_argument("原始分发任务不存在"))?;

    let workspace = get_workspace(&conn, &source_job.1)?;
    let release = get_release_with_content(&conn, &workspace.id, &source_job.2)?;

    let mut stmt = conn.prepare(
        "SELECT target_id FROM distribution_records WHERE job_id = ?1 AND status <> 'success'",
    )?;
    let rows = stmt.query_map(params![source_job.0], |row| row.get::<_, String>(0))?;
    let mut target_ids = Vec::new();
    for row in rows {
        target_ids.push(row?);
    }

    if target_ids.is_empty() {
        return Err(AppError::invalid_argument("没有可重试的失败目标"));
    }

    run_distribution_job(
        &conn,
        &workspace,
        &release,
        Some(&source_job.3),
        true,
        Some(target_ids.as_slice()),
        Some(&source_job.0),
        input.operator.as_deref().unwrap_or("system"),
        "distribution_retry_failed",
    )
}

#[tauri::command]
pub fn distribution_detect_drift(
    state: State<'_, AppState>,
    input: DriftDetectInput,
) -> Result<DistributionJobResult, AppError> {
    let conn = state.open()?;
    let workspace = get_workspace(&conn, crate::domain::models::APP_SCOPE_ID)?;
    let release = get_active_release_with_content(&conn, &workspace.id)?;
    let targets = list_targets(&conn, &workspace.id, input.target_ids.as_deref())?;

    if targets.is_empty() {
        return Err(AppError::invalid_argument("未找到可用分发目标"));
    }

    let job_id = Uuid::new_v4().to_string();
    let created_at = now_rfc3339();

    conn.execute(
        "INSERT INTO distribution_jobs(id, workspace_id, release_version, mode, status, fallback_enabled, retry_of_job_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'detect_drift', 'running', 0, NULL, ?4, ?5)",
        params![job_id, workspace.id, release.version, created_at, created_at],
    )?;

    let mut records = Vec::new();
    let workspace_root = PathBuf::from(&workspace.root_path);

    for target in targets {
        let target_path = PathBuf::from(&target.target_path);
        let safe_target = resolve_distribution_target_path(&workspace_root, &target_path);

        let (status, actual_hash, message) = match safe_target {
            Ok(path) => match detect_drift(&path, &release.content_hash) {
                Ok((result_status, hash_or_message)) => {
                    if result_status == "failed" {
                        (result_status, String::new(), hash_or_message)
                    } else {
                        (result_status, hash_or_message, "ok".to_string())
                    }
                }
                Err(err) => ("failed".to_string(), String::new(), err.message),
            },
            Err(err) => ("failed".to_string(), String::new(), err.message),
        };

        let record = DistributionRecordResult {
            id: Uuid::new_v4().to_string(),
            target_id: target.id,
            status,
            message,
            expected_hash: release.content_hash.clone(),
            actual_hash,
            used_mode: "detect_drift".to_string(),
        };
        insert_distribution_record(&conn, &job_id, &record)?;
        records.push(record);
    }

    let status = summarize_status(&records, true);
    conn.execute(
        "UPDATE distribution_jobs SET status = ?2, updated_at = ?3 WHERE id = ?1",
        params![job_id, status, now_rfc3339()],
    )?;

    append_audit_event(
        &conn,
        Some(&workspace.id),
        "distribution_detect_drift",
        "system",
        json!({
            "jobId": job_id,
            "releaseVersion": release.version,
            "status": status,
            "total": records.len(),
            "drifted": records.iter().filter(|record| record.status == "drifted").count(),
        }),
    )?;

    Ok(DistributionJobResult {
        id: job_id,
        workspace_id: workspace.id,
        release_version: release.version,
        mode: "detect_drift".to_string(),
        status,
        retry_of_job_id: None,
        records,
        created_at,
    })
}

fn run_distribution_job(
    conn: &Connection,
    workspace: &Workspace,
    release: &ReleaseBundle,
    mode_override: Option<&str>,
    allow_fallback: bool,
    target_ids: Option<&[String]>,
    retry_of_job_id: Option<&str>,
    operator: &str,
    audit_event_type: &str,
) -> Result<DistributionJobResult, AppError> {
    let targets = list_targets(conn, &workspace.id, target_ids)?;
    if targets.is_empty() {
        return Err(AppError::invalid_argument("未找到可用分发目标"));
    }

    let created_at = now_rfc3339();
    let job_id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO distribution_jobs(id, workspace_id, release_version, mode, status, fallback_enabled, retry_of_job_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'running', ?5, ?6, ?7, ?8)",
        params![
            job_id,
            workspace.id,
            release.version,
            mode_override.unwrap_or("default"),
            if allow_fallback { 1 } else { 0 },
            retry_of_job_id,
            created_at,
            created_at,
        ],
    )?;

    let workspace_root = PathBuf::from(&workspace.root_path);
    let mut records = Vec::new();

    for target in targets {
        let selected_mode = mode_override.unwrap_or(&target.install_mode).to_string();
        let target_path = PathBuf::from(&target.target_path);

        let result = match validate_install_mode(&selected_mode) {
            Ok(_) => match resolve_distribution_target_path(&workspace_root, &target_path) {
                Ok(safe_target_path) => {
                    match distribute_agents(
                        &release.content,
                        &release.content_hash,
                        &safe_target_path,
                        &selected_mode,
                        allow_fallback,
                    ) {
                        Ok(result) => DistributionRecordResult {
                            id: Uuid::new_v4().to_string(),
                            target_id: target.id,
                            status: result.status,
                            message: result.message,
                            expected_hash: release.content_hash.clone(),
                            actual_hash: result.actual_hash,
                            used_mode: result.used_mode,
                        },
                        Err(err) => DistributionRecordResult {
                            id: Uuid::new_v4().to_string(),
                            target_id: target.id,
                            status: "failed".to_string(),
                            message: err.message,
                            expected_hash: release.content_hash.clone(),
                            actual_hash: String::new(),
                            used_mode: selected_mode,
                        },
                    }
                }
                Err(err) => DistributionRecordResult {
                    id: Uuid::new_v4().to_string(),
                    target_id: target.id,
                    status: "failed".to_string(),
                    message: err.message,
                    expected_hash: release.content_hash.clone(),
                    actual_hash: String::new(),
                    used_mode: selected_mode,
                },
            },
            Err(err) => DistributionRecordResult {
                id: Uuid::new_v4().to_string(),
                target_id: target.id,
                status: "failed".to_string(),
                message: err.message,
                expected_hash: release.content_hash.clone(),
                actual_hash: String::new(),
                used_mode: selected_mode,
            },
        };

        insert_distribution_record(conn, &job_id, &result)?;
        records.push(result);
    }

    let status = summarize_status(&records, false);
    conn.execute(
        "UPDATE distribution_jobs SET status = ?2, updated_at = ?3 WHERE id = ?1",
        params![job_id, status, now_rfc3339()],
    )?;

    append_audit_event(
        conn,
        Some(&workspace.id),
        audit_event_type,
        operator,
        json!({
            "jobId": job_id,
            "releaseVersion": release.version,
            "status": status,
            "mode": mode_override.unwrap_or("default"),
            "summary": {
                "total": records.len(),
                "success": records.iter().filter(|item| item.status == "success").count(),
                "failed": records.iter().filter(|item| item.status == "failed").count(),
            }
        }),
    )?;

    Ok(DistributionJobResult {
        id: job_id,
        workspace_id: workspace.id.clone(),
        release_version: release.version.clone(),
        mode: mode_override.unwrap_or("default").to_string(),
        status,
        retry_of_job_id: retry_of_job_id.map(str::to_string),
        records,
        created_at,
    })
}

fn insert_distribution_record(
    conn: &Connection,
    job_id: &str,
    record: &DistributionRecordResult,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO distribution_records(id, job_id, target_id, status, message, expected_hash, actual_hash, used_mode, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            record.id,
            job_id,
            record.target_id,
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

fn list_distribution_records(
    conn: &Connection,
    job_id: &str,
) -> Result<Vec<DistributionRecordResult>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, target_id, status, message, expected_hash, actual_hash, used_mode
         FROM distribution_records
         WHERE job_id = ?1
         ORDER BY created_at ASC",
    )?;

    let rows = stmt.query_map(params![job_id], |row| {
        Ok(DistributionRecordResult {
            id: row.get(0)?,
            target_id: row.get(1)?,
            status: row.get(2)?,
            message: row.get(3)?,
            expected_hash: row.get(4)?,
            actual_hash: row.get(5)?,
            used_mode: row.get(6)?,
        })
    })?;

    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

fn summarize_status(records: &[DistributionRecordResult], with_drift: bool) -> String {
    if records.is_empty() {
        return "failed".to_string();
    }

    let success = records
        .iter()
        .filter(|item| item.status == "success")
        .count();
    let failed = records
        .iter()
        .filter(|item| item.status == "failed")
        .count();
    let drifted = records
        .iter()
        .filter(|item| item.status == "drifted")
        .count();

    if failed == records.len() {
        return "failed".to_string();
    }

    if failed == 0 && drifted == 0 {
        return "success".to_string();
    }

    if with_drift && failed == 0 && drifted > 0 {
        return "drifted".to_string();
    }

    if success > 0 || drifted > 0 {
        return "partial_failed".to_string();
    }

    "failed".to_string()
}

struct ReleaseBundle {
    version: String,
    content: String,
    content_hash: String,
}

fn get_release_with_content(
    conn: &Connection,
    workspace_id: &str,
    version: &str,
) -> Result<ReleaseBundle, AppError> {
    conn.query_row(
        "SELECT version, content, content_hash
         FROM agent_doc_versions
         WHERE workspace_id = ?1 AND version = ?2",
        params![workspace_id, version],
        |row| {
            Ok(ReleaseBundle {
                version: row.get(0)?,
                content: row.get(1)?,
                content_hash: row.get(2)?,
            })
        },
    )
    .optional()?
    .ok_or_else(AppError::release_not_found)
}

fn get_active_release_with_content(
    conn: &Connection,
    workspace_id: &str,
) -> Result<ReleaseBundle, AppError> {
    conn.query_row(
        "SELECT version, content, content_hash
         FROM agent_doc_versions
         WHERE workspace_id = ?1 AND active = 1
         ORDER BY created_at DESC
         LIMIT 1",
        params![workspace_id],
        |row| {
            Ok(ReleaseBundle {
                version: row.get(0)?,
                content: row.get(1)?,
                content_hash: row.get(2)?,
            })
        },
    )
    .optional()?
    .ok_or_else(AppError::release_not_found)
}

fn next_release_version(conn: &Connection, workspace_id: &str) -> Result<String, AppError> {
    let mut stmt =
        conn.prepare("SELECT version FROM agent_doc_versions WHERE workspace_id = ?1")?;
    let rows = stmt.query_map(params![workspace_id], |row| row.get::<_, String>(0))?;

    let mut max = 0_i64;
    for row in rows {
        let version = row?;
        let number = version
            .trim()
            .trim_start_matches('v')
            .parse::<i64>()
            .unwrap_or(0);
        if number > max {
            max = number;
        }
    }

    Ok(format!("v{}", max + 1))
}
