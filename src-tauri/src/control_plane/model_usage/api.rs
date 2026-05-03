use super::*;
#[tauri::command]
pub fn model_usage_sync_start(
    state: State<'_, AppState>,
    input: ModelUsageSyncStartInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    get_workspace_scope(&conn, crate::domain::models::APP_SCOPE_ID)?;

    let job_id = Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let state_arc = Arc::new(Mutex::new(ModelUsageSyncJobState {
        job_id: job_id.clone(),
        workspace_id: crate::domain::models::APP_SCOPE_ID.to_string(),
        status: JOB_STATUS_RUNNING.to_string(),
        total_files: 0,
        processed_files: 0,
        parsed_events: 0,
        inserted_events: 0,
        merged_events: 0,
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
            ModelUsageSyncJobHandle {
                state: state_arc.clone(),
            },
        );
    }

    let app_state = state.inner().clone();
    let workspace_id = crate::domain::models::APP_SCOPE_ID.to_string();
    let force_full = input.force_full.unwrap_or(false);
    std::thread::spawn(move || {
        if let Err(err) = run_sync_job(app_state, &workspace_id, state_arc.clone(), force_full) {
            if let Ok(mut job) = state_arc.lock() {
                job.status = JOB_STATUS_FAILED.to_string();
                job.error_message = err.message;
                job.updated_at = now_rfc3339();
            }
        }
    });

    usage_job_snapshot(&job_id, crate::domain::models::APP_SCOPE_ID)
}

#[tauri::command]
pub fn model_usage_sync_progress(
    _state: State<'_, AppState>,
    input: ModelUsageSyncProgressInput,
) -> Result<Value, AppError> {
    usage_job_snapshot(&input.job_id, crate::domain::models::APP_SCOPE_ID)
}
