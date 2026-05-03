use super::*;
use chrono::{DateTime, FixedOffset};
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
        "SELECT called_at, id, agent, provider, model, input_tokens, output_tokens, is_complete, status, source, source_path, session_id, request_id, total_duration_ms, first_token_ms
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

pub(super) fn clamp_timezone_offset_minutes(offset: Option<i64>) -> i64 {
    offset.unwrap_or(0).clamp(-14 * 60, 14 * 60)
}

pub(super) fn average_ms(total: i64, count: i64) -> Option<i64> {
    if count <= 0 {
        return None;
    }
    Some(((total as f64) / (count as f64)).round() as i64)
}

pub(super) fn day_bucket(timestamp: &str, timezone_offset_minutes: i64) -> String {
    let Ok(parsed) = DateTime::parse_from_rfc3339(timestamp) else {
        return timestamp.split('T').next().unwrap_or(timestamp).to_string();
    };
    let offset_seconds = (timezone_offset_minutes * 60) as i32;
    let Some(offset) = FixedOffset::east_opt(offset_seconds) else {
        return parsed.date_naive().to_string();
    };
    parsed.with_timezone(&offset).format("%Y-%m-%d").to_string()
}

pub(super) fn hour_bucket(timestamp: &str, timezone_offset_minutes: i64) -> String {
    let Ok(parsed) = DateTime::parse_from_rfc3339(timestamp) else {
        if timestamp.len() >= 13 {
            return format!("{}:00", &timestamp[..13].replace('T', " "));
        }
        return day_bucket(timestamp, timezone_offset_minutes);
    };
    let offset_seconds = (timezone_offset_minutes * 60) as i32;
    let Some(offset) = FixedOffset::east_opt(offset_seconds) else {
        return parsed.format("%Y-%m-%d %H:00").to_string();
    };
    parsed
        .with_timezone(&offset)
        .format("%Y-%m-%d %H:00")
        .to_string()
}

#[cfg(test)]
mod query_tests {
    use super::*;

    #[test]
    fn buckets_use_user_timezone_offset() {
        assert_eq!(day_bucket("2026-04-20T18:30:00Z", 8 * 60), "2026-04-21");
        assert_eq!(hour_bucket("2026-04-20T18:30:00Z", 8 * 60), "2026-04-21 02:00");
    }
}
