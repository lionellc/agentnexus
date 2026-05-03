use std::{env, fs, path::PathBuf};

use rusqlite::{params, Connection, OptionalExtension};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::{
    control_plane::agent_presets::{
        all_builtin_agent_presets, default_agent_enabled as preset_default_agent_enabled,
    },
    domain::models::{RuntimeFlags, APP_SCOPE_ID},
    error::AppError,
    utils::{now_rfc3339, sha256_hex},
};

mod channel_test_migrations;
mod model_usage_migrations;
mod schema;

use channel_test_migrations::run_channel_test_tables_migration_once;
use model_usage_migrations::run_model_usage_tables_migration_once;

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
    conn.execute_batch(schema::INITIAL_SCHEMA_SQL)?;
    seed_app_scope(conn)?;

    conn.execute(
        "INSERT INTO migration_meta(key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params!["schema_version", "v1", now_rfc3339()],
    )?;

    run_backfill_once(conn)?;
    run_skills_assets_source_metadata_migration_once(conn)?;
    run_skills_asset_sources_migration_once(conn)?;
    run_agent_connection_rule_file_migration_once(conn)?;
    run_agent_connection_search_dirs_migration_once(conn)?;
    run_global_rules_migration_once(conn)?;
    run_local_agent_translation_migration_once(conn)?;
    run_drop_legacy_metrics_tables_once(conn)?;
    run_skill_call_facts_evidence_migration_once(conn)?;
    run_model_usage_tables_migration_once(conn)?;
    run_channel_test_tables_migration_once(conn)?;

    Ok(())
}

fn seed_app_scope(conn: &Connection) -> Result<(), AppError> {
    let now = now_rfc3339();
    conn.execute(
        "INSERT OR IGNORE INTO workspaces(
            id, name, root_path, install_mode, platform_overrides, active, created_at, updated_at
         ) VALUES (?1, 'AgentNexus', ?2, 'copy', '{}', 1, ?3, ?4)",
        params![APP_SCOPE_ID, default_app_scope_root(), now, now],
    )?;
    Ok(())
}

fn default_app_scope_root() -> String {
    env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .to_string_lossy()
        .to_string()
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

fn run_skills_assets_source_metadata_migration_once(conn: &Connection) -> Result<(), AppError> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(1) FROM migration_meta WHERE key = 'migrate_skills_assets_source_metadata_v1'",
        [],
        |row| row.get(0),
    )?;
    if exists > 0 {
        return Ok(());
    }

    if !column_exists(conn, "skills_assets", "source_local_path")? {
        conn.execute(
            "ALTER TABLE skills_assets ADD COLUMN source_local_path TEXT",
            [],
        )?;
    }
    if !column_exists(conn, "skills_assets", "source_is_symlink")? {
        conn.execute(
            "ALTER TABLE skills_assets ADD COLUMN source_is_symlink INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }

    conn.execute(
        "UPDATE skills_assets
         SET source_local_path = local_path
         WHERE source_local_path IS NULL OR trim(source_local_path) = ''",
        [],
    )?;

    conn.execute(
        "INSERT INTO migration_meta(key, value, updated_at) VALUES (?1, ?2, ?3)",
        params![
            "migrate_skills_assets_source_metadata_v1",
            "done",
            now_rfc3339(),
        ],
    )?;
    Ok(())
}

fn run_skills_asset_sources_migration_once(conn: &Connection) -> Result<(), AppError> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(1) FROM migration_meta WHERE key = 'migrate_skills_asset_sources_v1'",
        [],
        |row| row.get(0),
    )?;
    if exists > 0 {
        return Ok(());
    }

    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS skills_asset_sources (
            id TEXT PRIMARY KEY,
            asset_id TEXT NOT NULL UNIQUE,
            source_type TEXT NOT NULL DEFAULT 'local',
            source TEXT NOT NULL DEFAULT '',
            source_url TEXT NOT NULL DEFAULT '',
            skill_path TEXT NOT NULL DEFAULT '',
            repo_owner TEXT NOT NULL DEFAULT '',
            repo_name TEXT NOT NULL DEFAULT '',
            repo_ref TEXT NOT NULL DEFAULT '',
            source_local_path TEXT NOT NULL DEFAULT '',
            local_content_hash TEXT NOT NULL DEFAULT '',
            remote_content_hash TEXT NOT NULL DEFAULT '',
            hash_checked_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(asset_id) REFERENCES skills_assets(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_skills_asset_sources_source
            ON skills_asset_sources(source_type, source);
        "#,
    )?;

    let mut stmt = conn.prepare(
        "SELECT id, source, COALESCE(source_local_path, '')
         FROM skills_assets
         ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;

    let now = now_rfc3339();
    for row in rows {
        let (asset_id, source, source_local_path) = row?;
        let source_row_exists: i64 = conn.query_row(
            "SELECT COUNT(1) FROM skills_asset_sources WHERE asset_id = ?1",
            params![asset_id],
            |r| r.get(0),
        )?;
        if source_row_exists > 0 {
            continue;
        }

        conn.execute(
            "INSERT INTO skills_asset_sources(
                id, asset_id, source_type, source, source_local_path, created_at, updated_at
             ) VALUES (?1, ?2, 'local', ?3, ?4, ?5, ?6)",
            params![
                Uuid::new_v4().to_string(),
                asset_id,
                source,
                source_local_path,
                now,
                now,
            ],
        )?;
    }

    conn.execute(
        "INSERT INTO migration_meta(key, value, updated_at) VALUES (?1, ?2, ?3)",
        params!["migrate_skills_asset_sources_v1", "done", now_rfc3339()],
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
        for preset in all_builtin_agent_presets() {
            ensure_default_agent_connection(conn, &workspace_id, preset.id, &now)?;
        }
        migrate_legacy_agent_doc(conn, &workspace_id, &now)?;
    }

    conn.execute(
        "INSERT INTO migration_meta(key, value, updated_at) VALUES (?1, ?2, ?3)",
        params!["migrate_global_rule_assets_v1", "done", now_rfc3339()],
    )?;
    Ok(())
}

fn run_local_agent_translation_migration_once(conn: &Connection) -> Result<(), AppError> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(1) FROM migration_meta WHERE key = 'migrate_local_agent_translation_v1'",
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
        for profile_key in ["codex", "claude"] {
            conn.execute(
                "INSERT INTO local_agent_profiles(
                    id, workspace_id, profile_key, name, executable, args_template, is_builtin, enabled, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, 1, ?7, ?8)
                 ON CONFLICT(workspace_id, profile_key) DO UPDATE SET
                    is_builtin = 1,
                    updated_at = excluded.updated_at",
                params![
                    Uuid::new_v4().to_string(),
                    workspace_id,
                    profile_key,
                    profile_key,
                    default_local_agent_executable(profile_key),
                    default_local_agent_args_template(profile_key),
                    now,
                    now,
                ],
            )?;
        }

        conn.execute(
            "INSERT INTO translation_configs(workspace_id, default_profile_key, prompt_template, updated_at)
             VALUES (?1, 'codex', ?2, ?3)
             ON CONFLICT(workspace_id) DO NOTHING",
            params![workspace_id, default_translation_prompt_template(), now],
        )?;
    }

    conn.execute(
        "INSERT INTO migration_meta(key, value, updated_at) VALUES (?1, ?2, ?3)",
        params!["migrate_local_agent_translation_v1", "done", now_rfc3339(),],
    )?;

    Ok(())
}

fn run_drop_legacy_metrics_tables_once(conn: &Connection) -> Result<(), AppError> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(1) FROM migration_meta WHERE key = 'drop_legacy_metrics_tables_v1'",
        [],
        |row| row.get(0),
    )?;
    if exists > 0 {
        return Ok(());
    }

    conn.execute_batch(
        r#"
        DROP TABLE IF EXISTS usage_events;
        DROP TABLE IF EXISTS ratings;
        "#,
    )?;

    conn.execute(
        "INSERT INTO migration_meta(key, value, updated_at) VALUES (?1, ?2, ?3)",
        params!["drop_legacy_metrics_tables_v1", "done", now_rfc3339()],
    )?;

    Ok(())
}

fn run_skill_call_facts_evidence_migration_once(conn: &Connection) -> Result<(), AppError> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(1) FROM migration_meta WHERE key = 'migrate_skill_call_facts_evidence_v1'",
        [],
        |row| row.get(0),
    )?;
    if exists > 0 {
        return Ok(());
    }

    if !column_exists(conn, "skill_call_facts", "evidence_source")? {
        conn.execute(
            "ALTER TABLE skill_call_facts ADD COLUMN evidence_source TEXT NOT NULL DEFAULT 'observed'",
            [],
        )?;
    }
    if !column_exists(conn, "skill_call_facts", "evidence_kind")? {
        conn.execute(
            "ALTER TABLE skill_call_facts ADD COLUMN evidence_kind TEXT NOT NULL DEFAULT 'explicit_use_skill'",
            [],
        )?;
    }

    conn.execute(
        "UPDATE skill_call_facts
         SET evidence_source = CASE
                 WHEN trim(COALESCE(evidence_source, '')) = '' THEN 'observed'
                 ELSE evidence_source
             END,
             evidence_kind = CASE
                 WHEN trim(COALESCE(evidence_kind, '')) = '' THEN 'explicit_use_skill'
                 ELSE evidence_kind
             END",
        [],
    )?;

    conn.execute(
        "INSERT INTO migration_meta(key, value, updated_at) VALUES (?1, ?2, ?3)",
        params![
            "migrate_skill_call_facts_evidence_v1",
            "done",
            now_rfc3339(),
        ],
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
    let default_enabled = if preset_default_agent_enabled(agent_type) {
        1
    } else {
        0
    };
    let has_source_columns = column_exists(conn, "agent_connections", "root_dir_source")?
        && column_exists(conn, "agent_connections", "rule_file_source")?
        && column_exists(conn, "agent_connections", "detection_status")?;
    if has_source_columns {
        let detection_status = infer_detection_status(&default_root);
        let detected_at = if detection_status == "detected" {
            Some(now.to_string())
        } else {
            None
        };
        conn.execute(
            "INSERT INTO agent_connections(
                id, workspace_id, agent_type, root_dir, rule_file, root_dir_source, rule_file_source,
                detection_status, detected_at, enabled, created_at, updated_at
            )
             VALUES (?1, ?2, ?3, ?4, ?5, 'inferred', 'inferred', ?6, ?7, ?8, ?9, ?10)
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
                root_dir_source = CASE
                    WHEN trim(COALESCE(agent_connections.root_dir_source, '')) = ''
                    THEN excluded.root_dir_source
                    ELSE agent_connections.root_dir_source
                END,
                rule_file_source = CASE
                    WHEN trim(COALESCE(agent_connections.rule_file_source, '')) = ''
                    THEN excluded.rule_file_source
                    ELSE agent_connections.rule_file_source
                END,
                detection_status = CASE
                    WHEN trim(COALESCE(agent_connections.detection_status, '')) = ''
                    THEN excluded.detection_status
                    ELSE agent_connections.detection_status
                END,
                detected_at = CASE
                    WHEN agent_connections.detected_at IS NULL
                    THEN excluded.detected_at
                    ELSE agent_connections.detected_at
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
                detection_status,
                detected_at,
                default_enabled,
                now,
                now
            ],
        )?;
    } else {
        conn.execute(
            "INSERT INTO agent_connections(id, workspace_id, agent_type, root_dir, rule_file, enabled, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
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
                default_enabled,
                now,
                now
            ],
        )?;
    }

    if table_exists(conn, "agent_connection_search_dirs")? {
        ensure_default_agent_search_dirs(conn, workspace_id, agent_type, now)?;
    }
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

fn table_exists(conn: &Connection, table: &str) -> Result<bool, AppError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(1) FROM sqlite_master WHERE type = 'table' AND name = ?1",
        params![table],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

fn infer_detection_status(root_dir: &str) -> &'static str {
    let trimmed = root_dir.trim();
    if trimmed.is_empty() {
        return "undetected";
    }
    match fs::metadata(trimmed) {
        Ok(metadata) => {
            if metadata.is_dir() {
                "detected"
            } else {
                "undetected"
            }
        }
        Err(err) if err.kind() == std::io::ErrorKind::PermissionDenied => "permission_denied",
        Err(_) => "undetected",
    }
}

fn ensure_default_agent_search_dirs(
    conn: &Connection,
    workspace_id: &str,
    agent_type: &str,
    now: &str,
) -> Result<(), AppError> {
    let row = conn
        .query_row(
            "SELECT id, root_dir FROM agent_connections WHERE workspace_id = ?1 AND agent_type = ?2",
            params![workspace_id, agent_type],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()?;
    let Some((connection_id, root_dir)) = row else {
        return Ok(());
    };

    let exists: i64 = conn.query_row(
        "SELECT COUNT(1) FROM agent_connection_search_dirs WHERE connection_id = ?1",
        params![connection_id.as_str()],
        |item| item.get(0),
    )?;
    if exists > 0 || root_dir.trim().is_empty() {
        return Ok(());
    }

    conn.execute(
        "INSERT INTO agent_connection_search_dirs(
            id, connection_id, path, enabled, priority, source, created_at, updated_at
        ) VALUES (?1, ?2, ?3, 1, 0, 'inferred', ?4, ?5)",
        params![
            Uuid::new_v4().to_string(),
            connection_id,
            root_dir.trim(),
            now,
            now,
        ],
    )?;
    Ok(())
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
        for preset in all_builtin_agent_presets() {
            let agent_type = preset.id;
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
                    now.as_str()
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

fn run_agent_connection_search_dirs_migration_once(conn: &Connection) -> Result<(), AppError> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(1) FROM migration_meta WHERE key = 'migrate_agent_connection_search_dirs_v1'",
        [],
        |row| row.get(0),
    )?;
    if exists > 0 {
        return Ok(());
    }

    if !column_exists(conn, "agent_connections", "root_dir_source")? {
        conn.execute(
            "ALTER TABLE agent_connections ADD COLUMN root_dir_source TEXT NOT NULL DEFAULT 'inferred'",
            [],
        )?;
    }
    if !column_exists(conn, "agent_connections", "rule_file_source")? {
        conn.execute(
            "ALTER TABLE agent_connections ADD COLUMN rule_file_source TEXT NOT NULL DEFAULT 'inferred'",
            [],
        )?;
    }
    if !column_exists(conn, "agent_connections", "detection_status")? {
        conn.execute(
            "ALTER TABLE agent_connections ADD COLUMN detection_status TEXT NOT NULL DEFAULT 'undetected'",
            [],
        )?;
    }
    if !column_exists(conn, "agent_connections", "detected_at")? {
        conn.execute(
            "ALTER TABLE agent_connections ADD COLUMN detected_at TEXT",
            [],
        )?;
    }

    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS agent_connection_search_dirs (
            id TEXT PRIMARY KEY,
            connection_id TEXT NOT NULL,
            path TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            priority INTEGER NOT NULL DEFAULT 0,
            source TEXT NOT NULL DEFAULT 'inferred',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(connection_id, path),
            FOREIGN KEY(connection_id) REFERENCES agent_connections(id) ON DELETE CASCADE
        );
        "#,
    )?;

    let now = now_rfc3339();
    let mut stmt = conn.prepare(
        "SELECT workspace_id, agent_type, root_dir, rule_file
         FROM agent_connections
         ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
        ))
    })?;

    for row in rows {
        let (workspace_id, agent_type, root_dir, rule_file) = row?;
        let default_root = default_agent_root_dir(&agent_type);
        let default_rule = default_agent_rule_file(&agent_type);
        let is_inferred_root =
            !default_root.trim().is_empty() && root_dir.trim() == default_root.trim();
        let is_inferred_rule =
            !default_rule.trim().is_empty() && rule_file.trim() == default_rule.trim();
        let root_source = if is_inferred_root {
            "inferred"
        } else {
            "manual"
        };
        let rule_source = if is_inferred_rule {
            "inferred"
        } else {
            "manual"
        };
        let status = infer_detection_status(&root_dir);

        conn.execute(
            "UPDATE agent_connections
             SET root_dir_source = CASE
                     WHEN trim(COALESCE(root_dir_source, '')) = '' THEN ?3
                     ELSE root_dir_source
                 END,
                 rule_file_source = CASE
                     WHEN trim(COALESCE(rule_file_source, '')) = '' THEN ?4
                     ELSE rule_file_source
                 END,
                 detection_status = CASE
                     WHEN trim(COALESCE(detection_status, '')) = '' THEN ?5
                     ELSE detection_status
                 END,
                 detected_at = CASE
                     WHEN detected_at IS NULL THEN ?6
                     ELSE detected_at
                 END,
                 updated_at = ?6
             WHERE workspace_id = ?1 AND agent_type = ?2",
            params![
                workspace_id,
                agent_type,
                root_source,
                rule_source,
                status,
                now.as_str()
            ],
        )?;
    }

    let mut workspace_stmt = conn.prepare("SELECT id FROM workspaces ORDER BY created_at ASC")?;
    let workspace_rows = workspace_stmt.query_map([], |row| row.get::<_, String>(0))?;
    let mut workspace_ids = Vec::new();
    for row in workspace_rows {
        workspace_ids.push(row?);
    }

    for workspace_id in workspace_ids {
        for preset in all_builtin_agent_presets() {
            ensure_default_agent_connection(conn, &workspace_id, preset.id, &now)?;
        }
    }

    conn.execute(
        "INSERT INTO migration_meta(key, value, updated_at) VALUES (?1, ?2, ?3)",
        params![
            "migrate_agent_connection_search_dirs_v1",
            "done",
            now_rfc3339(),
        ],
    )?;
    Ok(())
}

fn default_agent_root_dir(agent_type: &str) -> String {
    crate::control_plane::agent_presets::default_agent_root_dir(agent_type)
}

fn default_agent_rule_file(agent_type: &str) -> String {
    crate::control_plane::agent_presets::default_agent_rule_file(agent_type)
}

fn default_local_agent_executable(profile_key: &str) -> &'static str {
    match profile_key {
        "codex" => "codex",
        "claude" => "claude",
        _ => "",
    }
}

fn default_local_agent_args_template(profile_key: &str) -> String {
    let template = match profile_key {
        "codex" => vec!["exec", "--skip-git-repo-check"],
        "claude" => vec!["-p", "{{system_prompt}}", "--output-format", "json"],
        _ => vec![],
    };
    serde_json::to_string(&template).unwrap_or_else(|_| "[]".to_string())
}

fn default_translation_prompt_template() -> String {
    "You are a strict translation engine.\nTranslate source text into target language.\nPreserve the original content format exactly, including line breaks, indentation, markdown syntax, lists, tables, and code blocks.\nReturn JSON only.\n\nTarget language:\n{{target_language}}\n\nSource text:\n{{source_text}}\n\nSchema:\n{{output_schema_json}}".to_string()
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
