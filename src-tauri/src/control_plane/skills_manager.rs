use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;
use uuid::Uuid;
use walkdir::WalkDir;

use crate::{
    db::AppState,
    domain::models::{
        SkillsManagerActionInput, SkillsManagerBatchInput, SkillsManagerBatchItemInput,
        SkillsManagerDeleteInput, SkillsManagerDiffJobInput, SkillsManagerDiffStartInput,
        SkillsManagerLinkPreviewInput, SkillsManagerRestoreInput, SkillsManagerRuleValue,
        SkillsManagerRulesUpdateInput, SkillsManagerStateInput, SkillsManagerToolRuleValue,
        SkillsManagerUpdateThenLinkInput,
    },
    error::AppError,
    security::resolve_distribution_target_path,
    utils::now_rfc3339,
};

const STATUS_LINKED: &str = "linked";
const STATUS_MISSING: &str = "missing";
const STATUS_BLOCKED: &str = "blocked";
const STATUS_WRONG: &str = "wrong";
const STATUS_DIRECTORY: &str = "directory";
const DIFF_STATUS_RUNNING: &str = "running";
const DIFF_STATUS_CANCELLING: &str = "cancelling";
const DIFF_STATUS_CANCELLED: &str = "cancelled";
const DIFF_STATUS_COMPLETED: &str = "completed";
const DIFF_STATUS_FAILED: &str = "failed";

static SKILLS_MANAGER_DIFF_JOBS: OnceLock<Mutex<HashMap<String, SkillsManagerDiffJobHandle>>> =
    OnceLock::new();

#[derive(Debug, Clone)]
struct ToolTarget {
    id: String,
    platform: String,
    skills_path: String,
    install_mode: String,
}

#[derive(Debug, Clone)]
struct SkillRow {
    id: String,
    name: String,
    source: String,
    local_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct SkillsManagerConfig {
    rules: HashMap<String, SkillsManagerRuleValue>,
    group_rules: HashMap<String, SkillsManagerRuleValue>,
    tool_rules: HashMap<String, SkillsManagerToolRuleValue>,
    manual_unlinks: HashMap<String, Vec<String>>,
    deleted_skills: Vec<String>,
}

#[derive(Debug, Clone)]
struct SkillRuntime {
    id: String,
    name: String,
    source: String,
    local_path: PathBuf,
    group: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillsManagerDiffEntry {
    relative_path: String,
    status: String,
    left_bytes: u64,
    right_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillsManagerDiffJobState {
    job_id: String,
    workspace_id: String,
    left_skill_id: String,
    right_skill_id: String,
    left_skill_name: String,
    right_skill_name: String,
    status: String,
    total_files: u64,
    processed_files: u64,
    current_file: String,
    diff_files: u64,
    same_skill: Option<bool>,
    error_message: String,
    started_at: String,
    updated_at: String,
    entries: Vec<SkillsManagerDiffEntry>,
}

#[derive(Clone)]
struct SkillsManagerDiffJobHandle {
    state: Arc<Mutex<SkillsManagerDiffJobState>>,
    cancel_flag: Arc<AtomicBool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillsManagerLinkPreview {
    workspace_id: String,
    skill_id: String,
    skill_name: String,
    tool: String,
    target_path: String,
    target_kind: String,
    can_link: bool,
    requires_confirm: bool,
    same_target: bool,
    total_files: u64,
    diff_files: u64,
    entries: Vec<SkillsManagerDiffEntry>,
    entries_truncated: bool,
    message: String,
}

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

fn run_batch_action(
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

fn resolve_update_source_path(preview: &SkillsManagerLinkPreview) -> Result<PathBuf, AppError> {
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

fn replace_source_skill_from_target(
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
struct BatchItemResult {
    ok: bool,
    message: String,
}

fn run_single_batch_item(
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

fn build_link_preview(
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

fn diff_skill_roots(
    left_root: &Path,
    right_root: &Path,
    max_entries: usize,
) -> Result<(u64, u64, Vec<SkillsManagerDiffEntry>, bool), AppError> {
    let left_files = collect_skill_files(left_root)?;
    let right_files = collect_skill_files(right_root)?;
    let mut all_paths: Vec<String> = left_files
        .keys()
        .chain(right_files.keys())
        .cloned()
        .collect::<HashSet<String>>()
        .into_iter()
        .collect();
    all_paths.sort();

    let total_files = all_paths.len() as u64;
    let mut diff_files = 0_u64;
    let mut entries: Vec<SkillsManagerDiffEntry> = Vec::new();
    let mut truncated = false;

    for relative_path in all_paths {
        let diff = compare_skill_file_pair(
            left_files.get(&relative_path),
            right_files.get(&relative_path),
            &relative_path,
        )?;
        if let Some(entry) = diff {
            diff_files += 1;
            if entries.len() < max_entries {
                entries.push(entry);
            } else {
                truncated = true;
            }
        }
    }

    Ok((total_files, diff_files, entries, truncated))
}

fn resolve_link_target_path(target: &Path) -> Result<PathBuf, AppError> {
    let link_target = fs::read_link(target)?;
    if link_target.is_absolute() {
        return Ok(link_target);
    }
    Ok(target
        .parent()
        .map(|parent| parent.join(&link_target))
        .unwrap_or(link_target))
}

fn lock_diff_jobs(
) -> Result<std::sync::MutexGuard<'static, HashMap<String, SkillsManagerDiffJobHandle>>, AppError> {
    skills_manager_diff_jobs()
        .lock()
        .map_err(|_| AppError::internal("diff job 池锁异常"))
}

fn skills_manager_diff_jobs() -> &'static Mutex<HashMap<String, SkillsManagerDiffJobHandle>> {
    SKILLS_MANAGER_DIFF_JOBS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn prune_diff_jobs(jobs: &mut HashMap<String, SkillsManagerDiffJobHandle>) {
    if jobs.len() <= 24 {
        return;
    }

    let mut terminal_jobs: Vec<(String, String)> = Vec::new();
    for (job_id, handle) in jobs.iter() {
        if let Ok(state) = handle.state.lock() {
            if state.status == DIFF_STATUS_COMPLETED
                || state.status == DIFF_STATUS_CANCELLED
                || state.status == DIFF_STATUS_FAILED
            {
                terminal_jobs.push((job_id.clone(), state.updated_at.clone()));
            }
        }
    }
    terminal_jobs.sort_by(|left, right| left.1.cmp(&right.1));

    for (job_id, _) in terminal_jobs {
        if jobs.len() <= 16 {
            break;
        }
        jobs.remove(&job_id);
    }
}

fn diff_job_snapshot(job_id: &str, workspace_id: &str) -> Result<Value, AppError> {
    let jobs = lock_diff_jobs()?;
    let handle = jobs
        .get(job_id)
        .ok_or_else(|| AppError::invalid_argument("diff job 不存在"))?;
    let snapshot = handle
        .state
        .lock()
        .map_err(|_| AppError::internal("diff job 状态锁异常"))?
        .clone();
    drop(jobs);

    if snapshot.workspace_id != workspace_id {
        return Err(AppError::invalid_argument("workspace 不匹配"));
    }

    serde_json::to_value(snapshot).map_err(|err| AppError::internal(err.to_string()))
}

fn spawn_diff_worker(
    job_state: Arc<Mutex<SkillsManagerDiffJobState>>,
    cancel_flag: Arc<AtomicBool>,
    left_root: PathBuf,
    right_root: PathBuf,
) {
    std::thread::spawn(move || {
        let result = run_diff_worker(&job_state, &cancel_flag, &left_root, &right_root);
        if let Err(err) = result {
            if let Ok(mut state) = job_state.lock() {
                state.status = DIFF_STATUS_FAILED.to_string();
                state.error_message = err.message;
                state.current_file = String::new();
                state.same_skill = None;
                state.updated_at = now_rfc3339();
            }
        }
    });
}

fn run_diff_worker(
    job_state: &Arc<Mutex<SkillsManagerDiffJobState>>,
    cancel_flag: &Arc<AtomicBool>,
    left_root: &Path,
    right_root: &Path,
) -> Result<(), AppError> {
    if !left_root.exists() {
        return Err(AppError::invalid_argument("left skill 目录不存在"));
    }
    if !right_root.exists() {
        return Err(AppError::invalid_argument("right skill 目录不存在"));
    }

    let left_files = collect_skill_files(left_root)?;
    let right_files = collect_skill_files(right_root)?;
    let mut all_paths: Vec<String> = left_files
        .keys()
        .chain(right_files.keys())
        .cloned()
        .collect::<HashSet<String>>()
        .into_iter()
        .collect();
    all_paths.sort();

    {
        let mut state = job_state
            .lock()
            .map_err(|_| AppError::internal("diff job 状态锁异常"))?;
        state.total_files = all_paths.len() as u64;
        state.processed_files = 0;
        state.current_file = String::new();
        state.diff_files = 0;
        state.entries.clear();
        state.same_skill = None;
        state.error_message.clear();
        state.updated_at = now_rfc3339();
    }

    for relative_path in all_paths {
        if cancel_flag.load(Ordering::Relaxed) {
            let mut state = job_state
                .lock()
                .map_err(|_| AppError::internal("diff job 状态锁异常"))?;
            state.status = DIFF_STATUS_CANCELLED.to_string();
            state.current_file = String::new();
            state.same_skill = None;
            state.updated_at = now_rfc3339();
            return Ok(());
        }

        {
            let mut state = job_state
                .lock()
                .map_err(|_| AppError::internal("diff job 状态锁异常"))?;
            state.current_file = relative_path.clone();
            state.updated_at = now_rfc3339();
        }

        let diff = compare_skill_file_pair(
            left_files.get(&relative_path),
            right_files.get(&relative_path),
            &relative_path,
        )?;

        let mut state = job_state
            .lock()
            .map_err(|_| AppError::internal("diff job 状态锁异常"))?;
        state.processed_files += 1;
        if let Some(entry) = diff {
            state.diff_files += 1;
            state.entries.push(entry);
        }
        state.updated_at = now_rfc3339();
    }

    let mut state = job_state
        .lock()
        .map_err(|_| AppError::internal("diff job 状态锁异常"))?;
    state.status = DIFF_STATUS_COMPLETED.to_string();
    state.current_file = String::new();
    state.same_skill = Some(state.diff_files == 0);
    state.updated_at = now_rfc3339();

    Ok(())
}

fn collect_skill_files(root: &Path) -> Result<HashMap<String, PathBuf>, AppError> {
    let mut files: HashMap<String, PathBuf> = HashMap::new();
    for entry in WalkDir::new(root)
        .follow_links(true)
        .into_iter()
        .filter_map(|row| row.ok())
        .filter(|row| row.file_type().is_file())
    {
        let relative_path = entry
            .path()
            .strip_prefix(root)
            .map(to_normalized_relative_path)
            .unwrap_or_else(|_| to_normalized_relative_path(entry.path()));
        files.insert(relative_path, entry.path().to_path_buf());
    }
    Ok(files)
}

fn compare_skill_file_pair(
    left: Option<&PathBuf>,
    right: Option<&PathBuf>,
    relative_path: &str,
) -> Result<Option<SkillsManagerDiffEntry>, AppError> {
    let left_bytes = read_file_bytes(left)?;
    let right_bytes = read_file_bytes(right)?;

    match (left_bytes, right_bytes) {
        (Some(left_content), Some(right_content)) => {
            if left_content == right_content {
                Ok(None)
            } else {
                Ok(Some(SkillsManagerDiffEntry {
                    relative_path: relative_path.to_string(),
                    status: "changed".to_string(),
                    left_bytes: left_content.len() as u64,
                    right_bytes: right_content.len() as u64,
                }))
            }
        }
        (Some(left_content), None) => Ok(Some(SkillsManagerDiffEntry {
            relative_path: relative_path.to_string(),
            status: "removed".to_string(),
            left_bytes: left_content.len() as u64,
            right_bytes: 0,
        })),
        (None, Some(right_content)) => Ok(Some(SkillsManagerDiffEntry {
            relative_path: relative_path.to_string(),
            status: "added".to_string(),
            left_bytes: 0,
            right_bytes: right_content.len() as u64,
        })),
        (None, None) => Ok(None),
    }
}

fn read_file_bytes(path: Option<&PathBuf>) -> Result<Option<Vec<u8>>, AppError> {
    match path {
        Some(file_path) => fs::read(file_path).map(Some).map_err(|err| {
            AppError::internal(format!("读取文件失败 {}: {err}", file_path.display()))
        }),
        None => Ok(None),
    }
}

fn to_normalized_relative_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn build_manager_snapshot(
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

fn build_deleted_items(config: &SkillsManagerConfig, skills: &[SkillRow]) -> Vec<Value> {
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

fn build_name_conflicts(skills: &[SkillRow]) -> HashSet<String> {
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

fn compute_status<'a>(
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

fn is_manual_unlinked(
    manual_unlinks: &HashMap<String, Vec<String>>,
    skill_name: &str,
    tool: &str,
) -> bool {
    manual_unlinks
        .get(skill_name)
        .map(|items| items.iter().any(|item| item == tool))
        .unwrap_or(false)
}

fn add_manual_unlink(config: &mut SkillsManagerConfig, skill_name: &str, tool: &str) {
    let entry = config
        .manual_unlinks
        .entry(skill_name.to_string())
        .or_default();
    if !entry.iter().any(|item| item == tool) {
        entry.push(tool.to_string());
        entry.sort();
    }
}

fn remove_manual_unlink(config: &mut SkillsManagerConfig, skill_name: &str, tool: &str) {
    if let Some(entry) = config.manual_unlinks.get_mut(skill_name) {
        entry.retain(|item| item != tool);
        if entry.is_empty() {
            config.manual_unlinks.remove(skill_name);
        }
    }
}

fn is_allowed(
    skill_name: &str,
    tool: &str,
    group: &str,
    tool_rules: &HashMap<String, SkillsManagerToolRuleValue>,
    group_rules: &HashMap<String, SkillsManagerRuleValue>,
    rules: &HashMap<String, SkillsManagerRuleValue>,
) -> bool {
    if let Some(tool_rule) = tool_rules.get(tool) {
        if tool_rule.block_all.unwrap_or(false) {
            if list_contains(tool_rule.allow.as_ref(), skill_name) {
                return true;
            }
            if !group.is_empty() && list_contains(tool_rule.allow_groups.as_ref(), group) {
                return true;
            }
            return false;
        }
    }

    if !group.is_empty() {
        if let Some(rule) = group_rules.get(group) {
            if let Some(only) = &rule.only {
                if !only.iter().any(|item| item == tool) {
                    return false;
                }
            }
            if let Some(exclude) = &rule.exclude {
                if exclude.iter().any(|item| item == tool) {
                    return false;
                }
            }
        }
    }

    if let Some(rule) = rules.get(skill_name) {
        if let Some(only) = &rule.only {
            return only.iter().any(|item| item == tool);
        }
        if let Some(exclude) = &rule.exclude {
            return !exclude.iter().any(|item| item == tool);
        }
    }
    true
}

fn list_contains(values: Option<&Vec<String>>, target: &str) -> bool {
    values
        .map(|items| items.iter().any(|item| item == target))
        .unwrap_or(false)
}

fn to_runtime_skill(skill: &SkillRow) -> SkillRuntime {
    SkillRuntime {
        id: skill.id.clone(),
        name: skill.name.clone(),
        source: skill.source.clone(),
        local_path: PathBuf::from(&skill.local_path),
        group: derive_skill_group(&skill.source),
    }
}

fn derive_skill_group(source: &str) -> String {
    let path = Path::new(source);
    path.parent()
        .and_then(|parent| parent.file_name())
        .or_else(|| path.file_name())
        .map(|name| name.to_string_lossy().to_string())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| "default".to_string())
}

fn normalize_install_mode(mode: &str) -> &str {
    if mode.eq_ignore_ascii_case("symlink") {
        "symlink"
    } else {
        "copy"
    }
}

fn is_same_symlink_target(target: &Path, expected_source: &Path) -> bool {
    let link_target = match fs::read_link(target) {
        Ok(value) => value,
        Err(_) => return false,
    };
    let resolved = if link_target.is_absolute() {
        link_target
    } else {
        target
            .parent()
            .map(|parent| parent.join(&link_target))
            .unwrap_or_else(|| PathBuf::from(&link_target))
    };
    normalize_path(&resolved) == normalize_path(expected_source)
}

fn replace_link_target_with_symlink(source: &Path, target: &Path) -> Result<(), AppError> {
    remove_existing_target(target)?;
    create_symlink_dir(source, target)
}

fn replace_link_target_with_copy(source: &Path, target: &Path) -> Result<(), AppError> {
    if !source.is_dir() {
        return Err(AppError::invalid_argument("skill 源目录不存在或不可读"));
    }
    remove_existing_target(target)?;
    fs::create_dir_all(target)?;
    copy_dir_recursive(source, target)?;
    Ok(())
}

fn remove_existing_target(target: &Path) -> Result<(), AppError> {
    if let Ok(metadata) = fs::symlink_metadata(target) {
        if metadata.file_type().is_symlink() || metadata.is_file() {
            fs::remove_file(target)?;
        } else if metadata.is_dir() {
            fs::remove_dir_all(target)?;
        } else {
            fs::remove_file(target)?;
        }
    }
    Ok(())
}

fn copy_dir_recursive(source: &Path, target: &Path) -> Result<(), AppError> {
    for entry in WalkDir::new(source).follow_links(true) {
        let entry = entry.map_err(|err| AppError::internal(err.to_string()))?;
        let relative = entry
            .path()
            .strip_prefix(source)
            .map_err(|err| AppError::internal(err.to_string()))?;
        if relative.as_os_str().is_empty() {
            continue;
        }
        let destination = target.join(relative);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&destination)?;
        } else if entry.file_type().is_file() {
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(entry.path(), &destination)?;
        }
    }
    Ok(())
}

fn normalize_path(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

#[cfg(unix)]
fn create_symlink_dir(source: &Path, target: &Path) -> Result<(), AppError> {
    use std::os::unix::fs::symlink;
    symlink(source, target)?;
    Ok(())
}

#[cfg(windows)]
fn create_symlink_dir(source: &Path, target: &Path) -> Result<(), AppError> {
    use std::os::windows::fs::symlink_dir;
    symlink_dir(source, target)?;
    Ok(())
}

fn get_workspace_root(conn: &Connection, workspace_id: &str) -> Result<PathBuf, AppError> {
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

fn list_tool_targets(conn: &Connection, workspace_id: &str) -> Result<Vec<ToolTarget>, AppError> {
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

fn list_skills(conn: &Connection) -> Result<Vec<SkillRow>, AppError> {
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

fn load_skills_manager_config(
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

fn save_skills_manager_config(
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

fn parse_json_or_default<T>(raw: &str) -> Result<T, AppError>
where
    T: DeserializeOwned + Default,
{
    if raw.trim().is_empty() {
        return Ok(T::default());
    }
    serde_json::from_str(raw)
        .map_err(|err| AppError::internal(format!("解析 skills_manager 配置失败: {err}")))
}

fn sanitize_rule_map(
    incoming: HashMap<String, SkillsManagerRuleValue>,
) -> Result<HashMap<String, SkillsManagerRuleValue>, AppError> {
    let mut next = HashMap::new();
    for (key, mut value) in incoming {
        let normalized_key = key.trim().to_string();
        if normalized_key.is_empty() {
            continue;
        }
        value.only = normalize_string_list(value.only);
        value.exclude = normalize_string_list(value.exclude);
        validate_rule_value(&value)?;
        if value.only.is_none() && value.exclude.is_none() {
            continue;
        }
        next.insert(normalized_key, value);
    }
    Ok(next)
}

fn sanitize_tool_rule_map(
    incoming: HashMap<String, SkillsManagerToolRuleValue>,
) -> Result<HashMap<String, SkillsManagerToolRuleValue>, AppError> {
    let mut next = HashMap::new();
    for (key, mut value) in incoming {
        let normalized_key = key.trim().to_string();
        if normalized_key.is_empty() {
            continue;
        }
        value.allow = normalize_string_list(value.allow);
        value.allow_groups = normalize_string_list(value.allow_groups);
        if value.block_all.is_none() {
            value.block_all = Some(false);
        }
        validate_tool_rule_value(&value)?;
        let is_default = !value.block_all.unwrap_or(false)
            && value.allow.is_none()
            && value.allow_groups.is_none();
        if is_default {
            continue;
        }
        next.insert(normalized_key, value);
    }
    Ok(next)
}

fn normalize_string_list(values: Option<Vec<String>>) -> Option<Vec<String>> {
    let mut normalized = values
        .unwrap_or_default()
        .into_iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .collect::<Vec<String>>();
    if normalized.is_empty() {
        return None;
    }
    normalized.sort();
    normalized.dedup();
    Some(normalized)
}

fn validate_rule_value(rule: &SkillsManagerRuleValue) -> Result<(), AppError> {
    if rule.only.is_some() && rule.exclude.is_some() {
        return Err(AppError::invalid_argument(
            "规则 only 与 exclude 不能同时存在",
        ));
    }
    Ok(())
}

fn validate_tool_rule_value(rule: &SkillsManagerToolRuleValue) -> Result<(), AppError> {
    if let Some(groups) = &rule.allow_groups {
        if groups.iter().any(|item| item.trim().is_empty()) {
            return Err(AppError::invalid_argument("allowGroups 不能为空字符串"));
        }
    }
    if let Some(skills) = &rule.allow {
        if skills.iter().any(|item| item.trim().is_empty()) {
            return Err(AppError::invalid_argument("allow 不能为空字符串"));
        }
    }
    Ok(())
}

fn append_audit_event(
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

#[cfg(test)]
mod tests {
    use std::{
        collections::{HashMap, HashSet},
        fs,
        path::PathBuf,
    };

    use crate::domain::models::SkillsManagerBatchItemInput;

    use super::{
        build_link_preview, collect_skill_files, compare_skill_file_pair, compute_status,
        is_allowed, replace_source_skill_from_target, run_single_batch_item, sanitize_rule_map,
        SkillRuntime, SkillsManagerConfig, SkillsManagerRuleValue, SkillsManagerToolRuleValue,
        ToolTarget, STATUS_LINKED, STATUS_MISSING,
    };

    fn build_rule(only: Option<Vec<&str>>, exclude: Option<Vec<&str>>) -> SkillsManagerRuleValue {
        SkillsManagerRuleValue {
            only: only.map(|items| items.into_iter().map(str::to_string).collect()),
            exclude: exclude.map(|items| items.into_iter().map(str::to_string).collect()),
        }
    }

    #[test]
    fn tool_rule_block_all_honors_allow_and_allow_groups() {
        let rules = HashMap::new();
        let group_rules = HashMap::new();
        let mut tool_rules = HashMap::new();
        tool_rules.insert(
            "codex".to_string(),
            SkillsManagerToolRuleValue {
                block_all: Some(true),
                allow: Some(vec!["core-skill".to_string()]),
                allow_groups: Some(vec!["platform".to_string()]),
            },
        );

        assert!(is_allowed(
            "core-skill",
            "codex",
            "other",
            &tool_rules,
            &group_rules,
            &rules
        ));
        assert!(is_allowed(
            "unknown",
            "codex",
            "platform",
            &tool_rules,
            &group_rules,
            &rules
        ));
        assert!(!is_allowed(
            "unknown",
            "codex",
            "other",
            &tool_rules,
            &group_rules,
            &rules
        ));
    }

    #[test]
    fn group_rule_takes_precedence_before_skill_rule() {
        let rules = HashMap::new();

        let mut group_rules = HashMap::new();
        group_rules.insert(
            "platform".to_string(),
            build_rule(Some(vec!["claude"]), None),
        );

        let tool_rules = HashMap::new();
        assert!(!is_allowed(
            "skill-a",
            "codex",
            "platform",
            &tool_rules,
            &group_rules,
            &rules
        ));
        assert!(is_allowed(
            "skill-b",
            "claude",
            "platform",
            &tool_rules,
            &group_rules,
            &rules
        ));
    }

    #[test]
    fn sanitize_rule_map_rejects_conflicting_rule() {
        let mut incoming = HashMap::new();
        incoming.insert(
            "x".to_string(),
            build_rule(Some(vec!["codex"]), Some(vec!["claude"])),
        );

        let result = sanitize_rule_map(incoming);
        assert!(result.is_err());
    }

    #[test]
    fn compare_skill_file_pair_identifies_added_removed_and_changed() {
        let temp = tempfile::tempdir().expect("temp dir");
        let left_file = temp.path().join("left.md");
        let right_file = temp.path().join("right.md");
        fs::write(&left_file, "left").expect("write left");
        fs::write(&right_file, "right").expect("write right");

        let changed =
            compare_skill_file_pair(Some(&left_file), Some(&right_file), "x.md").expect("compare");
        assert!(changed.is_some());
        assert_eq!(changed.expect("changed").status, "changed");

        let removed = compare_skill_file_pair(Some(&left_file), None, "x.md").expect("compare");
        assert_eq!(removed.expect("removed").status, "removed");

        let added = compare_skill_file_pair(None, Some(&right_file), "x.md").expect("compare");
        assert_eq!(added.expect("added").status, "added");
    }

    #[test]
    fn collect_skill_files_returns_relative_paths() {
        let temp = tempfile::tempdir().expect("temp dir");
        let nested = temp.path().join("sub");
        fs::create_dir_all(&nested).expect("create nested");
        fs::write(nested.join("SKILL.md"), "version: 1.0.0").expect("write");

        let files = collect_skill_files(temp.path()).expect("collect");
        assert!(files.contains_key("sub/SKILL.md"));
    }

    #[test]
    fn build_link_preview_requires_confirm_when_target_differs() {
        let workspace = tempfile::tempdir().expect("workspace");
        let source_skill = workspace.path().join("source").join("demo-skill");
        let target_skill = workspace
            .path()
            .join("targets")
            .join("skills")
            .join("demo-skill");
        fs::create_dir_all(&source_skill).expect("create source");
        fs::create_dir_all(&target_skill).expect("create target");
        fs::write(source_skill.join("SKILL.md"), "version: 1.0.0\nsource").expect("write source");
        fs::write(target_skill.join("SKILL.md"), "version: 1.0.0\ntarget").expect("write target");

        let skill = SkillRuntime {
            id: "s1".to_string(),
            name: "demo-skill".to_string(),
            source: workspace
                .path()
                .join("source")
                .to_string_lossy()
                .to_string(),
            local_path: PathBuf::from(&source_skill),
            group: "source".to_string(),
        };
        let tool = ToolTarget {
            id: "t1".to_string(),
            platform: "codex".to_string(),
            skills_path: workspace
                .path()
                .join("targets")
                .join("skills")
                .to_string_lossy()
                .to_string(),
            install_mode: "symlink".to_string(),
        };
        let config = SkillsManagerConfig::default();

        let preview = build_link_preview(workspace.path(), "w1", &skill, &tool, &config, 16)
            .expect("build preview");

        assert!(preview.can_link);
        assert!(preview.requires_confirm);
        assert!(preview.diff_files > 0);
        assert_eq!(preview.target_kind, "directory");
    }

    #[test]
    fn replace_source_skill_from_target_overwrites_source_content() {
        let workspace = tempfile::tempdir().expect("workspace");
        let source_skill = workspace.path().join("source").join("demo-skill");
        let target_skill = workspace.path().join("target").join("demo-skill");
        fs::create_dir_all(&source_skill).expect("create source");
        fs::create_dir_all(&target_skill).expect("create target");
        fs::write(source_skill.join("SKILL.md"), "source").expect("write source");
        fs::write(target_skill.join("SKILL.md"), "target").expect("write target");

        let updated =
            replace_source_skill_from_target(&source_skill, &target_skill).expect("replace source");
        assert!(updated);
        assert_eq!(
            fs::read_to_string(source_skill.join("SKILL.md")).expect("read source"),
            "target"
        );
    }

    #[test]
    fn replace_source_skill_from_target_returns_false_when_paths_same() {
        let workspace = tempfile::tempdir().expect("workspace");
        let source_skill = workspace.path().join("source").join("demo-skill");
        fs::create_dir_all(&source_skill).expect("create source");
        fs::write(source_skill.join("SKILL.md"), "source").expect("write source");

        let updated =
            replace_source_skill_from_target(&source_skill, &source_skill).expect("replace source");
        assert!(!updated);
        assert_eq!(
            fs::read_to_string(source_skill.join("SKILL.md")).expect("read source"),
            "source"
        );
    }

    #[test]
    fn run_single_batch_item_copy_mode_link_creates_directory_copy() {
        let workspace = tempfile::tempdir().expect("workspace");
        let source_skill = workspace.path().join("source").join("demo-skill");
        fs::create_dir_all(&source_skill).expect("create source");
        fs::write(source_skill.join("SKILL.md"), "version: 1.0.0").expect("write source");

        let skill = SkillRuntime {
            id: "s1".to_string(),
            name: "demo-skill".to_string(),
            source: workspace
                .path()
                .join("source")
                .to_string_lossy()
                .to_string(),
            local_path: source_skill.clone(),
            group: "source".to_string(),
        };
        let tool = ToolTarget {
            id: "t1".to_string(),
            platform: "codex".to_string(),
            skills_path: workspace
                .path()
                .join("targets")
                .join("skills")
                .to_string_lossy()
                .to_string(),
            install_mode: "copy".to_string(),
        };

        let mut skill_map = HashMap::new();
        skill_map.insert(skill.id.clone(), skill.clone());
        let mut tool_map = HashMap::new();
        tool_map.insert(tool.platform.clone(), tool);
        let mut config = SkillsManagerConfig::default();
        let deleted = HashSet::new();
        let item = SkillsManagerBatchItemInput {
            skill_id: skill.id.clone(),
            tool: "codex".to_string(),
            force: Some(true),
        };

        let result = run_single_batch_item(
            workspace.path(),
            &item,
            &skill_map,
            &tool_map,
            &mut config,
            &deleted,
            true,
        );
        assert!(result.ok, "{}", result.message);

        let target = workspace
            .path()
            .join("targets")
            .join("skills")
            .join("demo-skill");
        let metadata = fs::symlink_metadata(&target).expect("target metadata");
        assert!(metadata.is_dir());
        assert!(!metadata.file_type().is_symlink());
        assert_eq!(
            fs::read_to_string(target.join("SKILL.md")).expect("read target"),
            "version: 1.0.0"
        );
    }

    #[test]
    fn compute_status_copy_mode_returns_linked_when_directory_matches_source() {
        let workspace = tempfile::tempdir().expect("workspace");
        let source_skill = workspace.path().join("source").join("demo-skill");
        let target_skill = workspace
            .path()
            .join("targets")
            .join("skills")
            .join("demo-skill");
        fs::create_dir_all(&source_skill).expect("create source");
        fs::create_dir_all(&target_skill).expect("create target");
        fs::write(source_skill.join("SKILL.md"), "version: 1.0.0\nsource").expect("write source");
        fs::write(target_skill.join("SKILL.md"), "version: 1.0.0\nsource").expect("write target");

        let skill = SkillRuntime {
            id: "s1".to_string(),
            name: "demo-skill".to_string(),
            source: workspace
                .path()
                .join("source")
                .to_string_lossy()
                .to_string(),
            local_path: source_skill,
            group: "source".to_string(),
        };

        let tool = ToolTarget {
            id: "t1".to_string(),
            platform: "codex".to_string(),
            skills_path: workspace
                .path()
                .join("targets")
                .join("skills")
                .to_string_lossy()
                .to_string(),
            install_mode: "copy".to_string(),
        };

        let config = SkillsManagerConfig::default();
        let status = compute_status(workspace.path(), &skill, &tool, &config);
        assert_eq!(status, STATUS_LINKED);
    }

    #[test]
    fn compute_status_returns_missing_when_manual_unlink_and_target_absent() {
        let workspace = tempfile::tempdir().expect("workspace");
        let source_skill = workspace.path().join("source").join("demo-skill");
        fs::create_dir_all(&source_skill).expect("create source");

        let skill = SkillRuntime {
            id: "s1".to_string(),
            name: "demo-skill".to_string(),
            source: workspace
                .path()
                .join("source")
                .to_string_lossy()
                .to_string(),
            local_path: source_skill,
            group: "source".to_string(),
        };

        let tool = ToolTarget {
            id: "t1".to_string(),
            platform: "codex".to_string(),
            skills_path: "targets/skills".to_string(),
            install_mode: "symlink".to_string(),
        };

        let mut config = SkillsManagerConfig::default();
        config
            .manual_unlinks
            .insert("demo-skill".to_string(), vec!["codex".to_string()]);

        let status = compute_status(workspace.path(), &skill, &tool, &config);
        assert_eq!(status, STATUS_MISSING);
    }
}
