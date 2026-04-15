use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
};

use chrono::{Duration, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use tauri::State;
use uuid::Uuid;
use walkdir::WalkDir;

use crate::{
    db::{load_runtime_flags, AppState},
    domain::models::{
        AgentDocRelease, AuditQueryInput, DistributionJobResult, DistributionRecordResult,
        DistributionRetryInput, DistributionRunInput, DistributionTarget, DriftDetectInput,
        ExternalSourceCheckInput, MetricsByAssetInput, PromptCreateInput, PromptDeleteInput,
        PromptRenderInput, PromptRestoreInput, PromptSearchInput, PromptUpdateInput, RatingInput,
        ReleaseCreateInput, ReleaseRollbackInput, RuntimeFlags, RuntimeFlagsInput, SkillAsset,
        SkillsBatchInput, SkillsFileReadInput, SkillsFileTreeInput, SkillsOpenInput,
        SkillsScanInput, TargetDeleteInput, TargetUpsertInput, UsageEventInput, Workspace,
        WorkspaceActivateInput, WorkspaceCreateInput, WorkspaceUpdateInput,
    },
    error::AppError,
    execution_plane::{
        distribution::{detect_drift, distribute_agents, distribute_skill, uninstall_skill},
        skills::{default_skill_directories, discover_skills, DiscoveredSkill},
    },
    security::{
        ensure_safe_target_path, resolve_distribution_target_path, validate_external_source,
        validate_install_mode, validate_workspace_root,
    },
    utils::{compare_version, now_rfc3339, render_template, sha256_hex},
};

fn default_agent_root_dir(agent_type: &str) -> String {
    let normalized = agent_type.trim().to_lowercase();
    let suffix = match normalized.as_str() {
        "codex" => Some(".codex"),
        "claude" => Some(".claude"),
        _ => None,
    };
    if let Some(suffix) = suffix {
        if let Some(home) = dirs::home_dir() {
            return home.join(suffix).to_string_lossy().to_string();
        }
    }
    String::new()
}

fn default_agent_rule_file(agent_type: &str) -> String {
    match agent_type.trim().to_lowercase().as_str() {
        "codex" => "AGENTS.md".to_string(),
        "claude" => "CLAUDE.md".to_string(),
        _ => "AGENTS.md".to_string(),
    }
}

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
    for agent_type in ["codex", "claude"] {
        let default_root = default_agent_root_dir(agent_type);
        let default_rule_file = default_agent_rule_file(agent_type);
        conn.execute(
            "INSERT INTO agent_connections(id, workspace_id, agent_type, root_dir, rule_file, enabled, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7)
             ON CONFLICT(workspace_id, agent_type) DO NOTHING",
            params![
                Uuid::new_v4().to_string(),
                workspace.id.clone(),
                agent_type,
                default_root,
                default_rule_file,
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

#[tauri::command]
pub fn agent_doc_read(state: State<'_, AppState>, workspace_id: String) -> Result<Value, AppError> {
    let conn = state.open()?;
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
    input: crate::domain::models::AgentDocSaveInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    get_workspace(&conn, &input.workspace_id)?;

    let hash = sha256_hex(&input.content);
    let now = now_rfc3339();

    conn.execute(
        "INSERT INTO agent_doc(workspace_id, content, content_hash, updated_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(workspace_id) DO UPDATE SET
            content = excluded.content,
            content_hash = excluded.content_hash,
            updated_at = excluded.updated_at",
        params![input.workspace_id, input.content, hash, now],
    )?;

    Ok(json!({
        "workspaceId": input.workspace_id,
        "contentHash": hash,
        "updatedAt": now,
    }))
}

#[tauri::command]
pub fn agent_doc_hash(state: State<'_, AppState>, workspace_id: String) -> Result<Value, AppError> {
    let conn = state.open()?;
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

    get_workspace(&tx, &input.workspace_id)?;

    let (content, content_hash) = tx
        .query_row(
            "SELECT content, content_hash FROM agent_doc WHERE workspace_id = ?1",
            params![input.workspace_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()?
        .ok_or_else(AppError::agent_doc_not_found)?;

    tx.execute(
        "UPDATE agent_doc_versions SET active = 0 WHERE workspace_id = ?1",
        params![input.workspace_id],
    )?;

    let version = next_release_version(&tx, &input.workspace_id)?;
    let now = now_rfc3339();
    let release = AgentDocRelease {
        id: Uuid::new_v4().to_string(),
        workspace_id: input.workspace_id,
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
pub fn release_list(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<AgentDocRelease>, AppError> {
    let conn = state.open()?;
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

    get_workspace(&tx, &input.workspace_id)?;

    let (content, content_hash, title) = tx
        .query_row(
            "SELECT content, content_hash, title
             FROM agent_doc_versions
             WHERE workspace_id = ?1 AND version = ?2",
            params![input.workspace_id, input.release_version],
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
        params![input.workspace_id],
    )?;

    let next_version = next_release_version(&tx, &input.workspace_id)?;
    let now = now_rfc3339();
    let operator = input.operator.unwrap_or_else(|| "system".to_string());
    let release = AgentDocRelease {
        id: Uuid::new_v4().to_string(),
        workspace_id: input.workspace_id,
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
    let workspace = get_workspace(&conn, &input.workspace_id)?;
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
    workspace_id: String,
    limit: Option<i64>,
) -> Result<Vec<DistributionJobResult>, AppError> {
    let conn = state.open()?;
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
    let workspace = get_workspace(&conn, &input.workspace_id)?;
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

fn derive_skill_source_parent(source: &str) -> String {
    let path = Path::new(source);
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string());
    match file_name {
        Some(name) if !name.trim().is_empty() => {
            if name.eq_ignore_ascii_case("skills") {
                return path
                    .parent()
                    .and_then(|parent| parent.file_name())
                    .map(|parent| parent.to_string_lossy().to_string())
                    .filter(|parent| !parent.trim().is_empty())
                    .unwrap_or(name);
            }
            name
        }
        _ => path
            .parent()
            .and_then(|parent| parent.file_name())
            .map(|name| name.to_string_lossy().to_string())
            .filter(|name| !name.trim().is_empty())
            .unwrap_or_else(|| "unknown".to_string()),
    }
}

fn detect_skill_symlink(local_path: &str) -> bool {
    let normalized = local_path.trim_end_matches(['/', '\\']);
    if normalized.is_empty() {
        return false;
    }
    fs::symlink_metadata(normalized)
        .map(|metadata| metadata.file_type().is_symlink())
        .unwrap_or(false)
}

fn detect_skill_source_symlink(local_path: &str, source_root: &str) -> bool {
    let normalized = local_path.trim_end_matches(['/', '\\']);
    if normalized.is_empty() {
        return false;
    }
    if detect_skill_symlink(normalized) {
        return true;
    }

    let root = PathBuf::from(source_root.trim_end_matches(['/', '\\']));
    let candidate = PathBuf::from(normalized);
    if root.as_os_str().is_empty() {
        return false;
    }
    let relative = match candidate.strip_prefix(&root) {
        Ok(value) => value,
        Err(_) => return false,
    };

    let mut current = root.clone();
    for component in relative.components() {
        current.push(component.as_os_str());
        if fs::symlink_metadata(&current)
            .map(|metadata| metadata.file_type().is_symlink())
            .unwrap_or(false)
        {
            return true;
        }
    }
    false
}

fn build_skill_source_candidate_paths(source_root: &str, skill_name: &str) -> Vec<PathBuf> {
    let normalized_root = source_root.trim_end_matches(['/', '\\']);
    let normalized_name = skill_name.trim();
    if normalized_root.is_empty() || normalized_name.is_empty() {
        return Vec::new();
    }

    let root = PathBuf::from(normalized_root);
    let mut candidates = Vec::new();
    if root
        .file_name()
        .map(|name| name.to_string_lossy().eq_ignore_ascii_case("skills"))
        .unwrap_or(false)
    {
        candidates.push(root.join(normalized_name));
    } else {
        candidates.push(root.join("skills").join(normalized_name));
        candidates.push(root.join(normalized_name));
    }
    candidates
}

fn detect_skill_source_symlink_by_name(source_root: &str, skill_name: &str) -> bool {
    build_skill_source_candidate_paths(source_root, skill_name)
        .into_iter()
        .any(|candidate| {
            fs::symlink_metadata(candidate)
                .map(|metadata| metadata.file_type().is_symlink())
                .unwrap_or(false)
        })
}

fn resolve_skill_display_source_path(
    source_root: &str,
    skill_name: &str,
    fallback: &str,
) -> String {
    for candidate in build_skill_source_candidate_paths(source_root, skill_name) {
        if candidate.exists() {
            return candidate.to_string_lossy().to_string();
        }
    }
    fallback.to_string()
}

fn get_skill_root_by_id(conn: &Connection, skill_id: &str) -> Result<PathBuf, AppError> {
    let local_path = conn
        .query_row(
            "SELECT local_path FROM skills_assets WHERE id = ?1",
            params![skill_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .ok_or_else(|| AppError::invalid_argument("skill 不存在"))?;
    let root = PathBuf::from(local_path);
    if !root.exists() {
        return Err(AppError::invalid_argument("skill 目录不存在"));
    }
    if !root.is_dir() {
        return Err(AppError::invalid_argument("skill 路径不是目录"));
    }
    root.canonicalize()
        .map_err(|err| AppError::internal(format!("读取 skill 目录失败: {err}")))
}

fn normalize_rel_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn list_skill_tree_entries(root: &Path, current: &Path) -> Result<Vec<Value>, AppError> {
    let mut entries = Vec::new();
    for item in fs::read_dir(current)? {
        let entry = match item {
            Ok(value) => value,
            Err(_) => continue,
        };
        let file_name = entry.file_name().to_string_lossy().to_string();
        if file_name == ".DS_Store" {
            continue;
        }

        let file_type = match entry.file_type() {
            Ok(value) => value,
            Err(_) => continue,
        };
        let is_symlink = file_type.is_symlink();
        let is_dir = !is_symlink && file_type.is_dir();
        let absolute = entry.path();
        let relative = absolute
            .strip_prefix(root)
            .map(normalize_rel_path)
            .unwrap_or_else(|_| file_name.clone());
        let mut node = json!({
            "name": file_name,
            "relativePath": relative,
            "isDir": is_dir,
            "isSymlink": is_symlink,
        });
        if is_dir {
            let children = list_skill_tree_entries(root, &absolute)?;
            node["children"] = json!(children);
        }
        entries.push(node);
    }

    entries.sort_by(|left, right| {
        let left_is_dir = left.get("isDir").and_then(Value::as_bool).unwrap_or(false);
        let right_is_dir = right.get("isDir").and_then(Value::as_bool).unwrap_or(false);
        match (left_is_dir, right_is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => {
                let left_name = left
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_lowercase();
                let right_name = right
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_lowercase();
                left_name.cmp(&right_name)
            }
        }
    });

    Ok(entries)
}

fn resolve_skill_child_path(root: &Path, relative_path: &str) -> Result<PathBuf, AppError> {
    let trimmed = relative_path.trim();
    if trimmed.is_empty() {
        return Err(AppError::invalid_argument("relative_path 不能为空"));
    }
    if Path::new(trimmed).is_absolute() {
        return Err(AppError::invalid_argument("relative_path 必须是相对路径"));
    }
    let scoped = ensure_safe_target_path(root, Path::new(trimmed))?;
    if !scoped.exists() {
        return Err(AppError::invalid_argument("文件不存在"));
    }
    let canonical = scoped
        .canonicalize()
        .map_err(|err| AppError::internal(format!("读取文件路径失败: {err}")))?;
    if !canonical.starts_with(root) {
        return Err(AppError::path_out_of_scope("文件路径超出 skill 根目录"));
    }
    Ok(canonical)
}

fn detect_file_language(path: &Path) -> String {
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "md" | "mdx" => "markdown".to_string(),
        "py" => "python".to_string(),
        "js" | "mjs" | "cjs" => "javascript".to_string(),
        "ts" | "mts" | "cts" => "typescript".to_string(),
        "tsx" => "tsx".to_string(),
        "jsx" => "jsx".to_string(),
        "json" => "json".to_string(),
        "yaml" | "yml" => "yaml".to_string(),
        "toml" => "toml".to_string(),
        "rs" => "rust".to_string(),
        "sh" => "bash".to_string(),
        "go" => "go".to_string(),
        "java" => "java".to_string(),
        "c" => "c".to_string(),
        "cpp" | "cc" | "cxx" => "cpp".to_string(),
        "h" | "hpp" => "c".to_string(),
        "css" => "css".to_string(),
        "html" | "htm" => "html".to_string(),
        "xml" => "xml".to_string(),
        "sql" => "sql".to_string(),
        _ => ext,
    }
}

fn is_supported_preview_file(path: &Path) -> bool {
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_lowercase();
    matches!(
        ext.as_str(),
        "md" | "mdx"
            | "txt"
            | "py"
            | "js"
            | "mjs"
            | "cjs"
            | "ts"
            | "mts"
            | "cts"
            | "tsx"
            | "jsx"
            | "json"
            | "yaml"
            | "yml"
            | "toml"
            | "rs"
            | "sh"
            | "go"
            | "java"
            | "c"
            | "cpp"
            | "cc"
            | "cxx"
            | "h"
            | "hpp"
            | "css"
            | "html"
            | "htm"
            | "xml"
            | "sql"
    )
}

fn normalize_open_mode(mode: Option<String>) -> String {
    mode.unwrap_or_else(|| "finder".to_string())
        .trim()
        .to_lowercase()
}

#[cfg(target_os = "macos")]
fn run_open_with_mode(path: &Path, mode: &str) -> Result<(), AppError> {
    let open_target = if matches!(mode, "terminal" | "iterm2") && path.is_file() {
        path.parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| path.to_path_buf())
    } else {
        path.to_path_buf()
    };

    let mut cmd = std::process::Command::new("open");
    match mode {
        "default" => {
            cmd.arg(&open_target);
        }
        "finder" => {
            cmd.arg("-R").arg(&open_target);
        }
        "vscode" => {
            cmd.arg("-a").arg("Visual Studio Code").arg(&open_target);
        }
        "cursor" => {
            cmd.arg("-a").arg("Cursor").arg(&open_target);
        }
        "zed" => {
            cmd.arg("-a").arg("Zed").arg(&open_target);
        }
        "terminal" => {
            cmd.arg("-a").arg("Terminal").arg(&open_target);
        }
        "iterm2" => {
            cmd.arg("-a").arg("iTerm").arg(&open_target);
        }
        "xcode" => {
            cmd.arg("-a").arg("Xcode").arg(&open_target);
        }
        "goland" => {
            cmd.arg("-a").arg("GoLand").arg(&open_target);
        }
        _ => return Err(AppError::invalid_argument("不支持的打开方式")),
    };
    let status = cmd
        .status()
        .map_err(|err| AppError::internal(format!("执行 open 失败: {err}")))?;
    if !status.success() {
        return Err(AppError::internal("执行 open 失败"));
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn run_open_with_mode(path: &Path, _mode: &str) -> Result<(), AppError> {
    let status = std::process::Command::new("xdg-open")
        .arg(path)
        .status()
        .map_err(|err| AppError::internal(format!("执行 xdg-open 失败: {err}")))?;
    if !status.success() {
        return Err(AppError::internal("执行 xdg-open 失败"));
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn run_open_with_mode(path: &Path, _mode: &str) -> Result<(), AppError> {
    let path_text = path.to_string_lossy().to_string();
    let status = std::process::Command::new("cmd")
        .args(["/C", "start", "", &path_text])
        .status()
        .map_err(|err| AppError::internal(format!("执行 start 失败: {err}")))?;
    if !status.success() {
        return Err(AppError::internal("执行 start 失败"));
    }
    Ok(())
}

#[tauri::command]
pub fn skills_scan(
    state: State<'_, AppState>,
    input: SkillsScanInput,
) -> Result<Vec<SkillAsset>, AppError> {
    let conn = state.open()?;
    let workspace = get_workspace(&conn, &input.workspace_id)?;
    let workspace_root = PathBuf::from(&workspace.root_path);

    let directories: Vec<PathBuf> = if let Some(input_dirs) = input.directories {
        input_dirs.into_iter().map(PathBuf::from).collect()
    } else {
        default_skill_directories(&workspace_root)
    };

    let discovered = discover_skills(&directories)?;
    let deduped = dedupe_skills(discovered);
    let latest_versions = input.latest_versions.unwrap_or_default();
    let managed_skills_root = ensure_workspace_managed_skills_root(&workspace_root)?;
    let managed_skills_root_normalized = normalize_fs_path(&managed_skills_root);
    let mut managed_source_count = 0usize;

    let mut assets = Vec::new();
    for skill in deduped {
        let source_entry_path = PathBuf::from(&skill.local_path);
        let source_local_path = source_entry_path.to_string_lossy().to_string();
        let source_is_symlink = detect_skill_source_symlink(&skill.local_path, &skill.source)
            || detect_skill_source_symlink_by_name(&skill.source, &skill.name);
        let managed_local_path =
            if is_path_under_root(&source_entry_path, &managed_skills_root_normalized) {
                managed_source_count += 1;
                source_local_path.clone()
            } else {
                ingest_skill_into_workspace_storage(&skill, &managed_skills_root)?
            };
        let managed_skill = DiscoveredSkill {
            local_path: managed_local_path,
            ..skill
        };
        let local_version = managed_skill.version.clone();
        let latest_version = latest_versions
            .get(&managed_skill.identity)
            .cloned()
            .unwrap_or_else(|| local_version.clone());
        let update_candidate = compare_version(&local_version, &latest_version).is_lt();

        let id = upsert_skill_asset(
            &conn,
            &managed_skill,
            &latest_version,
            update_candidate,
            &source_local_path,
            source_is_symlink,
            now_rfc3339(),
        )?;

        upsert_skill_version(&conn, &id, &local_version, &managed_skill.source)?;

        assets.push(get_skill_asset(&conn, &id)?);
    }

    append_audit_event(
        &conn,
        Some(&workspace.id),
        "skills_scan",
        "system",
        json!({
            "workspaceId": workspace.id,
            "directories": directories,
            "count": assets.len(),
            "managedSourceCount": managed_source_count,
        }),
    )?;

    Ok(assets)
}

#[tauri::command]
pub fn skills_list(state: State<'_, AppState>) -> Result<Vec<SkillAsset>, AppError> {
    let conn = state.open()?;
    let mut stmt = conn.prepare(
        "SELECT id, identity, name, version, latest_version, source, local_path, source_local_path, source_is_symlink, update_candidate, last_used_at, created_at, updated_at
         FROM skills_assets
         ORDER BY updated_at DESC, name ASC",
    )?;

    let rows = stmt.query_map([], skill_asset_from_row)?;
    let mut list = Vec::new();
    for row in rows {
        list.push(row?);
    }

    Ok(list)
}

#[tauri::command]
pub fn skills_asset_detail(
    state: State<'_, AppState>,
    skill_id: String,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    let asset = get_skill_asset(&conn, &skill_id)?;

    let mut stmt = conn.prepare(
        "SELECT version, source, installed_at
         FROM skills_versions
         WHERE asset_id = ?1
         ORDER BY installed_at DESC",
    )?;
    let rows = stmt.query_map(params![skill_id], |row| {
        Ok(json!({
            "version": row.get::<_, String>(0)?,
            "source": row.get::<_, String>(1)?,
            "installedAt": row.get::<_, String>(2)?,
        }))
    })?;

    let mut versions = Vec::new();
    for row in rows {
        versions.push(row?);
    }

    Ok(json!({
        "asset": asset,
        "versions": versions,
    }))
}

#[tauri::command]
pub fn skills_files_tree(
    state: State<'_, AppState>,
    input: SkillsFileTreeInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    let root = get_skill_root_by_id(&conn, &input.skill_id)?;
    let entries = list_skill_tree_entries(&root, &root)?;
    Ok(json!({
        "rootPath": normalize_rel_path(&root),
        "entries": entries,
    }))
}

#[tauri::command]
pub fn skills_file_read(
    state: State<'_, AppState>,
    input: SkillsFileReadInput,
) -> Result<Value, AppError> {
    const MAX_PREVIEW_BYTES: u64 = 1024 * 1024;

    let conn = state.open()?;
    let root = get_skill_root_by_id(&conn, &input.skill_id)?;
    let path = resolve_skill_child_path(&root, &input.relative_path)?;
    if path.is_dir() {
        return Err(AppError::invalid_argument("目标是目录，无法预览"));
    }

    let relative_path = path
        .strip_prefix(&root)
        .map(normalize_rel_path)
        .unwrap_or_else(|_| input.relative_path.trim().to_string());
    let language = detect_file_language(&path);
    if !is_supported_preview_file(&path) {
        return Ok(json!({
            "relativePath": relative_path,
            "absolutePath": normalize_rel_path(&path),
            "language": language,
            "supported": false,
            "content": "",
            "message": "该文件类型暂不支持预览",
        }));
    }

    if let Ok(metadata) = fs::metadata(&path) {
        if metadata.len() > MAX_PREVIEW_BYTES {
            return Ok(json!({
                "relativePath": relative_path,
                "absolutePath": normalize_rel_path(&path),
                "language": language,
                "supported": false,
                "content": "",
                "message": "文件过大，暂不支持预览",
            }));
        }
    }

    match fs::read_to_string(&path) {
        Ok(content) => Ok(json!({
            "relativePath": relative_path,
            "absolutePath": normalize_rel_path(&path),
            "language": language,
            "supported": true,
            "content": content,
            "message": "",
        })),
        Err(_) => Ok(json!({
            "relativePath": relative_path,
            "absolutePath": normalize_rel_path(&path),
            "language": language,
            "supported": false,
            "content": "",
            "message": "该文件不是可预览文本",
        })),
    }
}

#[tauri::command]
pub fn skills_open(state: State<'_, AppState>, input: SkillsOpenInput) -> Result<Value, AppError> {
    let conn = state.open()?;
    let root = get_skill_root_by_id(&conn, &input.skill_id)?;
    let mode = normalize_open_mode(input.mode);
    let path = if let Some(relative_path) = input.relative_path {
        if relative_path.trim().is_empty() {
            root.clone()
        } else {
            resolve_skill_child_path(&root, &relative_path)?
        }
    } else {
        root.clone()
    };
    run_open_with_mode(&path, &mode)?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub fn skills_distribute(
    state: State<'_, AppState>,
    input: SkillsBatchInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    let workspace = get_workspace(&conn, &input.workspace_id)?;
    let targets = list_targets(&conn, &workspace.id, Some(input.target_ids.as_slice()))?;
    if targets.is_empty() {
        return Err(AppError::invalid_argument("分发目标为空"));
    }

    let skills = list_skills_by_ids(&conn, &input.skill_ids)?;
    if skills.is_empty() {
        return Err(AppError::invalid_argument("skill 选择为空"));
    }

    let workspace_root = PathBuf::from(&workspace.root_path);
    let mut rows = Vec::new();

    for skill in &skills {
        let source_dir = PathBuf::from(&skill.local_path);
        for target in &targets {
            let safe_skills_root =
                resolve_distribution_target_path(&workspace_root, Path::new(&target.skills_path));
            let (status, message, used_mode) = match safe_skills_root {
                Ok(root) => {
                    let destination = root.join(&skill.name);
                    match distribute_skill(&source_dir, &destination, &target.install_mode) {
                        Ok(mode) => {
                            conn.execute(
                                "UPDATE skills_assets SET last_used_at = ?2, updated_at = ?2 WHERE id = ?1",
                                params![skill.id, now_rfc3339()],
                            )?;
                            ("success".to_string(), "ok".to_string(), mode)
                        }
                        Err(err) => (
                            "failed".to_string(),
                            err.message,
                            target.install_mode.clone(),
                        ),
                    }
                }
                Err(err) => (
                    "failed".to_string(),
                    err.message,
                    target.install_mode.clone(),
                ),
            };

            rows.push(json!({
                "skillId": skill.id,
                "skillName": skill.name,
                "targetId": target.id,
                "platform": target.platform,
                "status": status,
                "message": message,
                "usedMode": used_mode,
            }));
        }
    }

    append_audit_event(
        &conn,
        Some(&workspace.id),
        "skills_distribute",
        input.operator.as_deref().unwrap_or("system"),
        json!({
            "workspaceId": workspace.id,
            "skillIds": input.skill_ids,
            "targetIds": input.target_ids,
            "summary": summarize_json_rows(&rows),
        }),
    )?;

    Ok(json!({
        "results": rows,
        "summary": summarize_json_rows(&rows),
    }))
}

#[tauri::command]
pub fn skills_uninstall(
    state: State<'_, AppState>,
    input: SkillsBatchInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    let workspace = get_workspace(&conn, &input.workspace_id)?;
    let targets = list_targets(&conn, &workspace.id, Some(input.target_ids.as_slice()))?;
    if targets.is_empty() {
        return Err(AppError::invalid_argument("分发目标为空"));
    }

    let skills = list_skills_by_ids(&conn, &input.skill_ids)?;
    if skills.is_empty() {
        return Err(AppError::invalid_argument("skill 选择为空"));
    }

    let workspace_root = PathBuf::from(&workspace.root_path);
    let mut rows = Vec::new();

    for skill in &skills {
        for target in &targets {
            let safe_skills_root =
                resolve_distribution_target_path(&workspace_root, Path::new(&target.skills_path));
            let (status, message) = match safe_skills_root {
                Ok(root) => {
                    let destination = root.join(&skill.name);
                    match uninstall_skill(&destination) {
                        Ok(_) => ("success".to_string(), "ok".to_string()),
                        Err(err) => ("failed".to_string(), err.message),
                    }
                }
                Err(err) => ("failed".to_string(), err.message),
            };

            rows.push(json!({
                "skillId": skill.id,
                "skillName": skill.name,
                "targetId": target.id,
                "platform": target.platform,
                "status": status,
                "message": message,
            }));
        }
    }

    append_audit_event(
        &conn,
        Some(&workspace.id),
        "skills_uninstall",
        input.operator.as_deref().unwrap_or("system"),
        json!({
            "workspaceId": workspace.id,
            "skillIds": input.skill_ids,
            "targetIds": input.target_ids,
            "summary": summarize_json_rows(&rows),
        }),
    )?;

    Ok(json!({
        "results": rows,
        "summary": summarize_json_rows(&rows),
    }))
}

#[tauri::command]
pub fn prompt_create(
    state: State<'_, AppState>,
    input: PromptCreateInput,
) -> Result<Value, AppError> {
    let mut conn = state.open()?;
    let tx = conn.transaction()?;

    get_workspace(&tx, &input.workspace_id)?;

    let now = now_rfc3339();
    let prompt_id = Uuid::new_v4().to_string();
    let tags = input.tags.unwrap_or_default();
    let category = input.category.unwrap_or_else(|| "default".to_string());
    let favorite = input.favorite.unwrap_or(false);

    tx.execute(
        "INSERT INTO prompts_assets(id, workspace_id, name, tags, category, favorite, active_version, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8)",
        params![
            prompt_id,
            input.workspace_id,
            input.name,
            serde_json::to_string(&tags).map_err(|err| AppError::internal(err.to_string()))?,
            category,
            bool_to_int(favorite),
            now,
            now,
        ],
    )?;

    tx.execute(
        "INSERT INTO prompts_versions(asset_id, version, content, metadata, created_at)
         VALUES (?1, 1, ?2, ?3, ?4)",
        params![
            prompt_id,
            input.content,
            json!({"action": "create"}).to_string(),
            now,
        ],
    )?;

    tx.commit()?;
    get_prompt_with_active_content(&conn, &prompt_id)
}

#[tauri::command]
pub fn prompt_update(
    state: State<'_, AppState>,
    input: PromptUpdateInput,
) -> Result<Value, AppError> {
    let mut conn = state.open()?;
    let tx = conn.transaction()?;

    let prompt = get_prompt_asset_row(&tx, &input.prompt_id)?;
    let current_content: String = tx.query_row(
        "SELECT content FROM prompts_versions WHERE asset_id = ?1 AND version = ?2",
        params![prompt.id, prompt.active_version],
        |row| row.get(0),
    )?;
    let content_changed = current_content != input.content;
    let next_version = if content_changed {
        prompt.active_version + 1
    } else {
        prompt.active_version
    };
    let name = input.name.map(|item| item.trim().to_string());
    if let Some(candidate) = name.as_ref() {
        if candidate.is_empty() {
            return Err(AppError::invalid_argument("prompt 标题不能为空"));
        }
    }
    let tags = input.tags.unwrap_or(prompt.tags.clone());
    let category = input.category.unwrap_or(prompt.category.clone());
    let favorite = input.favorite.unwrap_or(prompt.favorite);
    let now = now_rfc3339();

    if content_changed {
        tx.execute(
            "INSERT INTO prompts_versions(asset_id, version, content, metadata, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                prompt.id,
                next_version,
                input.content,
                json!({"action": "update"}).to_string(),
                now,
            ],
        )?;
    }

    tx.execute(
        "UPDATE prompts_assets
         SET name = COALESCE(?2, name), tags = ?3, category = ?4, favorite = ?5, active_version = ?6, updated_at = ?7
         WHERE id = ?1",
        params![
            prompt.id,
            name,
            serde_json::to_string(&tags).map_err(|err| AppError::internal(err.to_string()))?,
            category,
            bool_to_int(favorite),
            next_version,
            now,
        ],
    )?;

    tx.commit()?;
    get_prompt_with_active_content(&conn, &input.prompt_id)
}

#[tauri::command]
pub fn prompt_delete(
    state: State<'_, AppState>,
    input: PromptDeleteInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    let affected = conn.execute(
        "DELETE FROM prompts_assets WHERE id = ?1",
        params![input.prompt_id],
    )?;

    if affected == 0 {
        return Err(AppError::invalid_argument("prompt 不存在"));
    }

    Ok(json!({ "deleted": true }))
}

#[tauri::command]
pub fn prompt_list(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<Value>, AppError> {
    let conn = state.open()?;
    get_workspace(&conn, &workspace_id)?;

    let mut stmt = conn.prepare(
        "SELECT p.id, p.workspace_id, p.name, p.tags, p.category, p.favorite, p.active_version, p.created_at, p.updated_at, v.content
         FROM prompts_assets p
         JOIN prompts_versions v ON v.asset_id = p.id AND v.version = p.active_version
         WHERE p.workspace_id = ?1
         ORDER BY p.updated_at DESC",
    )?;

    let rows = stmt.query_map(params![workspace_id], |row| {
        let tags_raw: String = row.get(3)?;
        let tags: Vec<String> = serde_json::from_str(&tags_raw).unwrap_or_default();

        Ok(json!({
            "id": row.get::<_, String>(0)?,
            "workspaceId": row.get::<_, String>(1)?,
            "name": row.get::<_, String>(2)?,
            "tags": tags,
            "category": row.get::<_, String>(4)?,
            "favorite": row.get::<_, i64>(5)? == 1,
            "activeVersion": row.get::<_, i64>(6)?,
            "createdAt": row.get::<_, String>(7)?,
            "updatedAt": row.get::<_, String>(8)?,
            "content": row.get::<_, String>(9)?,
        }))
    })?;

    let mut list = Vec::new();
    for row in rows {
        list.push(row?);
    }

    Ok(list)
}

#[tauri::command]
pub fn prompt_versions(
    state: State<'_, AppState>,
    prompt_id: String,
) -> Result<Vec<Value>, AppError> {
    let conn = state.open()?;
    get_prompt_asset_row(&conn, &prompt_id)?;

    let mut stmt = conn.prepare(
        "SELECT version, content, metadata, created_at
         FROM prompts_versions
         WHERE asset_id = ?1
         ORDER BY version DESC",
    )?;

    let rows = stmt.query_map(params![prompt_id], |row| {
        let metadata_raw: String = row.get(2)?;
        let metadata =
            serde_json::from_str::<Value>(&metadata_raw).unwrap_or(Value::String(metadata_raw));

        Ok(json!({
            "version": row.get::<_, i64>(0)?,
            "content": row.get::<_, String>(1)?,
            "metadata": metadata,
            "createdAt": row.get::<_, String>(3)?,
        }))
    })?;

    let mut list = Vec::new();
    for row in rows {
        list.push(row?);
    }

    Ok(list)
}

#[tauri::command]
pub fn prompt_restore_version(
    state: State<'_, AppState>,
    input: PromptRestoreInput,
) -> Result<Value, AppError> {
    let mut conn = state.open()?;
    let tx = conn.transaction()?;

    let prompt = get_prompt_asset_row(&tx, &input.prompt_id)?;
    let restored_content = tx
        .query_row(
            "SELECT content FROM prompts_versions WHERE asset_id = ?1 AND version = ?2",
            params![input.prompt_id, input.version],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .ok_or_else(|| AppError::invalid_argument("指定版本不存在"))?;

    let next_version = prompt.active_version + 1;
    let now = now_rfc3339();

    tx.execute(
        "INSERT INTO prompts_versions(asset_id, version, content, metadata, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            prompt.id,
            next_version,
            restored_content,
            json!({"action": "restore", "fromVersion": input.version}).to_string(),
            now,
        ],
    )?;

    tx.execute(
        "UPDATE prompts_assets SET active_version = ?2, updated_at = ?3 WHERE id = ?1",
        params![prompt.id, next_version, now],
    )?;

    tx.commit()?;
    get_prompt_with_active_content(&conn, &input.prompt_id)
}

#[tauri::command]
pub fn prompt_search(
    state: State<'_, AppState>,
    input: PromptSearchInput,
) -> Result<Vec<Value>, AppError> {
    let list = prompt_list(state, input.workspace_id)?;

    let keyword = input.keyword.unwrap_or_default().to_lowercase();
    let category = input.category.unwrap_or_default();
    let tag_filter: HashSet<String> = input
        .tags
        .unwrap_or_default()
        .into_iter()
        .map(|item| item.to_lowercase())
        .collect();

    let mut filtered = Vec::new();
    for item in list {
        let matches_keyword = if keyword.is_empty() {
            true
        } else {
            let name = item
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_lowercase();
            let content = item
                .get("content")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_lowercase();
            name.contains(&keyword) || content.contains(&keyword)
        };

        if !matches_keyword {
            continue;
        }

        if !category.is_empty()
            && item
                .get("category")
                .and_then(Value::as_str)
                .unwrap_or_default()
                != category
        {
            continue;
        }

        if let Some(favorite_filter) = input.favorite {
            let favorite = item
                .get("favorite")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            if favorite != favorite_filter {
                continue;
            }
        }

        if !tag_filter.is_empty() {
            let tags = item
                .get("tags")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();

            let present: HashSet<String> = tags
                .iter()
                .filter_map(|entry| entry.as_str().map(|item| item.to_lowercase()))
                .collect();

            if !tag_filter.iter().all(|tag| present.contains(tag)) {
                continue;
            }
        }

        filtered.push(item);
    }

    Ok(filtered)
}

#[tauri::command]
pub fn prompt_render(
    state: State<'_, AppState>,
    input: PromptRenderInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;

    let content = conn
        .query_row(
            "SELECT v.content
             FROM prompts_assets p
             JOIN prompts_versions v ON v.asset_id = p.id AND v.version = p.active_version
             WHERE p.id = ?1",
            params![input.prompt_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .ok_or_else(|| AppError::invalid_argument("prompt 不存在"))?;

    let rendered = render_template(&content, &input.variables);
    Ok(json!({ "rendered": rendered }))
}

#[tauri::command]
pub fn metrics_ingest_usage_event(
    state: State<'_, AppState>,
    input: UsageEventInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    get_workspace(&conn, &input.workspace_id)?;

    let event_id = Uuid::new_v4().to_string();
    let ts = now_rfc3339();
    let context = serde_json::to_string(&input.context.unwrap_or_default())
        .map_err(|err| AppError::internal(err.to_string()))?;

    conn.execute(
        "INSERT INTO usage_events(id, workspace_id, asset_type, asset_id, version, event_type, success, context, ts)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            event_id,
            input.workspace_id,
            input.asset_type,
            input.asset_id,
            input.version,
            input.event_type,
            bool_to_int(input.success),
            context,
            ts,
        ],
    )?;

    if input.asset_type == "skill" {
        conn.execute(
            "UPDATE skills_assets SET last_used_at = ?2, updated_at = ?2 WHERE id = ?1 OR identity = ?1",
            params![input.asset_id, now_rfc3339()],
        )?;
    }

    Ok(json!({ "eventId": event_id }))
}

#[tauri::command]
pub fn metrics_query_overview(
    state: State<'_, AppState>,
    workspace_id: String,
    days: Option<i64>,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    get_workspace(&conn, &workspace_id)?;

    let range_days = days.unwrap_or(30).clamp(1, 365);
    let from_ts = (Utc::now() - Duration::days(range_days)).to_rfc3339();

    let mut metrics_stmt = conn.prepare(
        "SELECT asset_type, COUNT(1), SUM(success), MAX(ts)
         FROM usage_events
         WHERE workspace_id = ?1 AND ts >= ?2
         GROUP BY asset_type",
    )?;

    let metric_rows = metrics_stmt.query_map(params![workspace_id, from_ts], |row| {
        let trigger_count: i64 = row.get(1)?;
        let success_count: i64 = row.get::<_, Option<i64>>(2)?.unwrap_or(0);
        let success_rate = if trigger_count == 0 {
            0.0
        } else {
            success_count as f64 / trigger_count as f64
        };

        Ok(json!({
            "assetType": row.get::<_, String>(0)?,
            "triggerCount": trigger_count,
            "successCount": success_count,
            "successRate": success_rate,
            "recentTs": row.get::<_, Option<String>>(3)?,
        }))
    })?;

    let mut metrics = Vec::new();
    for row in metric_rows {
        metrics.push(row?);
    }

    let mut ratings_stmt = conn.prepare(
        "SELECT asset_type, AVG(score), COUNT(1)
         FROM ratings
         WHERE workspace_id = ?1
         GROUP BY asset_type",
    )?;

    let rating_rows = ratings_stmt.query_map(params![workspace_id], |row| {
        Ok(json!({
            "assetType": row.get::<_, String>(0)?,
            "avgScore": row.get::<_, Option<f64>>(1)?.unwrap_or(0.0),
            "ratingCount": row.get::<_, i64>(2)?,
        }))
    })?;

    let mut ratings = Vec::new();
    for row in rating_rows {
        ratings.push(row?);
    }

    Ok(json!({
        "windowDays": range_days,
        "metrics": metrics,
        "ratings": ratings,
    }))
}

#[tauri::command]
pub fn metrics_query_by_asset(
    state: State<'_, AppState>,
    input: MetricsByAssetInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    get_workspace(&conn, &input.workspace_id)?;

    let range_days = input.days.unwrap_or(30).clamp(1, 365);
    let from_ts = (Utc::now() - Duration::days(range_days)).to_rfc3339();

    let row = conn.query_row(
        "SELECT COUNT(1), SUM(success), MAX(ts)
             FROM usage_events
             WHERE workspace_id = ?1
               AND asset_type = ?2
               AND asset_id = ?3
               AND ts >= ?4",
        params![
            input.workspace_id,
            input.asset_type,
            input.asset_id,
            from_ts
        ],
        |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, Option<i64>>(1)?.unwrap_or(0),
                row.get::<_, Option<String>>(2)?,
            ))
        },
    )?;

    let success_rate = if row.0 == 0 {
        0.0
    } else {
        row.1 as f64 / row.0 as f64
    };

    let rating = conn.query_row(
        "SELECT AVG(score), COUNT(1)
             FROM ratings
             WHERE workspace_id = ?1 AND asset_type = ?2 AND asset_id = ?3",
        params![input.workspace_id, input.asset_type, input.asset_id],
        |row| {
            Ok((
                row.get::<_, Option<f64>>(0)?.unwrap_or(0.0),
                row.get::<_, i64>(1)?,
            ))
        },
    )?;

    Ok(json!({
        "triggerCount": row.0,
        "successCount": row.1,
        "successRate": success_rate,
        "recentTs": row.2,
        "avgScore": rating.0,
        "ratingCount": rating.1,
    }))
}

#[tauri::command]
pub fn metrics_submit_rating(
    state: State<'_, AppState>,
    input: RatingInput,
) -> Result<Value, AppError> {
    if input.score < 1 || input.score > 5 {
        return Err(AppError::invalid_argument("评分范围必须在 1-5"));
    }

    let conn = state.open()?;
    get_workspace(&conn, &input.workspace_id)?;

    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO ratings(id, workspace_id, asset_type, asset_id, version, score, comment, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            id,
            input.workspace_id,
            input.asset_type,
            input.asset_id,
            input.version,
            input.score,
            input.comment.unwrap_or_default(),
            now_rfc3339(),
        ],
    )?;

    Ok(json!({ "ratingId": id }))
}

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
            bool_to_int(allow_fallback),
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

fn summarize_json_rows(rows: &[Value]) -> Value {
    let total = rows.len();
    let success = rows
        .iter()
        .filter(|item| item.get("status").and_then(Value::as_str) == Some("success"))
        .count();
    let failed = total.saturating_sub(success);

    json!({
        "total": total,
        "success": success,
        "failed": failed,
    })
}

fn get_workspace(conn: &Connection, id: &str) -> Result<Workspace, AppError> {
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

fn workspace_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Workspace> {
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

fn ensure_default_skills_distribution_targets(
    conn: &Connection,
    workspace: &Workspace,
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

fn get_target(conn: &Connection, target_id: &str) -> Result<DistributionTarget, AppError> {
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

fn list_targets(
    conn: &Connection,
    workspace_id: &str,
    target_ids: Option<&[String]>,
) -> Result<Vec<crate::domain::models::DistributionTarget>, AppError> {
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
                        Ok(crate::domain::models::DistributionTarget {
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
        Ok(crate::domain::models::DistributionTarget {
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

fn append_audit_event(
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

fn dedupe_skills(discovered: Vec<DiscoveredSkill>) -> Vec<DiscoveredSkill> {
    let mut mapped: HashMap<String, DiscoveredSkill> = HashMap::new();

    for skill in discovered {
        match mapped.get(&skill.identity) {
            None => {
                mapped.insert(skill.identity.clone(), skill);
            }
            Some(prev) => {
                let version_cmp = compare_version(&prev.version, &skill.version);
                if version_cmp.is_lt()
                    || (version_cmp.is_eq()
                        && skill_source_priority(&skill.source)
                            < skill_source_priority(&prev.source))
                {
                    mapped.insert(skill.identity.clone(), skill);
                }
            }
        }
    }

    let mut list: Vec<DiscoveredSkill> = mapped.into_values().collect();
    list.sort_by(|a, b| a.name.cmp(&b.name));
    list
}

fn skill_source_priority(source: &str) -> u8 {
    let normalized = source.replace('\\', "/").to_ascii_lowercase();
    if normalized.ends_with("/.codex") || normalized.contains("/.codex/") {
        return 0;
    }
    if normalized.ends_with("/.claude") || normalized.contains("/.claude/") {
        return 1;
    }
    if normalized.ends_with("/.agents") || normalized.contains("/.agents/") {
        return 2;
    }
    3
}

fn ensure_workspace_managed_skills_root(workspace_root: &Path) -> Result<PathBuf, AppError> {
    let root = workspace_root.join("skills");
    fs::create_dir_all(&root)?;
    Ok(root)
}

fn ingest_skill_into_workspace_storage(
    skill: &DiscoveredSkill,
    managed_root: &Path,
) -> Result<String, AppError> {
    let source_root = PathBuf::from(&skill.local_path);
    if !source_root.exists() || !source_root.is_dir() {
        return Err(AppError::invalid_argument(format!(
            "skill 源目录不存在或不是目录: {}",
            source_root.display()
        )));
    }

    let managed_name = managed_skill_dir_name(skill);
    let managed_path = managed_root.join(managed_name);
    if normalize_fs_path(&source_root) == normalize_fs_path(&managed_path) {
        return Ok(managed_path.to_string_lossy().to_string());
    }

    let staging_path = managed_root.join(format!(
        ".ingest-{}-{}",
        skill.identity,
        Uuid::new_v4().simple()
    ));
    if staging_path.exists() {
        remove_path_any(&staging_path)?;
    }

    copy_directory_tree(&source_root, &staging_path).inspect_err(|_| {
        let _ = remove_path_any(&staging_path);
    })?;

    if managed_path.exists() {
        remove_path_any(&managed_path)?;
    }

    fs::rename(&staging_path, &managed_path).inspect_err(|_| {
        let _ = remove_path_any(&staging_path);
    })?;

    Ok(managed_path.to_string_lossy().to_string())
}

fn managed_skill_dir_name(skill: &DiscoveredSkill) -> String {
    if !skill.identity.trim().is_empty() {
        return skill.identity.trim().to_string();
    }
    let mut normalized = skill
        .name
        .trim()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>();
    normalized = normalized.trim_matches('-').to_string();
    if normalized.is_empty() {
        "unknown-skill".to_string()
    } else {
        normalized
    }
}

fn copy_directory_tree(source_root: &Path, target_root: &Path) -> Result<(), AppError> {
    fs::create_dir_all(target_root)?;
    for row in WalkDir::new(source_root).follow_links(true).into_iter() {
        let entry = row.map_err(|err| AppError::internal(err.to_string()))?;
        let path = entry.path();
        if path == source_root {
            continue;
        }
        let relative = path
            .strip_prefix(source_root)
            .map_err(|err| AppError::internal(err.to_string()))?;
        let destination = target_root.join(relative);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&destination)?;
            continue;
        }
        if entry.file_type().is_file() {
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(path, &destination)?;
        }
    }
    Ok(())
}

fn remove_path_any(path: &Path) -> Result<(), AppError> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || metadata.is_file() {
        fs::remove_file(path)?;
        return Ok(());
    }
    if metadata.is_dir() {
        fs::remove_dir_all(path)?;
        return Ok(());
    }
    fs::remove_file(path)?;
    Ok(())
}

fn normalize_fs_path(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn is_path_under_root(candidate: &Path, normalized_root: &Path) -> bool {
    let normalized_candidate = normalize_fs_path(candidate);
    normalized_candidate.starts_with(normalized_root)
}

fn upsert_skill_asset(
    conn: &Connection,
    skill: &DiscoveredSkill,
    latest_version: &str,
    update_candidate: bool,
    source_local_path: &str,
    source_is_symlink: bool,
    ts: String,
) -> Result<String, AppError> {
    let existing = conn
        .query_row(
            "SELECT id FROM skills_assets WHERE identity = ?1",
            params![skill.identity],
            |row| row.get::<_, String>(0),
        )
        .optional()?;

    let id = existing.unwrap_or_else(|| Uuid::new_v4().to_string());

    conn.execute(
        "INSERT INTO skills_assets(
            id,
            identity,
            name,
            version,
            latest_version,
            source,
            local_path,
            source_local_path,
            source_is_symlink,
            update_candidate,
            created_at,
            updated_at
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
         ON CONFLICT(identity) DO UPDATE SET
            name = excluded.name,
            version = excluded.version,
            latest_version = excluded.latest_version,
            source = excluded.source,
            local_path = excluded.local_path,
            source_local_path = excluded.source_local_path,
            source_is_symlink = excluded.source_is_symlink,
            update_candidate = excluded.update_candidate,
            updated_at = excluded.updated_at",
        params![
            id,
            skill.identity,
            skill.name,
            skill.version,
            latest_version,
            skill.source,
            skill.local_path,
            source_local_path,
            bool_to_int(source_is_symlink),
            bool_to_int(update_candidate),
            ts,
            now_rfc3339(),
        ],
    )?;

    Ok(id)
}

fn upsert_skill_version(
    conn: &Connection,
    asset_id: &str,
    version: &str,
    source: &str,
) -> Result<(), AppError> {
    let exists = conn
        .query_row(
            "SELECT COUNT(1) FROM skills_versions WHERE asset_id = ?1 AND version = ?2",
            params![asset_id, version],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0);

    if exists > 0 {
        return Ok(());
    }

    conn.execute(
        "INSERT INTO skills_versions(id, asset_id, version, source, installed_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            Uuid::new_v4().to_string(),
            asset_id,
            version,
            source,
            now_rfc3339(),
        ],
    )?;

    Ok(())
}

fn get_skill_asset(conn: &Connection, skill_id: &str) -> Result<SkillAsset, AppError> {
    conn.query_row(
        "SELECT id, identity, name, version, latest_version, source, local_path, source_local_path, source_is_symlink, update_candidate, last_used_at, created_at, updated_at
         FROM skills_assets
         WHERE id = ?1",
        params![skill_id],
        skill_asset_from_row,
    )
    .optional()?
    .ok_or_else(|| AppError::invalid_argument("skill 不存在"))
}

fn skill_asset_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SkillAsset> {
    let source: String = row.get(5)?;
    let name: String = row.get(2)?;
    let local_path: String = row.get(6)?;
    let raw_source_local_path = row
        .get::<_, Option<String>>(7)?
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| local_path.clone());
    let source_local_path =
        resolve_skill_display_source_path(&source, &name, &raw_source_local_path);
    let source_is_symlink = row.get::<_, i64>(8)? == 1
        || detect_skill_source_symlink(&source_local_path, &source)
        || detect_skill_source_symlink_by_name(&source, &name);
    let source_parent = derive_skill_source_parent(&source);
    let is_symlink = detect_skill_symlink(&local_path);

    Ok(SkillAsset {
        id: row.get(0)?,
        identity: row.get(1)?,
        name,
        version: row.get(3)?,
        latest_version: row.get(4)?,
        source,
        source_parent,
        local_path,
        source_local_path,
        source_is_symlink,
        is_symlink,
        update_candidate: row.get::<_, i64>(9)? == 1,
        last_used_at: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

fn list_skills_by_ids(conn: &Connection, ids: &[String]) -> Result<Vec<SkillAsset>, AppError> {
    let mut list = Vec::new();
    for skill_id in ids {
        if let Some(item) = conn
            .query_row(
                "SELECT id, identity, name, version, latest_version, source, local_path, source_local_path, source_is_symlink, update_candidate, last_used_at, created_at, updated_at
                 FROM skills_assets
                 WHERE id = ?1",
                params![skill_id],
                skill_asset_from_row,
            )
            .optional()?
        {
            list.push(item);
        }
    }
    Ok(list)
}

struct PromptAssetRow {
    id: String,
    tags: Vec<String>,
    category: String,
    favorite: bool,
    active_version: i64,
}

fn get_prompt_asset_row(conn: &Connection, prompt_id: &str) -> Result<PromptAssetRow, AppError> {
    conn.query_row(
        "SELECT id, tags, category, favorite, active_version
         FROM prompts_assets
         WHERE id = ?1",
        params![prompt_id],
        |row| {
            let tags_raw: String = row.get(1)?;
            let tags = serde_json::from_str(&tags_raw).unwrap_or_default();
            Ok(PromptAssetRow {
                id: row.get(0)?,
                tags,
                category: row.get(2)?,
                favorite: row.get::<_, i64>(3)? == 1,
                active_version: row.get(4)?,
            })
        },
    )
    .optional()?
    .ok_or_else(|| AppError::invalid_argument("prompt 不存在"))
}

fn get_prompt_with_active_content(conn: &Connection, prompt_id: &str) -> Result<Value, AppError> {
    conn.query_row(
        "SELECT p.id, p.workspace_id, p.name, p.tags, p.category, p.favorite, p.active_version, p.created_at, p.updated_at, v.content
         FROM prompts_assets p
         JOIN prompts_versions v ON v.asset_id = p.id AND v.version = p.active_version
         WHERE p.id = ?1",
        params![prompt_id],
        |row| {
            let tags_raw: String = row.get(3)?;
            let tags: Vec<String> = serde_json::from_str(&tags_raw).unwrap_or_default();
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "workspaceId": row.get::<_, String>(1)?,
                "name": row.get::<_, String>(2)?,
                "tags": tags,
                "category": row.get::<_, String>(4)?,
                "favorite": row.get::<_, i64>(5)? == 1,
                "activeVersion": row.get::<_, i64>(6)?,
                "createdAt": row.get::<_, String>(7)?,
                "updatedAt": row.get::<_, String>(8)?,
                "content": row.get::<_, String>(9)?,
            }))
        },
    )
    .optional()?
    .ok_or_else(|| AppError::invalid_argument("prompt 不存在"))
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

fn bool_to_int(value: bool) -> i64 {
    if value {
        1
    } else {
        0
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use crate::execution_plane::skills::DiscoveredSkill;

    use super::{
        build_skill_source_candidate_paths, dedupe_skills, derive_skill_source_parent,
        detect_skill_source_symlink, detect_skill_source_symlink_by_name,
        ingest_skill_into_workspace_storage, is_path_under_root, normalize_fs_path,
        resolve_skill_display_source_path,
    };

    #[test]
    fn derive_skill_source_parent_prefers_source_basename() {
        assert_eq!(derive_skill_source_parent("/Users/liuc/.codex"), ".codex");
        assert_eq!(derive_skill_source_parent("/Users/liuc/.claude"), ".claude");
        assert_eq!(
            derive_skill_source_parent("/Users/liuc/.codex/skills"),
            ".codex"
        );
        assert_eq!(
            derive_skill_source_parent("/Users/liuc/.claude/skills"),
            ".claude"
        );
    }

    #[test]
    fn derive_skill_source_parent_falls_back_to_unknown() {
        assert_eq!(derive_skill_source_parent(""), "unknown");
    }

    #[test]
    fn ingest_skill_into_workspace_storage_writes_under_workspace_skills_and_overrides() {
        let workspace = tempfile::tempdir().expect("workspace tempdir");
        let external = tempfile::tempdir().expect("external tempdir");
        let external_skill = external.path().join("demo-skill");
        fs::create_dir_all(external_skill.join("nested")).expect("create external skill");
        fs::write(external_skill.join("SKILL.md"), "version: \"1.0.0\"\n").expect("write skill");
        fs::write(external_skill.join("nested/info.txt"), "v1").expect("write nested");

        let managed_root = workspace.path().join("skills");
        fs::create_dir_all(&managed_root).expect("create managed root");

        let discovered = DiscoveredSkill {
            identity: "demo-skill".to_string(),
            name: "demo-skill".to_string(),
            version: "1.0.0".to_string(),
            source: external.path().to_string_lossy().to_string(),
            local_path: external_skill.to_string_lossy().to_string(),
        };

        let managed_path =
            ingest_skill_into_workspace_storage(&discovered, &managed_root).expect("ingest first");
        let managed_skill = workspace.path().join("skills").join("demo-skill");
        assert_eq!(
            managed_skill,
            std::path::PathBuf::from(managed_path.clone())
        );
        assert_eq!(
            fs::read_to_string(managed_skill.join("nested/info.txt")).expect("read managed file"),
            "v1"
        );

        fs::write(external_skill.join("nested/info.txt"), "v2").expect("update external");
        let managed_path_2 =
            ingest_skill_into_workspace_storage(&discovered, &managed_root).expect("ingest second");
        assert_eq!(managed_path, managed_path_2);
        assert_eq!(
            fs::read_to_string(managed_skill.join("nested/info.txt")).expect("read managed file"),
            "v2"
        );
    }

    #[test]
    fn is_path_under_root_identifies_workspace_managed_skills() {
        let workspace = tempfile::tempdir().expect("workspace tempdir");
        let managed_root = workspace.path().join("skills");
        let managed_skill = managed_root.join("demo-skill");
        let external_skill = workspace.path().join("external").join("demo-skill");
        fs::create_dir_all(&managed_skill).expect("create managed skill");
        fs::create_dir_all(&external_skill).expect("create external skill");

        let normalized_root = normalize_fs_path(&managed_root);
        assert!(is_path_under_root(&managed_skill, &normalized_root));
        assert!(!is_path_under_root(&external_skill, &normalized_root));
    }

    #[test]
    fn dedupe_skills_prefers_codex_when_versions_equal() {
        let codex_skill = DiscoveredSkill {
            identity: "aaaaaaa1".to_string(),
            name: "aaaaaaa1".to_string(),
            version: "0.0.0".to_string(),
            source: "/Users/liuc/.codex".to_string(),
            local_path: "/Users/liuc/.codex/skills/aaaaaaa1".to_string(),
        };
        let claude_skill = DiscoveredSkill {
            identity: "aaaaaaa1".to_string(),
            name: "aaaaaaa1".to_string(),
            version: "0.0.0".to_string(),
            source: "/Users/liuc/.claude".to_string(),
            local_path: "/Users/liuc/.claude/skills/aaaaaaa1".to_string(),
        };

        let deduped = dedupe_skills(vec![claude_skill, codex_skill]);
        assert_eq!(deduped.len(), 1);
        assert_eq!(deduped[0].source, "/Users/liuc/.codex");
        assert_eq!(deduped[0].local_path, "/Users/liuc/.codex/skills/aaaaaaa1");
    }

    #[cfg(unix)]
    #[test]
    fn detect_skill_source_symlink_identifies_symlink_skill_dir() {
        let workspace = tempfile::tempdir().expect("workspace tempdir");
        let source_root = workspace.path().join(".claude");
        let skills_root = source_root.join("skills");
        let target = workspace.path().join("real-skill");
        std::fs::create_dir_all(&skills_root).expect("create skills root");
        std::fs::create_dir_all(&target).expect("create target");

        let link_path = skills_root.join("aaaaaaa1");
        std::os::unix::fs::symlink(&target, &link_path).expect("create symlink");

        assert!(detect_skill_source_symlink(
            &link_path.to_string_lossy(),
            &source_root.to_string_lossy()
        ));
    }

    #[cfg(unix)]
    #[test]
    fn detect_skill_source_symlink_by_name_identifies_skills_link() {
        let workspace = tempfile::tempdir().expect("workspace tempdir");
        let source_root = workspace.path().join(".claude");
        let skills_root = source_root.join("skills");
        let target = workspace.path().join("real-skill");
        std::fs::create_dir_all(&skills_root).expect("create skills root");
        std::fs::create_dir_all(&target).expect("create target");

        let link_path = skills_root.join("aaaaaaa1");
        std::os::unix::fs::symlink(&target, &link_path).expect("create symlink");

        assert!(detect_skill_source_symlink_by_name(
            &source_root.to_string_lossy(),
            "aaaaaaa1"
        ));
    }

    #[test]
    fn build_skill_source_candidate_paths_supports_source_root_and_skills_root() {
        let from_codex = build_skill_source_candidate_paths("/Users/liuc/.codex", "demo");
        assert_eq!(
            from_codex
                .iter()
                .map(|item| item.to_string_lossy().to_string())
                .collect::<Vec<_>>(),
            vec![
                "/Users/liuc/.codex/skills/demo".to_string(),
                "/Users/liuc/.codex/demo".to_string(),
            ]
        );

        let from_skills = build_skill_source_candidate_paths("/Users/liuc/.codex/skills", "demo");
        assert_eq!(
            from_skills
                .iter()
                .map(|item| item.to_string_lossy().to_string())
                .collect::<Vec<_>>(),
            vec!["/Users/liuc/.codex/skills/demo".to_string()]
        );
    }

    #[cfg(unix)]
    #[test]
    fn resolve_skill_display_source_path_prefers_existing_source_candidate() {
        let workspace = tempfile::tempdir().expect("workspace tempdir");
        let source_root = workspace.path().join(".codex");
        let skills_root = source_root.join("skills");
        let target = workspace.path().join("real-skill");
        std::fs::create_dir_all(&skills_root).expect("create skills root");
        std::fs::create_dir_all(&target).expect("create target");

        let link_path = skills_root.join("aaaaaaa1");
        std::os::unix::fs::symlink(&target, &link_path).expect("create symlink");

        let resolved = resolve_skill_display_source_path(
            &source_root.to_string_lossy(),
            "aaaaaaa1",
            "/tmp/fallback",
        );
        assert_eq!(resolved, link_path.to_string_lossy());
    }
}
