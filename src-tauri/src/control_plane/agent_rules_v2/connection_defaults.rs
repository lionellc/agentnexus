use std::fs;

use crate::{error::AppError, security::validate_absolute_root_dir};

use super::{
    normalize::default_agent_root_dir, AgentConnectionSearchDirDto, ConnectionRow,
};

pub(super) const SOURCE_MANUAL: &str = "manual";
pub(super) const SOURCE_INFERRED: &str = "inferred";

pub(super) const DETECTION_DETECTED: &str = "detected";
pub(super) const DETECTION_UNDETECTED: &str = "undetected";
const DETECTION_PERMISSION_DENIED: &str = "permission_denied";

pub(super) fn normalize_path_source(source: Option<&str>, fallback: &str) -> String {
    match source.map(|item| item.trim().to_ascii_lowercase()) {
        Some(value) if value == SOURCE_MANUAL => SOURCE_MANUAL.to_string(),
        Some(value) if value == SOURCE_INFERRED => SOURCE_INFERRED.to_string(),
        _ => fallback.to_string(),
    }
}

pub(super) fn normalize_detection_status(status: Option<&str>, fallback: &str) -> String {
    match status.map(|item| item.trim().to_ascii_lowercase()) {
        Some(value) if value == DETECTION_DETECTED => DETECTION_DETECTED.to_string(),
        Some(value) if value == DETECTION_UNDETECTED => DETECTION_UNDETECTED.to_string(),
        Some(value) if value == DETECTION_PERMISSION_DENIED => {
            DETECTION_PERMISSION_DENIED.to_string()
        }
        _ => fallback.to_string(),
    }
}

pub(super) fn validate_enabled_search_dirs(
    dirs: &[AgentConnectionSearchDirDto],
) -> Result<(), AppError> {
    if !dirs.iter().any(|item| item.enabled) {
        return Err(AppError::invalid_argument(
            "启用 Agent 时至少需要一个有效的 skillSearchDirs",
        ));
    }

    for dir in dirs.iter().filter(|item| item.enabled) {
        validate_absolute_root_dir(&dir.path)?;
    }
    Ok(())
}

pub(super) fn infer_detection_status(root_dir: &str) -> &'static str {
    let trimmed = root_dir.trim();
    if trimmed.is_empty() {
        return DETECTION_UNDETECTED;
    }
    match fs::metadata(trimmed) {
        Ok(metadata) => {
            if metadata.is_dir() {
                DETECTION_DETECTED
            } else {
                DETECTION_UNDETECTED
            }
        }
        Err(err) if err.kind() == std::io::ErrorKind::PermissionDenied => {
            DETECTION_PERMISSION_DENIED
        }
        Err(_) => DETECTION_UNDETECTED,
    }
}

pub(super) fn candidate_root_dirs(agent_type: &str) -> Vec<String> {
    let default_root = default_agent_root_dir(agent_type);
    if default_root.trim().is_empty() {
        return Vec::new();
    }
    vec![default_root]
}

pub(super) fn detect_candidate_root(candidates: &[String]) -> (Option<String>, String) {
    let mut saw_permission_denied = false;
    for candidate in candidates {
        let status = infer_detection_status(candidate);
        if status == DETECTION_DETECTED {
            return (Some(candidate.clone()), DETECTION_DETECTED.to_string());
        }
        if status == DETECTION_PERMISSION_DENIED {
            saw_permission_denied = true;
        }
    }
    (
        None,
        if saw_permission_denied {
            DETECTION_PERMISSION_DENIED.to_string()
        } else {
            DETECTION_UNDETECTED.to_string()
        },
    )
}

pub(super) fn is_manual_overridden(connection: &ConnectionRow) -> bool {
    connection.root_dir_source == SOURCE_MANUAL || connection.rule_file_source == SOURCE_MANUAL
}
