use super::*;

pub(super) fn run_batch_action(
    state: State<'_, AppState>,
    input: SkillsManagerBatchInput,
    is_link: bool,
) -> Result<Value, AppError> {
    if input.items.is_empty() {
        return Err(AppError::invalid_argument("items 不能为空"));
    }

    let conn = state.open()?;
    let workspace_root = get_workspace_root(&conn, &input.workspace_id)?;
    let mut config = load_skills_manager_config(&conn, &input.workspace_id)?;
    let tools = list_tool_targets(&conn, &input.workspace_id)?;
    let skills = list_skills(&conn)?;

    let skill_map: HashMap<String, SkillRuntime> = skills
        .iter()
        .map(|item| (item.id.clone(), to_runtime_skill(item)))
        .collect();
    let tool_map: HashMap<String, ToolTarget> = tools
        .iter()
        .map(|item| (item.platform.clone(), item.clone()))
        .collect();
    let deleted: HashSet<String> = config.deleted_skills.iter().cloned().collect();

    let mut success = 0_i64;
    let mut failed = 0_i64;
    let mut results: Vec<Value> = Vec::new();

    for item in &input.items {
        let result = run_single_batch_item(
            &workspace_root,
            item,
            &skill_map,
            &tool_map,
            &mut config,
            &deleted,
            is_link,
        );
        if result.ok {
            success += 1;
        } else {
            failed += 1;
        }
        results.push(json!({
            "skillId": item.skill_id,
            "tool": item.tool,
            "ok": result.ok,
            "message": result.message,
        }));
    }

    save_skills_manager_config(&conn, &input.workspace_id, &config)?;

    let action = if is_link {
        "skills_manager_batch_link"
    } else {
        "skills_manager_batch_unlink"
    };
    append_audit_event(
        &conn,
        Some(&input.workspace_id),
        action,
        input.operator.as_deref().unwrap_or("system"),
        json!({
            "workspaceId": input.workspace_id,
            "total": input.items.len(),
            "success": success,
            "failed": failed,
        }),
    )?;

    Ok(json!({
        "ok": true,
        "results": results,
        "summary": {
            "total": input.items.len(),
            "success": success,
            "failed": failed,
        },
    }))
}

pub(super) fn resolve_update_source_path(
    preview: &SkillsManagerLinkPreview,
) -> Result<PathBuf, AppError> {
    let target = PathBuf::from(&preview.target_path);
    let metadata = fs::symlink_metadata(&target)
        .map_err(|_| AppError::invalid_argument("目标不存在，无法执行更新后链接"))?;

    if metadata.file_type().is_symlink() {
        let resolved = resolve_link_target_path(&target)
            .map_err(|_| AppError::invalid_argument("目标软链接读取失败，无法执行更新后链接"))?;
        if resolved.exists() && resolved.is_dir() {
            return Ok(resolved);
        }
        return Err(AppError::invalid_argument(
            "目标软链接未指向可读目录，无法执行更新后链接",
        ));
    }

    if metadata.is_dir() {
        return Ok(target);
    }

    Err(AppError::invalid_argument(
        "目标不是目录，无法执行更新后链接",
    ))
}

pub(super) fn replace_source_skill_from_target(
    source_skill_path: &Path,
    update_source_path: &Path,
) -> Result<bool, AppError> {
    if normalize_path(source_skill_path) == normalize_path(update_source_path) {
        return Ok(false);
    }
    replace_link_target_with_copy(update_source_path, source_skill_path)?;
    Ok(true)
}

#[derive(Debug)]
pub(super) struct BatchItemResult {
    pub(super) ok: bool,
    pub(super) message: String,
}

pub(super) fn run_single_batch_item(
    workspace_root: &Path,
    item: &SkillsManagerBatchItemInput,
    skill_map: &HashMap<String, SkillRuntime>,
    tool_map: &HashMap<String, ToolTarget>,
    config: &mut SkillsManagerConfig,
    deleted: &HashSet<String>,
    is_link: bool,
) -> BatchItemResult {
    let skill = match skill_map.get(&item.skill_id) {
        Some(value) => value,
        None => {
            return BatchItemResult {
                ok: false,
                message: "skill 不存在".to_string(),
            };
        }
    };
    let tool = match tool_map.get(&item.tool) {
        Some(value) => value,
        None => {
            return BatchItemResult {
                ok: false,
                message: "工具不存在".to_string(),
            };
        }
    };
    if deleted.contains(&skill.name) {
        return BatchItemResult {
            ok: false,
            message: "skill 已被删除（soft-delete）".to_string(),
        };
    }

    if is_link {
        let preview = match build_link_preview(workspace_root, "", skill, tool, config, 0) {
            Ok(value) => value,
            Err(err) => {
                return BatchItemResult {
                    ok: false,
                    message: err.message,
                };
            }
        };
        if !preview.can_link {
            return BatchItemResult {
                ok: false,
                message: preview.message,
            };
        }
        if preview.requires_confirm && !item.force.unwrap_or(false) {
            return BatchItemResult {
                ok: false,
                message: format!(
                    "{}（检测到 {} 个差异文件，请确认后重试）",
                    preview.message, preview.diff_files
                ),
            };
        }
        let target = PathBuf::from(&preview.target_path);
        if let Some(parent) = target.parent() {
            if let Err(err) = fs::create_dir_all(parent) {
                return BatchItemResult {
                    ok: false,
                    message: err.to_string(),
                };
            }
        }
        let install_mode = normalize_install_mode(&tool.install_mode);
        let install_result = if install_mode == "copy" {
            replace_link_target_with_copy(&skill.local_path, &target)
        } else {
            replace_link_target_with_symlink(&skill.local_path, &target)
        };
        match install_result {
            Ok(_) => {
                remove_manual_unlink(config, &skill.name, &tool.platform);
                BatchItemResult {
                    ok: true,
                    message: "ok".to_string(),
                }
            }
            Err(err) => BatchItemResult {
                ok: false,
                message: err.message,
            },
        }
    } else {
        let safe_tool_dir =
            match resolve_distribution_target_path(workspace_root, Path::new(&tool.skills_path)) {
                Ok(value) => value,
                Err(err) => {
                    return BatchItemResult {
                        ok: false,
                        message: err.message,
                    };
                }
            };
        let target = safe_tool_dir.join(&skill.name);
        match fs::symlink_metadata(&target) {
            Ok(metadata) => {
                let remove_result = if metadata.is_dir() && !metadata.file_type().is_symlink() {
                    fs::remove_dir_all(&target)
                } else {
                    fs::remove_file(&target)
                };
                if let Err(err) = remove_result {
                    return BatchItemResult {
                        ok: false,
                        message: err.to_string(),
                    };
                }
                add_manual_unlink(config, &skill.name, &tool.platform);
                BatchItemResult {
                    ok: true,
                    message: "ok".to_string(),
                }
            }
            Err(_) => BatchItemResult {
                ok: false,
                message: "链接不存在".to_string(),
            },
        }
    }
}

pub(super) fn build_link_preview(
    workspace_root: &Path,
    workspace_id: &str,
    skill: &SkillRuntime,
    tool: &ToolTarget,
    config: &SkillsManagerConfig,
    max_entries: usize,
) -> Result<SkillsManagerLinkPreview, AppError> {
    let safe_tool_dir =
        resolve_distribution_target_path(workspace_root, Path::new(&tool.skills_path))
            .map_err(|err| AppError::invalid_argument(err.message))?;
    let target = safe_tool_dir.join(&skill.name);

    let mut preview = SkillsManagerLinkPreview {
        workspace_id: workspace_id.to_string(),
        skill_id: skill.id.clone(),
        skill_name: skill.name.clone(),
        tool: tool.platform.clone(),
        target_path: target.to_string_lossy().to_string(),
        target_kind: "missing".to_string(),
        can_link: true,
        requires_confirm: false,
        same_target: false,
        total_files: 0,
        diff_files: 0,
        entries: Vec::new(),
        entries_truncated: false,
        message: "目标缺失，可直接链接。".to_string(),
    };

    if !skill.local_path.exists() || !skill.local_path.is_dir() {
        preview.can_link = false;
        preview.message = "skill 源目录不存在或不可读".to_string();
        return Ok(preview);
    }

    if !is_allowed(
        &skill.name,
        &tool.platform,
        &skill.group,
        &config.tool_rules,
        &config.group_rules,
        &config.rules,
    ) {
        preview.can_link = false;
        preview.message = "skill 已被规则限制".to_string();
        return Ok(preview);
    }

    let metadata = match fs::symlink_metadata(&target) {
        Ok(value) => value,
        Err(_) => {
            preview.target_kind = "missing".to_string();
            return Ok(preview);
        }
    };

    if metadata.file_type().is_symlink() {
        preview.target_kind = "symlink".to_string();
        if is_same_symlink_target(&target, &skill.local_path) {
            preview.same_target = true;
            preview.message = "目标已链接到当前源。".to_string();
            return Ok(preview);
        }

        match resolve_link_target_path(&target) {
            Ok(resolved_target) if resolved_target.exists() && resolved_target.is_dir() => {
                let (total_files, diff_files, entries, entries_truncated) =
                    diff_skill_roots(&skill.local_path, &resolved_target, max_entries)?;
                preview.total_files = total_files;
                preview.diff_files = diff_files;
                preview.entries = entries;
                preview.entries_truncated = entries_truncated;
                preview.requires_confirm = diff_files > 0;
                preview.message = if preview.requires_confirm {
                    "检测到目标与当前 skill 存在差异，需确认后链接。".to_string()
                } else {
                    "目标内容与当前 skill 一致，可直接链接。".to_string()
                };
                return Ok(preview);
            }
            Ok(_) => {
                preview.requires_confirm = true;
                preview.message =
                    "目标是软链接，但其指向目录不可用于全量 diff，请确认是否覆盖链接。".to_string();
                return Ok(preview);
            }
            Err(_) => {
                preview.requires_confirm = true;
                preview.message =
                    "目标是软链接，但读取失败，无法执行全量 diff，请确认是否覆盖链接。".to_string();
                return Ok(preview);
            }
        }
    }

    if metadata.is_dir() {
        preview.target_kind = "directory".to_string();
        let (total_files, diff_files, entries, entries_truncated) =
            diff_skill_roots(&skill.local_path, &target, max_entries)?;
        preview.total_files = total_files;
        preview.diff_files = diff_files;
        preview.entries = entries;
        preview.entries_truncated = entries_truncated;
        preview.requires_confirm = diff_files > 0;
        preview.message = if preview.requires_confirm {
            "检测到目标目录与当前 skill 存在差异，需确认后链接。".to_string()
        } else {
            "目标目录内容与当前 skill 一致，可直接链接。".to_string()
        };
        return Ok(preview);
    }

    if metadata.is_file() {
        preview.target_kind = "file".to_string();
        preview.requires_confirm = true;
        preview.message = "目标是文件，无法执行目录级全量 diff，请确认是否覆盖链接。".to_string();
        return Ok(preview);
    }

    preview.target_kind = "other".to_string();
    preview.requires_confirm = true;
    preview.message = "目标类型异常，无法执行全量 diff，请确认是否覆盖链接。".to_string();
    Ok(preview)
}
