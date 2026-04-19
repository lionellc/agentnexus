use super::*;

pub(super) fn list_workspace_scopes(conn: &Connection) -> Result<Vec<WorkspaceScope>, AppError> {
    let mut stmt = conn.prepare("SELECT id, root_path FROM workspaces")?;
    let rows = stmt.query_map([], |row| {
        Ok(WorkspaceScope {
            id: row.get(0)?,
            root_path: PathBuf::from(row.get::<_, String>(1)?),
        })
    })?;

    let mut scopes = Vec::new();
    for row in rows {
        scopes.push(row?);
    }
    Ok(scopes)
}

pub(super) fn get_workspace_scope(conn: &Connection, workspace_id: &str) -> Result<WorkspaceScope, AppError> {
    conn.query_row(
        "SELECT id, root_path FROM workspaces WHERE id = ?1",
        params![workspace_id],
        |row| {
            Ok(WorkspaceScope {
                id: row.get(0)?,
                root_path: PathBuf::from(row.get::<_, String>(1)?),
            })
        },
    )
    .optional()?
    .ok_or_else(AppError::workspace_not_found)
}

pub(super) fn list_skill_aliases(conn: &Connection) -> Result<HashMap<String, SkillAliasEntry>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, identity, name, local_path, source_local_path
         FROM skills_assets",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, Option<String>>(4)?,
        ))
    })?;

    let mut map = HashMap::new();
    for row in rows {
        let (skill_id, identity, name, local_path, source_local_path) = row?;
        let entry = SkillAliasEntry {
            skill_id,
            identity: identity.clone(),
            name: name.clone(),
        };

        let mut aliases = Vec::new();
        aliases.extend(normalize_skill_alias_candidates(&identity));
        aliases.extend(normalize_skill_alias_candidates(&name));

        if let Some(base) = Path::new(&local_path)
            .file_name()
            .and_then(|item| item.to_str())
        {
            aliases.extend(normalize_skill_alias_candidates(base));
        }
        if let Some(source_path) = source_local_path {
            if let Some(base) = Path::new(&source_path)
                .file_name()
                .and_then(|item| item.to_str())
            {
                aliases.extend(normalize_skill_alias_candidates(base));
            }
        }

        aliases.sort();
        aliases.dedup();
        for alias in aliases {
            map.entry(alias).or_insert_with(|| entry.clone());
        }
    }

    Ok(map)
}

pub(super) fn count_insert_projection(
    conn: &Connection,
    calls: &[SessionSkillCallEvent],
) -> Result<(usize, usize), AppError> {
    let mut inserted = 0_usize;
    let mut duplicate = 0_usize;

    for call in calls {
        let exists: i64 = conn.query_row(
            "SELECT COUNT(1) FROM skill_call_facts WHERE dedupe_key = ?1",
            params![call.dedupe_key],
            |row| row.get(0),
        )?;
        if exists > 0 {
            duplicate += 1;
        } else {
            inserted += 1;
        }
    }

    Ok((inserted, duplicate))
}

pub(super) fn persist_events(
    conn: &mut Connection,
    calls: Vec<SessionSkillCallEvent>,
    failures: Vec<ParseFailureEvent>,
) -> Result<(), AppError> {
    let tx = conn.transaction()?;

    for call in calls {
        let now = now_rfc3339();
        tx.execute(
            "INSERT INTO skill_call_facts(
                id,
                workspace_id,
                agent,
                source,
                source_path,
                session_id,
                event_ref,
                skill_id,
                skill_identity,
                skill_name,
                called_at,
                result_status,
                confidence,
                raw_ref,
                dedupe_key,
                created_at,
                updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
            ON CONFLICT(dedupe_key) DO NOTHING",
            params![
                Uuid::new_v4().to_string(),
                call.workspace_id,
                call.agent,
                call.source,
                call.source_path,
                call.session_id,
                call.event_ref,
                call.skill_id,
                call.skill_identity,
                call.skill_name,
                call.called_at,
                call.result_status,
                call.confidence,
                call.raw_ref,
                call.dedupe_key,
                now,
                now,
            ],
        )?;
    }

    for failure in failures {
        tx.execute(
            "INSERT INTO skill_call_parse_failures(
                id,
                workspace_id,
                agent,
                source_path,
                session_id,
                line_no,
                event_ref,
                reason,
                raw_excerpt,
                created_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                Uuid::new_v4().to_string(),
                failure.workspace_id,
                failure.agent,
                failure.source_path,
                failure.session_id,
                failure.line_no,
                failure.event_ref,
                failure.reason,
                failure.raw_excerpt,
                now_rfc3339(),
            ],
        )?;
    }

    tx.commit()?;
    Ok(())
}

pub(super) fn load_checkpoint(
    conn: &Connection,
    agent: &str,
    source_path: &str,
) -> Result<Option<u64>, AppError> {
    conn.query_row(
        "SELECT byte_offset FROM skill_call_sync_checkpoints WHERE agent = ?1 AND source_path = ?2",
        params![agent, source_path],
        |row| row.get::<_, i64>(0),
    )
    .optional()
    .map(|item| item.map(|value| value.max(0) as u64))
    .map_err(Into::into)
}

pub(super) fn save_checkpoint(
    conn: &Connection,
    agent: &str,
    source_path: &str,
    file_size: u64,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO skill_call_sync_checkpoints(id, agent, source_path, byte_offset, file_size, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(agent, source_path) DO UPDATE SET
            byte_offset = excluded.byte_offset,
            file_size = excluded.file_size,
            updated_at = excluded.updated_at",
        params![
            Uuid::new_v4().to_string(),
            agent,
            source_path,
            file_size as i64,
            file_size as i64,
            now_rfc3339(),
        ],
    )?;
    Ok(())
}
