use super::*;
use chrono::DateTime;
use walkdir::WalkDir;

pub(super) fn run_sync_job(
    app_state: AppState,
    workspace_id: &str,
    job_state: Arc<Mutex<ModelUsageSyncJobState>>,
    force_full: bool,
) -> Result<(), AppError> {
    let mut conn = app_state.open()?;
    let workspace_scope = get_workspace_scope(&conn, workspace_id)?;
    let agent_root_dirs = list_enabled_agent_root_dirs(&conn, workspace_id)?;
    let _ = cleanup_legacy_codex_session_rows(&conn, &workspace_scope.id)?;
    let mut failure_reason_counts: HashMap<String, u64> = HashMap::new();

    let (mut files, discover_issues) = discover_session_files(&workspace_scope, &agent_root_dirs);
    let source_status = list_source_status_updated_at(&conn, &workspace_scope.id)?;
    let first_sync =
        source_status.is_empty() && latest_model_call_at(&conn, &workspace_scope.id)?.is_none();
    if !first_sync && !force_full {
        files.retain(|file| should_parse_incremental_file(file, &source_status));
    }
    files.sort_by(|left, right| left.path.cmp(&right.path));
    {
        let mut job = job_state
            .lock()
            .map_err(|_| AppError::internal("model usage job 状态锁异常"))?;
        job.total_files = files.len() as u64;
        job.updated_at = now_rfc3339();
    }

    if !discover_issues.is_empty() {
        let failures = discover_issues
            .iter()
            .map(|issue| ParseFailureEvent {
                workspace_id: workspace_scope.id.clone(),
                source: issue.source.clone(),
                source_path: issue.source_path.clone(),
                reason: issue.reason.clone(),
                raw_excerpt: String::new(),
            })
            .collect::<Vec<_>>();
        for failure in &failures {
            *failure_reason_counts
                .entry(failure.reason.clone())
                .or_insert(0) += 1;
        }
        persist_events(&mut conn, Vec::new(), failures)?;
        if let Ok(mut job) = job_state.lock() {
            job.parse_failures += discover_issues.len() as u64;
            job.updated_at = now_rfc3339();
        }
    }

    for (index, file) in files.iter().enumerate() {
        {
            let mut job = job_state
                .lock()
                .map_err(|_| AppError::internal("model usage job 状态锁异常"))?;
            job.current_source = file.path.clone();
            job.processed_files = index as u64;
            job.updated_at = now_rfc3339();
        }

        match parse_session_file(file, &workspace_scope.id) {
            Ok(parsed) => {
                for failure in &parsed.failures {
                    *failure_reason_counts
                        .entry(failure.reason.clone())
                        .or_insert(0) += 1;
                }

                let (inserted_events, merged_events) =
                    count_insert_projection(&conn, &parsed.facts)?;
                persist_events(&mut conn, parsed.facts, parsed.failures)?;

                {
                    let mut job = job_state
                        .lock()
                        .map_err(|_| AppError::internal("model usage job 状态锁异常"))?;
                    job.parsed_events += parsed.parsed_events as u64;
                    job.inserted_events += inserted_events as u64;
                    job.merged_events += merged_events as u64;
                    job.parse_failures += parsed.parse_failures as u64;
                    job.processed_files = (index + 1) as u64;
                    job.updated_at = now_rfc3339();
                }
            }
            Err(err) => {
                let reason = format!("file-parse-failed: {}", err.message);
                *failure_reason_counts.entry(reason.clone()).or_insert(0) += 1;
                persist_events(
                    &mut conn,
                    Vec::new(),
                    vec![ParseFailureEvent {
                        workspace_id: workspace_scope.id.clone(),
                        source: file.source.clone(),
                        source_path: file.path.clone(),
                        reason: reason.clone(),
                        raw_excerpt: String::new(),
                    }],
                )?;
                if let Ok(mut job) = job_state.lock() {
                    job.parse_failures += 1;
                    job.updated_at = now_rfc3339();
                }
            }
        }
    }

    {
        let mut job = job_state
            .lock()
            .map_err(|_| AppError::internal("model usage job 状态锁异常"))?;
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

pub(super) fn should_parse_incremental_file(
    file: &SessionFile,
    source_status: &HashMap<String, String>,
) -> bool {
    let Some(last_processed_at) = source_status.get(&file.path) else {
        return true;
    };
    let Ok(metadata) = std::fs::metadata(&file.path) else {
        return true;
    };
    let Ok(modified_at) = metadata.modified() else {
        return true;
    };
    let Ok(last_processed_at) = DateTime::parse_from_rfc3339(last_processed_at) else {
        return true;
    };
    let modified_at: DateTime<Utc> = modified_at.into();
    modified_at > last_processed_at.with_timezone(&Utc)
}

pub(super) fn build_parse_failure_summary(
    total: u64,
    reason_counts: &HashMap<String, u64>,
) -> String {
    if total == 0 {
        return String::new();
    }
    if reason_counts.is_empty() {
        return format!("发现 {total} 条模型使用解析异常，请重试或查看失败明细。");
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
        "发现 {total} 条模型使用解析异常，主要原因：{}",
        top_reasons.join("；")
    );
    if pairs.len() > 3 {
        message.push_str(&format!("；其余 {} 类已省略。", pairs.len() - 3));
    }
    message
}

pub(super) fn usage_jobs() -> &'static Mutex<HashMap<String, ModelUsageSyncJobHandle>> {
    MODEL_USAGE_SYNC_JOBS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub(super) fn lock_usage_jobs(
) -> Result<std::sync::MutexGuard<'static, HashMap<String, ModelUsageSyncJobHandle>>, AppError> {
    usage_jobs()
        .lock()
        .map_err(|_| AppError::internal("model usage job 池锁异常"))
}

pub(super) fn prune_usage_jobs(jobs: &mut HashMap<String, ModelUsageSyncJobHandle>) {
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

pub(super) fn usage_job_snapshot(job_id: &str, workspace_id: &str) -> Result<Value, AppError> {
    let jobs = lock_usage_jobs()?;
    let handle = jobs
        .get(job_id)
        .ok_or_else(|| AppError::invalid_argument("model usage job 不存在"))?;

    let snapshot = handle
        .state
        .lock()
        .map_err(|_| AppError::internal("model usage job 状态锁异常"))?
        .clone();

    if snapshot.workspace_id != workspace_id {
        return Err(AppError::invalid_argument("workspace 不匹配"));
    }

    serde_json::to_value(snapshot).map_err(|err| AppError::internal(err.to_string()))
}

pub(super) fn discover_session_files(
    workspace_scope: &WorkspaceScope,
    agent_root_dirs: &[AgentRootDirScope],
) -> (Vec<SessionFile>, Vec<SessionDiscoverIssue>) {
    fn append_unique_session_roots(
        roots: &mut Vec<std::path::PathBuf>,
        agent: &str,
        root_dir: &str,
    ) {
        let base = std::path::PathBuf::from(root_dir);
        let append = |roots: &mut Vec<std::path::PathBuf>, path: std::path::PathBuf| {
            if !roots.iter().any(|existing| existing == &path) {
                roots.push(path);
            }
        };
        match agent {
            AGENT_CODEX => {
                append(roots, base.join("sessions"));
                if base.file_name().and_then(|item| item.to_str()) != Some(".codex") {
                    append(roots, base.join(".codex/sessions"));
                }
            }
            AGENT_CLAUDE => {
                append(roots, base.join("transcripts"));
                if base.file_name().and_then(|item| item.to_str()) != Some(".claude") {
                    append(roots, base.join(".claude/transcripts"));
                }
            }
            _ => {}
        }
    }

    let mut files = Vec::new();
    let mut issues = Vec::new();
    let mut seen_files = std::collections::HashSet::<String>::new();
    let workspace_root = std::path::PathBuf::from(&workspace_scope.root_path);
    let mut session_roots = Vec::new();
    append_unique_session_roots(&mut session_roots, AGENT_CODEX, &workspace_scope.root_path);
    for scope in agent_root_dirs {
        append_unique_session_roots(&mut session_roots, &scope.agent, &scope.root_dir);
    }

    let mut roots = session_roots
        .into_iter()
        .map(|path| (path, SOURCE_SESSION_JSONL.to_string()))
        .collect::<Vec<_>>();
    roots.push((
        workspace_root.join(".agentnexus/instrumentation"),
        SOURCE_INSTRUMENTATION_EVENT.to_string(),
    ));

    for (scan_root, source) in roots {
        if !scan_root.exists() {
            continue;
        }

        for entry in WalkDir::new(&scan_root) {
            match entry {
                Ok(entry) => {
                    if !entry.file_type().is_file() {
                        continue;
                    }
                    let path = entry.path();
                    if path.extension().and_then(|ext| ext.to_str()) != Some("jsonl") {
                        continue;
                    }
                    let path_str = path.to_string_lossy().to_string();
                    if !seen_files.insert(path_str.clone()) {
                        continue;
                    }
                    let agent = infer_agent_from_path(&path_str);
                    files.push(SessionFile {
                        agent,
                        source: source.clone(),
                        path: path_str,
                    });
                }
                Err(err) => {
                    issues.push(SessionDiscoverIssue {
                        source: source.clone(),
                        source_path: scan_root.to_string_lossy().to_string(),
                        reason: format!("walkdir-error: {err}"),
                    });
                }
            }
        }
    }

    (files, issues)
}

fn infer_agent_from_path(path: &str) -> String {
    let lowered = path.to_lowercase();
    if lowered.contains("claude") {
        AGENT_CLAUDE.to_string()
    } else {
        AGENT_CODEX.to_string()
    }
}
