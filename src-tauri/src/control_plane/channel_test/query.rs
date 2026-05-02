use super::*;
use rusqlite::params;

pub(super) fn query_runs(
    conn: &Connection,
    workspace_id: &str,
    page: i64,
    page_size: i64,
) -> Result<Value, AppError> {
    let page = page.clamp(1, 10_000);
    let page_size = page_size.clamp(1, 100);
    let offset = (page - 1) * page_size;
    let total: i64 = conn.query_row(
        "SELECT COUNT(1) FROM channel_api_test_runs WHERE workspace_id = ?1",
        params![workspace_id],
        |row| row.get(0),
    )?;

    let mut stmt = conn.prepare(
        "SELECT
            id,
            workspace_id,
            started_at,
            completed_at,
            protocol,
            model,
            base_url_display,
            category,
            case_id,
            run_mode,
            stream,
            status,
            error_reason,
            http_status,
            total_duration_ms,
            first_token_ms,
            first_metric_kind,
            input_size,
            input_size_source,
            output_size,
            output_size_source,
            response_text,
            response_json_excerpt,
            raw_error_excerpt,
            usage_json,
            conversation_json,
            checks_json,
            rounds_json
         FROM channel_api_test_runs
         WHERE workspace_id = ?1
         ORDER BY started_at DESC, id DESC
         LIMIT ?2 OFFSET ?3",
    )?;
    let rows = stmt.query_map(params![workspace_id, page_size, offset], |row| {
        let checks_json: String = row.get(26)?;
        let rounds_json: String = row.get(27)?;
        let checks =
            serde_json::from_str::<Vec<ChannelApiTestCheck>>(&checks_json).unwrap_or_default();
        let rounds = serde_json::from_str::<Vec<ChannelApiTestRoundResult>>(&rounds_json)
            .unwrap_or_default();
        Ok(ChannelApiTestRunRecord {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            started_at: row.get(2)?,
            completed_at: row.get(3)?,
            protocol: row.get(4)?,
            model: row.get(5)?,
            base_url_display: row.get(6)?,
            category: row.get(7)?,
            case_id: row.get(8)?,
            run_mode: row.get(9)?,
            stream: row.get::<_, i64>(10)? == 1,
            status: row.get(11)?,
            error_reason: row.get(12)?,
            http_status: row.get(13)?,
            total_duration_ms: row.get(14)?,
            first_token_ms: row.get(15)?,
            first_metric_kind: row.get(16)?,
            input_size: row.get(17)?,
            input_size_source: row.get(18)?,
            output_size: row.get(19)?,
            output_size_source: row.get(20)?,
            response_text: row.get(21)?,
            response_json_excerpt: row.get(22)?,
            raw_error_excerpt: row.get(23)?,
            usage_json: row.get(24)?,
            conversation_json: row.get(25)?,
            checks,
            rounds,
        })
    })?;

    let mut items = Vec::new();
    for row in rows {
        items.push(persistence::record_to_value(&row?));
    }

    Ok(json!({
        "items": items,
        "total": total,
        "page": page,
        "pageSize": page_size,
    }))
}
