use std::{env, fs, path::PathBuf};

use rusqlite::{params, Connection, OptionalExtension};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::{
    domain::models::RuntimeFlags,
    error::AppError,
    utils::{now_rfc3339, sha256_hex},
};

#[derive(Clone)]
pub struct AppState {
    pub db_path: PathBuf,
}

impl AppState {
    pub fn from_app(app: &AppHandle) -> Result<Self, AppError> {
        let data_dir = app
            .path()
            .app_data_dir()
            .map_err(|err| AppError::internal(format!("获取 app_data_dir 失败: {err}")))?;
        fs::create_dir_all(&data_dir)?;
        let db_path = data_dir.join("agentnexus.db");

        let state = Self { db_path };
        let conn = state.open()?;
        bootstrap(&conn)?;
        seed_runtime_flags(&conn)?;
        Ok(state)
    }

    pub fn open(&self) -> Result<Connection, AppError> {
        let conn = Connection::open(&self.db_path)?;
        conn.execute("PRAGMA foreign_keys = ON", [])?;
        conn.query_row("PRAGMA journal_mode = WAL", [], |_row| Ok(()))?;
        Ok(conn)
    }
}

pub fn load_runtime_flags(conn: &Connection) -> Result<RuntimeFlags, AppError> {
    conn.query_row(
        "SELECT local_mode, external_sources_enabled, experimental_enabled, updated_at FROM runtime_config WHERE id = 1",
        [],
        |row| {
            Ok(RuntimeFlags {
                local_mode: row.get::<_, i64>(0)? == 1,
                external_sources_enabled: row.get::<_, i64>(1)? == 1,
                experimental_enabled: row.get::<_, i64>(2)? == 1,
                updated_at: row.get(3)?,
            })
        },
    )
    .map_err(Into::into)
}

fn bootstrap(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS migration_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            root_path TEXT NOT NULL UNIQUE,
            install_mode TEXT NOT NULL DEFAULT 'copy',
            platform_overrides TEXT NOT NULL DEFAULT '{}',
            active INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS runtime_config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            local_mode INTEGER NOT NULL,
            external_sources_enabled INTEGER NOT NULL,
            experimental_enabled INTEGER NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS agent_doc (
            workspace_id TEXT PRIMARY KEY,
            content TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS agent_doc_versions (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            version TEXT NOT NULL,
            title TEXT NOT NULL,
            notes TEXT NOT NULL,
            content TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            operator TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            UNIQUE(workspace_id, version),
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS distribution_targets (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            platform TEXT NOT NULL,
            target_path TEXT NOT NULL,
            skills_path TEXT NOT NULL,
            install_mode TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(workspace_id, platform),
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS distribution_jobs (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            release_version TEXT NOT NULL,
            mode TEXT NOT NULL,
            status TEXT NOT NULL,
            fallback_enabled INTEGER NOT NULL,
            retry_of_job_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS distribution_records (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            target_id TEXT NOT NULL,
            status TEXT NOT NULL,
            message TEXT NOT NULL,
            expected_hash TEXT NOT NULL,
            actual_hash TEXT NOT NULL,
            used_mode TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(job_id) REFERENCES distribution_jobs(id) ON DELETE CASCADE,
            FOREIGN KEY(target_id) REFERENCES distribution_targets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS skills_assets (
            id TEXT PRIMARY KEY,
            identity TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            version TEXT NOT NULL,
            latest_version TEXT NOT NULL,
            source TEXT NOT NULL,
            local_path TEXT NOT NULL,
            update_candidate INTEGER NOT NULL,
            last_used_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS skills_versions (
            id TEXT PRIMARY KEY,
            asset_id TEXT NOT NULL,
            version TEXT NOT NULL,
            source TEXT NOT NULL,
            installed_at TEXT NOT NULL,
            FOREIGN KEY(asset_id) REFERENCES skills_assets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS prompts_assets (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            name TEXT NOT NULL,
            tags TEXT NOT NULL,
            category TEXT NOT NULL,
            favorite INTEGER NOT NULL,
            active_version INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(workspace_id, name),
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS prompts_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            asset_id TEXT NOT NULL,
            version INTEGER NOT NULL,
            content TEXT NOT NULL,
            metadata TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(asset_id, version),
            FOREIGN KEY(asset_id) REFERENCES prompts_assets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS usage_events (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            asset_type TEXT NOT NULL,
            asset_id TEXT NOT NULL,
            version TEXT NOT NULL,
            event_type TEXT NOT NULL,
            success INTEGER NOT NULL,
            context TEXT NOT NULL,
            ts TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ratings (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            asset_type TEXT NOT NULL,
            asset_id TEXT NOT NULL,
            version TEXT NOT NULL,
            score INTEGER NOT NULL,
            comment TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS audit_events (
            id TEXT PRIMARY KEY,
            workspace_id TEXT,
            event_type TEXT NOT NULL,
            operator TEXT NOT NULL,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS agent_connections (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            agent_type TEXT NOT NULL,
            root_dir TEXT NOT NULL DEFAULT '',
            rule_file TEXT NOT NULL DEFAULT '',
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(workspace_id, agent_type),
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS global_rule_assets (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            name TEXT NOT NULL,
            latest_version INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(workspace_id, name),
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS global_rule_versions (
            id TEXT PRIMARY KEY,
            asset_id TEXT NOT NULL,
            version INTEGER NOT NULL,
            content TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            operator TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(asset_id, version),
            FOREIGN KEY(asset_id) REFERENCES global_rule_assets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS global_rule_agent_tags (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            agent_type TEXT NOT NULL,
            asset_id TEXT NOT NULL,
            last_applied_version INTEGER NOT NULL,
            last_applied_hash TEXT NOT NULL,
            drift_status TEXT NOT NULL DEFAULT 'unchecked',
            drift_reason TEXT NOT NULL DEFAULT '',
            last_checked_at TEXT,
            updated_at TEXT NOT NULL,
            UNIQUE(workspace_id, agent_type),
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
            FOREIGN KEY(asset_id) REFERENCES global_rule_assets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS global_rule_apply_jobs (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            asset_id TEXT,
            release_version TEXT NOT NULL,
            mode TEXT NOT NULL,
            status TEXT NOT NULL,
            retry_of_job_id TEXT,
            operator TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
            FOREIGN KEY(asset_id) REFERENCES global_rule_assets(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS global_rule_apply_records (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            agent_type TEXT NOT NULL,
            resolved_path TEXT NOT NULL,
            status TEXT NOT NULL,
            message TEXT NOT NULL,
            expected_hash TEXT NOT NULL,
            actual_hash TEXT NOT NULL,
            used_mode TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(job_id) REFERENCES global_rule_apply_jobs(id) ON DELETE CASCADE
        );
        "#,
    )?;

    conn.execute(
        "INSERT INTO migration_meta(key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params!["schema_version", "v1", now_rfc3339()],
    )?;

    run_backfill_once(conn)?;
    run_agent_connection_rule_file_migration_once(conn)?;
    run_global_rules_migration_once(conn)?;

    Ok(())
}

fn seed_runtime_flags(conn: &Connection) -> Result<(), AppError> {
    let local_mode = read_bool_env("AGENTNEXUS_LOCAL_MODE", true);
    let external_sources_enabled = read_bool_env("AGENTNEXUS_EXTERNAL_SOURCES_ENABLED", false);
    let experimental_enabled = read_bool_env("AGENTNEXUS_EXPERIMENTAL_ENABLED", false);
    conn.execute(
        "INSERT OR IGNORE INTO runtime_config(id, local_mode, external_sources_enabled, experimental_enabled, updated_at) VALUES (1, ?1, ?2, ?3, ?4)",
        params![
            if local_mode { 1 } else { 0 },
            if external_sources_enabled { 1 } else { 0 },
            if experimental_enabled { 1 } else { 0 },
            now_rfc3339(),
        ],
    )?;
    Ok(())
}

fn run_backfill_once(conn: &Connection) -> Result<(), AppError> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(1) FROM migration_meta WHERE key = 'backfill_default_install_mode'",
        [],
        |row| row.get(0),
    )?;

    if exists > 0 {
        return Ok(());
    }

    conn.execute(
        "UPDATE workspaces SET install_mode = 'copy' WHERE install_mode IS NULL OR install_mode = ''",
        [],
    )?;

    conn.execute(
        "INSERT INTO migration_meta(key, value, updated_at) VALUES (?1, ?2, ?3)",
        params!["backfill_default_install_mode", "done", now_rfc3339()],
    )?;

    Ok(())
}

fn run_global_rules_migration_once(conn: &Connection) -> Result<(), AppError> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(1) FROM migration_meta WHERE key = 'migrate_global_rule_assets_v1'",
        [],
        |row| row.get(0),
    )?;
    if exists > 0 {
        return Ok(());
    }

    let now = now_rfc3339();
    let mut stmt = conn.prepare("SELECT id FROM workspaces ORDER BY created_at ASC")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    let mut workspace_ids = Vec::new();
    for row in rows {
        workspace_ids.push(row?);
    }

    for workspace_id in workspace_ids {
        ensure_default_agent_connection(conn, &workspace_id, "codex", &now)?;
        ensure_default_agent_connection(conn, &workspace_id, "claude", &now)?;
        migrate_legacy_agent_doc(conn, &workspace_id, &now)?;
    }

    conn.execute(
        "INSERT INTO migration_meta(key, value, updated_at) VALUES (?1, ?2, ?3)",
        params!["migrate_global_rule_assets_v1", "done", now_rfc3339()],
    )?;
    Ok(())
}

fn ensure_default_agent_connection(
    conn: &Connection,
    workspace_id: &str,
    agent_type: &str,
    now: &str,
) -> Result<(), AppError> {
    let default_root = default_agent_root_dir(agent_type);
    let default_rule_file = default_agent_rule_file(agent_type);
    conn.execute(
        "INSERT INTO agent_connections(id, workspace_id, agent_type, root_dir, rule_file, enabled, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7)
         ON CONFLICT(workspace_id, agent_type) DO UPDATE SET
            root_dir = CASE
                WHEN trim(COALESCE(agent_connections.root_dir, '')) = ''
                THEN excluded.root_dir
                ELSE agent_connections.root_dir
            END,
            rule_file = CASE
                WHEN trim(COALESCE(agent_connections.rule_file, '')) = ''
                THEN excluded.rule_file
                ELSE agent_connections.rule_file
            END,
            updated_at = CASE
                WHEN trim(COALESCE(agent_connections.root_dir, '')) = ''
                  OR trim(COALESCE(agent_connections.rule_file, '')) = ''
                THEN excluded.updated_at
                ELSE agent_connections.updated_at
            END",
        params![
            Uuid::new_v4().to_string(),
            workspace_id,
            agent_type,
            default_root,
            default_rule_file,
            now,
            now
        ],
    )?;
    Ok(())
}

fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, AppError> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    for row in rows {
        if row?.eq_ignore_ascii_case(column) {
            return Ok(true);
        }
    }
    Ok(false)
}

fn run_agent_connection_rule_file_migration_once(conn: &Connection) -> Result<(), AppError> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(1) FROM migration_meta WHERE key = 'migrate_agent_connections_rule_file_v1'",
        [],
        |row| row.get(0),
    )?;
    if exists > 0 {
        return Ok(());
    }

    if !column_exists(conn, "agent_connections", "rule_file")? {
        conn.execute(
            "ALTER TABLE agent_connections ADD COLUMN rule_file TEXT NOT NULL DEFAULT ''",
            [],
        )?;
    }

    let now = now_rfc3339();
    let mut stmt = conn.prepare("SELECT id FROM workspaces ORDER BY created_at ASC")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    let mut workspace_ids = Vec::new();
    for row in rows {
        workspace_ids.push(row?);
    }

    for workspace_id in workspace_ids {
        for agent_type in ["codex", "claude"] {
            let default_root = default_agent_root_dir(agent_type);
            let default_rule_file = default_agent_rule_file(agent_type);
            conn.execute(
                "UPDATE agent_connections
                 SET root_dir = CASE
                       WHEN trim(COALESCE(root_dir, '')) = '' THEN ?3
                       ELSE root_dir
                     END,
                     rule_file = CASE
                       WHEN trim(COALESCE(rule_file, '')) = '' THEN ?4
                       ELSE rule_file
                     END,
                     updated_at = CASE
                       WHEN trim(COALESCE(root_dir, '')) = ''
                         OR trim(COALESCE(rule_file, '')) = ''
                       THEN ?5
                       ELSE updated_at
                     END
                 WHERE workspace_id = ?1 AND agent_type = ?2",
                params![
                    workspace_id,
                    agent_type,
                    default_root,
                    default_rule_file,
                    now
                ],
            )?;
            ensure_default_agent_connection(conn, &workspace_id, agent_type, &now)?;
        }
    }

    conn.execute(
        "INSERT INTO migration_meta(key, value, updated_at) VALUES (?1, ?2, ?3)",
        params![
            "migrate_agent_connections_rule_file_v1",
            "done",
            now_rfc3339(),
        ],
    )?;
    Ok(())
}

fn default_agent_root_dir(agent_type: &str) -> String {
    let normalized = agent_type.trim().to_lowercase();
    let suffix = match normalized.as_str() {
        "codex" => Some(".codex"),
        "claude" => Some(".claude"),
        _ => None,
    };

    if let Some(suffix) = suffix {
        if let Some(home) = dirs::home_dir() {
            return home.join(suffix).to_string_lossy().to_string();
        }
    }
    String::new()
}

fn default_agent_rule_file(agent_type: &str) -> String {
    match agent_type.trim().to_lowercase().as_str() {
        "codex" => "AGENTS.md".to_string(),
        "claude" => "CLAUDE.md".to_string(),
        _ => "AGENTS.md".to_string(),
    }
}

fn migrate_legacy_agent_doc(
    conn: &Connection,
    workspace_id: &str,
    now: &str,
) -> Result<(), AppError> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(1) FROM global_rule_assets WHERE workspace_id = ?1",
        params![workspace_id],
        |row| row.get(0),
    )?;
    if exists > 0 {
        return Ok(());
    }

    let mut versions_stmt = conn.prepare(
        "SELECT version, content, content_hash, operator, created_at
         FROM agent_doc_versions
         WHERE workspace_id = ?1
         ORDER BY created_at ASC",
    )?;
    let version_rows = versions_stmt.query_map(params![workspace_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
        ))
    })?;

    let mut legacy_versions: Vec<(String, String, String, String, String)> = Vec::new();
    for row in version_rows {
        legacy_versions.push(row?);
    }

    let mut migrated: Vec<(i64, String, String, String, String)> = Vec::new();
    let mut seq = 1_i64;
    for (legacy_version, content, content_hash, operator, created_at) in legacy_versions {
        let parsed = parse_legacy_version(&legacy_version).unwrap_or(seq);
        migrated.push((parsed, content, content_hash, operator, created_at));
        seq += 1;
    }

    if migrated.is_empty() {
        let draft = conn
            .query_row(
                "SELECT content, content_hash, updated_at FROM agent_doc WHERE workspace_id = ?1",
                params![workspace_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .optional()?;

        if let Some((content, content_hash, updated_at)) = draft {
            migrated.push((1, content, content_hash, "system".to_string(), updated_at));
        }
    }

    if migrated.is_empty() {
        return Ok(());
    }

    migrated.sort_by_key(|item| item.0);
    let latest_version = migrated.last().map(|item| item.0).unwrap_or(1);

    let asset_id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO global_rule_assets(id, workspace_id, name, latest_version, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            asset_id,
            workspace_id,
            "Legacy Global Rules",
            latest_version,
            now,
            now
        ],
    )?;

    for (version, content, content_hash, operator, created_at) in migrated {
        let final_hash = if content_hash.trim().is_empty() {
            sha256_hex(&content)
        } else {
            content_hash
        };
        conn.execute(
            "INSERT INTO global_rule_versions(id, asset_id, version, content, content_hash, operator, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                Uuid::new_v4().to_string(),
                asset_id,
                version,
                content,
                final_hash,
                operator,
                created_at
            ],
        )?;
    }

    Ok(())
}

fn parse_legacy_version(value: &str) -> Option<i64> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    trimmed.trim_start_matches('v').parse::<i64>().ok()
}

fn read_bool_env(key: &str, default: bool) -> bool {
    match env::var(key) {
        Ok(value) => matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "on"),
        Err(_) => default,
    }
}
