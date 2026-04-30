use rusqlite::{params, Connection};

use crate::{error::AppError, utils::now_rfc3339};

pub(super) fn run_model_usage_tables_migration_once(conn: &Connection) -> Result<(), AppError> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(1) FROM migration_meta WHERE key = 'migrate_model_usage_tables_v1'",
        [],
        |row| row.get(0),
    )?;
    if exists > 0 {
        return Ok(());
    }

    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS model_call_facts (
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
            updated_at TEXT NOT NULL,
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_model_call_facts_workspace_called_at
            ON model_call_facts(workspace_id, called_at DESC);

        CREATE INDEX IF NOT EXISTS idx_model_call_facts_workspace_agent_model_status
            ON model_call_facts(workspace_id, agent, model, status, called_at DESC);

        CREATE TABLE IF NOT EXISTS model_call_source_status (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            source TEXT NOT NULL,
            source_path TEXT NOT NULL,
            status TEXT NOT NULL,
            error_message TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL,
            UNIQUE(workspace_id, source, source_path),
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS model_call_parse_failures (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            source TEXT NOT NULL,
            source_path TEXT NOT NULL,
            reason TEXT NOT NULL,
            raw_excerpt TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_model_call_parse_failures_created_at
            ON model_call_parse_failures(created_at DESC);

        CREATE TABLE IF NOT EXISTS model_pricing_snapshots (
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
            created_at TEXT NOT NULL,
            UNIQUE(workspace_id, provider, model, currency, effective_from),
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_model_pricing_snapshots_workspace_model_effective
            ON model_pricing_snapshots(workspace_id, provider, model, currency, effective_from DESC);

        CREATE TABLE IF NOT EXISTS model_pricing_overrides (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            currency TEXT NOT NULL,
            input_cost_per_million REAL NOT NULL,
            output_cost_per_million REAL NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(workspace_id, provider, model, currency),
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS fx_snapshots (
            id TEXT PRIMARY KEY,
            base_currency TEXT NOT NULL,
            quote_currency TEXT NOT NULL,
            rate REAL NOT NULL,
            source TEXT NOT NULL,
            fetched_at TEXT NOT NULL,
            UNIQUE(base_currency, quote_currency, fetched_at)
        );
        "#,
    )?;

    conn.execute(
        "INSERT INTO migration_meta(key, value, updated_at) VALUES (?1, ?2, ?3)",
        params!["migrate_model_usage_tables_v1", "done", now_rfc3339()],
    )?;
    Ok(())
}
