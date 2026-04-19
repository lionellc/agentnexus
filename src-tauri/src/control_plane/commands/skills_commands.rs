use std::path::{Path, PathBuf};

use serde_json::{json, Value};
use tauri::State;

use crate::{
    db::AppState,
    domain::models::{
        SkillAsset, SkillsBatchInput, SkillsFileReadInput, SkillsFileTreeInput, SkillsOpenInput,
        SkillsScanInput,
    },
    error::AppError,
    execution_plane::{
        distribution::{distribute_skill, uninstall_skill},
        skills::{default_skill_directories, discover_skills, DiscoveredSkill},
    },
    security::resolve_distribution_target_path,
    utils::now_rfc3339,
};

use super::{
    shared::{append_audit_event, get_workspace},
    skills_support::{
        dedupe_skills, detect_file_language, detect_skill_source_symlink,
        detect_skill_source_symlink_by_name, ensure_workspace_managed_skills_root, get_skill_asset,
        get_skill_root_by_id, ingest_skill_into_workspace_storage, is_path_under_root,
        is_supported_preview_file, list_skill_tree_entries, list_skills_by_ids, normalize_fs_path,
        normalize_open_mode, normalize_rel_path, resolve_skill_child_path, run_open_with_mode,
        skill_asset_from_row, summarize_json_rows, upsert_skill_asset, upsert_skill_version,
    },
    target_commands::list_targets,
};

#[tauri::command]
pub fn skills_scan(
    state: State<'_, AppState>,
    input: SkillsScanInput,
) -> Result<Vec<SkillAsset>, AppError> {
    let conn = state.open()?;
    let workspace = get_workspace(&conn, &input.workspace_id)?;
    let workspace_root = PathBuf::from(&workspace.root_path);

    let directories: Vec<PathBuf> = if let Some(input_dirs) = input.directories {
        input_dirs.into_iter().map(PathBuf::from).collect()
    } else {
        default_skill_directories(&workspace_root)
    };

    let discovered = discover_skills(&directories)?;
    let deduped = dedupe_skills(discovered);
    let latest_versions = input.latest_versions.unwrap_or_default();
    let managed_skills_root = ensure_workspace_managed_skills_root(&workspace_root)?;
    let managed_skills_root_normalized = normalize_fs_path(&managed_skills_root);
    let mut managed_source_count = 0usize;

    let mut assets = Vec::new();
    for skill in deduped {
        let source_entry_path = PathBuf::from(&skill.local_path);
        let source_local_path = source_entry_path.to_string_lossy().to_string();
        let source_is_symlink = detect_skill_source_symlink(&skill.local_path, &skill.source)
            || detect_skill_source_symlink_by_name(&skill.source, &skill.name);
        let managed_local_path =
            if is_path_under_root(&source_entry_path, &managed_skills_root_normalized) {
                managed_source_count += 1;
                source_local_path.clone()
            } else {
                ingest_skill_into_workspace_storage(&skill, &managed_skills_root)?
            };
        let managed_skill = DiscoveredSkill {
            local_path: managed_local_path,
            ..skill
        };
        let local_version = managed_skill.version.clone();
        let latest_version = latest_versions
            .get(&managed_skill.identity)
            .cloned()
            .unwrap_or_else(|| local_version.clone());
        let update_candidate = crate::utils::compare_version(&local_version, &latest_version).is_lt();

        let id = upsert_skill_asset(
            &conn,
            &managed_skill,
            &latest_version,
            update_candidate,
            &source_local_path,
            source_is_symlink,
            now_rfc3339(),
        )?;

        upsert_skill_version(&conn, &id, &local_version, &managed_skill.source)?;

        assets.push(get_skill_asset(&conn, &id)?);
    }

    append_audit_event(
        &conn,
        Some(&workspace.id),
        "skills_scan",
        "system",
        json!({
            "workspaceId": workspace.id,
            "directories": directories,
            "count": assets.len(),
            "managedSourceCount": managed_source_count,
        }),
    )?;

    Ok(assets)
}

#[tauri::command]
pub fn skills_list(state: State<'_, AppState>) -> Result<Vec<SkillAsset>, AppError> {
    let conn = state.open()?;
    let mut stmt = conn.prepare(
        "SELECT id, identity, name, version, latest_version, source, local_path, source_local_path, source_is_symlink, update_candidate, last_used_at, created_at, updated_at
         FROM skills_assets
         ORDER BY updated_at DESC, name ASC",
    )?;

    let rows = stmt.query_map([], skill_asset_from_row)?;
    let mut list = Vec::new();
    for row in rows {
        list.push(row?);
    }

    Ok(list)
}

#[tauri::command]
pub fn skills_asset_detail(
    state: State<'_, AppState>,
    skill_id: String,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    let asset = get_skill_asset(&conn, &skill_id)?;

    let mut stmt = conn.prepare(
        "SELECT version, source, installed_at
         FROM skills_versions
         WHERE asset_id = ?1
         ORDER BY installed_at DESC",
    )?;
    let rows = stmt.query_map(rusqlite::params![skill_id], |row| {
        Ok(json!({
            "version": row.get::<_, String>(0)?,
            "source": row.get::<_, String>(1)?,
            "installedAt": row.get::<_, String>(2)?,
        }))
    })?;

    let mut versions = Vec::new();
    for row in rows {
        versions.push(row?);
    }

    Ok(json!({
        "asset": asset,
        "versions": versions,
    }))
}

#[tauri::command]
pub fn skills_files_tree(
    state: State<'_, AppState>,
    input: SkillsFileTreeInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    let root = get_skill_root_by_id(&conn, &input.skill_id)?;
    let entries = list_skill_tree_entries(&root, &root)?;
    Ok(json!({
        "rootPath": normalize_rel_path(&root),
        "entries": entries,
    }))
}

#[tauri::command]
pub fn skills_file_read(
    state: State<'_, AppState>,
    input: SkillsFileReadInput,
) -> Result<Value, AppError> {
    const MAX_PREVIEW_BYTES: u64 = 1024 * 1024;

    let conn = state.open()?;
    let root = get_skill_root_by_id(&conn, &input.skill_id)?;
    let path = resolve_skill_child_path(&root, &input.relative_path)?;
    if path.is_dir() {
        return Err(AppError::invalid_argument("目标是目录，无法预览"));
    }

    let relative_path = path
        .strip_prefix(&root)
        .map(normalize_rel_path)
        .unwrap_or_else(|_| input.relative_path.trim().to_string());
    let language = detect_file_language(&path);
    if !is_supported_preview_file(&path) {
        return Ok(json!({
            "relativePath": relative_path,
            "absolutePath": normalize_rel_path(&path),
            "language": language,
            "supported": false,
            "content": "",
            "message": "该文件类型暂不支持预览",
        }));
    }

    if let Ok(metadata) = std::fs::metadata(&path) {
        if metadata.len() > MAX_PREVIEW_BYTES {
            return Ok(json!({
                "relativePath": relative_path,
                "absolutePath": normalize_rel_path(&path),
                "language": language,
                "supported": false,
                "content": "",
                "message": "文件过大，暂不支持预览",
            }));
        }
    }

    match std::fs::read_to_string(&path) {
        Ok(content) => Ok(json!({
            "relativePath": relative_path,
            "absolutePath": normalize_rel_path(&path),
            "language": language,
            "supported": true,
            "content": content,
            "message": "",
        })),
        Err(_) => Ok(json!({
            "relativePath": relative_path,
            "absolutePath": normalize_rel_path(&path),
            "language": language,
            "supported": false,
            "content": "",
            "message": "该文件不是可预览文本",
        })),
    }
}

#[tauri::command]
pub fn skills_open(state: State<'_, AppState>, input: SkillsOpenInput) -> Result<Value, AppError> {
    let conn = state.open()?;
    let root = get_skill_root_by_id(&conn, &input.skill_id)?;
    let mode = normalize_open_mode(input.mode);
    let path = if let Some(relative_path) = input.relative_path {
        if relative_path.trim().is_empty() {
            root.clone()
        } else {
            resolve_skill_child_path(&root, &relative_path)?
        }
    } else {
        root.clone()
    };
    run_open_with_mode(&path, &mode)?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub fn skills_distribute(
    state: State<'_, AppState>,
    input: SkillsBatchInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    let workspace = get_workspace(&conn, &input.workspace_id)?;
    let targets = list_targets(&conn, &workspace.id, Some(input.target_ids.as_slice()))?;
    if targets.is_empty() {
        return Err(AppError::invalid_argument("分发目标为空"));
    }

    let skills = list_skills_by_ids(&conn, &input.skill_ids)?;
    if skills.is_empty() {
        return Err(AppError::invalid_argument("skill 选择为空"));
    }

    let workspace_root = PathBuf::from(&workspace.root_path);
    let mut rows = Vec::new();

    for skill in &skills {
        let source_dir = PathBuf::from(&skill.local_path);
        for target in &targets {
            let safe_skills_root =
                resolve_distribution_target_path(&workspace_root, Path::new(&target.skills_path));
            let (status, message, used_mode) = match safe_skills_root {
                Ok(root) => {
                    let destination = root.join(&skill.name);
                    match distribute_skill(&source_dir, &destination, &target.install_mode) {
                        Ok(mode) => ("success".to_string(), "ok".to_string(), mode),
                        Err(err) => (
                            "failed".to_string(),
                            err.message,
                            target.install_mode.clone(),
                        ),
                    }
                }
                Err(err) => (
                    "failed".to_string(),
                    err.message,
                    target.install_mode.clone(),
                ),
            };

            rows.push(json!({
                "skillId": skill.id,
                "skillName": skill.name,
                "targetId": target.id,
                "platform": target.platform,
                "status": status,
                "message": message,
                "usedMode": used_mode,
            }));
        }
    }

    append_audit_event(
        &conn,
        Some(&workspace.id),
        "skills_distribute",
        input.operator.as_deref().unwrap_or("system"),
        json!({
            "workspaceId": workspace.id,
            "skillIds": input.skill_ids,
            "targetIds": input.target_ids,
            "summary": summarize_json_rows(&rows),
        }),
    )?;

    Ok(json!({
        "results": rows,
        "summary": summarize_json_rows(&rows),
    }))
}

#[tauri::command]
pub fn skills_uninstall(
    state: State<'_, AppState>,
    input: SkillsBatchInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    let workspace = get_workspace(&conn, &input.workspace_id)?;
    let targets = list_targets(&conn, &workspace.id, Some(input.target_ids.as_slice()))?;
    if targets.is_empty() {
        return Err(AppError::invalid_argument("分发目标为空"));
    }

    let skills = list_skills_by_ids(&conn, &input.skill_ids)?;
    if skills.is_empty() {
        return Err(AppError::invalid_argument("skill 选择为空"));
    }

    let workspace_root = PathBuf::from(&workspace.root_path);
    let mut rows = Vec::new();

    for skill in &skills {
        for target in &targets {
            let safe_skills_root =
                resolve_distribution_target_path(&workspace_root, Path::new(&target.skills_path));
            let (status, message) = match safe_skills_root {
                Ok(root) => {
                    let destination = root.join(&skill.name);
                    match uninstall_skill(&destination) {
                        Ok(_) => ("success".to_string(), "ok".to_string()),
                        Err(err) => ("failed".to_string(), err.message),
                    }
                }
                Err(err) => ("failed".to_string(), err.message),
            };

            rows.push(json!({
                "skillId": skill.id,
                "skillName": skill.name,
                "targetId": target.id,
                "platform": target.platform,
                "status": status,
                "message": message,
            }));
        }
    }

    append_audit_event(
        &conn,
        Some(&workspace.id),
        "skills_uninstall",
        input.operator.as_deref().unwrap_or("system"),
        json!({
            "workspaceId": workspace.id,
            "skillIds": input.skill_ids,
            "targetIds": input.target_ids,
            "summary": summarize_json_rows(&rows),
        }),
    )?;

    Ok(json!({
        "results": rows,
        "summary": summarize_json_rows(&rows),
    }))
}
