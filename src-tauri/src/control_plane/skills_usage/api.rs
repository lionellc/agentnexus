use super::*;

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
