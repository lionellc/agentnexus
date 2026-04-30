use super::*;
use rusqlite::{params, OptionalExtension};
use std::collections::HashMap;

pub(super) fn get_workspace_scope(
    conn: &Connection,
    workspace_id: &str,
) -> Result<WorkspaceScope, AppError> {
    conn.query_row(
        "SELECT id, root_path FROM workspaces WHERE id = ?1",
        params![workspace_id],
        |row| {
            Ok(WorkspaceScope {
                id: row.get(0)?,
                root_path: row.get::<_, String>(1)?,
            })
        },
    )
    .optional()?
    .ok_or_else(AppError::workspace_not_found)
}

pub(super) fn list_enabled_agent_root_dirs(
    conn: &Connection,
    workspace_id: &str,
) -> Result<Vec<AgentRootDirScope>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT agent_type, root_dir
         FROM agent_connections
         WHERE workspace_id = ?1
           AND enabled = 1
           AND trim(root_dir) <> ''",
    )?;

    let rows = stmt.query_map(params![workspace_id], |row| {
        Ok(AgentRootDirScope {
            agent: row.get::<_, String>(0)?,
            root_dir: row.get::<_, String>(1)?,
        })
    })?;

    let mut scopes = Vec::new();
    for row in rows {
        scopes.push(row?);
    }
    Ok(scopes)
}

pub(super) fn count_insert_projection(
    conn: &Connection,
    facts: &[ModelUsageFactDraft],
) -> Result<(usize, usize), AppError> {
    let mut inserted = 0_usize;
    let mut merged = 0_usize;

    for fact in facts {
        let exists: i64 = conn.query_row(
            "SELECT COUNT(1) FROM model_call_facts WHERE dedupe_key = ?1",
            params![fact.dedupe_key],
            |row| row.get(0),
        )?;
        if exists > 0 {
            merged += 1;
        } else {
            inserted += 1;
        }
    }

    Ok((inserted, merged))
}

pub(super) fn cleanup_legacy_codex_session_rows(
    conn: &Connection,
    workspace_id: &str,
) -> Result<usize, AppError> {
    let deleted = conn.execute(
        "DELETE FROM model_call_facts
         WHERE workspace_id = ?1
           AND agent = ?2
           AND instr(source, ?3) > 0
           AND request_id IS NULL",
        params![workspace_id, AGENT_CODEX, SOURCE_SESSION_JSONL],
    )?;
    Ok(deleted)
}

pub(super) fn list_source_status_updated_at(
    conn: &Connection,
    workspace_id: &str,
) -> Result<HashMap<String, String>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT source_path, updated_at
         FROM model_call_source_status
         WHERE workspace_id = ?1",
    )?;
    let rows = stmt.query_map(params![workspace_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    let mut status = HashMap::new();
    for row in rows {
        let (source_path, updated_at) = row?;
        status.insert(source_path, updated_at);
    }
    Ok(status)
}

pub(super) fn latest_model_call_at(
    conn: &Connection,
    workspace_id: &str,
) -> Result<Option<String>, AppError> {
    conn.query_row(
        "SELECT MAX(called_at) FROM model_call_facts WHERE workspace_id = ?1",
        params![workspace_id],
        |row| row.get::<_, Option<String>>(0),
    )
    .map_err(AppError::from)
}

pub(super) fn persist_events(
    conn: &mut Connection,
    facts: Vec<ModelUsageFactDraft>,
    failures: Vec<ParseFailureEvent>,
) -> Result<(), AppError> {
    let tx = conn.transaction()?;
    let mut source_status_map = HashMap::<(String, String), (String, String, String)>::new();

    for fact in facts {
        let now = now_rfc3339();
        tx.execute(
            "INSERT INTO model_call_facts(
                id,
                workspace_id,
                called_at,
                agent,
                provider,
                model,
                status,
                input_tokens,
                output_tokens,
                total_tokens,
                is_complete,
                source,
                source_path,
                session_id,
                event_ref,
                request_id,
                attempt_key,
                raw_payload,
                dedupe_key,
                created_at,
                updated_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9,
                COALESCE(?8, 0) + COALESCE(?9, 0),
                CASE
                    WHEN trim(COALESCE(?6, '')) <> '' AND ?8 IS NOT NULL AND ?9 IS NOT NULL THEN 1
                    ELSE 0
                END,
                ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19
            )
            ON CONFLICT(dedupe_key) DO UPDATE SET
                called_at = CASE
                    WHEN excluded.called_at < model_call_facts.called_at THEN excluded.called_at
                    ELSE model_call_facts.called_at
                END,
                provider = CASE
                    WHEN trim(COALESCE(model_call_facts.provider, '')) = '' THEN excluded.provider
                    ELSE model_call_facts.provider
                END,
                model = CASE
                    WHEN trim(COALESCE(model_call_facts.model, '')) = '' THEN excluded.model
                    ELSE model_call_facts.model
                END,
                status = CASE
                    WHEN model_call_facts.status = 'unknown' AND excluded.status <> 'unknown'
                        THEN excluded.status
                    ELSE model_call_facts.status
                END,
                input_tokens = COALESCE(model_call_facts.input_tokens, excluded.input_tokens),
                output_tokens = COALESCE(model_call_facts.output_tokens, excluded.output_tokens),
                total_tokens = COALESCE(model_call_facts.input_tokens, excluded.input_tokens, 0)
                    + COALESCE(model_call_facts.output_tokens, excluded.output_tokens, 0),
                is_complete = CASE
                    WHEN trim(COALESCE(
                        CASE
                            WHEN trim(COALESCE(model_call_facts.model, '')) = ''
                                THEN excluded.model
                            ELSE model_call_facts.model
                        END,
                        ''
                    )) <> ''
                    AND COALESCE(model_call_facts.input_tokens, excluded.input_tokens) IS NOT NULL
                    AND COALESCE(model_call_facts.output_tokens, excluded.output_tokens) IS NOT NULL
                        THEN 1
                    ELSE 0
                END,
                source = CASE
                    WHEN instr(model_call_facts.source, excluded.source) > 0
                        THEN model_call_facts.source
                    ELSE model_call_facts.source || ',' || excluded.source
                END,
                request_id = COALESCE(model_call_facts.request_id, excluded.request_id),
                attempt_key = COALESCE(model_call_facts.attempt_key, excluded.attempt_key),
                raw_payload = CASE
                    WHEN length(COALESCE(model_call_facts.raw_payload, '')) >= length(COALESCE(excluded.raw_payload, ''))
                        THEN model_call_facts.raw_payload
                    ELSE excluded.raw_payload
                END,
                updated_at = excluded.updated_at",
            params![
                Uuid::new_v4().to_string(),
                fact.workspace_id,
                fact.timestamp,
                fact.agent,
                fact.provider,
                fact.model,
                fact.status,
                fact.input_tokens,
                fact.output_tokens,
                fact.source,
                fact.source_path,
                fact.session_id,
                fact.event_ref,
                fact.request_id,
                fact.attempt_key,
                fact.raw_payload,
                fact.dedupe_key,
                now,
                now,
            ],
        )?;
        source_status_map.insert(
            (fact.source, fact.source_path),
            (
                fact.workspace_id,
                JOB_STATUS_COMPLETED.to_string(),
                String::new(),
            ),
        );
    }

    for failure in failures {
        tx.execute(
            "INSERT INTO model_call_parse_failures(
                id,
                workspace_id,
                source,
                source_path,
                reason,
                raw_excerpt,
                created_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                Uuid::new_v4().to_string(),
                failure.workspace_id,
                failure.source,
                failure.source_path,
                failure.reason,
                failure.raw_excerpt,
                now_rfc3339(),
            ],
        )?;
        source_status_map.insert(
            (failure.source, failure.source_path),
            (
                failure.workspace_id,
                JOB_STATUS_FAILED.to_string(),
                failure.reason,
            ),
        );
    }

    tx.commit()?;

    for ((source, source_path), (workspace_id, status, error_message)) in source_status_map {
        upsert_source_status(
            conn,
            &workspace_id,
            &status,
            &source,
            &source_path,
            &error_message,
        )?;
    }

    Ok(())
}

pub(super) fn upsert_source_status(
    conn: &Connection,
    workspace_id: &str,
    status: &str,
    source: &str,
    source_path: &str,
    error_message: &str,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO model_call_source_status(
            id, workspace_id, source, source_path, status, error_message, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(workspace_id, source, source_path) DO UPDATE SET
            status = excluded.status,
            error_message = excluded.error_message,
            updated_at = excluded.updated_at",
        params![
            Uuid::new_v4().to_string(),
            workspace_id,
            source,
            source_path,
            status,
            error_message,
            now_rfc3339(),
        ],
    )?;
    Ok(())
}
