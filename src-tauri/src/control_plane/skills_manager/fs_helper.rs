use super::*;

pub(super) fn diff_skill_roots(
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

pub(super) fn resolve_link_target_path(target: &Path) -> Result<PathBuf, AppError> {
    let link_target = fs::read_link(target)?;
    if link_target.is_absolute() {
        return Ok(link_target);
    }
    Ok(target
        .parent()
        .map(|parent| parent.join(&link_target))
        .unwrap_or(link_target))
}
pub(super) fn collect_skill_files(root: &Path) -> Result<HashMap<String, PathBuf>, AppError> {
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

pub(super) fn compare_skill_file_pair(
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

pub(super) fn read_file_bytes(path: Option<&PathBuf>) -> Result<Option<Vec<u8>>, AppError> {
    match path {
        Some(file_path) => fs::read(file_path).map(Some).map_err(|err| {
            AppError::internal(format!("读取文件失败 {}: {err}", file_path.display()))
        }),
        None => Ok(None),
    }
}

pub(super) fn to_normalized_relative_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}
pub(super) fn is_same_symlink_target(target: &Path, expected_source: &Path) -> bool {
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

pub(super) fn replace_link_target_with_symlink(
    source: &Path,
    target: &Path,
) -> Result<(), AppError> {
    remove_existing_target(target)?;
    create_symlink_dir(source, target)
}

pub(super) fn replace_link_target_with_copy(source: &Path, target: &Path) -> Result<(), AppError> {
    if !source.is_dir() {
        return Err(AppError::invalid_argument("skill 源目录不存在或不可读"));
    }
    remove_existing_target(target)?;
    fs::create_dir_all(target)?;
    copy_dir_recursive(source, target)?;
    Ok(())
}

pub(super) fn remove_existing_target(target: &Path) -> Result<(), AppError> {
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

pub(super) fn copy_dir_recursive(source: &Path, target: &Path) -> Result<(), AppError> {
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

pub(super) fn normalize_path(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

#[cfg(unix)]
pub(super) fn create_symlink_dir(source: &Path, target: &Path) -> Result<(), AppError> {
    use std::os::unix::fs::symlink;
    symlink(source, target)?;
    Ok(())
}

#[cfg(windows)]
pub(super) fn create_symlink_dir(source: &Path, target: &Path) -> Result<(), AppError> {
    use std::os::windows::fs::symlink_dir;
    symlink_dir(source, target)?;
    Ok(())
}
