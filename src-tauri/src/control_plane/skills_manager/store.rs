use super::*;

pub(super) fn build_manager_snapshot(
    workspace_root: &Path,
    conn: &Connection,
    config: &SkillsManagerConfig,
    workspace_id: &str,
) -> Result<Value, AppError> {
    let tools = list_tool_targets(conn, workspace_id)?;
    let skills = list_skills(conn)?;
    let created_at_by_id: HashMap<String, String> = skills
        .iter()
        .map(|item| (item.id.clone(), item.created_at.clone()))
        .collect();

    let conflict_names = build_name_conflicts(&skills);
    let deleted: HashSet<String> = config.deleted_skills.iter().cloned().collect();

    let runtime_skills: Vec<SkillRuntime> = skills
        .iter()
        .map(to_runtime_skill)
        .filter(|item| !deleted.contains(&item.name))
        .collect();
    let deleted_items = build_deleted_items(config, &skills);

    let mut skill_rows: Vec<Value> = Vec::new();
    for skill in runtime_skills {
        let mut status_by_tool: HashMap<String, String> = HashMap::new();
        for tool in &tools {
            let status = compute_status(workspace_root, &skill, tool, config);
            status_by_tool.insert(tool.platform.clone(), status.to_string());
        }
        skill_rows.push(json!({
            "id": skill.id,
            "name": skill.name,
            "group": skill.group,
            "source": skill.source,
            "localPath": skill.local_path.to_string_lossy().to_string(),
            "createdAt": created_at_by_id.get(&skill.id).cloned(),
            "sourceMissing": !skill.local_path.exists(),
            "statusByTool": status_by_tool,
            "conflict": conflict_names.contains(&skill.name),
        }));
    }
    skill_rows.sort_by(|left, right| {
        let ln = left.get("name").and_then(Value::as_str).unwrap_or("");
        let rn = right.get("name").and_then(Value::as_str).unwrap_or("");
        ln.cmp(rn)
    });

    let tool_rows = tools
        .iter()
        .map(|item| {
            json!({
                "id": item.id,
                "tool": item.platform,
                "skillsPath": item.skills_path,
            })
        })
        .collect::<Vec<Value>>();

    let conflict_map = conflict_names
        .into_iter()
        .map(|name| (name, true))
        .collect::<HashMap<String, bool>>();

    Ok(json!({
        "skills": skill_rows,
        "tools": tool_rows,
        "rules": config.rules,
        "groupRules": config.group_rules,
        "toolRules": config.tool_rules,
        "manualUnlinks": config.manual_unlinks,
        "deletedSkills": deleted_items,
        "nameConflicts": conflict_map,
    }))
}

pub(super) fn build_deleted_items(config: &SkillsManagerConfig, skills: &[SkillRow]) -> Vec<Value> {
    let mut on_disk: HashSet<String> = HashSet::new();
    for skill in skills {
        let path = PathBuf::from(&skill.local_path);
        if path.exists() {
            on_disk.insert(skill.name.clone());
        }
    }
    let mut names = config.deleted_skills.clone();
    names.sort();
    names.dedup();
    names
        .into_iter()
        .map(|name| {
            json!({
                "name": name,
                "existsOnDisk": on_disk.contains(&name),
            })
        })
        .collect()
}

pub(super) fn build_name_conflicts(skills: &[SkillRow]) -> HashSet<String> {
    let mut name_count: HashMap<String, i64> = HashMap::new();
    for skill in skills {
        let entry = name_count.entry(skill.name.clone()).or_insert(0);
        *entry += 1;
    }
    name_count
        .into_iter()
        .filter_map(|(name, count)| if count > 1 { Some(name) } else { None })
        .collect()
}

pub(super) fn compute_status<'a>(
    workspace_root: &Path,
    skill: &SkillRuntime,
    tool: &'a ToolTarget,
    config: &'a SkillsManagerConfig,
) -> &'a str {
    if !is_allowed(
        &skill.name,
        &tool.platform,
        &skill.group,
        &config.tool_rules,
        &config.group_rules,
        &config.rules,
    ) {
        return STATUS_BLOCKED;
    }

    let safe_tool_dir =
        resolve_distribution_target_path(workspace_root, Path::new(&tool.skills_path));
    let tool_dir = match safe_tool_dir {
        Ok(value) => value,
        Err(_) => return STATUS_WRONG,
    };

    let target = tool_dir.join(&skill.name);
    let install_mode = normalize_install_mode(&tool.install_mode);
    if install_mode == "copy" {
        return match fs::symlink_metadata(&target) {
            Ok(metadata) => {
                if metadata.file_type().is_symlink() {
                    STATUS_WRONG
                } else if metadata.is_dir() {
                    match diff_skill_roots(&skill.local_path, &target, 0) {
                        Ok((_, diff_files, _, _)) if diff_files == 0 => STATUS_LINKED,
                        Ok(_) => STATUS_DIRECTORY,
                        Err(_) => STATUS_DIRECTORY,
                    }
                } else {
                    STATUS_WRONG
                }
            }
            Err(_) => STATUS_MISSING,
        };
    }

    match fs::symlink_metadata(&target) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() {
                if is_same_symlink_target(&target, &skill.local_path) {
                    STATUS_LINKED
                } else {
                    STATUS_WRONG
                }
            } else {
                STATUS_DIRECTORY
            }
        }
        Err(_) => STATUS_MISSING,
    }
}
pub(super) fn get_workspace_root(
    conn: &Connection,
    workspace_id: &str,
) -> Result<PathBuf, AppError> {
    let root_path = conn
        .query_row(
            "SELECT root_path FROM workspaces WHERE id = ?1",
            params![workspace_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .ok_or_else(AppError::workspace_not_found)?;
    Ok(PathBuf::from(root_path))
}

pub(super) fn list_tool_targets(
    conn: &Connection,
    workspace_id: &str,
) -> Result<Vec<ToolTarget>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT
            ac.id,
            ac.agent_type,
            COALESCE(NULLIF(dt.skills_path, ''), ''),
            COALESCE(dt.install_mode, ''),
            ac.root_dir
         FROM agent_connections ac
         LEFT JOIN distribution_targets dt
           ON dt.workspace_id = ac.workspace_id
          AND lower(dt.platform) = lower(ac.agent_type)
         WHERE ac.workspace_id = ?1
           AND ac.enabled = 1
         ORDER BY ac.agent_type ASC",
    )?;
    let rows = stmt.query_map(params![workspace_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
        ))
    })?;
    let mut targets = Vec::new();
    for row in rows {
        let (id, platform, skills_path, install_mode, root_dir) = row?;
        let next_skills_path = if skills_path.trim().is_empty() {
            if root_dir.trim().is_empty() {
                continue;
            }
            Path::new(root_dir.trim())
                .join("skills")
                .to_string_lossy()
                .to_string()
        } else {
            skills_path
        };
        targets.push(ToolTarget {
            id,
            platform,
            skills_path: next_skills_path,
            install_mode: normalize_install_mode(&install_mode).to_string(),
        });
    }
    Ok(targets)
}

pub(super) fn list_skills(conn: &Connection) -> Result<Vec<SkillRow>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, name, source, local_path, created_at
         FROM skills_assets
         ORDER BY name ASC, updated_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(SkillRow {
            id: row.get(0)?,
            name: row.get(1)?,
            source: row.get(2)?,
            local_path: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;
    let mut list = Vec::new();
    for row in rows {
        list.push(row?);
    }
    Ok(list)
}

fn skill_source_binding_from_row(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<SkillSourceBindingRow> {
    Ok(SkillSourceBindingRow {
        asset_id: row.get(0)?,
        identity: row.get(1)?,
        name: row.get(2)?,
        local_path: row.get(3)?,
        source_local_path: row.get(4)?,
        source_type: row.get(5)?,
        source: row.get(6)?,
        source_url: row.get(7)?,
        skill_path: row.get(8)?,
        repo_owner: row.get(9)?,
        repo_name: row.get(10)?,
        repo_ref: row.get(11)?,
    })
}

fn query_skill_source_binding_rows(
    conn: &Connection,
    skill_ids: Option<&[String]>,
) -> Result<Vec<SkillSourceBindingRow>, AppError> {
    let base_sql = "SELECT
            sa.id,
            sa.identity,
            sa.name,
            sa.local_path,
            COALESCE(NULLIF(ss.source_local_path, ''), COALESCE(sa.source_local_path, ''), ''),
            COALESCE(ss.source_type, 'local'),
            COALESCE(ss.source, ''),
            COALESCE(ss.source_url, ''),
            COALESCE(ss.skill_path, ''),
            COALESCE(ss.repo_owner, ''),
            COALESCE(ss.repo_name, ''),
            COALESCE(ss.repo_ref, '')
         FROM skills_assets sa
         LEFT JOIN skills_asset_sources ss ON ss.asset_id = sa.id";

    let mut rows_out: Vec<SkillSourceBindingRow> = Vec::new();
    match skill_ids {
        Some(ids) => {
            for skill_id in ids {
                let row = conn
                    .query_row(
                        &format!("{base_sql} WHERE sa.id = ?1"),
                        params![skill_id],
                        skill_source_binding_from_row,
                    )
                    .optional()?;
                if let Some(item) = row {
                    rows_out.push(item);
                }
            }
        }
        None => {
            let mut stmt = conn.prepare(&format!("{base_sql} ORDER BY sa.name ASC"))?;
            let rows = stmt.query_map([], skill_source_binding_from_row)?;
            for row in rows {
                rows_out.push(row?);
            }
        }
    }
    Ok(rows_out)
}

pub(super) fn list_skills_for_external_update_check(
    conn: &Connection,
    skill_ids: Option<&[String]>,
) -> Result<Vec<SkillSourceBindingRow>, AppError> {
    if let Some(ids) = skill_ids {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
    }
    query_skill_source_binding_rows(conn, skill_ids)
}

pub(super) fn save_skill_external_hash_check(
    conn: &Connection,
    skill: &SkillSourceBindingRow,
    local_hash: &str,
    remote_hash: &str,
    update_candidate: bool,
    checked_at: &str,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE skills_assets
         SET update_candidate = ?2, updated_at = ?3
         WHERE id = ?1",
        params![
            skill.asset_id,
            if update_candidate { 1 } else { 0 },
            now_rfc3339(),
        ],
    )?;

    let now = now_rfc3339();
    let existing_id = conn
        .query_row(
            "SELECT id FROM skills_asset_sources WHERE asset_id = ?1",
            params![skill.asset_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?;

    if let Some(id) = existing_id {
        conn.execute(
            "UPDATE skills_asset_sources
             SET source_local_path = CASE
                    WHEN trim(COALESCE(source_local_path, '')) = ''
                    THEN ?2
                    ELSE source_local_path
                 END,
                 local_content_hash = ?3,
                 remote_content_hash = ?4,
                 hash_checked_at = ?5,
                 updated_at = ?6
             WHERE id = ?1",
            params![
                id,
                skill.source_local_path,
                local_hash,
                remote_hash,
                checked_at,
                now
            ],
        )?;
    } else {
        conn.execute(
            "INSERT INTO skills_asset_sources(
                id,
                asset_id,
                source_type,
                source,
                source_url,
                skill_path,
                repo_owner,
                repo_name,
                repo_ref,
                source_local_path,
                local_content_hash,
                remote_content_hash,
                hash_checked_at,
                created_at,
                updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                Uuid::new_v4().to_string(),
                skill.asset_id,
                skill.source_type,
                skill.source,
                skill.source_url,
                skill.skill_path,
                skill.repo_owner,
                skill.repo_name,
                skill.repo_ref,
                skill.source_local_path,
                local_hash,
                remote_hash,
                checked_at,
                now,
                now,
            ],
        )?;
    }

    Ok(())
}

pub(super) fn load_skills_manager_config(
    conn: &Connection,
    workspace_id: &str,
) -> Result<SkillsManagerConfig, AppError> {
    conn.execute(
        "INSERT OR IGNORE INTO skills_manager_configs(
            workspace_id,
            rules_json,
            group_rules_json,
            tool_rules_json,
            manual_unlinks_json,
            deleted_skills_json,
            updated_at
         ) VALUES (?1, '{}', '{}', '{}', '{}', '[]', ?2)",
        params![workspace_id, now_rfc3339()],
    )?;

    let row = conn
        .query_row(
            "SELECT rules_json, group_rules_json, tool_rules_json, manual_unlinks_json, deleted_skills_json
             FROM skills_manager_configs
             WHERE workspace_id = ?1",
            params![workspace_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| AppError::internal("skills_manager 配置读取失败"))?;

    let rules = parse_json_or_default::<HashMap<String, SkillsManagerRuleValue>>(&row.0)?;
    let group_rules = parse_json_or_default::<HashMap<String, SkillsManagerRuleValue>>(&row.1)?;
    let tool_rules = parse_json_or_default::<HashMap<String, SkillsManagerToolRuleValue>>(&row.2)?;
    let manual_unlinks = parse_json_or_default::<HashMap<String, Vec<String>>>(&row.3)?;
    let deleted_skills = parse_json_or_default::<Vec<String>>(&row.4)?;

    Ok(SkillsManagerConfig {
        rules,
        group_rules,
        tool_rules,
        manual_unlinks,
        deleted_skills,
    })
}

pub(super) fn save_skills_manager_config(
    conn: &Connection,
    workspace_id: &str,
    config: &SkillsManagerConfig,
) -> Result<(), AppError> {
    let rules =
        serde_json::to_string(&config.rules).map_err(|err| AppError::internal(err.to_string()))?;
    let group_rules = serde_json::to_string(&config.group_rules)
        .map_err(|err| AppError::internal(err.to_string()))?;
    let tool_rules = serde_json::to_string(&config.tool_rules)
        .map_err(|err| AppError::internal(err.to_string()))?;
    let manual_unlinks = serde_json::to_string(&config.manual_unlinks)
        .map_err(|err| AppError::internal(err.to_string()))?;
    let deleted_skills = serde_json::to_string(&config.deleted_skills)
        .map_err(|err| AppError::internal(err.to_string()))?;

    conn.execute(
        "INSERT INTO skills_manager_configs(
            workspace_id,
            rules_json,
            group_rules_json,
            tool_rules_json,
            manual_unlinks_json,
            deleted_skills_json,
            updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(workspace_id) DO UPDATE SET
            rules_json = excluded.rules_json,
            group_rules_json = excluded.group_rules_json,
            tool_rules_json = excluded.tool_rules_json,
            manual_unlinks_json = excluded.manual_unlinks_json,
            deleted_skills_json = excluded.deleted_skills_json,
            updated_at = excluded.updated_at",
        params![
            workspace_id,
            rules,
            group_rules,
            tool_rules,
            manual_unlinks,
            deleted_skills,
            now_rfc3339(),
        ],
    )?;
    Ok(())
}

pub(super) fn parse_json_or_default<T>(raw: &str) -> Result<T, AppError>
where
    T: DeserializeOwned + Default,
{
    if raw.trim().is_empty() {
        return Ok(T::default());
    }
    serde_json::from_str(raw)
        .map_err(|err| AppError::internal(format!("解析 skills_manager 配置失败: {err}")))
}

pub(super) fn append_audit_event(
    conn: &Connection,
    workspace_id: Option<&str>,
    event_type: &str,
    operator: &str,
    payload: Value,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO audit_events(id, workspace_id, event_type, operator, payload, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            Uuid::new_v4().to_string(),
            workspace_id,
            event_type,
            operator,
            payload.to_string(),
            now_rfc3339(),
        ],
    )?;
    Ok(())
}
