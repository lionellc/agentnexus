use super::*;

pub(super) fn lock_diff_jobs(
) -> Result<std::sync::MutexGuard<'static, HashMap<String, SkillsManagerDiffJobHandle>>, AppError> {
    skills_manager_diff_jobs()
        .lock()
        .map_err(|_| AppError::internal("diff job 池锁异常"))
}

pub(super) fn skills_manager_diff_jobs() -> &'static Mutex<HashMap<String, SkillsManagerDiffJobHandle>> {
    SKILLS_MANAGER_DIFF_JOBS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub(super) fn prune_diff_jobs(jobs: &mut HashMap<String, SkillsManagerDiffJobHandle>) {
    if jobs.len() <= 24 {
        return;
    }

    let mut terminal_jobs: Vec<(String, String)> = Vec::new();
    for (job_id, handle) in jobs.iter() {
        if let Ok(state) = handle.state.lock() {
            if state.status == DIFF_STATUS_COMPLETED
                || state.status == DIFF_STATUS_CANCELLED
                || state.status == DIFF_STATUS_FAILED
            {
                terminal_jobs.push((job_id.clone(), state.updated_at.clone()));
            }
        }
    }
    terminal_jobs.sort_by(|left, right| left.1.cmp(&right.1));

    for (job_id, _) in terminal_jobs {
        if jobs.len() <= 16 {
            break;
        }
        jobs.remove(&job_id);
    }
}

pub(super) fn diff_job_snapshot(job_id: &str, workspace_id: &str) -> Result<Value, AppError> {
    let jobs = lock_diff_jobs()?;
    let handle = jobs
        .get(job_id)
        .ok_or_else(|| AppError::invalid_argument("diff job 不存在"))?;
    let snapshot = handle
        .state
        .lock()
        .map_err(|_| AppError::internal("diff job 状态锁异常"))?
        .clone();
    drop(jobs);

    if snapshot.workspace_id != workspace_id {
        return Err(AppError::invalid_argument("workspace 不匹配"));
    }

    serde_json::to_value(snapshot).map_err(|err| AppError::internal(err.to_string()))
}

pub(super) fn spawn_diff_worker(
    job_state: Arc<Mutex<SkillsManagerDiffJobState>>,
    cancel_flag: Arc<AtomicBool>,
    left_root: PathBuf,
    right_root: PathBuf,
) {
    std::thread::spawn(move || {
        let result = run_diff_worker(&job_state, &cancel_flag, &left_root, &right_root);
        if let Err(err) = result {
            if let Ok(mut state) = job_state.lock() {
                state.status = DIFF_STATUS_FAILED.to_string();
                state.error_message = err.message;
                state.current_file = String::new();
                state.same_skill = None;
                state.updated_at = now_rfc3339();
            }
        }
    });
}

pub(super) fn run_diff_worker(
    job_state: &Arc<Mutex<SkillsManagerDiffJobState>>,
    cancel_flag: &Arc<AtomicBool>,
    left_root: &Path,
    right_root: &Path,
) -> Result<(), AppError> {
    if !left_root.exists() {
        return Err(AppError::invalid_argument("left skill 目录不存在"));
    }
    if !right_root.exists() {
        return Err(AppError::invalid_argument("right skill 目录不存在"));
    }

    let left_files = collect_skill_files(left_root)?;
    let right_files = collect_skill_files(right_root)?;
    let mut all_paths: Vec<String> = left_files
        .keys()
        .chain(right_files.keys())
        .cloned()
        .collect::<HashSet<String>>()
        .into_iter()
        .collect();
    all_paths.sort();

    {
        let mut state = job_state
            .lock()
            .map_err(|_| AppError::internal("diff job 状态锁异常"))?;
        state.total_files = all_paths.len() as u64;
        state.processed_files = 0;
        state.current_file = String::new();
        state.diff_files = 0;
        state.entries.clear();
        state.same_skill = None;
        state.error_message.clear();
        state.updated_at = now_rfc3339();
    }

    for relative_path in all_paths {
        if cancel_flag.load(Ordering::Relaxed) {
            let mut state = job_state
                .lock()
                .map_err(|_| AppError::internal("diff job 状态锁异常"))?;
            state.status = DIFF_STATUS_CANCELLED.to_string();
            state.current_file = String::new();
            state.same_skill = None;
            state.updated_at = now_rfc3339();
            return Ok(());
        }

        {
            let mut state = job_state
                .lock()
                .map_err(|_| AppError::internal("diff job 状态锁异常"))?;
            state.current_file = relative_path.clone();
            state.updated_at = now_rfc3339();
        }

        let diff = compare_skill_file_pair(
            left_files.get(&relative_path),
            right_files.get(&relative_path),
            &relative_path,
        )?;

        let mut state = job_state
            .lock()
            .map_err(|_| AppError::internal("diff job 状态锁异常"))?;
        state.processed_files += 1;
        if let Some(entry) = diff {
            state.diff_files += 1;
            state.entries.push(entry);
        }
        state.updated_at = now_rfc3339();
    }

    let mut state = job_state
        .lock()
        .map_err(|_| AppError::internal("diff job 状态锁异常"))?;
    state.status = DIFF_STATUS_COMPLETED.to_string();
    state.current_file = String::new();
    state.same_skill = Some(state.diff_files == 0);
    state.updated_at = now_rfc3339();

    Ok(())
}
