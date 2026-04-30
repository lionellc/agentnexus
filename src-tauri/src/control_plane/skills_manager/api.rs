use super::*;

#[tauri::command]
pub fn skills_manager_state(
    state: State<'_, AppState>,
    input: SkillsManagerStateInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    let workspace_root = get_workspace_root(&conn, &input.workspace_id)?;
    let config = load_skills_manager_config(&conn, &input.workspace_id)?;
    build_manager_snapshot(&workspace_root, &conn, &config, &input.workspace_id)
}

#[tauri::command]
pub fn skills_manager_sync(
    state: State<'_, AppState>,
    input: SkillsManagerActionInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    let workspace_root = get_workspace_root(&conn, &input.workspace_id)?;
    let config = load_skills_manager_config(&conn, &input.workspace_id)?;
    let tools = list_tool_targets(&conn, &input.workspace_id)?;
    if tools.is_empty() {
        return Err(AppError::invalid_argument("当前 workspace 未配置分发目标"));
    }

    let mut skills = list_skills(&conn)?;
    skills.sort_by(|left, right| left.name.cmp(&right.name));

    let deleted: HashSet<String> = config.deleted_skills.iter().cloned().collect();
    let mut seen_name: HashMap<String, String> = HashMap::new();
    let mut conflict_names: HashSet<String> = HashSet::new();

    for skill in &skills {
        if deleted.contains(&skill.name) {
            continue;
        }
        if let Some(existing) = seen_name.insert(skill.name.clone(), skill.id.clone()) {
            conflict_names.insert(skill.name.clone());
            seen_name.insert(skill.name.clone(), existing);
        }
    }

    let mut log: Vec<String> = Vec::new();
    let mut created = 0_i64;
    let mut skipped = 0_i64;
    let mut blocked = 0_i64;
    let mut manual = 0_i64;
    let mut warned = 0_i64;

    for skill in skills {
        if deleted.contains(&skill.name) {
            continue;
        }
        if conflict_names.contains(&skill.name) {
            warned += 1;
            log.push(format!(
                "[warn] 名称冲突: \"{}\"，已跳过自动同步",
                skill.name
            ));
            continue;
        }

        let runtime = to_runtime_skill(&skill);
        for tool in &tools {
            if !is_allowed(
                &runtime.name,
                &tool.platform,
                &runtime.group,
                &config.tool_rules,
                &config.group_rules,
                &config.rules,
            ) {
                blocked += 1;
                continue;
            }

            if is_manual_unlinked(&config.manual_unlinks, &runtime.name, &tool.platform) {
                manual += 1;
                continue;
            }

            let safe_tool_dir =
                resolve_distribution_target_path(&workspace_root, Path::new(&tool.skills_path));
            let tool_dir = match safe_tool_dir {
                Ok(value) => value,
                Err(err) => {
                    warned += 1;
                    log.push(format!(
                        "[err] {}: 目标路径不可用，{}",
                        tool.platform, err.message
                    ));
                    continue;
                }
            };

            fs::create_dir_all(&tool_dir)?;
            let target = tool_dir.join(&runtime.name);
            match fs::symlink_metadata(&target) {
                Ok(metadata) => {
                    if metadata.file_type().is_symlink() {
                        if is_same_symlink_target(&target, &runtime.local_path) {
                            skipped += 1;
                        } else {
                            match replace_link_target_with_symlink(&runtime.local_path, &target) {
                                Ok(_) => {
                                    created += 1;
                                    log.push(format!(
                                        "[ok]   覆盖 {} / {}",
                                        tool.platform, runtime.name
                                    ));
                                }
                                Err(err) => {
                                    warned += 1;
                                    log.push(format!(
                                        "[err]  {} / {}: {}",
                                        tool.platform, runtime.name, err.message
                                    ));
                                }
                            }
                        }
                    } else {
                        match replace_link_target_with_symlink(&runtime.local_path, &target) {
                            Ok(_) => {
                                created += 1;
                                log.push(format!(
                                    "[ok]   覆盖 {} / {}",
                                    tool.platform, runtime.name
                                ));
                            }
                            Err(err) => {
                                warned += 1;
                                log.push(format!(
                                    "[err]  {} / {}: {}",
                                    tool.platform, runtime.name, err.message
                                ));
                            }
                        }
                    }
                }
                Err(_) => match create_symlink_dir(&runtime.local_path, &target) {
                    Ok(_) => {
                        created += 1;
                        log.push(format!("[ok]   新建 {} / {}", tool.platform, runtime.name));
                    }
                    Err(err) => {
                        warned += 1;
                        log.push(format!(
                            "[err]  {} / {}: {}",
                            tool.platform, runtime.name, err.message
                        ));
                    }
                },
            }
        }
    }

    let mut summary_parts = vec![
        format!("新建 {}", created),
        format!("已有 {}", skipped),
        format!("屏蔽跳过 {}", blocked),
    ];
    if manual > 0 {
        summary_parts.push(format!("手动跳过 {}", manual));
    }
    if warned > 0 {
        summary_parts.push(format!("警告 {}", warned));
    }
    log.push(format!("完成: {}", summary_parts.join("，")));

    append_audit_event(
        &conn,
        Some(&input.workspace_id),
        "skills_manager_sync",
        input.operator.as_deref().unwrap_or("system"),
        json!({
            "workspaceId": input.workspace_id,
            "created": created,
            "skipped": skipped,
            "blocked": blocked,
            "manual": manual,
            "warned": warned,
        }),
    )?;

    Ok(json!({
        "ok": true,
        "summary": {
            "created": created,
            "skipped": skipped,
            "blocked": blocked,
            "manual": manual,
            "warned": warned,
        },
        "output": log.join("\n"),
    }))
}

#[tauri::command]
pub fn skills_manager_clean(
    state: State<'_, AppState>,
    input: SkillsManagerActionInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    let workspace_root = get_workspace_root(&conn, &input.workspace_id)?;
    let tools = list_tool_targets(&conn, &input.workspace_id)?;
    if tools.is_empty() {
        return Err(AppError::invalid_argument("当前 workspace 未配置分发目标"));
    }

    let mut cleaned = 0_i64;
    let mut warned = 0_i64;
    let mut log: Vec<String> = Vec::new();

    for tool in tools {
        let safe_tool_dir =
            resolve_distribution_target_path(&workspace_root, Path::new(&tool.skills_path));
        let tool_dir = match safe_tool_dir {
            Ok(value) => value,
            Err(err) => {
                warned += 1;
                log.push(format!(
                    "[err] {}: 目标路径不可用，{}",
                    tool.platform, err.message
                ));
                continue;
            }
        };

        let entries = match fs::read_dir(&tool_dir) {
            Ok(rows) => rows,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let target = entry.path();
            let metadata = match fs::symlink_metadata(&target) {
                Ok(value) => value,
                Err(_) => continue,
            };
            if !metadata.file_type().is_symlink() {
                continue;
            }
            if fs::metadata(&target).is_ok() {
                continue;
            }
            match fs::remove_file(&target) {
                Ok(_) => {
                    cleaned += 1;
                    let display_name = entry.file_name().to_string_lossy().to_string();
                    log.push(format!(
                        "[ok]   删除失效链接: {} / {}",
                        tool.platform, display_name
                    ));
                }
                Err(err) => {
                    warned += 1;
                    log.push(format!("[err]  {}: 清理失败，{}", tool.platform, err));
                }
            }
        }
    }

    log.push(format!("清理完成，删除 {} 个失效链接", cleaned));

    append_audit_event(
        &conn,
        Some(&input.workspace_id),
        "skills_manager_clean",
        input.operator.as_deref().unwrap_or("system"),
        json!({
            "workspaceId": input.workspace_id,
            "cleaned": cleaned,
            "warned": warned,
        }),
    )?;

    Ok(json!({
        "ok": true,
        "summary": {
            "cleaned": cleaned,
            "warned": warned,
        },
        "output": log.join("\n"),
    }))
}

#[tauri::command]
pub fn skills_manager_batch_link(
    state: State<'_, AppState>,
    input: SkillsManagerBatchInput,
) -> Result<Value, AppError> {
    run_batch_action(state, input, true)
}

#[tauri::command]
pub fn skills_manager_batch_unlink(
    state: State<'_, AppState>,
    input: SkillsManagerBatchInput,
) -> Result<Value, AppError> {
    run_batch_action(state, input, false)
}

#[tauri::command]
pub fn skills_manager_delete(
    state: State<'_, AppState>,
    input: SkillsManagerDeleteInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    let workspace_root = get_workspace_root(&conn, &input.workspace_id)?;
    let mut config = load_skills_manager_config(&conn, &input.workspace_id)?;
    let tools = list_tool_targets(&conn, &input.workspace_id)?;
    let skills = list_skills(&conn)?;
    let skill = skills
        .iter()
        .find(|item| item.id == input.skill_id)
        .cloned()
        .ok_or_else(|| AppError::invalid_argument("skill 不存在"))?;

    if !config.deleted_skills.contains(&skill.name) {
        config.deleted_skills.push(skill.name.clone());
        config.deleted_skills.sort();
        config.deleted_skills.dedup();
    }
    config.manual_unlinks.remove(&skill.name);

    let mut removed: Vec<String> = Vec::new();
    for tool in tools {
        let safe_tool_dir =
            match resolve_distribution_target_path(&workspace_root, Path::new(&tool.skills_path)) {
                Ok(value) => value,
                Err(_) => continue,
            };
        let target = safe_tool_dir.join(&skill.name);
        if let Ok(metadata) = fs::symlink_metadata(&target) {
            if metadata.file_type().is_symlink() && fs::remove_file(&target).is_ok() {
                removed.push(tool.platform);
            }
        }
    }

    save_skills_manager_config(&conn, &input.workspace_id, &config)?;

    append_audit_event(
        &conn,
        Some(&input.workspace_id),
        "skills_manager_delete",
        input.operator.as_deref().unwrap_or("system"),
        json!({
            "workspaceId": input.workspace_id,
            "skillId": input.skill_id,
            "skillName": skill.name,
            "removedTools": removed,
            "deletedCount": config.deleted_skills.len(),
        }),
    )?;

    Ok(json!({
        "ok": true,
        "skillId": skill.id,
        "skillName": skill.name,
        "removedTools": removed,
        "deletedCount": config.deleted_skills.len(),
    }))
}

#[tauri::command]
pub fn skills_manager_purge(
    state: State<'_, AppState>,
    input: SkillsManagerDeleteInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    let workspace_root = get_workspace_root(&conn, &input.workspace_id)?;
    let mut config = load_skills_manager_config(&conn, &input.workspace_id)?;
    let tools = list_tool_targets(&conn, &input.workspace_id)?;
    let skills = list_skills(&conn)?;
    let skill = skills
        .iter()
        .find(|item| item.id == input.skill_id)
        .cloned()
        .ok_or_else(|| AppError::invalid_argument("skill 不存在"))?;

    let mut removed_tools: Vec<String> = Vec::new();
    for tool in tools {
        let safe_tool_dir =
            match resolve_distribution_target_path(&workspace_root, Path::new(&tool.skills_path)) {
                Ok(value) => value,
                Err(_) => continue,
            };
        let target = safe_tool_dir.join(&skill.name);
        let metadata = match fs::symlink_metadata(&target) {
            Ok(value) => value,
            Err(_) => continue,
        };
        if metadata.file_type().is_symlink() && fs::remove_file(&target).is_ok() {
            removed_tools.push(tool.platform);
        }
    }

    let deleted_assets = conn.execute(
        "DELETE FROM skills_assets WHERE id = ?1",
        params![&input.skill_id],
    )?;
    if deleted_assets == 0 {
        return Err(AppError::invalid_argument("skill 不存在"));
    }

    config.manual_unlinks.remove(&skill.name);
    config.deleted_skills.retain(|name| name != &skill.name);
    save_skills_manager_config(&conn, &input.workspace_id, &config)?;

    append_audit_event(
        &conn,
        Some(&input.workspace_id),
        "skills_manager_purge",
        input.operator.as_deref().unwrap_or("system"),
        json!({
            "workspaceId": input.workspace_id,
            "skillId": input.skill_id,
            "skillName": skill.name,
            "removedTools": removed_tools,
            "deletedAssets": deleted_assets,
        }),
    )?;

    Ok(json!({
        "ok": true,
        "skillId": skill.id,
        "skillName": skill.name,
        "removedTools": removed_tools,
        "deletedAssets": deleted_assets,
    }))
}

#[tauri::command]
pub fn skills_manager_restore(
    state: State<'_, AppState>,
    input: SkillsManagerRestoreInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    get_workspace_root(&conn, &input.workspace_id)?;
    let mut config = load_skills_manager_config(&conn, &input.workspace_id)?;
    config
        .deleted_skills
        .retain(|name| name != &input.skill_name);
    save_skills_manager_config(&conn, &input.workspace_id, &config)?;

    append_audit_event(
        &conn,
        Some(&input.workspace_id),
        "skills_manager_restore",
        input.operator.as_deref().unwrap_or("system"),
        json!({
            "workspaceId": input.workspace_id,
            "skillName": input.skill_name,
            "deletedCount": config.deleted_skills.len(),
        }),
    )?;

    Ok(json!({
        "ok": true,
        "skillName": input.skill_name,
        "deletedCount": config.deleted_skills.len(),
    }))
}

#[tauri::command]
pub fn skills_manager_rules_update(
    state: State<'_, AppState>,
    input: SkillsManagerRulesUpdateInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    get_workspace_root(&conn, &input.workspace_id)?;
    let mut config = load_skills_manager_config(&conn, &input.workspace_id)?;

    if let Some(rules) = input.rules {
        config.rules = sanitize_rule_map(rules)?;
    }
    if let Some(group_rules) = input.group_rules {
        config.group_rules = sanitize_rule_map(group_rules)?;
    }
    if let Some(tool_rules) = input.tool_rules {
        config.tool_rules = sanitize_tool_rule_map(tool_rules)?;
    }

    save_skills_manager_config(&conn, &input.workspace_id, &config)?;

    append_audit_event(
        &conn,
        Some(&input.workspace_id),
        "skills_manager_rules_update",
        input.operator.as_deref().unwrap_or("system"),
        json!({
            "workspaceId": input.workspace_id,
            "rules": config.rules.len(),
            "groupRules": config.group_rules.len(),
            "toolRules": config.tool_rules.len(),
        }),
    )?;

    Ok(json!({
        "ok": true,
        "rules": config.rules,
        "groupRules": config.group_rules,
        "toolRules": config.tool_rules,
    }))
}

#[tauri::command]
pub fn skills_manager_diff_start(
    state: State<'_, AppState>,
    input: SkillsManagerDiffStartInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    get_workspace_root(&conn, &input.workspace_id)?;
    let skills = list_skills(&conn)?;

    let left = skills
        .iter()
        .find(|item| item.id == input.left_skill_id)
        .cloned()
        .ok_or_else(|| AppError::invalid_argument("left skill 不存在"))?;
    let right = skills
        .iter()
        .find(|item| item.id == input.right_skill_id)
        .cloned()
        .ok_or_else(|| AppError::invalid_argument("right skill 不存在"))?;

    if left.id == right.id {
        return Err(AppError::invalid_argument("无法对同一个 skill 执行 diff"));
    }

    let now = now_rfc3339();
    let job_id = Uuid::new_v4().to_string();
    let state_arc = Arc::new(Mutex::new(SkillsManagerDiffJobState {
        job_id: job_id.clone(),
        workspace_id: input.workspace_id.clone(),
        left_skill_id: left.id.clone(),
        right_skill_id: right.id.clone(),
        left_skill_name: left.name.clone(),
        right_skill_name: right.name.clone(),
        status: DIFF_STATUS_RUNNING.to_string(),
        total_files: 0,
        processed_files: 0,
        current_file: String::new(),
        diff_files: 0,
        same_skill: None,
        error_message: String::new(),
        started_at: now.clone(),
        updated_at: now,
        entries: Vec::new(),
    }));
    let cancel_flag = Arc::new(AtomicBool::new(false));
    let handle = SkillsManagerDiffJobHandle {
        state: state_arc.clone(),
        cancel_flag: cancel_flag.clone(),
    };

    {
        let mut jobs = lock_diff_jobs()?;
        prune_diff_jobs(&mut jobs);
        jobs.insert(job_id.clone(), handle);
    }

    spawn_diff_worker(
        state_arc,
        cancel_flag,
        PathBuf::from(&left.local_path),
        PathBuf::from(&right.local_path),
    );

    append_audit_event(
        &conn,
        Some(&input.workspace_id),
        "skills_manager_diff_start",
        input.operator.as_deref().unwrap_or("system"),
        json!({
            "workspaceId": input.workspace_id,
            "jobId": job_id,
            "leftSkillId": left.id,
            "rightSkillId": right.id,
            "leftSkillName": left.name,
            "rightSkillName": right.name,
        }),
    )?;

    let snapshot = diff_job_snapshot(&job_id, &input.workspace_id)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn skills_manager_diff_progress(
    _state: State<'_, AppState>,
    input: SkillsManagerDiffJobInput,
) -> Result<Value, AppError> {
    diff_job_snapshot(&input.job_id, &input.workspace_id)
}

#[tauri::command]
pub fn skills_manager_diff_cancel(
    state: State<'_, AppState>,
    input: SkillsManagerDiffJobInput,
) -> Result<Value, AppError> {
    let mut jobs = lock_diff_jobs()?;
    let handle = jobs
        .get_mut(&input.job_id)
        .ok_or_else(|| AppError::invalid_argument("diff job 不存在"))?;

    {
        let mut job = handle
            .state
            .lock()
            .map_err(|_| AppError::internal("diff job 状态锁异常"))?;
        if job.workspace_id != input.workspace_id {
            return Err(AppError::invalid_argument("workspace 不匹配"));
        }
        if job.status == DIFF_STATUS_RUNNING {
            job.status = DIFF_STATUS_CANCELLING.to_string();
            job.updated_at = now_rfc3339();
        }
    }

    handle.cancel_flag.store(true, Ordering::Relaxed);

    let conn = state.open()?;
    append_audit_event(
        &conn,
        Some(&input.workspace_id),
        "skills_manager_diff_cancel",
        input.operator.as_deref().unwrap_or("system"),
        json!({
            "workspaceId": input.workspace_id,
            "jobId": input.job_id,
        }),
    )?;

    diff_job_snapshot(&input.job_id, &input.workspace_id)
}

#[tauri::command]
pub fn skills_manager_link_preview(
    state: State<'_, AppState>,
    input: SkillsManagerLinkPreviewInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    let workspace_root = get_workspace_root(&conn, &input.workspace_id)?;
    let config = load_skills_manager_config(&conn, &input.workspace_id)?;
    let tools = list_tool_targets(&conn, &input.workspace_id)?;
    let skills = list_skills(&conn)?;
    let deleted: HashSet<String> = config.deleted_skills.iter().cloned().collect();

    let skill = skills
        .iter()
        .find(|item| item.id == input.skill_id)
        .map(to_runtime_skill)
        .ok_or_else(|| AppError::invalid_argument("skill 不存在"))?;
    if deleted.contains(&skill.name) {
        return Err(AppError::invalid_argument("skill 已被删除（soft-delete）"));
    }
    let tool = tools
        .iter()
        .find(|item| item.platform == input.tool)
        .cloned()
        .ok_or_else(|| AppError::invalid_argument("工具不存在"))?;

    let max_entries = input.max_entries.unwrap_or(24).min(200);
    let preview = build_link_preview(
        &workspace_root,
        &input.workspace_id,
        &skill,
        &tool,
        &config,
        max_entries,
    )?;
    serde_json::to_value(preview).map_err(|err| AppError::internal(err.to_string()))
}

#[tauri::command]
pub fn skills_manager_update_then_link(
    state: State<'_, AppState>,
    input: SkillsManagerUpdateThenLinkInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    let workspace_root = get_workspace_root(&conn, &input.workspace_id)?;
    let mut config = load_skills_manager_config(&conn, &input.workspace_id)?;
    let tools = list_tool_targets(&conn, &input.workspace_id)?;
    let skills = list_skills(&conn)?;
    let deleted: HashSet<String> = config.deleted_skills.iter().cloned().collect();

    let skill_map: HashMap<String, SkillRuntime> = skills
        .iter()
        .map(|item| (item.id.clone(), to_runtime_skill(item)))
        .collect();
    let tool_map: HashMap<String, ToolTarget> = tools
        .iter()
        .map(|item| (item.platform.clone(), item.clone()))
        .collect();

    let skill = skill_map
        .get(&input.skill_id)
        .ok_or_else(|| AppError::invalid_argument("skill 不存在"))?;
    let tool = tool_map
        .get(&input.tool)
        .ok_or_else(|| AppError::invalid_argument("工具不存在"))?;
    if deleted.contains(&skill.name) {
        return Err(AppError::invalid_argument("skill 已被删除（soft-delete）"));
    }

    let preview = build_link_preview(
        &workspace_root,
        &input.workspace_id,
        skill,
        tool,
        &config,
        0,
    )?;
    if !preview.can_link {
        return Err(AppError::invalid_argument(preview.message));
    }

    let update_source_path = resolve_update_source_path(&preview)?;
    let updated = replace_source_skill_from_target(&skill.local_path, &update_source_path)?;

    let batch_item = SkillsManagerBatchItemInput {
        skill_id: input.skill_id.clone(),
        tool: input.tool.clone(),
        force: Some(true),
    };
    let link_result = run_single_batch_item(
        &workspace_root,
        &batch_item,
        &skill_map,
        &tool_map,
        &mut config,
        &deleted,
        true,
    );
    if !link_result.ok {
        return Err(AppError::invalid_argument(link_result.message));
    }

    save_skills_manager_config(&conn, &input.workspace_id, &config)?;
    append_audit_event(
        &conn,
        Some(&input.workspace_id),
        "skills_manager_update_then_link",
        input.operator.as_deref().unwrap_or("system"),
        json!({
            "workspaceId": input.workspace_id,
            "skillId": input.skill_id,
            "tool": input.tool,
            "updated": updated,
            "targetPath": preview.target_path,
            "targetKind": preview.target_kind,
            "diffFiles": preview.diff_files,
        }),
    )?;

    Ok(json!({
        "ok": true,
        "updated": updated,
        "linked": true,
        "message": if updated { "已更新 skill 并完成链接。" } else { "已完成链接，未发生内容更新。" },
    }))
}
