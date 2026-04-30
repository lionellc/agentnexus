use super::*;

pub(super) fn run_sync_job(
    app_state: AppState,
    workspace_id: &str,
    job_state: Arc<Mutex<SkillsUsageSyncJobState>>,
) -> Result<(), AppError> {
    let mut conn = app_state.open()?;
    let workspace_scope = get_workspace_scope(&conn, workspace_id)?;
    let workspace_scopes = list_workspace_scopes(&conn)?;
    let skill_aliases = list_skill_aliases(&conn)?;
    let agent_search_dirs = list_enabled_agent_search_dirs(&conn, &workspace_scope.id)?;
    let force_full_scan = should_force_full_scan(&conn, &workspace_scope.id)?;
    let mut failure_reason_counts: HashMap<String, u64> = HashMap::new();

    let (mut files, discover_issues) = discover_session_files(&agent_search_dirs);
    files.sort_by(|left, right| left.path.cmp(&right.path));
    {
        let mut job = job_state
            .lock()
            .map_err(|_| AppError::internal("usage job 状态锁异常"))?;
        job.total_files = files.len() as u64;
        job.updated_at = now_rfc3339();
    }

    if !discover_issues.is_empty() {
        let failures = discover_issues
            .iter()
            .map(|issue| ParseFailureEvent {
                workspace_id: Some(workspace_scope.id.clone()),
                agent: issue.agent.clone(),
                source_path: issue.source_path.clone(),
                session_id: None,
                line_no: 0,
                event_ref: "discover".to_string(),
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
            &agent_search_dirs,
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

pub(super) fn build_parse_failure_summary(
    total: u64,
    reason_counts: &HashMap<String, u64>,
) -> String {
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
pub(super) fn usage_jobs() -> &'static Mutex<HashMap<String, SkillsUsageSyncJobHandle>> {
    SKILLS_USAGE_SYNC_JOBS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub(super) fn lock_usage_jobs(
) -> Result<std::sync::MutexGuard<'static, HashMap<String, SkillsUsageSyncJobHandle>>, AppError> {
    usage_jobs()
        .lock()
        .map_err(|_| AppError::internal("usage job 池锁异常"))
}

pub(super) fn prune_usage_jobs(jobs: &mut HashMap<String, SkillsUsageSyncJobHandle>) {
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
