use super::*;
use rusqlite::params;
use serde_json::json;

#[tauri::command]
pub fn model_usage_sync_start(
    state: State<'_, AppState>,
    input: ModelUsageSyncStartInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    get_workspace_scope(&conn, &input.workspace_id)?;

    let job_id = Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let state_arc = Arc::new(Mutex::new(ModelUsageSyncJobState {
        job_id: job_id.clone(),
        workspace_id: input.workspace_id.clone(),
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
pub fn model_usage_sync_progress(
    _state: State<'_, AppState>,
    input: ModelUsageSyncProgressInput,
) -> Result<Value, AppError> {
    usage_job_snapshot(&input.job_id, &input.workspace_id)
}

#[tauri::command]
pub fn model_pricing_sync_trigger(
    state: State<'_, AppState>,
    input: ModelPricingSyncInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    get_workspace_scope(&conn, &input.workspace_id)?;
    ensure_pricing_seed(&conn, &input.workspace_id)?;
    ensure_fx_seed(&conn)?;
    let pricing_count: i64 = conn.query_row(
        "SELECT COUNT(1) FROM model_pricing_snapshots WHERE workspace_id = ?1",
        params![input.workspace_id],
        |row| row.get(0),
    )?;
    let fx = load_fx_snapshot(&conn)?;
    Ok(json!({
        "workspaceId": input.workspace_id,
        "syncedAt": now_rfc3339(),
        "pricingRows": pricing_count,
        "source": "builtin",
        "fx": {
            "rate": fx.rate,
            "stale": fx.stale,
            "fetchedAt": fx.fetched_at,
            "source": fx.source,
        }
    }))
}

#[tauri::command]
pub fn model_pricing_query(
    state: State<'_, AppState>,
    input: ModelPricingQueryInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    get_workspace_scope(&conn, &input.workspace_id)?;
    ensure_pricing_seed(&conn, &input.workspace_id)?;
    ensure_fx_seed(&conn)?;
    let currency = normalize_currency(input.currency.as_deref());
    let rows = query_pricing_rows(&conn, &input.workspace_id, Some(currency.as_str()))?;
    let fx = load_fx_snapshot(&conn)?;
    Ok(json!({
        "items": rows,
        "fx": {
            "rate": fx.rate,
            "stale": fx.stale,
            "fetchedAt": fx.fetched_at,
            "source": fx.source,
        },
        "currency": currency,
    }))
}

#[tauri::command]
pub fn model_pricing_override_upsert(
    state: State<'_, AppState>,
    input: ModelPricingOverrideUpsertInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    get_workspace_scope(&conn, &input.workspace_id)?;
    upsert_pricing_override(&conn, &input)
}
