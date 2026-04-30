use super::*;
use rusqlite::{params_from_iter, types::Value as SqlValue};

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
    let evidence_source_filter = normalize_filter_value(input.evidence_source.as_deref());

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
        let (total_calls, last_7d_calls, last_called_at) = query_skill_stats(
            &conn,
            workspace_id,
            skill_id_ref,
            from_7d.as_str(),
            agent_filter.as_deref(),
            source_filter.as_deref(),
            evidence_source_filter.as_deref(),
        )?;

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
    let evidence_source_filter = normalize_filter_value(input.evidence_source.as_deref());
    let workspace_id = input.workspace_id.as_str();
    let skill_id = input.skill_id.as_str();
    let mut rows = Vec::new();
    let (list_sql, list_params) = build_calls_query(
        workspace_id,
        skill_id,
        agent_filter.as_deref(),
        source_filter.as_deref(),
        evidence_source_filter.as_deref(),
        Some((limit, offset)),
    );
    let mut list_stmt = conn.prepare(&list_sql)?;
    let query_rows = list_stmt.query_map(params_from_iter(list_params), |row| {
        Ok(json!({
            "calledAt": row.get::<_, String>(0)?,
            "agent": row.get::<_, String>(1)?,
            "source": row.get::<_, String>(2)?,
            "resultStatus": row.get::<_, String>(3)?,
            "evidenceSource": row.get::<_, String>(4)?,
            "evidenceKind": row.get::<_, String>(5)?,
            "confidence": row.get::<_, f64>(6)?,
            "sessionId": row.get::<_, String>(7)?,
            "eventRef": row.get::<_, String>(8)?,
            "rawRef": row.get::<_, String>(9)?,
        }))
    })?;
    for row in query_rows {
        rows.push(row?);
    }

    let (count_sql, count_params) = build_calls_count_query(
        workspace_id,
        skill_id,
        agent_filter.as_deref(),
        source_filter.as_deref(),
        evidence_source_filter.as_deref(),
    );
    let total: i64 =
        conn.query_row(&count_sql, params_from_iter(count_params), |row| row.get(0))?;

    Ok(json!({
        "items": rows,
        "total": total,
    }))
}

fn query_skill_stats(
    conn: &Connection,
    workspace_id: &str,
    skill_id: &str,
    from_7d: &str,
    agent_filter: Option<&str>,
    source_filter: Option<&str>,
    evidence_source_filter: Option<&str>,
) -> Result<(i64, i64, Option<String>), AppError> {
    let mut sql = String::from(
        "SELECT COUNT(1),
                SUM(CASE WHEN called_at >= ?1 THEN 1 ELSE 0 END),
                MAX(called_at)
         FROM skill_call_facts
         WHERE workspace_id = ?2 AND skill_id = ?3",
    );
    let mut params = vec![
        SqlValue::Text(from_7d.to_string()),
        SqlValue::Text(workspace_id.to_string()),
        SqlValue::Text(skill_id.to_string()),
    ];
    append_calls_filters(
        &mut sql,
        &mut params,
        agent_filter,
        source_filter,
        evidence_source_filter,
    );
    conn.query_row(&sql, params_from_iter(params), |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, Option<i64>>(1)?.unwrap_or(0),
            row.get::<_, Option<String>>(2)?,
        ))
    })
    .map_err(AppError::from)
}

fn build_calls_query(
    workspace_id: &str,
    skill_id: &str,
    agent_filter: Option<&str>,
    source_filter: Option<&str>,
    evidence_source_filter: Option<&str>,
    page: Option<(i64, i64)>,
) -> (String, Vec<SqlValue>) {
    let mut sql = String::from(
        "SELECT called_at, agent, source, result_status, evidence_source, evidence_kind, confidence, session_id, event_ref, raw_ref
         FROM skill_call_facts
         WHERE workspace_id = ?1 AND skill_id = ?2",
    );
    let mut params = vec![
        SqlValue::Text(workspace_id.to_string()),
        SqlValue::Text(skill_id.to_string()),
    ];
    append_calls_filters(
        &mut sql,
        &mut params,
        agent_filter,
        source_filter,
        evidence_source_filter,
    );
    sql.push_str(" ORDER BY called_at DESC, created_at DESC");
    if let Some((limit, offset)) = page {
        sql.push_str(" LIMIT ?");
        params.push(SqlValue::Integer(limit));
        sql.push_str(" OFFSET ?");
        params.push(SqlValue::Integer(offset));
    }
    (sql, params)
}

fn build_calls_count_query(
    workspace_id: &str,
    skill_id: &str,
    agent_filter: Option<&str>,
    source_filter: Option<&str>,
    evidence_source_filter: Option<&str>,
) -> (String, Vec<SqlValue>) {
    let mut sql = String::from(
        "SELECT COUNT(1)
         FROM skill_call_facts
         WHERE workspace_id = ?1 AND skill_id = ?2",
    );
    let mut params = vec![
        SqlValue::Text(workspace_id.to_string()),
        SqlValue::Text(skill_id.to_string()),
    ];
    append_calls_filters(
        &mut sql,
        &mut params,
        agent_filter,
        source_filter,
        evidence_source_filter,
    );
    (sql, params)
}

fn append_calls_filters(
    sql: &mut String,
    params: &mut Vec<SqlValue>,
    agent_filter: Option<&str>,
    source_filter: Option<&str>,
    evidence_source_filter: Option<&str>,
) {
    if let Some(agent) = agent_filter {
        sql.push_str(" AND agent = ?");
        params.push(SqlValue::Text(agent.to_string()));
    }
    if let Some(source) = source_filter {
        sql.push_str(" AND source = ?");
        params.push(SqlValue::Text(source.to_string()));
    }
    if let Some(evidence_source) = evidence_source_filter {
        sql.push_str(" AND evidence_source = ?");
        params.push(SqlValue::Text(evidence_source.to_string()));
    }
}
