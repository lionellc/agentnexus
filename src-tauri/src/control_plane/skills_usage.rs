use std::{
    collections::HashMap,
    fs::{self, File},
    io::{BufRead, BufReader, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
};

use chrono::{Duration, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;
use uuid::Uuid;
use walkdir::WalkDir;

use crate::{
    db::AppState,
    domain::models::{
        SkillsUsageCallsQueryInput, SkillsUsageStatsQueryInput, SkillsUsageSyncProgressInput,
        SkillsUsageSyncStartInput,
    },
    error::AppError,
    utils::{now_rfc3339, sha256_hex},
};

const AGENT_CODEX: &str = "codex";
const AGENT_CLAUDE: &str = "claude";
const SOURCE_CODEX_JSONL: &str = "codex_jsonl";
const SOURCE_CLAUDE_TRANSCRIPT: &str = "claude_transcript";

const JOB_STATUS_RUNNING: &str = "running";
const JOB_STATUS_COMPLETED: &str = "completed";
const JOB_STATUS_COMPLETED_WITH_ERRORS: &str = "completed_with_errors";
const JOB_STATUS_FAILED: &str = "failed";

const RESULT_STATUS_SUCCESS: &str = "success";
const RESULT_STATUS_UNKNOWN: &str = "unknown";

static SKILLS_USAGE_SYNC_JOBS: OnceLock<Mutex<HashMap<String, SkillsUsageSyncJobHandle>>> =
    OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillsUsageSyncJobState {
    job_id: String,
    workspace_id: String,
    status: String,
    total_files: u64,
    processed_files: u64,
    parsed_events: u64,
    inserted_events: u64,
    duplicate_events: u64,
    parse_failures: u64,
    current_source: String,
    error_message: String,
    started_at: String,
    updated_at: String,
}

#[derive(Clone)]
struct SkillsUsageSyncJobHandle {
    state: Arc<Mutex<SkillsUsageSyncJobState>>,
}

#[derive(Debug, Clone)]
struct WorkspaceScope {
    id: String,
    root_path: PathBuf,
}

#[derive(Debug, Clone)]
struct SkillAliasEntry {
    skill_id: String,
    identity: String,
    name: String,
}

#[derive(Debug, Clone)]
struct SessionSkillCallEvent {
    workspace_id: Option<String>,
    agent: String,
    source: String,
    source_path: String,
    session_id: String,
    event_ref: String,
    skill_id: String,
    skill_identity: String,
    skill_name: String,
    called_at: String,
    result_status: String,
    confidence: f64,
    raw_ref: String,
    dedupe_key: String,
}

#[derive(Debug, Clone)]
struct ParseFailureEvent {
    workspace_id: Option<String>,
    agent: String,
    source_path: String,
    session_id: Option<String>,
    line_no: i64,
    event_ref: String,
    reason: String,
    raw_excerpt: String,
}

#[derive(Debug, Clone)]
struct SessionFile {
    agent: String,
    source: String,
    path: PathBuf,
}

#[derive(Debug, Clone)]
struct FileParseState {
    session_id: String,
    session_cwd: Option<String>,
}

fn normalize_filter_value(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(str::to_string)
}

#[tauri::command]
pub fn skills_usage_sync_start(
    state: State<'_, AppState>,
    input: SkillsUsageSyncStartInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    get_workspace_scope(&conn, &input.workspace_id)?;

    let job_id = Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let state_arc = Arc::new(Mutex::new(SkillsUsageSyncJobState {
        job_id: job_id.clone(),
        workspace_id: input.workspace_id.clone(),
        status: JOB_STATUS_RUNNING.to_string(),
        total_files: 0,
        processed_files: 0,
        parsed_events: 0,
        inserted_events: 0,
        duplicate_events: 0,
        parse_failures: 0,
        current_source: String::new(),
        error_message: String::new(),
        started_at: now.clone(),
        updated_at: now,
    }));

    {
        let mut jobs = lock_usage_jobs()?;
        prune_usage_jobs(&mut jobs);
        jobs.insert(
            job_id.clone(),
            SkillsUsageSyncJobHandle {
                state: state_arc.clone(),
            },
        );
    }

    let app_state = state.inner().clone();
    let workspace_id = input.workspace_id.clone();
    std::thread::spawn(move || {
        if let Err(err) = run_sync_job(app_state, &workspace_id, state_arc.clone()) {
            if let Ok(mut job) = state_arc.lock() {
                job.status = JOB_STATUS_FAILED.to_string();
                job.error_message = err.message;
                job.updated_at = now_rfc3339();
            }
        }
    });

    usage_job_snapshot(&job_id, &input.workspace_id)
}

#[tauri::command]
pub fn skills_usage_sync_progress(
    _state: State<'_, AppState>,
    input: SkillsUsageSyncProgressInput,
) -> Result<Value, AppError> {
    usage_job_snapshot(&input.job_id, &input.workspace_id)
}

#[tauri::command]
pub fn skills_usage_query_stats(
    state: State<'_, AppState>,
    input: SkillsUsageStatsQueryInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    get_workspace_scope(&conn, &input.workspace_id)?;

    let from_7d = (Utc::now() - Duration::days(7)).to_rfc3339();
    let agent_filter = normalize_filter_value(input.agent.as_deref());
    let source_filter = normalize_filter_value(input.source.as_deref());

    let mut rows = Vec::new();
    let mut stmt = conn.prepare(
        "SELECT id, name
         FROM skills_assets
         ORDER BY name COLLATE NOCASE ASC",
    )?;
    let skills = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    for skill in skills {
        let (skill_id, _skill_name) = skill?;
        let workspace_id = input.workspace_id.as_str();
        let skill_id_ref = skill_id.as_str();
        let (total_calls, last_7d_calls, last_called_at) =
            match (agent_filter.as_deref(), source_filter.as_deref()) {
                (Some(agent), Some(source)) => conn.query_row(
                    "SELECT COUNT(1),
                            SUM(CASE WHEN called_at >= ?5 THEN 1 ELSE 0 END),
                            MAX(called_at)
                     FROM skill_call_facts
                     WHERE workspace_id = ?1 AND skill_id = ?2 AND agent = ?3 AND source = ?4",
                    params![workspace_id, skill_id_ref, agent, source, from_7d],
                    |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, Option<i64>>(1)?.unwrap_or(0),
                            row.get::<_, Option<String>>(2)?,
                        ))
                    },
                )?,
                (Some(agent), None) => conn.query_row(
                    "SELECT COUNT(1),
                            SUM(CASE WHEN called_at >= ?4 THEN 1 ELSE 0 END),
                            MAX(called_at)
                     FROM skill_call_facts
                     WHERE workspace_id = ?1 AND skill_id = ?2 AND agent = ?3",
                    params![workspace_id, skill_id_ref, agent, from_7d],
                    |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, Option<i64>>(1)?.unwrap_or(0),
                            row.get::<_, Option<String>>(2)?,
                        ))
                    },
                )?,
                (None, Some(source)) => conn.query_row(
                    "SELECT COUNT(1),
                            SUM(CASE WHEN called_at >= ?4 THEN 1 ELSE 0 END),
                            MAX(called_at)
                     FROM skill_call_facts
                     WHERE workspace_id = ?1 AND skill_id = ?2 AND source = ?3",
                    params![workspace_id, skill_id_ref, source, from_7d],
                    |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, Option<i64>>(1)?.unwrap_or(0),
                            row.get::<_, Option<String>>(2)?,
                        ))
                    },
                )?,
                (None, None) => conn.query_row(
                    "SELECT COUNT(1),
                            SUM(CASE WHEN called_at >= ?3 THEN 1 ELSE 0 END),
                            MAX(called_at)
                     FROM skill_call_facts
                     WHERE workspace_id = ?1 AND skill_id = ?2",
                    params![workspace_id, skill_id_ref, from_7d],
                    |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, Option<i64>>(1)?.unwrap_or(0),
                            row.get::<_, Option<String>>(2)?,
                        ))
                    },
                )?,
            };

        rows.push(json!({
            "skillId": skill_id,
            "totalCalls": total_calls,
            "last7dCalls": last_7d_calls,
            "lastCalledAt": last_called_at,
        }));
    }

    Ok(json!({ "rows": rows }))
}

#[tauri::command]
pub fn skills_usage_query_calls(
    state: State<'_, AppState>,
    input: SkillsUsageCallsQueryInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    get_workspace_scope(&conn, &input.workspace_id)?;

    let limit = input.limit.unwrap_or(80).clamp(1, 500);
    let offset = input.offset.unwrap_or(0).max(0);
    let agent_filter = normalize_filter_value(input.agent.as_deref());
    let source_filter = normalize_filter_value(input.source.as_deref());
    let workspace_id = input.workspace_id.as_str();
    let skill_id = input.skill_id.as_str();
    let mut rows = Vec::new();
    let total: i64;

    match (agent_filter.as_deref(), source_filter.as_deref()) {
        (Some(agent), Some(source)) => {
            let mut list_stmt = conn.prepare(
                "SELECT called_at, agent, source, result_status, confidence, session_id, event_ref, raw_ref
                 FROM skill_call_facts
                 WHERE workspace_id = ?1 AND skill_id = ?2 AND agent = ?3 AND source = ?4
                 ORDER BY called_at DESC, created_at DESC
                 LIMIT ?5 OFFSET ?6",
            )?;
            let query_rows = list_stmt.query_map(
                params![workspace_id, skill_id, agent, source, limit, offset],
                |row| {
                    Ok(json!({
                        "calledAt": row.get::<_, String>(0)?,
                        "agent": row.get::<_, String>(1)?,
                        "source": row.get::<_, String>(2)?,
                        "resultStatus": row.get::<_, String>(3)?,
                        "confidence": row.get::<_, f64>(4)?,
                        "sessionId": row.get::<_, String>(5)?,
                        "eventRef": row.get::<_, String>(6)?,
                        "rawRef": row.get::<_, String>(7)?,
                    }))
                },
            )?;
            for row in query_rows {
                rows.push(row?);
            }
            total = conn.query_row(
                "SELECT COUNT(1)
                 FROM skill_call_facts
                 WHERE workspace_id = ?1 AND skill_id = ?2 AND agent = ?3 AND source = ?4",
                params![workspace_id, skill_id, agent, source],
                |row| row.get::<_, i64>(0),
            )?;
        }
        (Some(agent), None) => {
            let mut list_stmt = conn.prepare(
                "SELECT called_at, agent, source, result_status, confidence, session_id, event_ref, raw_ref
                 FROM skill_call_facts
                 WHERE workspace_id = ?1 AND skill_id = ?2 AND agent = ?3
                 ORDER BY called_at DESC, created_at DESC
                 LIMIT ?4 OFFSET ?5",
            )?;
            let query_rows = list_stmt.query_map(
                params![workspace_id, skill_id, agent, limit, offset],
                |row| {
                    Ok(json!({
                        "calledAt": row.get::<_, String>(0)?,
                        "agent": row.get::<_, String>(1)?,
                        "source": row.get::<_, String>(2)?,
                        "resultStatus": row.get::<_, String>(3)?,
                        "confidence": row.get::<_, f64>(4)?,
                        "sessionId": row.get::<_, String>(5)?,
                        "eventRef": row.get::<_, String>(6)?,
                        "rawRef": row.get::<_, String>(7)?,
                    }))
                },
            )?;
            for row in query_rows {
                rows.push(row?);
            }
            total = conn.query_row(
                "SELECT COUNT(1)
                 FROM skill_call_facts
                 WHERE workspace_id = ?1 AND skill_id = ?2 AND agent = ?3",
                params![workspace_id, skill_id, agent],
                |row| row.get::<_, i64>(0),
            )?;
        }
        (None, Some(source)) => {
            let mut list_stmt = conn.prepare(
                "SELECT called_at, agent, source, result_status, confidence, session_id, event_ref, raw_ref
                 FROM skill_call_facts
                 WHERE workspace_id = ?1 AND skill_id = ?2 AND source = ?3
                 ORDER BY called_at DESC, created_at DESC
                 LIMIT ?4 OFFSET ?5",
            )?;
            let query_rows = list_stmt.query_map(
                params![workspace_id, skill_id, source, limit, offset],
                |row| {
                    Ok(json!({
                        "calledAt": row.get::<_, String>(0)?,
                        "agent": row.get::<_, String>(1)?,
                        "source": row.get::<_, String>(2)?,
                        "resultStatus": row.get::<_, String>(3)?,
                        "confidence": row.get::<_, f64>(4)?,
                        "sessionId": row.get::<_, String>(5)?,
                        "eventRef": row.get::<_, String>(6)?,
                        "rawRef": row.get::<_, String>(7)?,
                    }))
                },
            )?;
            for row in query_rows {
                rows.push(row?);
            }
            total = conn.query_row(
                "SELECT COUNT(1)
                 FROM skill_call_facts
                 WHERE workspace_id = ?1 AND skill_id = ?2 AND source = ?3",
                params![workspace_id, skill_id, source],
                |row| row.get::<_, i64>(0),
            )?;
        }
        (None, None) => {
            let mut list_stmt = conn.prepare(
                "SELECT called_at, agent, source, result_status, confidence, session_id, event_ref, raw_ref
                 FROM skill_call_facts
                 WHERE workspace_id = ?1 AND skill_id = ?2
                 ORDER BY called_at DESC, created_at DESC
                 LIMIT ?3 OFFSET ?4",
            )?;
            let query_rows =
                list_stmt.query_map(params![workspace_id, skill_id, limit, offset], |row| {
                    Ok(json!({
                        "calledAt": row.get::<_, String>(0)?,
                        "agent": row.get::<_, String>(1)?,
                        "source": row.get::<_, String>(2)?,
                        "resultStatus": row.get::<_, String>(3)?,
                        "confidence": row.get::<_, f64>(4)?,
                        "sessionId": row.get::<_, String>(5)?,
                        "eventRef": row.get::<_, String>(6)?,
                        "rawRef": row.get::<_, String>(7)?,
                    }))
                })?;
            for row in query_rows {
                rows.push(row?);
            }
            total = conn.query_row(
                "SELECT COUNT(1)
                 FROM skill_call_facts
                 WHERE workspace_id = ?1 AND skill_id = ?2",
                params![workspace_id, skill_id],
                |row| row.get::<_, i64>(0),
            )?;
        }
    }

    Ok(json!({
        "items": rows,
        "total": total,
    }))
}

fn run_sync_job(
    app_state: AppState,
    workspace_id: &str,
    job_state: Arc<Mutex<SkillsUsageSyncJobState>>,
) -> Result<(), AppError> {
    let mut conn = app_state.open()?;
    let workspace_scope = get_workspace_scope(&conn, workspace_id)?;
    let workspace_scopes = list_workspace_scopes(&conn)?;
    let skill_aliases = list_skill_aliases(&conn)?;
    let force_full_scan = should_force_full_scan(&conn, &workspace_scope.id)?;
    let mut failure_reason_counts: HashMap<String, u64> = HashMap::new();

    let mut files = discover_session_files();
    files.sort_by(|left, right| left.path.cmp(&right.path));
    {
        let mut job = job_state
            .lock()
            .map_err(|_| AppError::internal("usage job 状态锁异常"))?;
        job.total_files = files.len() as u64;
        job.updated_at = now_rfc3339();
    }

    for (index, file) in files.iter().enumerate() {
        {
            let mut job = job_state
                .lock()
                .map_err(|_| AppError::internal("usage job 状态锁异常"))?;
            job.current_source = file.path.to_string_lossy().to_string();
            job.processed_files = index as u64;
            job.updated_at = now_rfc3339();
        }

        let parsed = parse_session_file(
            &file.path,
            &file.agent,
            &file.source,
            &workspace_scope,
            &workspace_scopes,
            &skill_aliases,
            force_full_scan,
            &conn,
        )?;

        for failure in &parsed.failures {
            *failure_reason_counts
                .entry(failure.reason.clone())
                .or_insert(0) += 1;
        }

        persist_events(&mut conn, parsed.calls, parsed.failures)?;

        {
            let mut job = job_state
                .lock()
                .map_err(|_| AppError::internal("usage job 状态锁异常"))?;
            job.parsed_events += parsed.parsed_events as u64;
            job.inserted_events += parsed.inserted_events as u64;
            job.duplicate_events += parsed.duplicate_events as u64;
            job.parse_failures += parsed.parse_failures as u64;
            job.processed_files = (index + 1) as u64;
            job.updated_at = now_rfc3339();
        }
    }

    {
        let mut job = job_state
            .lock()
            .map_err(|_| AppError::internal("usage job 状态锁异常"))?;
        job.current_source.clear();
        job.status = if job.parse_failures > 0 {
            job.error_message =
                build_parse_failure_summary(job.parse_failures, &failure_reason_counts);
            JOB_STATUS_COMPLETED_WITH_ERRORS.to_string()
        } else {
            job.error_message.clear();
            JOB_STATUS_COMPLETED.to_string()
        };
        job.updated_at = now_rfc3339();
    }

    Ok(())
}

fn build_parse_failure_summary(total: u64, reason_counts: &HashMap<String, u64>) -> String {
    if total == 0 {
        return String::new();
    }
    if reason_counts.is_empty() {
        return format!("发现 {total} 条解析异常，请重试或查看解析失败明细。");
    }

    let mut pairs: Vec<(&String, &u64)> = reason_counts.iter().collect();
    pairs.sort_by(|left, right| {
        right
            .1
            .cmp(left.1)
            .then_with(|| left.0.as_str().cmp(right.0.as_str()))
    });

    let mut top_reasons = Vec::new();
    for (reason, count) in pairs.iter().take(3) {
        top_reasons.push(format!("{reason} ×{count}"));
    }

    let mut message = format!(
        "发现 {total} 条解析异常，主要原因：{}",
        top_reasons.join("；")
    );
    if pairs.len() > 3 {
        message.push_str(&format!("；其余 {} 类已省略。", pairs.len() - 3));
    }
    message
}

struct ParseFileResult {
    calls: Vec<SessionSkillCallEvent>,
    failures: Vec<ParseFailureEvent>,
    parsed_events: usize,
    inserted_events: usize,
    duplicate_events: usize,
    parse_failures: usize,
}

fn parse_session_file(
    path: &Path,
    agent: &str,
    source: &str,
    workspace_scope: &WorkspaceScope,
    workspace_scopes: &[WorkspaceScope],
    skill_aliases: &HashMap<String, SkillAliasEntry>,
    force_full_scan: bool,
    conn: &Connection,
) -> Result<ParseFileResult, AppError> {
    let metadata = fs::metadata(path)?;
    let file_size = metadata.len();
    let source_path = path.to_string_lossy().to_string();
    let checkpoint = if force_full_scan {
        None
    } else {
        load_checkpoint(conn, agent, &source_path)?
    };
    let mut start_offset = checkpoint.unwrap_or(0);
    if start_offset > file_size {
        start_offset = 0;
    }

    let file = File::open(path)?;
    let mut reader = BufReader::new(file);
    reader.seek(SeekFrom::Start(start_offset))?;

    let fallback_session_id = path
        .file_stem()
        .map(|item| item.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown-session".to_string());
    let mut parse_state = FileParseState {
        session_id: fallback_session_id,
        session_cwd: None,
    };

    let mut line = String::new();
    let mut bytes_offset = start_offset;
    let mut line_no: i64 = 0;
    let mut calls = Vec::new();
    let mut failures = Vec::new();

    loop {
        line.clear();
        let bytes = reader.read_line(&mut line)?;
        if bytes == 0 {
            break;
        }
        line_no += 1;
        let line_start = bytes_offset;
        bytes_offset += bytes as u64;

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let value: Value = match serde_json::from_str(trimmed) {
            Ok(parsed) => parsed,
            Err(err) => {
                failures.push(ParseFailureEvent {
                    workspace_id: Some(workspace_scope.id.clone()),
                    agent: agent.to_string(),
                    source_path: source_path.clone(),
                    session_id: Some(parse_state.session_id.clone()),
                    line_no,
                    event_ref: format!("{line_start}:json-parse"),
                    reason: format!("json-parse-failed: {err}"),
                    raw_excerpt: truncate_text(trimmed, 400),
                });
                continue;
            }
        };

        update_parse_state(&mut parse_state, &value);

        let skill_calls = if agent == AGENT_CLAUDE {
            extract_claude_skill_calls(&value)
        } else {
            extract_codex_skill_calls(&value)
        };

        if skill_calls.is_empty() {
            continue;
        }

        let called_at = value
            .get("timestamp")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(now_rfc3339);

        let workspace_hint = extract_workspace_hint(&value)
            .or_else(|| parse_state.session_cwd.clone())
            .or_else(|| {
                value
                    .get("payload")
                    .and_then(|item| item.get("cwd"))
                    .and_then(Value::as_str)
                    .map(str::to_string)
            });
        let matched_workspace = workspace_hint
            .as_deref()
            .and_then(|hint| map_workspace_id(hint, workspace_scopes))
            .map(str::to_string)
            .or_else(|| {
                parse_state
                    .session_cwd
                    .as_deref()
                    .and_then(|hint| map_workspace_id(hint, workspace_scopes))
                    .map(str::to_string)
            });

        for (idx, skill_call) in skill_calls.iter().enumerate() {
            let normalized_candidates = normalize_skill_alias_candidates(&skill_call.skill_token);
            let alias = normalized_candidates
                .iter()
                .find_map(|candidate| skill_aliases.get(candidate));

            let Some(alias) = alias else {
                failures.push(ParseFailureEvent {
                    workspace_id: matched_workspace.clone(),
                    agent: agent.to_string(),
                    source_path: source_path.clone(),
                    session_id: Some(parse_state.session_id.clone()),
                    line_no,
                    event_ref: format!("{line_start}:{idx}"),
                    reason: format!("skill-not-mapped: {}", skill_call.skill_token),
                    raw_excerpt: truncate_text(trimmed, 400),
                });
                continue;
            };

            let event_workspace_id = workspace_scope.id.clone();
            let event_ref = format!("{line_start}:{idx}");
            let dedupe_seed = format!(
                "{}|{}|{}|{}|{}|{}|{}",
                event_workspace_id,
                agent,
                source_path,
                parse_state.session_id,
                event_ref,
                alias.skill_id,
                called_at
            );

            calls.push(SessionSkillCallEvent {
                workspace_id: Some(event_workspace_id),
                agent: agent.to_string(),
                source: source.to_string(),
                source_path: source_path.clone(),
                session_id: parse_state.session_id.clone(),
                event_ref,
                skill_id: alias.skill_id.clone(),
                skill_identity: alias.identity.clone(),
                skill_name: alias.name.clone(),
                called_at: called_at.clone(),
                result_status: skill_call.result_status.clone(),
                confidence: skill_call.confidence,
                raw_ref: truncate_text(trimmed, 400),
                dedupe_key: sha256_hex(&dedupe_seed),
            });
        }
    }

    let (inserted_events, duplicate_events) = count_insert_projection(conn, &calls)?;
    save_checkpoint(conn, agent, &source_path, file_size)?;

    Ok(ParseFileResult {
        parsed_events: calls.len(),
        inserted_events,
        duplicate_events,
        parse_failures: failures.len(),
        calls,
        failures,
    })
}

#[derive(Debug, Clone)]
struct ParsedSkillCall {
    skill_token: String,
    result_status: String,
    confidence: f64,
}

fn update_parse_state(state: &mut FileParseState, value: &Value) {
    let event_type = value
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if event_type == "session_meta" {
        if let Some(session_id) = value
            .get("payload")
            .and_then(|item| item.get("id"))
            .and_then(Value::as_str)
        {
            state.session_id = session_id.to_string();
        }
        if let Some(cwd) = value
            .get("payload")
            .and_then(|item| item.get("cwd"))
            .and_then(Value::as_str)
        {
            state.session_cwd = Some(cwd.to_string());
        }
    }

    if let Some(cwd) = value
        .get("payload")
        .and_then(|item| item.get("cwd"))
        .and_then(Value::as_str)
    {
        state.session_cwd = Some(cwd.to_string());
    }
}

fn extract_codex_skill_calls(value: &Value) -> Vec<ParsedSkillCall> {
    let mut calls = Vec::new();
    if value.get("type").and_then(Value::as_str) != Some("response_item") {
        return calls;
    }
    let payload = match value.get("payload") {
        Some(item) => item,
        None => return calls,
    };

    let payload_type = payload
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if payload_type == "function_call" {
        let arguments = payload
            .get("arguments")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let command =
            extract_command_from_arguments(arguments).unwrap_or_else(|| arguments.to_string());
        calls.extend(extract_from_shell_command(&command));
    } else if payload_type == "function_call_output" {
        let output = payload
            .get("output")
            .and_then(Value::as_str)
            .unwrap_or_default();
        calls.extend(extract_from_use_skill_output(output));
    } else if payload_type == "message" {
        let role = payload
            .get("role")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if role != "user" {
            return calls;
        }
        if let Some(content) = payload.get("content").and_then(Value::as_array) {
            for item in content {
                let text = item.get("text").and_then(Value::as_str).unwrap_or_default();
                calls.extend(extract_from_markdown_skill_links(text));
            }
        }
    }

    calls
}

fn extract_claude_skill_calls(value: &Value) -> Vec<ParsedSkillCall> {
    let mut calls = Vec::new();
    let event_type = value
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if event_type == "user" {
        let text = value
            .get("content")
            .and_then(Value::as_str)
            .unwrap_or_default();
        calls.extend(extract_from_markdown_skill_links(text));
        return calls;
    }

    if event_type == "tool_use" {
        let tool_name = value
            .get("tool_name")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if matches!(tool_name, "bash" | "shell_command" | "task") {
            let command = value
                .get("tool_input")
                .and_then(|item| item.get("command"))
                .and_then(Value::as_str)
                .unwrap_or_default();
            calls.extend(extract_from_shell_command(command));

            let prompt = value
                .get("tool_input")
                .and_then(|item| item.get("prompt"))
                .and_then(Value::as_str)
                .unwrap_or_default();
            calls.extend(extract_from_markdown_skill_links(prompt));
        }
        return calls;
    }

    calls
}

fn extract_from_markdown_skill_links(text: &str) -> Vec<ParsedSkillCall> {
    let mut calls = Vec::new();
    let mut remain = text;
    while let Some(start) = remain.find("[$") {
        let after_start = &remain[start + 2..];
        let Some(end_bracket) = after_start.find(']') else {
            break;
        };
        let token = &after_start[..end_bracket];
        let after_bracket = &after_start[end_bracket + 1..];
        if let Some(close_paren) = after_bracket.find(')') {
            let target = &after_bracket[..close_paren];
            if target.to_ascii_lowercase().contains("skill.md") {
                calls.push(ParsedSkillCall {
                    skill_token: token.trim().to_string(),
                    result_status: RESULT_STATUS_UNKNOWN.to_string(),
                    confidence: 0.92,
                });
            }
            remain = &after_bracket[close_paren + 1..];
        } else {
            break;
        }
    }
    calls
}

fn extract_from_shell_command(text: &str) -> Vec<ParsedSkillCall> {
    let mut calls = Vec::new();
    let lower = text.to_ascii_lowercase();
    if !lower.contains("use-skill") {
        return calls;
    }

    let mut segments = text.split_whitespace();
    while let Some(segment) = segments.next() {
        if segment.eq_ignore_ascii_case("use-skill") {
            if let Some(skill) = segments.next() {
                let Some(skill_token) = sanitize_skill_token(skill) else {
                    continue;
                };
                calls.push(ParsedSkillCall {
                    skill_token,
                    result_status: RESULT_STATUS_SUCCESS.to_string(),
                    confidence: 0.98,
                });
            }
        }
    }

    calls
}

fn sanitize_skill_token(raw: &str) -> Option<String> {
    let trimmed = raw
        .trim()
        .trim_matches(|ch| matches!(ch, '"' | '\'' | '`'))
        .trim_start_matches('$');
    if trimmed.is_empty() {
        return None;
    }

    let mut token = String::new();
    for ch in trimmed.chars() {
        if ch.is_whitespace() || matches!(ch, ',' | '}' | ']' | ')' | '"' | '\'' | '`') {
            break;
        }
        token.push(ch);
    }

    let cleaned = token.trim_end_matches('\\').trim();
    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned.to_string())
    }
}

fn extract_from_use_skill_output(text: &str) -> Vec<ParsedSkillCall> {
    let mut calls = Vec::new();
    for line in text.lines() {
        let lowered = line.to_ascii_lowercase();
        if lowered.contains("loading personal skill:")
            || lowered.contains("loading superpowers skill:")
        {
            if let Some(idx) = line.rfind(':') {
                let token = line[idx + 1..].trim();
                if !token.is_empty() {
                    calls.push(ParsedSkillCall {
                        skill_token: token.to_string(),
                        result_status: RESULT_STATUS_SUCCESS.to_string(),
                        confidence: 0.96,
                    });
                }
            }
        }
    }
    calls
}

fn extract_workspace_hint(value: &Value) -> Option<String> {
    if let Some(workdir) = value
        .get("payload")
        .and_then(|item| item.get("arguments"))
        .and_then(Value::as_str)
        .and_then(extract_workdir_from_arguments)
    {
        return Some(workdir);
    }

    if let Some(workdir) = value
        .get("tool_input")
        .and_then(|item| item.get("workdir"))
        .and_then(Value::as_str)
    {
        return Some(workdir.to_string());
    }

    if let Some(cwd) = value
        .get("payload")
        .and_then(|item| item.get("cwd"))
        .and_then(Value::as_str)
    {
        return Some(cwd.to_string());
    }

    None
}

fn extract_workdir_from_arguments(arguments: &str) -> Option<String> {
    if arguments.trim().is_empty() {
        return None;
    }
    let parsed: Value = serde_json::from_str(arguments).ok()?;
    parsed
        .get("workdir")
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn extract_command_from_arguments(arguments: &str) -> Option<String> {
    if arguments.trim().is_empty() {
        return None;
    }
    let parsed: Value = serde_json::from_str(arguments).ok()?;
    parsed
        .get("command")
        .or_else(|| parsed.get("cmd"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn should_force_full_scan(conn: &Connection, workspace_id: &str) -> Result<bool, AppError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(1) FROM skill_call_facts WHERE workspace_id = ?1",
        params![workspace_id],
        |row| row.get(0),
    )?;
    Ok(count == 0)
}

fn map_workspace_id<'a>(path: &str, scopes: &'a [WorkspaceScope]) -> Option<&'a str> {
    let normalized = normalize_path(path)?;
    let mut best: Option<(&str, usize)> = None;

    for scope in scopes {
        let scope_path = normalize_path(scope.root_path.to_string_lossy().as_ref())?;
        if normalized == scope_path
            || normalized.starts_with(&format!("{scope_path}/"))
            || normalized.starts_with(&format!("{scope_path}\\"))
        {
            let score = scope_path.len();
            if best.map(|(_, size)| score > size).unwrap_or(true) {
                best = Some((scope.id.as_str(), score));
            }
        }
    }

    best.map(|item| item.0)
}

fn normalize_path(path: &str) -> Option<String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.replace('\\', "/").trim_end_matches('/').to_string())
}

fn normalize_skill_alias_candidates(token: &str) -> Vec<String> {
    let trimmed = token.trim().trim_start_matches('$').trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    let mut variants = Vec::new();
    let lower = trimmed.to_ascii_lowercase();
    variants.push(lower.clone());

    if lower.contains(':') {
        variants.push(lower.replace(':', "-"));
        if let Some(last) = lower.rsplit(':').next() {
            variants.push(last.to_string());
        }
    }

    if lower.contains('-') {
        variants.push(lower.replace('-', ":"));
    }

    if lower.ends_with("/skill.md") {
        if let Some(name) = lower
            .trim_end_matches("/skill.md")
            .split('/')
            .next_back()
            .filter(|item| !item.trim().is_empty())
        {
            variants.push(name.to_string());
        }
    }

    variants.sort();
    variants.dedup();
    variants
}

fn truncate_text(value: &str, limit: usize) -> String {
    if value.len() <= limit {
        return value.to_string();
    }
    let end = value
        .char_indices()
        .map(|(idx, _)| idx)
        .chain(std::iter::once(value.len()))
        .take_while(|idx| *idx <= limit)
        .last()
        .unwrap_or(0);
    value[..end].to_string()
}

fn discover_session_files() -> Vec<SessionFile> {
    let mut files = Vec::new();

    if let Some(home) = dirs::home_dir() {
        let codex_root = home.join(".codex").join("sessions");
        files.extend(discover_jsonl_files(
            &codex_root,
            AGENT_CODEX,
            SOURCE_CODEX_JSONL,
        ));

        let claude_root = home.join(".claude").join("transcripts");
        files.extend(discover_jsonl_files(
            &claude_root,
            AGENT_CLAUDE,
            SOURCE_CLAUDE_TRANSCRIPT,
        ));
    }

    files
}

fn discover_jsonl_files(root: &Path, agent: &str, source: &str) -> Vec<SessionFile> {
    if !root.exists() || !root.is_dir() {
        return Vec::new();
    }

    let mut files = Vec::new();
    for entry in WalkDir::new(root)
        .follow_links(true)
        .into_iter()
        .flatten()
        .filter(|item| item.file_type().is_file())
    {
        let path = entry.path();
        if path
            .extension()
            .and_then(|item| item.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("jsonl"))
            .unwrap_or(false)
        {
            files.push(SessionFile {
                agent: agent.to_string(),
                source: source.to_string(),
                path: path.to_path_buf(),
            });
        }
    }

    files
}

fn list_workspace_scopes(conn: &Connection) -> Result<Vec<WorkspaceScope>, AppError> {
    let mut stmt = conn.prepare("SELECT id, root_path FROM workspaces")?;
    let rows = stmt.query_map([], |row| {
        Ok(WorkspaceScope {
            id: row.get(0)?,
            root_path: PathBuf::from(row.get::<_, String>(1)?),
        })
    })?;

    let mut scopes = Vec::new();
    for row in rows {
        scopes.push(row?);
    }
    Ok(scopes)
}

fn get_workspace_scope(conn: &Connection, workspace_id: &str) -> Result<WorkspaceScope, AppError> {
    conn.query_row(
        "SELECT id, root_path FROM workspaces WHERE id = ?1",
        params![workspace_id],
        |row| {
            Ok(WorkspaceScope {
                id: row.get(0)?,
                root_path: PathBuf::from(row.get::<_, String>(1)?),
            })
        },
    )
    .optional()?
    .ok_or_else(AppError::workspace_not_found)
}

fn list_skill_aliases(conn: &Connection) -> Result<HashMap<String, SkillAliasEntry>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, identity, name, local_path, source_local_path
         FROM skills_assets",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, Option<String>>(4)?,
        ))
    })?;

    let mut map = HashMap::new();
    for row in rows {
        let (skill_id, identity, name, local_path, source_local_path) = row?;
        let entry = SkillAliasEntry {
            skill_id,
            identity: identity.clone(),
            name: name.clone(),
        };

        let mut aliases = Vec::new();
        aliases.extend(normalize_skill_alias_candidates(&identity));
        aliases.extend(normalize_skill_alias_candidates(&name));

        if let Some(base) = Path::new(&local_path)
            .file_name()
            .and_then(|item| item.to_str())
        {
            aliases.extend(normalize_skill_alias_candidates(base));
        }
        if let Some(source_path) = source_local_path {
            if let Some(base) = Path::new(&source_path)
                .file_name()
                .and_then(|item| item.to_str())
            {
                aliases.extend(normalize_skill_alias_candidates(base));
            }
        }

        aliases.sort();
        aliases.dedup();
        for alias in aliases {
            map.entry(alias).or_insert_with(|| entry.clone());
        }
    }

    Ok(map)
}

fn count_insert_projection(
    conn: &Connection,
    calls: &[SessionSkillCallEvent],
) -> Result<(usize, usize), AppError> {
    let mut inserted = 0_usize;
    let mut duplicate = 0_usize;

    for call in calls {
        let exists: i64 = conn.query_row(
            "SELECT COUNT(1) FROM skill_call_facts WHERE dedupe_key = ?1",
            params![call.dedupe_key],
            |row| row.get(0),
        )?;
        if exists > 0 {
            duplicate += 1;
        } else {
            inserted += 1;
        }
    }

    Ok((inserted, duplicate))
}

fn persist_events(
    conn: &mut Connection,
    calls: Vec<SessionSkillCallEvent>,
    failures: Vec<ParseFailureEvent>,
) -> Result<(), AppError> {
    let tx = conn.transaction()?;

    for call in calls {
        let now = now_rfc3339();
        tx.execute(
            "INSERT INTO skill_call_facts(
                id,
                workspace_id,
                agent,
                source,
                source_path,
                session_id,
                event_ref,
                skill_id,
                skill_identity,
                skill_name,
                called_at,
                result_status,
                confidence,
                raw_ref,
                dedupe_key,
                created_at,
                updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
            ON CONFLICT(dedupe_key) DO NOTHING",
            params![
                Uuid::new_v4().to_string(),
                call.workspace_id,
                call.agent,
                call.source,
                call.source_path,
                call.session_id,
                call.event_ref,
                call.skill_id,
                call.skill_identity,
                call.skill_name,
                call.called_at,
                call.result_status,
                call.confidence,
                call.raw_ref,
                call.dedupe_key,
                now,
                now,
            ],
        )?;
    }

    for failure in failures {
        tx.execute(
            "INSERT INTO skill_call_parse_failures(
                id,
                workspace_id,
                agent,
                source_path,
                session_id,
                line_no,
                event_ref,
                reason,
                raw_excerpt,
                created_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                Uuid::new_v4().to_string(),
                failure.workspace_id,
                failure.agent,
                failure.source_path,
                failure.session_id,
                failure.line_no,
                failure.event_ref,
                failure.reason,
                failure.raw_excerpt,
                now_rfc3339(),
            ],
        )?;
    }

    tx.commit()?;
    Ok(())
}

fn load_checkpoint(
    conn: &Connection,
    agent: &str,
    source_path: &str,
) -> Result<Option<u64>, AppError> {
    conn.query_row(
        "SELECT byte_offset FROM skill_call_sync_checkpoints WHERE agent = ?1 AND source_path = ?2",
        params![agent, source_path],
        |row| row.get::<_, i64>(0),
    )
    .optional()
    .map(|item| item.map(|value| value.max(0) as u64))
    .map_err(Into::into)
}

fn save_checkpoint(
    conn: &Connection,
    agent: &str,
    source_path: &str,
    file_size: u64,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO skill_call_sync_checkpoints(id, agent, source_path, byte_offset, file_size, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(agent, source_path) DO UPDATE SET
            byte_offset = excluded.byte_offset,
            file_size = excluded.file_size,
            updated_at = excluded.updated_at",
        params![
            Uuid::new_v4().to_string(),
            agent,
            source_path,
            file_size as i64,
            file_size as i64,
            now_rfc3339(),
        ],
    )?;
    Ok(())
}

fn usage_jobs() -> &'static Mutex<HashMap<String, SkillsUsageSyncJobHandle>> {
    SKILLS_USAGE_SYNC_JOBS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn lock_usage_jobs(
) -> Result<std::sync::MutexGuard<'static, HashMap<String, SkillsUsageSyncJobHandle>>, AppError> {
    usage_jobs()
        .lock()
        .map_err(|_| AppError::internal("usage job 池锁异常"))
}

fn prune_usage_jobs(jobs: &mut HashMap<String, SkillsUsageSyncJobHandle>) {
    if jobs.len() <= 24 {
        return;
    }

    let mut terminal: Vec<(String, String)> = Vec::new();
    for (job_id, handle) in jobs.iter() {
        if let Ok(state) = handle.state.lock() {
            if matches!(
                state.status.as_str(),
                JOB_STATUS_COMPLETED | JOB_STATUS_COMPLETED_WITH_ERRORS | JOB_STATUS_FAILED
            ) {
                terminal.push((job_id.clone(), state.updated_at.clone()));
            }
        }
    }
    terminal.sort_by(|left, right| left.1.cmp(&right.1));

    for (job_id, _) in terminal {
        if jobs.len() <= 16 {
            break;
        }
        jobs.remove(&job_id);
    }
}

fn usage_job_snapshot(job_id: &str, workspace_id: &str) -> Result<Value, AppError> {
    let jobs = lock_usage_jobs()?;
    let handle = jobs
        .get(job_id)
        .ok_or_else(|| AppError::invalid_argument("usage job 不存在"))?;

    let snapshot = handle
        .state
        .lock()
        .map_err(|_| AppError::internal("usage job 状态锁异常"))?
        .clone();

    if snapshot.workspace_id != workspace_id {
        return Err(AppError::invalid_argument("workspace 不匹配"));
    }

    serde_json::to_value(snapshot).map_err(|err| AppError::internal(err.to_string()))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{
        build_parse_failure_summary, extract_claude_skill_calls, extract_codex_skill_calls,
        normalize_skill_alias_candidates, truncate_text, ParsedSkillCall, RESULT_STATUS_SUCCESS,
    };

    #[test]
    fn normalize_skill_alias_candidates_supports_colon_and_dash() {
        let list = normalize_skill_alias_candidates("$ce:work");
        assert!(list.contains(&"ce:work".to_string()));
        assert!(list.contains(&"ce-work".to_string()));
        assert!(list.contains(&"work".to_string()));
    }

    #[test]
    fn extract_codex_skill_calls_from_function_call() {
        let value = json!({
            "type": "response_item",
            "payload": {
                "type": "function_call",
                "arguments": "{\"command\":\"~/.codex/superpowers/.codex/superpowers-codex use-skill ce:work\"}"
            }
        });

        let calls = extract_codex_skill_calls(&value);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].skill_token, "ce:work");
        assert_eq!(calls[0].result_status, RESULT_STATUS_SUCCESS);
    }

    #[test]
    fn extract_codex_skill_calls_from_exec_command_cmd_field() {
        let value = json!({
            "type": "response_item",
            "payload": {
                "type": "function_call",
                "name": "exec_command",
                "arguments": "{\"cmd\":\"~/.codex/superpowers/.codex/superpowers-codex use-skill uoc-page-style\",\"yield_time_ms\":1000,\"max_output_tokens\":2000}"
            }
        });

        let calls = extract_codex_skill_calls(&value);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].skill_token, "uoc-page-style");
        assert_eq!(calls[0].result_status, RESULT_STATUS_SUCCESS);
    }

    #[test]
    fn extract_claude_skill_calls_from_user_content() {
        let value = json!({
            "type": "user",
            "content": "请执行 [$ce:work](/Users/demo/.codex/skills/ce-work/SKILL.md)"
        });

        let calls: Vec<ParsedSkillCall> = extract_claude_skill_calls(&value);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].skill_token, "ce:work");
    }

    #[test]
    fn truncate_text_handles_utf8_char_boundary() {
        let text = "abc发票xyz";

        assert_eq!(truncate_text(text, 5), "abc");
        assert_eq!(truncate_text(text, 6), "abc发");
    }

    #[test]
    fn truncate_text_does_not_panic_when_limit_hits_multibyte_middle() {
        let text = format!("{}发票{}", "a".repeat(399), "xyz");
        let truncated = truncate_text(&text, 400);

        assert_eq!(truncated.len(), 399);
        assert!(truncated.is_char_boundary(truncated.len()));
    }

    #[test]
    fn build_parse_failure_summary_contains_top_reasons() {
        let mut counts = std::collections::HashMap::new();
        counts.insert("skill-not-mapped: a".to_string(), 5_u64);
        counts.insert("skill-not-mapped: b".to_string(), 3_u64);
        counts.insert("json-parse-failed".to_string(), 2_u64);
        counts.insert("skill-not-mapped: c".to_string(), 1_u64);

        let summary = build_parse_failure_summary(11, &counts);
        assert!(summary.contains("发现 11 条解析异常"));
        assert!(summary.contains("skill-not-mapped: a ×5"));
        assert!(summary.contains("其余 1 类已省略"));
    }
}
