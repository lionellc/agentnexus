use serde_json::Value;

use crate::error::AppError;

#[derive(Debug, Clone, Copy)]
pub(super) enum TranslationConflictStrategy {
    Overwrite,
    SaveAs,
}

pub(super) fn normalize_strategy(
    input: Option<&str>,
) -> Result<Option<TranslationConflictStrategy>, AppError> {
    let Some(raw) = input else {
        return Ok(None);
    };

    match raw.trim().to_lowercase().as_str() {
        "overwrite" => Ok(Some(TranslationConflictStrategy::Overwrite)),
        "save_as" | "saveas" => Ok(Some(TranslationConflictStrategy::SaveAs)),
        _ => Err(AppError::invalid_argument(
            "strategy 仅支持 overwrite / save_as",
        )),
    }
}

pub(super) fn normalize_apply_mode(input: Option<&str>) -> String {
    match input.unwrap_or("immersive").trim().to_lowercase().as_str() {
        "overwrite" => "overwrite".to_string(),
        _ => "immersive".to_string(),
    }
}

pub(super) fn normalize_profile_key(value: &str) -> Result<String, AppError> {
    let key = value.trim().to_lowercase();
    if key.is_empty() {
        return Err(AppError::invalid_argument("profileKey 不能为空"));
    }
    if !key
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-')
    {
        return Err(AppError::invalid_argument(
            "profileKey 仅支持字母、数字、-、_",
        ));
    }
    Ok(key)
}

pub(super) fn normalize_target_language(value: &str) -> Result<String, AppError> {
    let language = value.trim();
    if language.is_empty() {
        return Err(AppError::invalid_argument("目标语言不能为空"));
    }
    if language.chars().count() > 64 {
        return Err(AppError::invalid_argument("目标语言长度不能超过 64"));
    }
    Ok(language.to_string())
}

pub(super) fn normalize_source_text(value: &str) -> Result<String, AppError> {
    if value.trim().is_empty() {
        return Err(AppError::invalid_argument("原文不能为空"));
    }
    Ok(value.to_string())
}

pub(super) fn validate_profile_name(value: &str) -> Result<(), AppError> {
    let name = value.trim();
    if name.is_empty() {
        return Err(AppError::invalid_argument("profile 名称不能为空"));
    }
    if name.chars().count() > 128 {
        return Err(AppError::invalid_argument("profile 名称长度不能超过 128"));
    }
    Ok(())
}

pub(super) fn validate_executable(value: &str) -> Result<(), AppError> {
    let executable = value.trim();
    if executable.is_empty() {
        return Err(AppError::invalid_argument("可执行程序不能为空"));
    }
    if contains_forbidden_exec_pattern(executable) {
        return Err(AppError::new(
            "AGENT_EXEC_FORBIDDEN",
            "可执行程序命中安全策略，禁止执行",
        ));
    }
    Ok(())
}

pub(super) fn validate_args_template(args_template: &[String]) -> Result<(), AppError> {
    if args_template.len() > 40 {
        return Err(AppError::invalid_argument("参数模板过长，最多 40 项"));
    }

    for arg in args_template {
        let trimmed = arg.trim();
        if trimmed.is_empty() {
            return Err(AppError::invalid_argument("参数模板中包含空项"));
        }

        if contains_forbidden_exec_pattern(trimmed) {
            return Err(AppError::new(
                "AGENT_EXEC_FORBIDDEN",
                "参数模板命中安全策略，禁止执行",
            ));
        }
    }

    Ok(())
}

pub(super) fn validate_translation_template(template: &str) -> Result<(), AppError> {
    let trimmed = template.trim();
    if trimmed.is_empty() {
        return Err(AppError::invalid_argument("翻译 Prompt 模板不能为空"));
    }

    if !trimmed.contains("{{source_text}}") || !trimmed.contains("{{target_language}}") {
        return Err(AppError::invalid_argument(
            "翻译模板必须包含 {{source_text}} 与 {{target_language}} 占位符",
        ));
    }

    Ok(())
}

pub(super) fn contains_forbidden_exec_pattern(input: &str) -> bool {
    let value = input.trim();
    if value.is_empty() {
        return false;
    }

    if value.contains('|')
        || value.contains('>')
        || value.contains('<')
        || value.contains(';')
        || value.contains("`")
        || value.contains("$(")
    {
        return true;
    }

    let lower = value.to_lowercase();
    lower.contains("--output")
        || lower == "-o"
        || lower.starts_with("-o=")
        || lower.contains("--file")
        || lower.contains("--path")
        || lower.contains("--tool")
        || lower.contains("--tools")
}

pub(super) fn truncate_text(value: &str, limit: usize) -> String {
    if value.len() <= limit {
        return value.to_string();
    }

    let mut end = limit;
    while !value.is_char_boundary(end) {
        end -= 1;
    }

    value[..end].to_string()
}

pub(super) fn clamp_timeout(value: u64) -> u64 {
    value.clamp(5, 30 * 60)
}

pub(super) fn bool_to_int(value: bool) -> i64 {
    if value {
        1
    } else {
        0
    }
}

pub(super) fn json_to_sql_value(value: &Value) -> rusqlite::types::Value {
    match value {
        Value::Null => rusqlite::types::Value::Null,
        Value::Bool(boolean) => rusqlite::types::Value::Integer(i64::from(*boolean)),
        Value::Number(number) => {
            if let Some(int) = number.as_i64() {
                rusqlite::types::Value::Integer(int)
            } else if let Some(float) = number.as_f64() {
                rusqlite::types::Value::Real(float)
            } else {
                rusqlite::types::Value::Null
            }
        }
        Value::String(text) => rusqlite::types::Value::Text(text.clone()),
        Value::Array(_) | Value::Object(_) => rusqlite::types::Value::Text(value.to_string()),
    }
}
