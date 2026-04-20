use std::path::Path;

use crate::error::AppError;

pub(super) fn normalize_open_mode(mode: Option<String>) -> String {
    mode.unwrap_or_else(|| "finder".to_string())
        .trim()
        .to_lowercase()
}

#[cfg(target_os = "macos")]
pub(super) fn run_open_with_mode(path: &Path, mode: &str) -> Result<(), AppError> {
    let open_target = if matches!(mode, "terminal" | "iterm2") && path.is_file() {
        path.parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| path.to_path_buf())
    } else {
        path.to_path_buf()
    };

    let mut cmd = std::process::Command::new("open");
    match mode {
        "default" => {
            cmd.arg(&open_target);
        }
        "finder" => {
            cmd.arg("-R").arg(&open_target);
        }
        "vscode" => {
            cmd.arg("-a").arg("Visual Studio Code").arg(&open_target);
        }
        "cursor" => {
            cmd.arg("-a").arg("Cursor").arg(&open_target);
        }
        "zed" => {
            cmd.arg("-a").arg("Zed").arg(&open_target);
        }
        "terminal" => {
            cmd.arg("-a").arg("Terminal").arg(&open_target);
        }
        "iterm2" => {
            cmd.arg("-a").arg("iTerm").arg(&open_target);
        }
        "xcode" => {
            cmd.arg("-a").arg("Xcode").arg(&open_target);
        }
        "goland" => {
            cmd.arg("-a").arg("GoLand").arg(&open_target);
        }
        _ => return Err(AppError::invalid_argument("不支持的打开方式")),
    };
    let status = cmd
        .status()
        .map_err(|err| AppError::internal(format!("执行 open 失败: {err}")))?;
    if !status.success() {
        return Err(AppError::internal("执行 open 失败"));
    }
    Ok(())
}

#[cfg(target_os = "linux")]
pub(super) fn run_open_with_mode(path: &Path, _mode: &str) -> Result<(), AppError> {
    let status = std::process::Command::new("xdg-open")
        .arg(path)
        .status()
        .map_err(|err| AppError::internal(format!("执行 xdg-open 失败: {err}")))?;
    if !status.success() {
        return Err(AppError::internal("执行 xdg-open 失败"));
    }
    Ok(())
}

#[cfg(target_os = "windows")]
pub(super) fn run_open_with_mode(path: &Path, _mode: &str) -> Result<(), AppError> {
    let path_text = path.to_string_lossy().to_string();
    let status = std::process::Command::new("cmd")
        .args(["/C", "start", "", &path_text])
        .status()
        .map_err(|err| AppError::internal(format!("执行 start 失败: {err}")))?;
    if !status.success() {
        return Err(AppError::internal("执行 start 失败"));
    }
    Ok(())
}
