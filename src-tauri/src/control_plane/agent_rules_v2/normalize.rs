use std::path::{Component, Path, PathBuf};

use crate::{
    control_plane::agent_presets::{
        default_agent_root_dir as preset_default_agent_root_dir,
        default_agent_rule_file as preset_default_agent_rule_file,
    },
    error::AppError,
    security::validate_absolute_root_dir,
};

pub(super) fn normalize_agent_type(agent_type: &str) -> Result<String, AppError> {
    let normalized = agent_type.trim().to_lowercase();
    if normalized.is_empty() {
        return Err(AppError::invalid_argument("agent_type 不能为空"));
    }
    let valid = normalized
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-');
    if !valid {
        return Err(AppError::invalid_argument("agent_type 仅允许字母/数字/-/_"));
    }
    Ok(normalized)
}

pub(super) fn default_rule_file_name(agent_type: &str) -> String {
    preset_default_agent_rule_file(agent_type)
}

pub(super) fn default_agent_root_dir(agent_type: &str) -> String {
    preset_default_agent_root_dir(agent_type)
}

pub(super) fn normalize_rule_file(
    rule_file: Option<&str>,
    agent_type: &str,
) -> Result<String, AppError> {
    let candidate = rule_file
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| default_rule_file_name(agent_type));
    let path = Path::new(&candidate);
    if path.is_absolute() {
        return Err(AppError::invalid_argument("rule_file 必须是相对路径"));
    }
    for component in path.components() {
        if matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        ) {
            return Err(AppError::invalid_argument("rule_file 路径不合法"));
        }
    }
    Ok(candidate)
}

pub(super) fn validate_enabled_root_dir(root_dir: &str) -> Result<(), AppError> {
    if root_dir.trim().is_empty() {
        return Err(AppError::invalid_argument(
            "启用 Agent 时 root_dir 不能为空",
        ));
    }
    validate_absolute_root_dir(root_dir)?;
    Ok(())
}

pub(super) fn resolve_rule_file_path(
    root_dir: &str,
    rule_file: &str,
    agent_type: &str,
) -> Result<PathBuf, AppError> {
    let root = validate_absolute_root_dir(root_dir)?;
    let normalized_rule_file = normalize_rule_file(Some(rule_file), agent_type)?;
    Ok(root.join(normalized_rule_file))
}

pub(super) fn bool_to_int(value: bool) -> i64 {
    if value {
        1
    } else {
        0
    }
}
