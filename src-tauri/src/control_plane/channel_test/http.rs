use super::*;
use reqwest::blocking::{Client, Response};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE};
use serde_json::Map;

pub(super) fn build_client() -> Result<Client, AppError> {
    Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|err| AppError::internal(err.to_string()))
}

pub(super) fn endpoint(base_url: &str, suffix: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.ends_with(suffix) {
        trimmed.to_string()
    } else {
        format!("{trimmed}{suffix}")
    }
}

pub(super) fn header_value(value: &str) -> Result<HeaderValue, AppError> {
    HeaderValue::from_str(value).map_err(|err| AppError::invalid_argument(err.to_string()))
}

pub(super) fn headers(pairs: &[(&str, String)]) -> Result<HeaderMap, AppError> {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    for (name, value) in pairs {
        let name = HeaderName::from_bytes(name.as_bytes())
            .map_err(|err| AppError::invalid_argument(err.to_string()))?;
        headers.insert(name, header_value(value)?);
    }
    Ok(headers)
}

pub(super) fn response_text(response: Response) -> Result<String, AppError> {
    response
        .text()
        .map_err(|err| AppError::internal(format!("读取响应失败: {err}")))
}

pub(super) fn diagnostic_headers(headers: &HeaderMap) -> Value {
    let mut result = Map::new();
    for name in [
        "server",
        "via",
        "x-cache",
        "cf-ray",
        "x-request-id",
        "x-ratelimit-limit-requests",
        "x-ratelimit-remaining-requests",
        "x-ratelimit-reset-requests",
        "anthropic-ratelimit-requests-limit",
        "anthropic-ratelimit-requests-remaining",
        "anthropic-ratelimit-requests-reset",
        "openai-processing-ms",
    ] {
        if let Some(value) = headers.get(name).and_then(|value| value.to_str().ok()) {
            result.insert(
                name.to_string(),
                Value::String(checks::truncate_text(value, 400)),
            );
        }
    }
    Value::Object(result)
}
