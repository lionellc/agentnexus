use std::{fs, path::Path};

use crate::{error::AppError, utils::sha256_file};

#[derive(Debug, Clone)]
pub struct DistributionExecResult {
    pub status: String,
    pub message: String,
    pub used_mode: String,
    pub actual_hash: String,
}

pub fn distribute_agents(
    content: &str,
    expected_hash: &str,
    target_path: &Path,
    mode: &str,
    allow_fallback: bool,
) -> Result<DistributionExecResult, AppError> {
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let mut used_mode = mode.to_string();
    let mut fallback_message = String::new();

    if mode == "symlink" {
        match write_symlink_content(content, target_path) {
            Ok(_) => {}
            Err(err) if allow_fallback => {
                used_mode = "copy".to_string();
                fallback_message = format!("symlink 失败，已降级 copy: {err}");
                fs::write(target_path, content)?;
            }
            Err(err) => {
                return Ok(DistributionExecResult {
                    status: "failed".to_string(),
                    message: err.to_string(),
                    used_mode,
                    actual_hash: String::new(),
                });
            }
        }
    } else {
        fs::write(target_path, content)?;
    }

    let actual_hash = sha256_file(target_path)?;
    let status = if actual_hash == expected_hash {
        "success"
    } else {
        "failed"
    }
    .to_string();

    let mut message = if status == "success" {
        "ok".to_string()
    } else {
        "hash mismatch".to_string()
    };
    if !fallback_message.is_empty() {
        message = format!("{message}; {fallback_message}");
    }

    Ok(DistributionExecResult {
        status,
        message,
        used_mode,
        actual_hash,
    })
}

pub fn detect_drift(target_path: &Path, expected_hash: &str) -> Result<(String, String), AppError> {
    if !target_path.exists() {
        return Ok(("failed".to_string(), "目标文件不存在".to_string()));
    }
    let actual_hash = sha256_file(target_path)?;
    if actual_hash == expected_hash {
        Ok(("success".to_string(), actual_hash))
    } else {
        Ok(("drifted".to_string(), actual_hash))
    }
}

pub fn distribute_skill(
    source_dir: &Path,
    target_dir: &Path,
    mode: &str,
) -> Result<String, AppError> {
    if !source_dir.exists() {
        return Err(AppError::target_path_unavailable("Skill 源目录不存在"));
    }

    if let Some(parent) = target_dir.parent() {
        fs::create_dir_all(parent)?;
    }

    if target_dir.exists() {
        remove_path(target_dir)?;
    }

    if mode == "symlink" {
        write_symlink_path(source_dir, target_dir)?;
        return Ok("symlink".to_string());
    }

    copy_dir_recursive(source_dir, target_dir)?;
    Ok("copy".to_string())
}

pub fn uninstall_skill(target_dir: &Path) -> Result<(), AppError> {
    if target_dir.exists() {
        remove_path(target_dir)?;
    }
    Ok(())
}

fn remove_path(path: &Path) -> Result<(), AppError> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || metadata.is_file() {
        fs::remove_file(path)?;
    } else {
        fs::remove_dir_all(path)?;
    }
    Ok(())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), AppError> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else if file_type.is_symlink() {
            let linked = fs::read_link(&src_path)?;
            write_symlink_path(&linked, &dst_path)?;
        } else {
            if let Some(parent) = dst_path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

#[cfg(unix)]
fn write_symlink_content(content: &str, target_path: &Path) -> Result<(), AppError> {
    use std::os::unix::fs::symlink;

    let link_source = target_path.with_extension("agentnexus.link");
    fs::write(&link_source, content)?;
    if target_path.exists() {
        remove_path(target_path)?;
    }
    symlink(&link_source, target_path)?;
    Ok(())
}

#[cfg(windows)]
fn write_symlink_content(content: &str, target_path: &Path) -> Result<(), AppError> {
    use std::os::windows::fs::symlink_file;

    let link_source = target_path.with_extension("agentnexus.link");
    fs::write(&link_source, content)?;
    if target_path.exists() {
        remove_path(target_path)?;
    }
    symlink_file(&link_source, target_path)?;
    Ok(())
}

#[cfg(unix)]
fn write_symlink_path(source: &Path, target: &Path) -> Result<(), AppError> {
    use std::os::unix::fs::symlink;

    symlink(source, target)?;
    Ok(())
}

#[cfg(windows)]
fn write_symlink_path(source: &Path, target: &Path) -> Result<(), AppError> {
    use std::os::windows::fs::symlink_dir;

    symlink_dir(source, target)?;
    Ok(())
}
