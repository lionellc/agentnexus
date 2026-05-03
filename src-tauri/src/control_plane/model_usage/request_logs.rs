use super::*;
use rusqlite::params_from_iter;
use serde_json::json;

#[tauri::command]
pub fn model_usage_query_request_logs(
    state: State<'_, AppState>,
    input: ModelUsageRequestLogsQueryInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    get_workspace_scope(&conn, crate::domain::models::APP_SCOPE_ID)?;
    ensure_pricing_seed(&conn, crate::domain::models::APP_SCOPE_ID)?;
    ensure_fx_seed(&conn)?;

    let currency = normalize_currency(input.currency.as_deref());
    let end_at = input.end_at.unwrap_or_else(now_rfc3339);
    let days = if input.days == Some(0) {
        1
    } else {
        input.days.unwrap_or(7).clamp(1, 365)
    };
    let start_at = input
        .start_at
        .unwrap_or_else(|| (Utc::now() - Duration::days(days)).to_rfc3339());
    let limit = input.limit.unwrap_or(80).clamp(1, 200);
    let agent_filter = normalize_filter_value(input.agent.as_deref());
    let model_filter = normalize_filter_value(input.model.as_deref());
    let status_filter = normalize_filter_value(input.status.as_deref());

    let cursor = match (
        normalize_filter_value(input.cursor_timestamp.as_deref()),
        normalize_filter_value(input.cursor_id.as_deref()),
    ) {
        (Some(timestamp), Some(id)) => Some((timestamp, id)),
        _ => None,
    };
    let (list_sql, list_params) = build_facts_query(
        crate::domain::models::APP_SCOPE_ID,
        &start_at,
        &end_at,
        agent_filter.as_deref(),
        model_filter.as_deref(),
        status_filter.as_deref(),
        Some((limit + 1, cursor.clone())),
    );
    let mut stmt = conn.prepare(&list_sql)?;
    let rows = stmt.query_map(params_from_iter(list_params), |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, Option<i64>>(5)?,
            row.get::<_, Option<i64>>(6)?,
            row.get::<_, i64>(7)?,
            row.get::<_, String>(8)?,
            row.get::<_, String>(9)?,
            row.get::<_, String>(10)?,
            row.get::<_, String>(11)?,
            row.get::<_, Option<String>>(12)?,
        ))
    })?;

    let fx = load_fx_snapshot(&conn)?;
    let mut all_items = Vec::new();
    for row in rows {
        let (
            called_at,
            id,
            agent,
            provider,
            model,
            input_tokens,
            output_tokens,
            is_complete,
            status,
            source,
            source_path,
            session_id,
            request_id,
        ) = row?;
        let in_tokens = input_tokens.unwrap_or(0);
        let out_tokens = output_tokens.unwrap_or(0);
        let total_tokens = in_tokens + out_tokens;
        let cost_usd = if is_complete == 0 {
            0.0
        } else {
            calculate_row_cost_usd(
                &conn,
                crate::domain::models::APP_SCOPE_ID,
                &provider,
                &model,
                &called_at,
                input_tokens,
                output_tokens,
            )?
        };
        let cost_cny = cost_usd * fx.rate;
        all_items.push(json!({
            "id": id,
            "calledAt": called_at,
            "agent": agent,
            "provider": provider,
            "model": model,
            "status": status,
            "inputTokens": input_tokens,
            "outputTokens": output_tokens,
            "totalTokens": total_tokens,
            "isComplete": is_complete == 1,
            "source": source,
            "sourcePath": source_path,
            "sessionId": session_id,
            "requestId": request_id,
            "costUsd": round6(cost_usd),
            "costCny": round6(cost_cny),
            "displayCurrency": currency,
            "displayCost": round6(if currency == "CNY" { cost_cny } else { cost_usd }),
        }));
    }

    let has_next = all_items.len() as i64 > limit;
    let items = if has_next {
        all_items
            .into_iter()
            .take(limit as usize)
            .collect::<Vec<_>>()
    } else {
        all_items
    };
    let next_cursor = if has_next {
        items.last().map(|item| {
            json!({
                "timestamp": item.get("calledAt").and_then(Value::as_str).unwrap_or_default(),
                "id": item.get("id").and_then(Value::as_str).unwrap_or_default(),
            })
        })
    } else {
        None
    };

    let (count_sql, count_params) = build_facts_count_query(
        crate::domain::models::APP_SCOPE_ID,
        &start_at,
        &end_at,
        agent_filter.as_deref(),
        model_filter.as_deref(),
        status_filter.as_deref(),
    );
    let total: i64 =
        conn.query_row(&count_sql, params_from_iter(count_params), |row| row.get(0))?;

    Ok(json!({
        "items": items,
        "total": total,
        "nextCursor": next_cursor,
        "displayCurrency": currency,
        "fxRateUsdCny": fx.rate,
        "fxStale": fx.stale,
        "fxFetchedAt": fx.fetched_at,
    }))
}
