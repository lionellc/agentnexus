use std::{
    net::IpAddr,
    path::{Component, Path, PathBuf},
};

use url::Url;

use crate::error::AppError;

pub fn validate_workspace_root(root_path: &str) -> Result<PathBuf, AppError> {
    let path = PathBuf::from(root_path);
    if !path.exists() {
        return Err(AppError::invalid_argument("workspace 路径不存在"));
    }
    if !path.is_dir() {
        return Err(AppError::invalid_argument("workspace 路径必须是目录"));
    }
    let canonical = path
        .canonicalize()
        .map_err(|err| AppError::invalid_argument(err.to_string()))?;
    Ok(canonical)
}

pub fn validate_absolute_root_dir(root_dir: &str) -> Result<PathBuf, AppError> {
    let trimmed = root_dir.trim();
    if trimmed.is_empty() {
        return Err(AppError::invalid_argument("root_dir 不能为空"));
    }
    let path = PathBuf::from(trimmed);
    if !path.is_absolute() {
        return Err(AppError::invalid_argument("root_dir 必须是绝对路径"));
    }
    Ok(path)
}

pub fn validate_install_mode(mode: &str) -> Result<(), AppError> {
    if mode != "copy" && mode != "symlink" {
        return Err(AppError::invalid_argument(
            "install mode 仅支持 copy/symlink",
        ));
    }
    Ok(())
}

pub fn validate_agent_root_dir(root_dir: &str) -> Result<PathBuf, AppError> {
    let trimmed = root_dir.trim();
    if trimmed.is_empty() {
        return Err(AppError::invalid_argument("agent root_dir 不能为空"));
    }

    let raw = PathBuf::from(trimmed);
    if !raw.is_absolute() {
        return Err(AppError::invalid_argument(
            "agent root_dir 必须为绝对路径",
        ));
    }

    normalize_lexical(&raw)
}

pub fn ensure_safe_target_path(
    workspace_root: &Path,
    target_path: &Path,
) -> Result<PathBuf, AppError> {
    let root = workspace_root
        .canonicalize()
        .map_err(|err| AppError::path_out_of_scope(format!("workspace 路径不可访问: {err}")))?;

    let absolute = if target_path.is_absolute() {
        target_path.to_path_buf()
    } else {
        root.join(target_path)
    };

    let normalized = normalize_lexical(&absolute)?;
    if !normalized.starts_with(&root) {
        return Err(AppError::path_out_of_scope("目标路径超出 workspace 范围"));
    }

    Ok(normalized)
}

pub fn validate_external_source(url_str: &str) -> Result<Url, AppError> {
    let parsed = Url::parse(url_str)
        .map_err(|err| AppError::security_violation(format!("URL 非法: {err}")))?;
    if parsed.scheme() != "https" {
        return Err(AppError::security_violation("外部源仅允许 HTTPS"));
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| AppError::security_violation("外部源缺少 host"))?
        .to_lowercase();

    if host == "localhost"
        || host.ends_with(".localhost")
        || host.ends_with(".local")
        || host.ends_with(".internal")
        || host.contains("localhost")
    {
        return Err(AppError::security_violation(
            "外部源 host 命中 localhost/private 规则",
        ));
    }

    if let Ok(ip) = host.parse::<IpAddr>() {
        if is_private_ip(&ip) {
            return Err(AppError::security_violation("外部源命中私网地址"));
        }
    }

    Ok(parsed)
}

fn normalize_lexical(path: &Path) -> Result<PathBuf, AppError> {
    let mut stack: Vec<Component<'_>> = Vec::new();

    for component in path.components() {
        match component {
            Component::ParentDir => {
                if stack.is_empty() {
                    return Err(AppError::path_out_of_scope("检测到越界路径"));
                }
                stack.pop();
            }
            Component::CurDir => {}
            other => stack.push(other),
        }
    }

    let mut normalized = PathBuf::new();
    for component in stack {
        normalized.push(component.as_os_str());
    }

    if normalized.as_os_str().is_empty() {
        return Err(AppError::path_out_of_scope("路径不能为空"));
    }

    Ok(normalized)
}

fn is_private_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(addr) => {
            addr.is_private()
                || addr.is_loopback()
                || addr.is_link_local()
                || addr.octets()[0] == 0
                || addr.octets()[0] >= 224
        }
        IpAddr::V6(addr) => {
            addr.is_loopback()
                || addr.is_unspecified()
                || addr.is_unique_local()
                || addr.is_unicast_link_local()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{ensure_safe_target_path, validate_absolute_root_dir, validate_external_source};

    #[test]
    fn reject_out_of_scope_target_path() {
        let workspace = tempfile::tempdir().expect("create temp workspace");
        let outside = workspace.path().join("../outside/AGENTS.md");
        let result = ensure_safe_target_path(workspace.path(), &outside);
        assert!(result.is_err());
    }

    #[test]
    fn reject_private_network_url() {
        let result = validate_external_source("https://127.0.0.1/skills");
        assert!(result.is_err());
    }

    #[test]
    fn allow_public_https_url() {
        let result = validate_external_source("https://example.com/skills");
        assert!(result.is_ok());
    }

    #[test]
    fn reject_relative_agent_root_dir() {
        let result = validate_absolute_root_dir("workspace/rules");
        assert!(result.is_err());
    }
}
