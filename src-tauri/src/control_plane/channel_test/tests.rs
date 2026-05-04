use super::*;
use rusqlite::Connection;
use serde_json::json;
use std::{io::Read, thread, time::Duration};

fn setup_conn() -> Connection {
    let conn = Connection::open_in_memory().expect("open sqlite");
    conn.execute_batch(
        r#"
        CREATE TABLE workspaces (
            id TEXT PRIMARY KEY,
            root_path TEXT NOT NULL
        );
        CREATE TABLE migration_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE channel_api_test_runs (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            started_at TEXT NOT NULL,
            completed_at TEXT NOT NULL,
            protocol TEXT NOT NULL,
            model TEXT NOT NULL,
            base_url_display TEXT NOT NULL,
            category TEXT NOT NULL,
            case_id TEXT NOT NULL,
            run_mode TEXT NOT NULL DEFAULT 'standard',
            stream INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL,
            error_reason TEXT,
            http_status INTEGER,
            total_duration_ms INTEGER NOT NULL DEFAULT 0,
            first_token_ms INTEGER,
            first_metric_kind TEXT NOT NULL,
            input_size INTEGER NOT NULL DEFAULT 0,
            input_size_source TEXT NOT NULL,
            output_size INTEGER NOT NULL DEFAULT 0,
            output_size_source TEXT NOT NULL,
            response_text TEXT,
            response_json_excerpt TEXT,
            raw_error_excerpt TEXT,
            usage_json TEXT,
            conversation_json TEXT,
            checks_json TEXT NOT NULL,
            rounds_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE channel_api_test_cases (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            category TEXT NOT NULL,
            label TEXT NOT NULL,
            messages_json TEXT NOT NULL,
            rounds_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        INSERT INTO workspaces(id, root_path) VALUES ('workspace-1', '/tmp/ws');
        INSERT INTO workspaces(id, root_path) VALUES ('global', '/tmp/global');
        "#,
    )
    .expect("schema");
    conn
}

#[test]
fn query_runs_returns_descending_page() {
    let conn = setup_conn();
    let checks = serde_json::to_string(&Vec::<ChannelApiTestCheck>::new()).expect("checks");
    let rounds = serde_json::to_string(&Vec::<ChannelApiTestRoundResult>::new()).expect("rounds");
    for idx in 1..=3 {
        conn.execute(
            "INSERT INTO channel_api_test_runs(
                id, workspace_id, started_at, completed_at, protocol, model, base_url_display,
                category, case_id, run_mode, stream, status, total_duration_ms, first_metric_kind,
                input_size, input_size_source, output_size, output_size_source, checks_json,
                rounds_json, created_at
            ) VALUES (?1, 'workspace-1', ?2, ?2, 'openai', 'gpt', 'https://api.example.com',
                'small', 'case', 'standard', 0, 'success', 1, 'first_response', 1, 'chars', 1, 'chars',
                ?3, ?4, ?2)",
            rusqlite::params![
                format!("run-{idx}"),
                format!("2026-05-02T00:00:0{idx}Z"),
                checks,
                rounds
            ],
        )
        .expect("insert");
    }

    let result = query::query_runs(&conn, "workspace-1", 1, 2).expect("query");
    let items = result
        .get("items")
        .and_then(Value::as_array)
        .expect("items");
    assert_eq!(result.get("total").and_then(Value::as_i64), Some(3));
    assert_eq!(items.len(), 2);
    assert_eq!(items[0].get("id").and_then(Value::as_str), Some("run-3"));
    assert_eq!(items[1].get("id").and_then(Value::as_str), Some("run-2"));
}

#[test]
fn custom_case_can_be_upserted_and_queried() {
    let conn = setup_conn();
    let input = ChannelApiTestCaseUpsertInput {
        id: None,
        category: CATEGORY_SMALL.to_string(),
        label: "我的短答题".to_string(),
        messages: Some(vec![ChannelApiTestMessageInput {
            role: "user".to_string(),
            content: "回答 ok".to_string(),
        }]),
        rounds: None,
    };

    let saved = persistence::upsert_custom_case(&conn, &input).expect("upsert");
    let saved_id = saved.get("id").and_then(Value::as_str).expect("id");
    let result =
        persistence::query_custom_cases(&conn, crate::domain::models::APP_SCOPE_ID).expect("query");
    let items = result.as_array().expect("items");

    assert_eq!(items.len(), 1);
    assert_eq!(items[0].get("id").and_then(Value::as_str), Some(saved_id));
    assert_eq!(
        items[0].get("label").and_then(Value::as_str),
        Some("我的短答题")
    );
}

#[test]
fn default_cases_are_seeded_once_per_workspace() {
    let conn = setup_conn();

    persistence::seed_default_cases_once(&conn, "workspace-1").expect("seed");
    let first = persistence::query_custom_cases(&conn, "workspace-1").expect("query");
    let first_items = first.as_array().expect("items");
    assert!(first_items.len() >= 4);
    assert!(first_items
        .iter()
        .any(|item| item.get("id").and_then(Value::as_str) == Some("small-basic")));

    persistence::delete_custom_case(&conn, "workspace-1", "small-basic").expect("delete");
    persistence::seed_default_cases_once(&conn, "workspace-1").expect("seed again");
    let second = persistence::query_custom_cases(&conn, "workspace-1").expect("query");
    let second_items = second.as_array().expect("items");
    assert!(!second_items
        .iter()
        .any(|item| item.get("id").and_then(Value::as_str) == Some("small-basic")));
}

#[test]
fn persist_run_masks_key_by_not_storing_it() {
    let conn = setup_conn();
    let record = ChannelApiTestRunRecord {
        id: "run-1".to_string(),
        workspace_id: "workspace-1".to_string(),
        started_at: "2026-05-02T00:00:00Z".to_string(),
        completed_at: "2026-05-02T00:00:01Z".to_string(),
        protocol: PROTOCOL_OPENAI.to_string(),
        model: "gpt".to_string(),
        base_url_display: "https://api.example.com".to_string(),
        category: CATEGORY_SMALL.to_string(),
        case_id: "small-basic".to_string(),
        run_mode: RUN_MODE_STANDARD.to_string(),
        stream: false,
        status: STATUS_SUCCESS.to_string(),
        error_reason: None,
        http_status: Some(200),
        total_duration_ms: 1,
        first_token_ms: Some(1),
        first_metric_kind: FIRST_RESPONSE.to_string(),
        input_size: 1,
        input_size_source: SIZE_CHARS.to_string(),
        output_size: 1,
        output_size_source: SIZE_CHARS.to_string(),
        response_text: Some("ok".to_string()),
        response_json_excerpt: Some("{\"ok\":true}".to_string()),
        raw_error_excerpt: None,
        usage_json: None,
        conversation_json: Some(json!({ "requests": [], "responses": [] }).to_string()),
        checks: Vec::new(),
        rounds: Vec::new(),
    };

    persistence::persist_run(&conn, &record).expect("persist");
    let dumped: String = conn
        .query_row(
            "SELECT group_concat(COALESCE(response_text, '') || COALESCE(response_json_excerpt, '') || COALESCE(raw_error_excerpt, ''), '')
             FROM channel_api_test_runs",
            [],
            |row| row.get(0),
        )
        .expect("dump");
    assert!(!dumped.contains("sk-secret"));
    assert!(!dumped.contains("Authorization"));
}

#[test]
fn parse_openai_json_extracts_usage_and_text() {
    let response = openai::parse_openai_json_for_test(
        r#"{
          "model": "gpt-4.1-mini",
          "choices": [{"message": {"content": "pong"}, "finish_reason": "stop"}],
          "usage": {"prompt_tokens": 3, "completion_tokens": 5}
        }"#,
    );

    assert_eq!(response.model.as_deref(), Some("gpt-4.1-mini"));
    assert_eq!(response.text, "pong");
    assert_eq!(response.finish_reason.as_deref(), Some("stop"));
    assert_eq!(
        response
            .usage
            .as_ref()
            .and_then(|v| v.get("completion_tokens"))
            .and_then(Value::as_i64),
        Some(5)
    );
}

#[test]
fn parse_anthropic_json_extracts_usage_and_text() {
    let response = anthropic::parse_anthropic_json_for_test(
        r#"{
          "model": "claude-sonnet-4-5",
          "content": [{"type": "text", "text": "pong"}],
          "stop_reason": "end_turn",
          "usage": {"input_tokens": 3, "output_tokens": 5}
        }"#,
    );

    assert_eq!(response.model.as_deref(), Some("claude-sonnet-4-5"));
    assert_eq!(response.text, "pong");
    assert_eq!(response.finish_reason.as_deref(), Some("end_turn"));
    assert_eq!(
        response
            .usage
            .as_ref()
            .and_then(|v| v.get("output_tokens"))
            .and_then(Value::as_i64),
        Some(5)
    );
}

#[test]
fn openai_and_anthropic_request_bodies_include_max_tokens() {
    let input = ChannelApiTestRunInput {
        max_tokens: Some(2048),
        ..test_input("claude-sonnet-4-5")
    };
    let messages = input.messages.as_ref().expect("messages");

    let openai_body = openai::request_body_for_test(&input, messages);
    let anthropic_body = anthropic::request_body_for_test(&input, messages);

    assert_eq!(
        openai_body.get("max_tokens").and_then(Value::as_i64),
        Some(2048)
    );
    assert_eq!(
        anthropic_body.get("max_tokens").and_then(Value::as_i64),
        Some(2048)
    );
}

#[test]
fn parse_bedrock_event_stream_extracts_timeline_usage_and_text() {
    let bytes = [
        bedrock_frame(
            "messageStart",
            json!({ "messageStart": { "role": "assistant" } }),
        ),
        bedrock_frame(
            "contentBlockDelta",
            json!({
                "contentBlockDelta": { "delta": { "text": "pong" } }
            }),
        ),
        bedrock_frame(
            "messageStop",
            json!({ "messageStop": { "stopReason": "end_turn" } }),
        ),
        bedrock_frame(
            "metadata",
            json!({
                "metadata": {
                    "usage": { "inputTokens": 3, "outputTokens": 5, "totalTokens": 8 },
                    "metrics": { "latencyMs": 321 }
                }
            }),
        ),
    ]
    .concat();

    let events = bedrock::parse_event_stream_for_test(&bytes).expect("parse");
    let response = bedrock::response_from_events_for_test(events);

    assert_eq!(response.text, "pong");
    assert_eq!(response.first_metric_kind, FIRST_TOKEN);
    assert_eq!(response.finish_reason.as_deref(), Some("end_turn"));
    assert_eq!(
        response
            .usage
            .as_ref()
            .and_then(|value| value.get("outputTokens"))
            .and_then(Value::as_i64),
        Some(5)
    );
    let bedrock = response.bedrock.as_ref().expect("bedrock details");
    assert_eq!(bedrock.get("latencyMs").and_then(Value::as_i64), Some(321));
    assert_eq!(
        bedrock
            .get("eventCounts")
            .and_then(|value| value.get("contentBlockDelta"))
            .and_then(Value::as_i64),
        Some(1)
    );
}

#[test]
fn bedrock_stream_timestamps_events_while_reading() {
    let bytes = [
        bedrock_frame(
            "messageStart",
            json!({ "messageStart": { "role": "assistant" } }),
        ),
        bedrock_frame(
            "contentBlockDelta",
            json!({
                "contentBlockDelta": { "delta": { "text": "pong" } }
            }),
        ),
        bedrock_frame(
            "messageStop",
            json!({ "messageStop": { "stopReason": "end_turn" } }),
        ),
    ]
    .concat();
    let mut reader = SlowChunks::new(bytes, 28, Duration::from_millis(8));

    let response = bedrock::response_from_reader_for_test(&mut reader).expect("stream response");

    let first = response.first_token_ms.expect("first token");
    let completed = response.completed_ms.expect("completed");
    assert!(first < completed, "first={first} completed={completed}");
    let bedrock = response.bedrock.as_ref().expect("bedrock details");
    let timeline = bedrock
        .get("timeline")
        .and_then(Value::as_array)
        .expect("timeline");
    let first_event = timeline
        .first()
        .and_then(|item| item.get("observedMs"))
        .and_then(Value::as_i64)
        .expect("first event");
    let last_event = timeline
        .last()
        .and_then(|item| item.get("observedMs"))
        .and_then(Value::as_i64)
        .expect("last event");
    assert!(first_event <= first);
    assert!(last_event <= completed);
}

#[test]
fn parse_bedrock_event_stream_rejects_invalid_frame_length() {
    let mut bytes = bedrock_frame("messageStart", json!({ "messageStart": {} }));
    bytes[0] = 0;
    bytes[1] = 0;
    bytes[2] = 0;
    bytes[3] = 4;

    let result = bedrock::parse_event_stream_for_test(&bytes);

    assert!(result.is_err());
}

#[test]
fn bedrock_stream_exception_returns_failed_response_without_token() {
    let bytes = bedrock_frame(
        "modelStreamErrorException",
        json!({ "message": "upstream failed without secret" }),
    );
    let events = bedrock::parse_event_stream_for_test(&bytes).expect("parse");
    let response = bedrock::response_from_events_for_test(events);

    assert!(response
        .error_reason
        .as_deref()
        .unwrap_or_default()
        .contains("modelStreamErrorException"));
    assert!(!response.raw_excerpt.contains("bedrock-secret"));
}

#[test]
fn build_checks_marks_empty_response_failed() {
    let response = ProtocolResponse {
        http_status: Some(200),
        model: Some("gpt".to_string()),
        text: String::new(),
        raw_excerpt: String::new(),
        usage: Some(json!({ "prompt_tokens": 1 })),
        finish_reason: Some("stop".to_string()),
        first_metric_kind: FIRST_RESPONSE.to_string(),
        first_token_ms: Some(1),
        error_reason: None,
        request_json: Value::Null,
        response_json: Value::Null,
        header_ms: Some(1),
        first_event_ms: None,
        first_text_delta_ms: None,
        completed_ms: Some(1),
        response_headers: Value::Null,
        bedrock: None,
    };
    let checks = checks::build_checks(&response, "gpt");
    assert!(checks
        .iter()
        .any(|check| check.id == "non_empty_response" && check.status == "fail"));
}

#[test]
fn build_checks_flags_model_rewrite() {
    let response = ProtocolResponse {
        http_status: Some(200),
        model: Some("claude-haiku".to_string()),
        text: "ok".to_string(),
        raw_excerpt: String::new(),
        usage: Some(json!({ "prompt_tokens": 1 })),
        finish_reason: Some("stop".to_string()),
        first_metric_kind: FIRST_RESPONSE.to_string(),
        first_token_ms: Some(1),
        error_reason: None,
        request_json: Value::Null,
        response_json: Value::Null,
        header_ms: Some(1),
        first_event_ms: None,
        first_text_delta_ms: None,
        completed_ms: Some(1),
        response_headers: Value::Null,
        bedrock: None,
    };
    let checks = checks::build_checks(&response, "claude-sonnet");

    assert!(checks.iter().any(|check| {
        check.id == "model_rewrite"
            && check.status == "warn"
            && check
                .detail
                .as_deref()
                .unwrap_or_default()
                .contains("疑似模型被改写")
    }));
}

#[test]
fn attribution_report_marks_same_model_as_not_proof() {
    let input = test_input("gpt-4.1-mini");
    let response = test_response(Some("gpt-4.1-mini"), json!({}));
    let report = attribution::build_attribution_report(&input, &[response], None);
    let model_rewrite = report.get("modelRewrite").expect("model rewrite");

    assert_eq!(
        model_rewrite.get("status").and_then(Value::as_str),
        Some("same_field")
    );
    assert!(model_rewrite
        .get("note")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .contains("不能证明"));
}

#[test]
fn sampling_summary_detects_multiple_clusters() {
    let first = test_response(Some("gpt"), json!({ "server": "a", "x-request-id": "1" }));
    let second = test_response(Some("gpt"), json!({ "server": "b", "x-request-id": "2" }));
    let summary = attribution::sampling_summary(&[first, second]);

    assert_eq!(summary.get("clusterCount").and_then(Value::as_i64), Some(2));
    assert!(summary
        .get("label")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .contains("疑似多路由"));
}

#[test]
fn sanitize_text_masks_api_key_and_auth_labels() {
    let sanitized = checks::sanitize_text(
        "Authorization: Bearer sk-secret x-api-key: sk-secret",
        "sk-secret",
    );

    assert!(!sanitized.contains("sk-secret"));
    assert!(!sanitized.contains("Authorization"));
    assert!(!sanitized.contains("x-api-key"));
}

fn test_input(model: &str) -> ChannelApiTestRunInput {
    ChannelApiTestRunInput {
        protocol: PROTOCOL_OPENAI.to_string(),
        model: model.to_string(),
        base_url: "https://api.openai.com".to_string(),
        api_key: "sk-secret".to_string(),
        stream: false,
        region: None,
        max_tokens: None,
        timeout_ms: None,
        category: CATEGORY_SMALL.to_string(),
        case_id: "small-basic".to_string(),
        run_mode: None,
        messages: Some(vec![ChannelApiTestMessageInput {
            role: "user".to_string(),
            content: "ping".to_string(),
        }]),
        rounds: None,
    }
}

fn bedrock_frame(event_type: &str, payload: Value) -> Vec<u8> {
    let mut headers = Vec::new();
    push_header(&mut headers, ":event-type", event_type);
    let payload = payload.to_string().into_bytes();
    let total_len = 12 + headers.len() + payload.len() + 4;
    let mut bytes = Vec::new();
    bytes.extend_from_slice(&(total_len as u32).to_be_bytes());
    bytes.extend_from_slice(&(headers.len() as u32).to_be_bytes());
    bytes.extend_from_slice(&[0, 0, 0, 0]);
    bytes.extend_from_slice(&headers);
    bytes.extend_from_slice(&payload);
    bytes.extend_from_slice(&[0, 0, 0, 0]);
    bytes
}

fn push_header(bytes: &mut Vec<u8>, name: &str, value: &str) {
    bytes.push(name.len() as u8);
    bytes.extend_from_slice(name.as_bytes());
    bytes.push(7);
    bytes.extend_from_slice(&(value.len() as u16).to_be_bytes());
    bytes.extend_from_slice(value.as_bytes());
}

fn test_response(model: Option<&str>, response_headers: Value) -> ProtocolResponse {
    ProtocolResponse {
        http_status: Some(200),
        model: model.map(str::to_string),
        text: "ok".to_string(),
        raw_excerpt: String::new(),
        usage: Some(json!({ "prompt_tokens": 1, "completion_tokens": 1 })),
        finish_reason: Some("stop".to_string()),
        first_metric_kind: FIRST_RESPONSE.to_string(),
        first_token_ms: Some(1),
        error_reason: None,
        request_json: Value::Null,
        response_json: Value::Null,
        header_ms: Some(1),
        first_event_ms: None,
        first_text_delta_ms: None,
        completed_ms: Some(1),
        response_headers,
        bedrock: None,
    }
}

struct SlowChunks {
    bytes: Vec<u8>,
    offset: usize,
    chunk_size: usize,
    delay: Duration,
}

impl SlowChunks {
    fn new(bytes: Vec<u8>, chunk_size: usize, delay: Duration) -> Self {
        Self {
            bytes,
            offset: 0,
            chunk_size,
            delay,
        }
    }
}

impl Read for SlowChunks {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        if self.offset >= self.bytes.len() {
            return Ok(0);
        }
        thread::sleep(self.delay);
        let size = self
            .chunk_size
            .min(buf.len())
            .min(self.bytes.len() - self.offset);
        buf[..size].copy_from_slice(&self.bytes[self.offset..self.offset + size]);
        self.offset += size;
        Ok(size)
    }
}
