use super::*;
use rusqlite::{params_from_iter};
use serde_json::json;

#[tauri::command]
pub fn model_usage_query_dashboard(
    state: State<'_, AppState>,
    input: ModelUsageDashboardQueryInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    get_workspace_scope(&conn, &input.workspace_id)?;
    ensure_pricing_seed(&conn, &input.workspace_id)?;
    ensure_fx_seed(&conn)?;

    let currency = normalize_currency(input.currency.as_deref());
    let hourly_bucket = input.days == Some(0);
    let end_at = input.end_at.unwrap_or_else(now_rfc3339);
    let days = if hourly_bucket { 1 } else { input.days.unwrap_or(7).clamp(1, 365) };
    let start_at = input
        .start_at
        .unwrap_or_else(|| (Utc::now() - Duration::days(days)).to_rfc3339());
    let agent_filter = normalize_filter_value(input.agent.as_deref());
    let model_filter = normalize_filter_value(input.model.as_deref());
    let status_filter = normalize_filter_value(input.status.as_deref());

    let (facts_sql, facts_params) = build_facts_query(
        &input.workspace_id,
        &start_at,
        &end_at,
        agent_filter.as_deref(),
        model_filter.as_deref(),
        status_filter.as_deref(),
        None,
    );
    let mut stmt = conn.prepare(&facts_sql)?;
    let rows = stmt.query_map(params_from_iter(facts_params), |row| {
        Ok((
            row.get::<_, String>(1)?,
            row.get::<_, String>(0)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(8)?,
            row.get::<_, Option<i64>>(5)?,
            row.get::<_, Option<i64>>(6)?,
            row.get::<_, i64>(7)?,
        ))
    })?;

    let fx = load_fx_snapshot(&conn)?;
    let mut request_count = 0_i64;
    let mut billable_request_count = 0_i64;
    let mut incomplete_count = 0_i64;
    let mut total_input_tokens = 0_i64;
    let mut total_output_tokens = 0_i64;
    let mut total_tokens = 0_i64;
    let mut total_cost_usd = 0_f64;
    let mut daily_cost: HashMap<String, f64> = HashMap::new();
    let mut daily_input: HashMap<String, i64> = HashMap::new();
    let mut daily_output: HashMap<String, i64> = HashMap::new();
    let mut status_counts: HashMap<String, i64> = HashMap::new();
    let mut model_counts: HashMap<String, i64> = HashMap::new();
    let mut model_stats: HashMap<String, (i64, i64, f64)> = HashMap::new();

    for row in rows {
        let (_id, called_at, agent, provider, model, status, input_tokens, output_tokens, is_complete) = row?;
        request_count += 1;
        *status_counts.entry(status.clone()).or_insert(0) += 1;
        *model_counts.entry(model.clone()).or_insert(0) += 1;

        let in_tokens = input_tokens.unwrap_or(0);
        let out_tokens = output_tokens.unwrap_or(0);
        let row_tokens = in_tokens + out_tokens;
        total_input_tokens += in_tokens;
        total_output_tokens += out_tokens;
        total_tokens += row_tokens;

        let date_key = if hourly_bucket { hour_bucket(&called_at) } else { day_bucket(&called_at) };
        *daily_input.entry(date_key.clone()).or_insert(0) += in_tokens;
        *daily_output.entry(date_key.clone()).or_insert(0) += out_tokens;

        if is_complete == 0 {
            incomplete_count += 1;
            continue;
        }
        billable_request_count += 1;
        let cost_usd = calculate_row_cost_usd(
            &conn,
            &input.workspace_id,
            &provider,
            &model,
            &called_at,
            input_tokens,
            output_tokens,
        )?;
        total_cost_usd += cost_usd;
        *daily_cost.entry(date_key).or_insert(0.0) += cost_usd;
        let entry = model_stats.entry(model.clone()).or_insert((0_i64, 0_i64, 0_f64));
        entry.0 += 1;
        entry.1 += row_tokens;
        entry.2 += cost_usd;
        let _ = agent;
    }

    let total_cost_cny = total_cost_usd * fx.rate;
    let display_cost = if currency == "CNY" { total_cost_cny } else { total_cost_usd };

    let mut daily_cost_rows = daily_cost
        .into_iter()
        .map(|(date, usd)| {
            let cny = usd * fx.rate;
            json!({
                "date": date,
                "usd": round6(usd),
                "cny": round6(cny),
                "display": round6(if currency == "CNY" { cny } else { usd }),
            })
        })
        .collect::<Vec<_>>();
    daily_cost_rows.sort_by(|left, right| {
        left.get("date").and_then(Value::as_str).unwrap_or_default().cmp(
            right.get("date").and_then(Value::as_str).unwrap_or_default(),
        )
    });

    let mut dates = daily_input.keys().cloned().collect::<Vec<_>>();
    dates.sort();
    let daily_token_rows = dates
        .iter()
        .map(|date| {
            let in_tokens = *daily_input.get(date).unwrap_or(&0);
            let out_tokens = *daily_output.get(date).unwrap_or(&0);
            json!({
                "date": date,
                "inputTokens": in_tokens,
                "outputTokens": out_tokens,
                "totalTokens": in_tokens + out_tokens,
            })
        })
        .collect::<Vec<_>>();

    let mut status_rows = status_counts
        .into_iter()
        .map(|(status, count)| json!({ "status": status, "count": count }))
        .collect::<Vec<_>>();
    status_rows.sort_by(|left, right| {
        right.get("count").and_then(Value::as_i64).unwrap_or(0).cmp(
            &left.get("count").and_then(Value::as_i64).unwrap_or(0),
        )
    });

    let mut model_distribution_rows = model_counts
        .into_iter()
        .map(|(model, count)| json!({ "model": model, "count": count }))
        .collect::<Vec<_>>();
    model_distribution_rows.sort_by(|left, right| {
        right.get("count").and_then(Value::as_i64).unwrap_or(0).cmp(
            &left.get("count").and_then(Value::as_i64).unwrap_or(0),
        )
    });

    let mut model_rows = model_stats
        .into_iter()
        .map(|(model, (requests, tokens, usd))| {
            let cny = usd * fx.rate;
            json!({
                "model": model,
                "requests": requests,
                "tokens": tokens,
                "costUsd": round6(usd),
                "costCny": round6(cny),
                "displayCost": round6(if currency == "CNY" { cny } else { usd }),
            })
        })
        .collect::<Vec<_>>();
    model_rows.sort_by(|left, right| {
        right
            .get("displayCost")
            .and_then(Value::as_f64)
            .unwrap_or(0.0)
            .partial_cmp(&left.get("displayCost").and_then(Value::as_f64).unwrap_or(0.0))
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let source_coverage = query_source_coverage(&conn, &input.workspace_id)?;
    let pricing_rows = query_pricing_rows(&conn, &input.workspace_id, Some(currency.as_str()))?;

    Ok(json!({
        "window": {
            "startAt": start_at,
            "endAt": end_at,
            "days": if hourly_bucket { 0 } else { days },
        },
        "summary": {
            "requestCount": request_count,
            "billableRequestCount": billable_request_count,
            "incompleteCount": incomplete_count,
            "totalInputTokens": total_input_tokens,
            "totalOutputTokens": total_output_tokens,
            "totalTokens": total_tokens,
            "totalCostUsd": round6(total_cost_usd),
            "totalCostCny": round6(total_cost_cny),
            "displayCurrency": currency,
            "displayCost": round6(display_cost),
            "fxRateUsdCny": fx.rate,
            "fxStale": fx.stale,
            "fxFetchedAt": fx.fetched_at,
            "fxSource": fx.source,
        },
        "trends": {
            "dailyCost": daily_cost_rows,
            "dailyTokens": daily_token_rows,
            "statusDistribution": status_rows,
            "modelDistribution": model_distribution_rows,
            "modelCostDistribution": model_rows,
        },
        "sourceCoverage": source_coverage,
        "pricing": {
            "rows": pricing_rows,
        }
    }))
}
