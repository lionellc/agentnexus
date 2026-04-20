use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;
use walkdir::WalkDir;

use crate::{
    domain::models::SkillAsset,
    error::AppError,
    execution_plane::skills::DiscoveredSkill,
    utils::{compare_version, now_rfc3339},
};

mod open_mode;
#[cfg(test)]
mod tests;

pub(super) fn normalize_open_mode(mode: Option<String>) -> String {
    open_mode::normalize_open_mode(mode)
}

pub(super) fn run_open_with_mode(path: &Path, mode: &str) -> Result<(), AppError> {
    open_mode::run_open_with_mode(path, mode)
}

pub(super) fn derive_skill_source_parent(source: &str) -> String {
    let path = Path::new(source);
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string());
    match file_name {
        Some(name) if !name.trim().is_empty() => {
            if name.eq_ignore_ascii_case("skills") {
                return path
                    .parent()
                    .and_then(|parent| parent.file_name())
                    .map(|parent| parent.to_string_lossy().to_string())
                    .filter(|parent| !parent.trim().is_empty())
                    .unwrap_or(name);
            }
            name
        }
        _ => path
            .parent()
            .and_then(|parent| parent.file_name())
            .map(|name| name.to_string_lossy().to_string())
            .filter(|name| !name.trim().is_empty())
            .unwrap_or_else(|| "unknown".to_string()),
    }
}

#[derive(Debug, Clone, Default)]
pub(super) struct SkillSourceMetadata {
    pub source_type: String,
    pub source: String,
    pub source_url: String,
    pub skill_path: String,
    pub repo_owner: String,
    pub repo_name: String,
    pub repo_ref: String,
}

#[derive(Debug, Deserialize, Default)]
struct AgentsSkillLockFile {
    #[serde(default)]
    skills: HashMap<String, AgentsSkillLockEntry>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct AgentsSkillLockEntry {
    source: Option<String>,
    source_type: Option<String>,
    source_url: Option<String>,
    skill_path: Option<String>,
    branch: Option<String>,
    source_branch: Option<String>,
}

fn detect_skill_symlink(local_path: &str) -> bool {
    let normalized = local_path.trim_end_matches(['/', '\\']);
    if normalized.is_empty() {
        return false;
    }
    fs::symlink_metadata(normalized)
        .map(|metadata| metadata.file_type().is_symlink())
        .unwrap_or(false)
}

pub(super) fn detect_skill_source_symlink(local_path: &str, source_root: &str) -> bool {
    let normalized = local_path.trim_end_matches(['/', '\\']);
    if normalized.is_empty() {
        return false;
    }
    if detect_skill_symlink(normalized) {
        return true;
    }

    let root = PathBuf::from(source_root.trim_end_matches(['/', '\\']));
    let candidate = PathBuf::from(normalized);
    if root.as_os_str().is_empty() {
        return false;
    }
    let relative = match candidate.strip_prefix(&root) {
        Ok(value) => value,
        Err(_) => return false,
    };

    let mut current = root.clone();
    for component in relative.components() {
        current.push(component.as_os_str());
        if fs::symlink_metadata(&current)
            .map(|metadata| metadata.file_type().is_symlink())
            .unwrap_or(false)
        {
            return true;
        }
    }
    false
}

pub(super) fn build_skill_source_candidate_paths(
    source_root: &str,
    skill_name: &str,
) -> Vec<PathBuf> {
    let normalized_root = source_root.trim_end_matches(['/', '\\']);
    let normalized_name = skill_name.trim();
    if normalized_root.is_empty() || normalized_name.is_empty() {
        return Vec::new();
    }

    let root = PathBuf::from(normalized_root);
    let mut candidates = Vec::new();
    if root
        .file_name()
        .map(|name| name.to_string_lossy().eq_ignore_ascii_case("skills"))
        .unwrap_or(false)
    {
        candidates.push(root.join(normalized_name));
    } else {
        candidates.push(root.join("skills").join(normalized_name));
        candidates.push(root.join(normalized_name));
    }
    candidates
}

pub(super) fn detect_skill_source_symlink_by_name(source_root: &str, skill_name: &str) -> bool {
    build_skill_source_candidate_paths(source_root, skill_name)
        .into_iter()
        .any(|candidate| {
            fs::symlink_metadata(candidate)
                .map(|metadata| metadata.file_type().is_symlink())
                .unwrap_or(false)
        })
}

pub(super) fn resolve_skill_display_source_path(
    source_root: &str,
    skill_name: &str,
    fallback: &str,
) -> String {
    for candidate in build_skill_source_candidate_paths(source_root, skill_name) {
        if candidate.exists() {
            return candidate.to_string_lossy().to_string();
        }
    }
    fallback.to_string()
}

fn normalize_source_lookup_key(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.to_ascii_lowercase())
}

fn parse_owner_repo(source: &str) -> Option<(String, String)> {
    let normalized = source
        .trim()
        .trim_end_matches(".git")
        .trim_start_matches("https://github.com/")
        .trim_start_matches("http://github.com/");
    let mut parts = normalized.split('/').filter(|seg| !seg.trim().is_empty());
    let owner = parts.next()?;
    let repo = parts.next()?;
    Some((owner.to_string(), repo.to_string()))
}

fn parse_branch_from_source_url(source_url: Option<&str>) -> Option<String> {
    let source_url = source_url?;
    let source_url = source_url.trim();
    if source_url.is_empty() {
        return None;
    }

    if let Some((_, after_tree)) = source_url.split_once("/tree/") {
        let branch = after_tree
            .split('/')
            .next()
            .map(str::trim)
            .filter(|s| !s.is_empty())?;
        return Some(branch.to_string());
    }

    if let Some((_, fragment)) = source_url.split_once('#') {
        let branch = fragment
            .split('&')
            .next()
            .map(str::trim)
            .filter(|s| !s.is_empty())?;
        return Some(branch.to_string());
    }

    if let Some((_, query)) = source_url.split_once('?') {
        for pair in query.split('&') {
            let Some((key, value)) = pair.split_once('=') else {
                continue;
            };
            if matches!(key, "branch" | "ref") {
                let branch = value.trim();
                if !branch.is_empty() {
                    return Some(branch.to_string());
                }
            }
        }
    }

    None
}

fn normalize_optional_value(raw: Option<String>) -> String {
    raw.unwrap_or_default().trim().to_string()
}

fn detect_skill_dir_name_from_path(skill_path: &str) -> Option<String> {
    let path = Path::new(skill_path.trim());
    let parent = path.parent()?;
    let dir_name = parent.file_name()?.to_string_lossy().to_string();
    if dir_name.trim().is_empty() {
        None
    } else {
        Some(dir_name)
    }
}

pub(super) fn load_skill_source_hints_from_agents_lock() -> HashMap<String, SkillSourceMetadata> {
    let mut hints: HashMap<String, SkillSourceMetadata> = HashMap::new();
    let Some(home) = dirs::home_dir() else {
        return hints;
    };
    let lock_path = home.join(".agents").join(".skill-lock.json");
    let content = match fs::read_to_string(&lock_path) {
        Ok(value) => value,
        Err(_) => return hints,
    };
    let lock_file = match serde_json::from_str::<AgentsSkillLockFile>(&content) {
        Ok(value) => value,
        Err(_) => return hints,
    };

    for (lock_key, item) in lock_file.skills {
        let source_type = normalize_optional_value(item.source_type.clone());
        if source_type != "github" {
            continue;
        }
        let source = normalize_optional_value(item.source.clone());
        let Some((repo_owner, repo_name)) = parse_owner_repo(&source) else {
            continue;
        };
        let source_url = normalize_optional_value(item.source_url.clone());
        let repo_ref = item
            .branch
            .clone()
            .or(item.source_branch.clone())
            .or_else(|| parse_branch_from_source_url(item.source_url.as_deref()))
            .unwrap_or_default()
            .trim()
            .to_string();
        let skill_path = normalize_optional_value(item.skill_path.clone());
        let metadata = SkillSourceMetadata {
            source_type: "github".to_string(),
            source,
            source_url,
            skill_path: skill_path.clone(),
            repo_owner,
            repo_name,
            repo_ref,
        };

        if let Some(key) = normalize_source_lookup_key(&lock_key) {
            hints.entry(key).or_insert_with(|| metadata.clone());
        }
        if let Some(dir_name) = detect_skill_dir_name_from_path(&skill_path)
            .and_then(|name| normalize_source_lookup_key(&name))
        {
            hints.entry(dir_name).or_insert_with(|| metadata.clone());
        }
    }
    hints
}

pub(super) fn resolve_skill_source_metadata(
    skill_name: &str,
    source_local_path: &str,
    lock_hints: &HashMap<String, SkillSourceMetadata>,
) -> SkillSourceMetadata {
    let mut candidates: Vec<String> = Vec::new();
    if let Some(key) = normalize_source_lookup_key(skill_name) {
        candidates.push(key);
    }
    if let Some(path_name) = Path::new(source_local_path)
        .file_name()
        .and_then(|name| normalize_source_lookup_key(&name.to_string_lossy()))
    {
        candidates.push(path_name);
    }

    for key in candidates {
        if let Some(metadata) = lock_hints.get(&key) {
            return metadata.clone();
        }
    }

    SkillSourceMetadata {
        source_type: "local".to_string(),
        ..SkillSourceMetadata::default()
    }
}

pub(super) fn get_skill_root_by_id(conn: &Connection, skill_id: &str) -> Result<PathBuf, AppError> {
    let local_path = conn
        .query_row(
            "SELECT local_path FROM skills_assets WHERE id = ?1",
            params![skill_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .ok_or_else(|| AppError::invalid_argument("skill 不存在"))?;
    let root = PathBuf::from(local_path);
    if !root.exists() {
        return Err(AppError::invalid_argument("skill 目录不存在"));
    }
    if !root.is_dir() {
        return Err(AppError::invalid_argument("skill 路径不是目录"));
    }
    root.canonicalize()
        .map_err(|err| AppError::internal(format!("读取 skill 目录失败: {err}")))
}

pub(super) fn normalize_rel_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

pub(super) fn list_skill_tree_entries(root: &Path, current: &Path) -> Result<Vec<Value>, AppError> {
    let mut entries = Vec::new();
    for item in fs::read_dir(current)? {
        let entry = match item {
            Ok(value) => value,
            Err(_) => continue,
        };
        let file_name = entry.file_name().to_string_lossy().to_string();
        if file_name == ".DS_Store" {
            continue;
        }

        let file_type = match entry.file_type() {
            Ok(value) => value,
            Err(_) => continue,
        };
        let is_symlink = file_type.is_symlink();
        let is_dir = !is_symlink && file_type.is_dir();
        let absolute = entry.path();
        let relative = absolute
            .strip_prefix(root)
            .map(normalize_rel_path)
            .unwrap_or_else(|_| file_name.clone());
        let mut node = json!({
            "name": file_name,
            "relativePath": relative,
            "isDir": is_dir,
            "isSymlink": is_symlink,
        });
        if is_dir {
            let children = list_skill_tree_entries(root, &absolute)?;
            node["children"] = json!(children);
        }
        entries.push(node);
    }

    entries.sort_by(|left, right| {
        let left_is_dir = left.get("isDir").and_then(Value::as_bool).unwrap_or(false);
        let right_is_dir = right.get("isDir").and_then(Value::as_bool).unwrap_or(false);
        match (left_is_dir, right_is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => {
                let left_name = left
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_lowercase();
                let right_name = right
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_lowercase();
                left_name.cmp(&right_name)
            }
        }
    });

    Ok(entries)
}

pub(super) fn resolve_skill_child_path(
    root: &Path,
    relative_path: &str,
) -> Result<PathBuf, AppError> {
    let trimmed = relative_path.trim();
    if trimmed.is_empty() {
        return Err(AppError::invalid_argument("relative_path 不能为空"));
    }
    if Path::new(trimmed).is_absolute() {
        return Err(AppError::invalid_argument("relative_path 必须是相对路径"));
    }
    let scoped = crate::security::ensure_safe_target_path(root, Path::new(trimmed))?;
    if !scoped.exists() {
        return Err(AppError::invalid_argument("文件不存在"));
    }
    let canonical = scoped
        .canonicalize()
        .map_err(|err| AppError::internal(format!("读取文件路径失败: {err}")))?;
    if !canonical.starts_with(root) {
        return Err(AppError::path_out_of_scope("文件路径超出 skill 根目录"));
    }
    Ok(canonical)
}

pub(super) fn detect_file_language(path: &Path) -> String {
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "md" | "mdx" => "markdown".to_string(),
        "py" => "python".to_string(),
        "js" | "mjs" | "cjs" => "javascript".to_string(),
        "ts" | "mts" | "cts" => "typescript".to_string(),
        "tsx" => "tsx".to_string(),
        "jsx" => "jsx".to_string(),
        "json" => "json".to_string(),
        "yaml" | "yml" => "yaml".to_string(),
        "toml" => "toml".to_string(),
        "rs" => "rust".to_string(),
        "sh" => "bash".to_string(),
        "go" => "go".to_string(),
        "java" => "java".to_string(),
        "c" => "c".to_string(),
        "cpp" | "cc" | "cxx" => "cpp".to_string(),
        "h" | "hpp" => "c".to_string(),
        "css" => "css".to_string(),
        "html" | "htm" => "html".to_string(),
        "xml" => "xml".to_string(),
        "sql" => "sql".to_string(),
        _ => ext,
    }
}

pub(super) fn is_supported_preview_file(path: &Path) -> bool {
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_lowercase();
    matches!(
        ext.as_str(),
        "md" | "mdx"
            | "txt"
            | "py"
            | "js"
            | "mjs"
            | "cjs"
            | "ts"
            | "mts"
            | "cts"
            | "tsx"
            | "jsx"
            | "json"
            | "yaml"
            | "yml"
            | "toml"
            | "rs"
            | "sh"
            | "go"
            | "java"
            | "c"
            | "cpp"
            | "cc"
            | "cxx"
            | "h"
            | "hpp"
            | "css"
            | "html"
            | "htm"
            | "xml"
            | "sql"
    )
}

pub(super) fn dedupe_skills(discovered: Vec<DiscoveredSkill>) -> Vec<DiscoveredSkill> {
    let mut mapped: std::collections::HashMap<String, DiscoveredSkill> =
        std::collections::HashMap::new();

    for skill in discovered {
        match mapped.get(&skill.identity) {
            None => {
                mapped.insert(skill.identity.clone(), skill);
            }
            Some(prev) => {
                let version_cmp = compare_version(&prev.version, &skill.version);
                if version_cmp.is_lt()
                    || (version_cmp.is_eq()
                        && skill_source_priority(&skill.source)
                            < skill_source_priority(&prev.source))
                {
                    mapped.insert(skill.identity.clone(), skill);
                }
            }
        }
    }

    let mut list: Vec<DiscoveredSkill> = mapped.into_values().collect();
    list.sort_by(|a, b| a.name.cmp(&b.name));
    list
}

fn skill_source_priority(source: &str) -> u8 {
    let normalized = source.replace('\\', "/").to_ascii_lowercase();
    if normalized.ends_with("/.codex") || normalized.contains("/.codex/") {
        return 0;
    }
    if normalized.ends_with("/.claude") || normalized.contains("/.claude/") {
        return 1;
    }
    if normalized.ends_with("/.agents") || normalized.contains("/.agents/") {
        return 2;
    }
    3
}

pub(super) fn ensure_workspace_managed_skills_root(
    workspace_root: &Path,
) -> Result<PathBuf, AppError> {
    let root = workspace_root.join("skills");
    fs::create_dir_all(&root)?;
    Ok(root)
}

pub(super) fn ingest_skill_into_workspace_storage(
    skill: &DiscoveredSkill,
    managed_root: &Path,
) -> Result<String, AppError> {
    let source_root = PathBuf::from(&skill.local_path);
    if !source_root.exists() || !source_root.is_dir() {
        return Err(AppError::invalid_argument(format!(
            "skill 源目录不存在或不是目录: {}",
            source_root.display()
        )));
    }

    let managed_name = managed_skill_dir_name(skill);
    let managed_path = managed_root.join(managed_name);
    if normalize_fs_path(&source_root) == normalize_fs_path(&managed_path) {
        return Ok(managed_path.to_string_lossy().to_string());
    }

    let staging_path = managed_root.join(format!(
        ".ingest-{}-{}",
        skill.identity,
        Uuid::new_v4().simple()
    ));
    if staging_path.exists() {
        remove_path_any(&staging_path)?;
    }

    copy_directory_tree(&source_root, &staging_path).inspect_err(|_| {
        let _ = remove_path_any(&staging_path);
    })?;

    if managed_path.exists() {
        remove_path_any(&managed_path)?;
    }

    fs::rename(&staging_path, &managed_path).inspect_err(|_| {
        let _ = remove_path_any(&staging_path);
    })?;

    Ok(managed_path.to_string_lossy().to_string())
}

fn managed_skill_dir_name(skill: &DiscoveredSkill) -> String {
    if !skill.identity.trim().is_empty() {
        return skill.identity.trim().to_string();
    }
    let mut normalized = skill
        .name
        .trim()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>();
    normalized = normalized.trim_matches('-').to_string();
    if normalized.is_empty() {
        "unknown-skill".to_string()
    } else {
        normalized
    }
}

fn copy_directory_tree(source_root: &Path, target_root: &Path) -> Result<(), AppError> {
    fs::create_dir_all(target_root)?;
    for row in WalkDir::new(source_root).follow_links(true).into_iter() {
        let entry = row.map_err(|err| AppError::internal(err.to_string()))?;
        let path = entry.path();
        if path == source_root {
            continue;
        }
        let relative = path
            .strip_prefix(source_root)
            .map_err(|err| AppError::internal(err.to_string()))?;
        let destination = target_root.join(relative);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&destination)?;
            continue;
        }
        if entry.file_type().is_file() {
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(path, &destination)?;
        }
    }
    Ok(())
}

fn remove_path_any(path: &Path) -> Result<(), AppError> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || metadata.is_file() {
        fs::remove_file(path)?;
        return Ok(());
    }
    if metadata.is_dir() {
        fs::remove_dir_all(path)?;
        return Ok(());
    }
    fs::remove_file(path)?;
    Ok(())
}

pub(super) fn normalize_fs_path(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

pub(super) fn is_path_under_root(candidate: &Path, normalized_root: &Path) -> bool {
    let normalized_candidate = normalize_fs_path(candidate);
    normalized_candidate.starts_with(normalized_root)
}

pub(super) fn upsert_skill_asset(
    conn: &Connection,
    skill: &DiscoveredSkill,
    latest_version: &str,
    update_candidate: bool,
    source_local_path: &str,
    source_is_symlink: bool,
    ts: String,
) -> Result<String, AppError> {
    let existing = conn
        .query_row(
            "SELECT id FROM skills_assets WHERE identity = ?1",
            params![skill.identity],
            |row| row.get::<_, String>(0),
        )
        .optional()?;

    let id = existing.unwrap_or_else(|| Uuid::new_v4().to_string());

    conn.execute(
        "INSERT INTO skills_assets(
            id,
            identity,
            name,
            version,
            latest_version,
            source,
            local_path,
            source_local_path,
            source_is_symlink,
            update_candidate,
            created_at,
            updated_at
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
         ON CONFLICT(identity) DO UPDATE SET
            name = excluded.name,
            version = excluded.version,
            latest_version = excluded.latest_version,
            source = excluded.source,
            local_path = excluded.local_path,
            source_local_path = excluded.source_local_path,
            source_is_symlink = excluded.source_is_symlink,
            update_candidate = excluded.update_candidate,
            updated_at = excluded.updated_at",
        params![
            id,
            skill.identity,
            skill.name,
            skill.version,
            latest_version,
            skill.source,
            skill.local_path,
            source_local_path,
            if source_is_symlink { 1 } else { 0 },
            if update_candidate { 1 } else { 0 },
            ts,
            now_rfc3339(),
        ],
    )?;

    Ok(id)
}

pub(super) fn upsert_skill_version(
    conn: &Connection,
    asset_id: &str,
    version: &str,
    source: &str,
) -> Result<(), AppError> {
    let exists = conn
        .query_row(
            "SELECT COUNT(1) FROM skills_versions WHERE asset_id = ?1 AND version = ?2",
            params![asset_id, version],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0);

    if exists > 0 {
        return Ok(());
    }

    conn.execute(
        "INSERT INTO skills_versions(id, asset_id, version, source, installed_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            Uuid::new_v4().to_string(),
            asset_id,
            version,
            source,
            now_rfc3339(),
        ],
    )?;

    Ok(())
}

pub(super) fn upsert_skill_asset_source(
    conn: &Connection,
    asset_id: &str,
    metadata: &SkillSourceMetadata,
    source_local_path: &str,
    local_content_hash: &str,
    remote_content_hash: &str,
    hash_checked_at: Option<&str>,
) -> Result<(), AppError> {
    let now = now_rfc3339();
    let existing = conn
        .query_row(
            "SELECT id FROM skills_asset_sources WHERE asset_id = ?1",
            params![asset_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    let id = existing.unwrap_or_else(|| Uuid::new_v4().to_string());

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
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
         ON CONFLICT(asset_id) DO UPDATE SET
            source_type = excluded.source_type,
            source = excluded.source,
            source_url = excluded.source_url,
            skill_path = excluded.skill_path,
            repo_owner = excluded.repo_owner,
            repo_name = excluded.repo_name,
            repo_ref = excluded.repo_ref,
            source_local_path = excluded.source_local_path,
            local_content_hash = excluded.local_content_hash,
            remote_content_hash = excluded.remote_content_hash,
            hash_checked_at = excluded.hash_checked_at,
            updated_at = excluded.updated_at",
        params![
            id,
            asset_id,
            metadata.source_type,
            metadata.source,
            metadata.source_url,
            metadata.skill_path,
            metadata.repo_owner,
            metadata.repo_name,
            metadata.repo_ref,
            source_local_path,
            local_content_hash,
            remote_content_hash,
            hash_checked_at,
            now,
            now,
        ],
    )?;

    Ok(())
}

pub(super) fn get_skill_asset(conn: &Connection, skill_id: &str) -> Result<SkillAsset, AppError> {
    conn.query_row(
        "SELECT id, identity, name, version, latest_version, source, local_path, source_local_path, source_is_symlink, update_candidate, last_used_at, created_at, updated_at
         FROM skills_assets
         WHERE id = ?1",
        params![skill_id],
        skill_asset_from_row,
    )
    .optional()?
    .ok_or_else(|| AppError::invalid_argument("skill 不存在"))
}

pub(super) fn skill_asset_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SkillAsset> {
    let source: String = row.get(5)?;
    let name: String = row.get(2)?;
    let local_path: String = row.get(6)?;
    let raw_source_local_path = row
        .get::<_, Option<String>>(7)?
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| local_path.clone());
    let source_local_path =
        resolve_skill_display_source_path(&source, &name, &raw_source_local_path);
    let source_is_symlink = row.get::<_, i64>(8)? == 1
        || detect_skill_source_symlink(&source_local_path, &source)
        || detect_skill_source_symlink_by_name(&source, &name);
    let source_parent = derive_skill_source_parent(&source);
    let is_symlink = detect_skill_symlink(&local_path);

    Ok(SkillAsset {
        id: row.get(0)?,
        identity: row.get(1)?,
        name,
        version: row.get(3)?,
        latest_version: row.get(4)?,
        source,
        source_parent,
        local_path,
        source_local_path,
        source_is_symlink,
        is_symlink,
        update_candidate: row.get::<_, i64>(9)? == 1,
        last_used_at: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

pub(super) fn list_skills_by_ids(
    conn: &Connection,
    ids: &[String],
) -> Result<Vec<SkillAsset>, AppError> {
    let mut list = Vec::new();
    for skill_id in ids {
        if let Some(item) = conn
            .query_row(
                "SELECT id, identity, name, version, latest_version, source, local_path, source_local_path, source_is_symlink, update_candidate, last_used_at, created_at, updated_at
                 FROM skills_assets
                 WHERE id = ?1",
                params![skill_id],
                skill_asset_from_row,
            )
            .optional()?
        {
            list.push(item);
        }
    }
    Ok(list)
}

pub(super) fn summarize_json_rows(rows: &[Value]) -> Value {
    let total = rows.len();
    let success = rows
        .iter()
        .filter(|item| item.get("status").and_then(Value::as_str) == Some("success"))
        .count();
    let failed = total.saturating_sub(success);

    json!({
        "total": total,
        "success": success,
        "failed": failed,
    })
}
