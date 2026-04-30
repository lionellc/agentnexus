use super::{
    build_parse_failure_summary, cleanup_legacy_codex_session_rows, discover_session_files,
    extract_model_usage_event, parse_session_file, persist_events, resolve_pricing_usd,
    should_parse_incremental_file, truncate_text, AgentRootDirScope, ModelUsageFactDraft,
    ParseFailureEvent, SessionFile, WorkspaceScope, AGENT_CODEX, SOURCE_SESSION_JSONL,
};
use crate::utils::sha256_hex;
use chrono::{Duration, Utc};
use rusqlite::{params, Connection};
use serde_json::json;
use std::collections::HashMap;
use std::fs;
use tempfile::tempdir;

#[test]
fn truncate_text_handles_utf8_char_boundary() {
    let text = "abc发票xyz";
    assert_eq!(truncate_text(text, 5), "abc");
    assert_eq!(truncate_text(text, 6), "abc发");
}

#[test]
fn build_parse_failure_summary_contains_top_reasons() {
    let mut counts = std::collections::HashMap::new();
    counts.insert("json-parse-failed".to_string(), 3_u64);
    counts.insert("file-parse-failed".to_string(), 2_u64);
    counts.insert("token-missing".to_string(), 1_u64);
    let summary = build_parse_failure_summary(6, &counts);
    assert!(summary.contains("发现 6 条模型使用解析异常"));
    assert!(summary.contains("json-parse-failed ×3"));
}

#[test]
fn discover_session_files_reads_from_enabled_agent_root_dir() {
    let workspace_dir = tempdir().expect("workspace temp dir");
    let codex_dir = tempdir().expect("codex temp dir");
    let session_root = codex_dir.path().join("sessions/2026/04");
    fs::create_dir_all(&session_root).expect("create session dir");
    let session_file = session_root.join("session-a.jsonl");
    fs::write(
        &session_file,
        r#"{"timestamp":"2026-04-21T10:00:00Z","payload":{"response":{"model":"gpt-4.1-mini"},"usage":{"input_tokens":1,"output_tokens":1}}}"#,
    )
    .expect("write session file");

    let workspace_scope = WorkspaceScope {
        id: "workspace-1".to_string(),
        root_path: workspace_dir.path().to_string_lossy().to_string(),
    };
    let roots = vec![AgentRootDirScope {
        agent: AGENT_CODEX.to_string(),
        root_dir: codex_dir.path().to_string_lossy().to_string(),
    }];

    let (files, issues) = discover_session_files(&workspace_scope, &roots);
    assert!(issues.is_empty());
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].path, session_file.to_string_lossy().to_string());
}

#[test]
fn discover_session_files_supports_home_root_dir_for_codex() {
    let workspace_dir = tempdir().expect("workspace temp dir");
    let home_dir = tempdir().expect("home temp dir");
    let session_root = home_dir.path().join(".codex/sessions");
    fs::create_dir_all(&session_root).expect("create session dir");
    let session_file = session_root.join("session-b.jsonl");
    fs::write(
        &session_file,
        r#"{"timestamp":"2026-04-21T10:00:00Z","payload":{"response":{"model":"gpt-4.1-mini"},"usage":{"input_tokens":1,"output_tokens":1}}}"#,
    )
    .expect("write session file");

    let workspace_scope = WorkspaceScope {
        id: "workspace-1".to_string(),
        root_path: workspace_dir.path().to_string_lossy().to_string(),
    };
    let roots = vec![AgentRootDirScope {
        agent: AGENT_CODEX.to_string(),
        root_dir: home_dir.path().to_string_lossy().to_string(),
    }];

    let (files, _issues) = discover_session_files(&workspace_scope, &roots);
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].path, session_file.to_string_lossy().to_string());
}

#[test]
fn should_parse_incremental_file_only_reprocesses_new_or_modified_files() {
    let temp = tempdir().expect("create temp dir");
    let session_file = temp.path().join("session-incremental.jsonl");
    fs::write(&session_file, "{}").expect("write jsonl");
    let file = SessionFile {
        agent: AGENT_CODEX.to_string(),
        source: SOURCE_SESSION_JSONL.to_string(),
        path: session_file.to_string_lossy().to_string(),
    };

    let empty_status = HashMap::new();
    assert!(should_parse_incremental_file(&file, &empty_status));

    let mut old_status = HashMap::new();
    old_status.insert(
        file.path.clone(),
        (Utc::now() - Duration::days(1)).to_rfc3339(),
    );
    assert!(should_parse_incremental_file(&file, &old_status));

    let mut future_status = HashMap::new();
    future_status.insert(
        file.path.clone(),
        (Utc::now() + Duration::days(1)).to_rfc3339(),
    );
    assert!(!should_parse_incremental_file(&file, &future_status));
}

#[test]
fn extract_model_usage_event_reads_nested_payload_usage() {
    let value = json!({
        "timestamp": "2026-04-21T10:00:00Z",
        "payload": {
            "provider": "openai",
            "response": { "model": "gpt-4.1-mini", "status": "completed" },
            "usage": { "input_tokens": 1200, "output_tokens": 300 }
        }
    });
    let event = extract_model_usage_event(&value).expect("should extract");
    assert_eq!(event.provider, "openai");
    assert_eq!(event.model, "gpt-4.1-mini");
    assert_eq!(event.input_tokens, Some(1200));
    assert_eq!(event.output_tokens, Some(300));
}

#[test]
fn parse_session_file_codex_skips_turn_context_events() {
    let temp = tempdir().expect("create temp dir");
    let session_file = temp.path().join("session-codex-turn-context-only.jsonl");
    fs::write(
        &session_file,
        r#"{"timestamp":"2026-04-21T10:00:00Z","type":"session_meta","payload":{"id":"session-codex-1"}}
{"timestamp":"2026-04-21T10:00:01Z","type":"turn_context","payload":{"model":"gpt-5.4"}}"#,
    )
    .expect("write jsonl");

    let parsed = parse_session_file(
        &SessionFile {
            agent: AGENT_CODEX.to_string(),
            source: SOURCE_SESSION_JSONL.to_string(),
            path: session_file.to_string_lossy().to_string(),
        },
        "workspace-1",
    )
    .expect("parse");

    assert_eq!(parsed.parsed_events, 0);
    assert!(parsed.facts.is_empty());
}

#[test]
fn parse_session_file_codex_extracts_token_count_delta() {
    let temp = tempdir().expect("create temp dir");
    let session_file = temp.path().join("session-codex-token-count.jsonl");
    fs::write(
        &session_file,
        r#"{"timestamp":"2026-04-21T10:00:00Z","type":"session_meta","payload":{"id":"session-codex-2"}}
{"timestamp":"2026-04-21T10:00:01Z","type":"turn_context","payload":{"model":"openai/gpt-5.4-2026-04-10"}}
{"timestamp":"2026-04-21T10:00:02Z","type":"event_msg","payload":{"type":"token_count","info":null}}
{"timestamp":"2026-04-21T10:00:03Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":100,"output_tokens":10}}}}
{"timestamp":"2026-04-21T10:00:04Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":150,"output_tokens":40}}}}
{"timestamp":"2026-04-21T10:00:05Z","type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":20,"output_tokens":5}}}}"#,
    )
    .expect("write jsonl");

    let parsed = parse_session_file(
        &SessionFile {
            agent: AGENT_CODEX.to_string(),
            source: SOURCE_SESSION_JSONL.to_string(),
            path: session_file.to_string_lossy().to_string(),
        },
        "workspace-1",
    )
    .expect("parse");

    assert_eq!(parsed.parsed_events, 3);
    assert_eq!(parsed.facts.len(), 3);

    assert_eq!(parsed.facts[0].input_tokens, Some(100));
    assert_eq!(parsed.facts[0].output_tokens, Some(10));
    assert_eq!(
        parsed.facts[0].request_id.as_deref(),
        Some("codex_session:session-codex-2:1")
    );
    assert_eq!(parsed.facts[0].model, "gpt-5.4");
    assert_eq!(parsed.facts[0].status, "success");
    assert_eq!(parsed.facts[0].session_id, "session-codex-2");

    assert_eq!(parsed.facts[1].input_tokens, Some(50));
    assert_eq!(parsed.facts[1].output_tokens, Some(30));
    assert_eq!(
        parsed.facts[1].request_id.as_deref(),
        Some("codex_session:session-codex-2:2")
    );

    assert_eq!(parsed.facts[2].input_tokens, Some(20));
    assert_eq!(parsed.facts[2].output_tokens, Some(5));
    assert_eq!(
        parsed.facts[2].request_id.as_deref(),
        Some("codex_session:session-codex-2:3")
    );
}

#[test]
fn cleanup_legacy_codex_session_rows_removes_null_request_rows() {
    let conn = Connection::open_in_memory().expect("open sqlite");
    conn.execute_batch(
        r#"
        CREATE TABLE model_call_facts (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            agent TEXT NOT NULL,
            source TEXT NOT NULL,
            request_id TEXT
        );
        "#,
    )
    .expect("create model_call_facts");

    conn.execute(
        "INSERT INTO model_call_facts(id, workspace_id, agent, source, request_id)
         VALUES ('1', 'workspace-1', 'codex', 'session_jsonl', NULL)",
        [],
    )
    .expect("insert legacy codex row");
    conn.execute(
        "INSERT INTO model_call_facts(id, workspace_id, agent, source, request_id)
         VALUES ('2', 'workspace-1', 'codex', 'session_jsonl', 'codex_session:s1:1')",
        [],
    )
    .expect("insert valid codex row");
    conn.execute(
        "INSERT INTO model_call_facts(id, workspace_id, agent, source, request_id)
         VALUES ('3', 'workspace-1', 'claude', 'session_jsonl', NULL)",
        [],
    )
    .expect("insert claude row");

    let deleted =
        cleanup_legacy_codex_session_rows(&conn, "workspace-1").expect("cleanup legacy rows");
    assert_eq!(deleted, 1);

    let remaining: i64 = conn
        .query_row("SELECT COUNT(*) FROM model_call_facts", [], |row| {
            row.get(0)
        })
        .expect("count remaining rows");
    assert_eq!(remaining, 2);
}

#[test]
fn persist_events_merges_duplicate_fact_with_non_empty_fields() {
    let mut conn = Connection::open_in_memory().expect("open sqlite");
    conn.execute_batch(
        r#"
        CREATE TABLE model_call_facts (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            called_at TEXT NOT NULL,
            agent TEXT NOT NULL,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            status TEXT NOT NULL,
            input_tokens INTEGER,
            output_tokens INTEGER,
            total_tokens INTEGER NOT NULL DEFAULT 0,
            is_complete INTEGER NOT NULL DEFAULT 0,
            source TEXT NOT NULL,
            source_path TEXT NOT NULL,
            session_id TEXT NOT NULL,
            event_ref TEXT NOT NULL,
            request_id TEXT,
            attempt_key TEXT,
            raw_payload TEXT NOT NULL,
            dedupe_key TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE model_call_parse_failures (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            source TEXT NOT NULL,
            source_path TEXT NOT NULL,
            reason TEXT NOT NULL,
            raw_excerpt TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE model_call_source_status (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            source TEXT NOT NULL,
            source_path TEXT NOT NULL,
            status TEXT NOT NULL,
            error_message TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(workspace_id, source, source_path)
        );
        "#,
    )
    .expect("create tables");

    let dedupe_key = sha256_hex("workspace-1|req-1");
    let base = ModelUsageFactDraft {
        workspace_id: "workspace-1".to_string(),
        timestamp: "2026-04-21T10:00:00Z".to_string(),
        agent: "codex".to_string(),
        provider: "openai".to_string(),
        model: String::new(),
        status: "unknown".to_string(),
        input_tokens: Some(120),
        output_tokens: None,
        source: "session_jsonl".to_string(),
        source_path: "/tmp/session.jsonl".to_string(),
        session_id: "s1".to_string(),
        event_ref: "1:1".to_string(),
        request_id: Some("req-1".to_string()),
        attempt_key: None,
        raw_payload: "{}".to_string(),
        dedupe_key: dedupe_key.clone(),
    };
    let merged = ModelUsageFactDraft {
        model: "gpt-4.1".to_string(),
        status: "success".to_string(),
        output_tokens: Some(80),
        source: "instrumentation_event".to_string(),
        source_path: "/tmp/instrumentation.jsonl".to_string(),
        event_ref: "2:2".to_string(),
        ..base.clone()
    };

    persist_events(&mut conn, vec![base], Vec::<ParseFailureEvent>::new()).expect("insert base");
    persist_events(&mut conn, vec![merged], Vec::<ParseFailureEvent>::new()).expect("merge row");

    let row = conn
        .query_row(
            "SELECT model, status, input_tokens, output_tokens, is_complete, source
             FROM model_call_facts WHERE dedupe_key = ?1",
            params![dedupe_key],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<i64>>(2)?,
                    row.get::<_, Option<i64>>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, String>(5)?,
                ))
            },
        )
        .expect("query row");

    assert_eq!(row.0, "gpt-4.1");
    assert_eq!(row.1, "success");
    assert_eq!(row.2, Some(120));
    assert_eq!(row.3, Some(80));
    assert_eq!(row.4, 1);
    assert!(row.5.contains("session_jsonl"));
    assert!(row.5.contains("instrumentation_event"));
}

#[test]
fn resolve_pricing_usd_prefers_manual_override() {
    let conn = Connection::open_in_memory().expect("open sqlite");
    conn.execute_batch(
        r#"
        CREATE TABLE model_pricing_snapshots (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            currency TEXT NOT NULL,
            input_cost_per_million REAL NOT NULL,
            output_cost_per_million REAL NOT NULL,
            effective_from TEXT NOT NULL,
            snapshot_version TEXT NOT NULL,
            source TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE model_pricing_overrides (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            currency TEXT NOT NULL,
            input_cost_per_million REAL NOT NULL,
            output_cost_per_million REAL NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(workspace_id, provider, model, currency)
        );
        "#,
    )
    .expect("create pricing tables");

    conn.execute(
        "INSERT INTO model_pricing_snapshots(
            id, workspace_id, provider, model, currency, input_cost_per_million, output_cost_per_million, effective_from, snapshot_version, source, created_at
        ) VALUES ('1', 'workspace-1', 'openai', 'gpt-4.1', 'USD', 2, 8, '1970-01-01T00:00:00Z', 'builtin', 'builtin', '2026-04-21T00:00:00Z')",
        [],
    )
    .expect("insert snapshot");
    conn.execute(
        "INSERT INTO model_pricing_overrides(
            id, workspace_id, provider, model, currency, input_cost_per_million, output_cost_per_million, updated_at
        ) VALUES ('2', 'workspace-1', 'openai', 'gpt-4.1', 'USD', 4, 12, '2026-04-21T00:00:00Z')",
        [],
    )
    .expect("insert override");

    let pricing = resolve_pricing_usd(
        &conn,
        "workspace-1",
        "openai",
        "gpt-4.1",
        "2026-04-21T10:00:00Z",
    )
    .expect("resolve")
    .expect("pricing exists");
    assert_eq!(pricing.input_cost_per_million, 4.0);
    assert_eq!(pricing.output_cost_per_million, 12.0);
    assert_eq!(pricing.source, "manual_override");
}
