use rusqlite::{params, Connection};

use crate::{error::AppError, utils::now_rfc3339};

pub(super) fn run_channel_test_tables_migration_once(conn: &Connection) -> Result<(), AppError> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(1) FROM migration_meta WHERE key = 'migrate_channel_api_test_runs_v1'",
        [],
        |row| row.get(0),
    )?;
    if exists > 0 {
        add_conversation_json_column_once(conn)?;
        add_run_mode_column_once(conn)?;
        return add_custom_cases_table_once(conn);
    }

    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS channel_api_test_runs (
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
            checks_json TEXT NOT NULL,
            rounds_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_channel_api_test_runs_workspace_started_at
            ON channel_api_test_runs(workspace_id, started_at DESC, id DESC);
        "#,
    )?;

    conn.execute(
        "INSERT INTO migration_meta(key, value, updated_at) VALUES (?1, ?2, ?3)",
        params!["migrate_channel_api_test_runs_v1", "done", now_rfc3339()],
    )?;
    add_conversation_json_column_once(conn)?;
    add_run_mode_column_once(conn)?;
    add_custom_cases_table_once(conn)?;
    Ok(())
}

pub(super) fn add_conversation_json_column_once(conn: &Connection) -> Result<(), AppError> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(1) FROM migration_meta WHERE key = 'migrate_channel_api_test_runs_conversation_json_v1'",
        [],
        |row| row.get(0),
    )?;
    if exists > 0 {
        return Ok(());
    }

    let has_column: i64 = conn.query_row(
        "SELECT COUNT(1) FROM pragma_table_info('channel_api_test_runs') WHERE name = 'conversation_json'",
        [],
        |row| row.get(0),
    )?;
    if has_column == 0 {
        conn.execute(
            "ALTER TABLE channel_api_test_runs ADD COLUMN conversation_json TEXT",
            [],
        )?;
    }

    conn.execute(
        "INSERT INTO migration_meta(key, value, updated_at) VALUES (?1, ?2, ?3)",
        params![
            "migrate_channel_api_test_runs_conversation_json_v1",
            "done",
            now_rfc3339()
        ],
    )?;
    Ok(())
}

pub(super) fn add_run_mode_column_once(conn: &Connection) -> Result<(), AppError> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(1) FROM migration_meta WHERE key = 'migrate_channel_api_test_runs_run_mode_v1'",
        [],
        |row| row.get(0),
    )?;
    if exists > 0 {
        return Ok(());
    }

    let has_column: i64 = conn.query_row(
        "SELECT COUNT(1) FROM pragma_table_info('channel_api_test_runs') WHERE name = 'run_mode'",
        [],
        |row| row.get(0),
    )?;
    if has_column == 0 {
        conn.execute(
            "ALTER TABLE channel_api_test_runs ADD COLUMN run_mode TEXT NOT NULL DEFAULT 'standard'",
            [],
        )?;
    }

    conn.execute(
        "INSERT INTO migration_meta(key, value, updated_at) VALUES (?1, ?2, ?3)",
        params![
            "migrate_channel_api_test_runs_run_mode_v1",
            "done",
            now_rfc3339()
        ],
    )?;
    Ok(())
}

pub(super) fn add_custom_cases_table_once(conn: &Connection) -> Result<(), AppError> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(1) FROM migration_meta WHERE key = 'migrate_channel_api_test_cases_v1'",
        [],
        |row| row.get(0),
    )?;
    if exists > 0 {
        return Ok(());
    }

    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS channel_api_test_cases (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            category TEXT NOT NULL,
            label TEXT NOT NULL,
            messages_json TEXT NOT NULL,
            rounds_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(workspace_id, id),
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_channel_api_test_cases_workspace_category
            ON channel_api_test_cases(workspace_id, category, updated_at DESC);
        "#,
    )?;

    conn.execute(
        "INSERT INTO migration_meta(key, value, updated_at) VALUES (?1, ?2, ?3)",
        params!["migrate_channel_api_test_cases_v1", "done", now_rfc3339()],
    )?;
    Ok(())
}
