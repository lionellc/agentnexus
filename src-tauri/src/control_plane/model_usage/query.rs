use super::*;
use rusqlite::{params, types::Value as SqlValue};
use serde_json::json;

pub(super) fn build_facts_query(
    workspace_id: &str,
    start_at: &str,
    end_at: &str,
    agent_filter: Option<&str>,
    model_filter: Option<&str>,
    status_filter: Option<&str>,
    page: Option<(i64, Option<(String, String)>)>,
) -> (String, Vec<SqlValue>) {
    let mut sql = String::from(
        "SELECT called_at, id, agent, provider, model, input_tokens, output_tokens, is_complete, status, source, source_path, session_id, request_id
         FROM model_call_facts
         WHERE workspace_id = ?1 AND called_at >= ?2 AND called_at <= ?3",
    );
    let mut params = vec![
        SqlValue::Text(workspace_id.to_string()),
        SqlValue::Text(start_at.to_string()),
        SqlValue::Text(end_at.to_string()),
    ];
    append_fact_filters(
        &mut sql,
        &mut params,
        agent_filter,
        model_filter,
        status_filter,
    );
    if let Some((_, Some((cursor_ts, cursor_id)))) = page.as_ref() {
        sql.push_str(" AND (called_at < ? OR (called_at = ? AND id < ?))");
        params.push(SqlValue::Text(cursor_ts.clone()));
        params.push(SqlValue::Text(cursor_ts.clone()));
        params.push(SqlValue::Text(cursor_id.clone()));
    }
    sql.push_str(" ORDER BY called_at DESC, id DESC");
    if let Some((limit, _)) = page {
        sql.push_str(" LIMIT ?");
        params.push(SqlValue::Integer(limit));
    }
    (sql, params)
}

pub(super) fn build_facts_count_query(
    workspace_id: &str,
    start_at: &str,
    end_at: &str,
    agent_filter: Option<&str>,
    model_filter: Option<&str>,
    status_filter: Option<&str>,
) -> (String, Vec<SqlValue>) {
    let mut sql = String::from(
        "SELECT COUNT(1)
         FROM model_call_facts
         WHERE workspace_id = ?1 AND called_at >= ?2 AND called_at <= ?3",
    );
    let mut params = vec![
        SqlValue::Text(workspace_id.to_string()),
        SqlValue::Text(start_at.to_string()),
        SqlValue::Text(end_at.to_string()),
    ];
    append_fact_filters(
        &mut sql,
        &mut params,
        agent_filter,
        model_filter,
        status_filter,
    );
    (sql, params)
}

fn append_fact_filters(
    sql: &mut String,
    params: &mut Vec<SqlValue>,
    agent_filter: Option<&str>,
    model_filter: Option<&str>,
    status_filter: Option<&str>,
) {
    if let Some(agent) = agent_filter {
        sql.push_str(" AND agent = ?");
        params.push(SqlValue::Text(agent.to_string()));
    }
    if let Some(model) = model_filter {
        sql.push_str(" AND model = ?");
        params.push(SqlValue::Text(model.to_string()));
    }
    if let Some(status) = status_filter {
        sql.push_str(" AND status = ?");
        params.push(SqlValue::Text(status.to_string()));
    }
}

pub(super) fn query_source_coverage(
    conn: &Connection,
    workspace_id: &str,
) -> Result<Vec<Value>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT source, status, COUNT(1), MAX(updated_at)
         FROM model_call_source_status
         WHERE workspace_id = ?1
         GROUP BY source, status
         ORDER BY source ASC",
    )?;
    let rows = stmt.query_map(params![workspace_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i64>(2)?,
            row.get::<_, Option<String>>(3)?,
        ))
    })?;
    let mut coverage = Vec::new();
    for row in rows {
        let (source, status, count, updated_at) = row?;
        coverage.push(json!({
            "source": source,
            "status": status,
            "count": count,
            "updatedAt": updated_at,
        }));
    }
    Ok(coverage)
}

pub(super) fn calculate_row_cost_usd(
    conn: &Connection,
    workspace_id: &str,
    provider: &str,
    model: &str,
    called_at: &str,
    input_tokens: Option<i64>,
    output_tokens: Option<i64>,
) -> Result<f64, AppError> {
    let Some(pricing) = resolve_pricing_usd(conn, workspace_id, provider, model, called_at)? else {
        return Ok(0.0);
    };
    let input = input_tokens.unwrap_or(0) as f64;
    let output = output_tokens.unwrap_or(0) as f64;
    Ok((input / 1_000_000.0) * pricing.input_cost_per_million
        + (output / 1_000_000.0) * pricing.output_cost_per_million)
}

pub(super) fn round6(value: f64) -> f64 {
    (value * 1_000_000.0).round() / 1_000_000.0
}

pub(super) fn day_bucket(timestamp: &str) -> String {
    timestamp.split('T').next().unwrap_or(timestamp).to_string()
}

pub(super) fn hour_bucket(timestamp: &str) -> String {
    if timestamp.len() >= 13 {
        return format!("{}:00", &timestamp[..13].replace('T', " "));
    }
    day_bucket(timestamp)
}
