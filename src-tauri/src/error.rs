use serde::Serialize;
use std::fmt::{Display, Formatter};

#[derive(Debug, Clone, Serialize)]
pub struct AppError {
    pub code: String,
    pub message: String,
}

impl AppError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }

    pub fn invalid_argument(message: impl Into<String>) -> Self {
        Self::new("INVALID_ARGUMENT", message)
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new("INTERNAL_ERROR", message)
    }

    pub fn workspace_not_found() -> Self {
        Self::new("WORKSPACE_NOT_FOUND", "workspace 不存在")
    }

    pub fn agent_doc_not_found() -> Self {
        Self::new("AGENT_DOC_NOT_FOUND", "AGENTS 草稿不存在")
    }

    pub fn release_not_found() -> Self {
        Self::new("RELEASE_NOT_FOUND", "release 不存在")
    }

    pub fn path_out_of_scope(message: impl Into<String>) -> Self {
        Self::new("PATH_OUT_OF_SCOPE", message)
    }

    pub fn target_path_unavailable(message: impl Into<String>) -> Self {
        Self::new("TARGET_PATH_UNAVAILABLE", message)
    }

    pub fn security_violation(message: impl Into<String>) -> Self {
        Self::new("SECURITY_VIOLATION", message)
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(value: rusqlite::Error) -> Self {
        Self::internal(value.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        Self::internal(value.to_string())
    }
}

impl From<anyhow::Error> for AppError {
    fn from(value: anyhow::Error) -> Self {
        Self::internal(value.to_string())
    }
}

impl Display for AppError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for AppError {}
