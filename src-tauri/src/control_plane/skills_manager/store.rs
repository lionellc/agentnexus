use super::*;

pub(super) fn build_manager_snapshot(
    workspace_root: &Path,
    conn: &Connection,
    config: &SkillsManagerConfig,
    workspace_id: &str,
) -> Result<Value, AppError> {
    let tools = list_tool_targets(conn, workspace_id)?;
    let skills = list_skills(conn)?;

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
pub(super) fn get_workspace_root(conn: &Connection, workspace_id: &str) -> Result<PathBuf, AppError> {
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

pub(super) fn list_tool_targets(conn: &Connection, workspace_id: &str) -> Result<Vec<ToolTarget>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, platform, skills_path, COALESCE(install_mode, 'copy')
         FROM distribution_targets
         WHERE workspace_id = ?1
         ORDER BY platform ASC",
    )?;
    let rows = stmt.query_map(params![workspace_id], |row| {
        Ok(ToolTarget {
            id: row.get(0)?,
            platform: row.get(1)?,
            skills_path: row.get(2)?,
            install_mode: row.get(3)?,
        })
    })?;
    let mut targets = Vec::new();
    for row in rows {
        targets.push(row?);
    }
    Ok(targets)
}

pub(super) fn list_skills(conn: &Connection) -> Result<Vec<SkillRow>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, name, source, local_path
         FROM skills_assets
         ORDER BY name ASC, updated_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(SkillRow {
            id: row.get(0)?,
            name: row.get(1)?,
            source: row.get(2)?,
            local_path: row.get(3)?,
        })
    })?;
    let mut list = Vec::new();
    for row in rows {
        list.push(row?);
    }
    Ok(list)
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
