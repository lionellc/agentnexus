use super::*;

pub(super) fn build_checks(
    response: &ProtocolResponse,
    expected_model: &str,
) -> Vec<ChannelApiTestCheck> {
    let mut checks = Vec::new();
    checks.push(check(
        "non_empty_response",
        "响应非空",
        if response.text.trim().is_empty() {
            "fail"
        } else {
            "pass"
        },
        None,
    ));
    checks.push(check(
        "http_status",
        "HTTP 状态",
        match response.http_status {
            Some(status) if (200..300).contains(&status) => "pass",
            Some(_) => "fail",
            None => "warn",
        },
        response.http_status.map(|status| status.to_string()),
    ));
    checks.push(check(
        "error_json",
        "错误 JSON",
        if response.error_reason.is_some() {
            "fail"
        } else {
            "pass"
        },
        response.error_reason.clone(),
    ));
    checks.push(check(
        "model_field",
        "模型字段",
        match response.model.as_deref() {
            Some(model) if !model.trim().is_empty() => "pass",
            _ => "warn",
        },
        response
            .model
            .clone()
            .or_else(|| Some(format!("请求模型: {expected_model}"))),
    ));
    checks.push(model_rewrite_check(
        response.model.as_deref(),
        expected_model,
    ));
    checks.push(check(
        "usage_field",
        "usage 字段",
        if response.usage.is_some() {
            "pass"
        } else {
            "warn"
        },
        None,
    ));
    checks.push(check(
        "finish_reason",
        "结束原因",
        match response.finish_reason.as_deref() {
            Some("length") | Some("max_tokens") => "warn",
            Some(_) => "pass",
            None => "warn",
        },
        response.finish_reason.clone(),
    ));
    if response.bedrock.is_some() {
        checks.extend(build_bedrock_checks(response));
    }
    checks
}

fn build_bedrock_checks(response: &ProtocolResponse) -> Vec<ChannelApiTestCheck> {
    let details = response.bedrock.as_ref().unwrap_or(&Value::Null);
    vec![
        check(
            "bedrock_event_stream",
            "Bedrock event-stream",
            if details
                .get("eventStreamParsed")
                .and_then(Value::as_bool)
                .unwrap_or(false)
            {
                "pass"
            } else {
                "fail"
            },
            details
                .get("parseError")
                .and_then(Value::as_str)
                .map(str::to_string),
        ),
        check(
            "bedrock_latency_metadata",
            "Bedrock latency metadata",
            if details.get("latencyMs").and_then(Value::as_i64).is_some() {
                "pass"
            } else {
                "warn"
            },
            details
                .get("latencyMs")
                .and_then(Value::as_i64)
                .map(|value| value.to_string()),
        ),
        check(
            "bedrock_stream_exception",
            "Bedrock stream exception",
            if details
                .get("streamException")
                .is_some_and(|value| !value.is_null())
            {
                "fail"
            } else {
                "pass"
            },
            details
                .get("streamException")
                .and_then(Value::as_str)
                .map(str::to_string),
        ),
        check(
            "region_model",
            "Region/Model",
            if response.error_reason.as_deref().is_some_and(|value| {
                let lower = value.to_ascii_lowercase();
                lower.contains("region") || lower.contains("model")
            }) {
                "warn"
            } else {
                "pass"
            },
            response.error_reason.clone(),
        ),
    ]
}

fn model_rewrite_check(response_model: Option<&str>, expected_model: &str) -> ChannelApiTestCheck {
    let expected = expected_model.trim();
    match response_model
        .map(str::trim)
        .filter(|model| !model.is_empty())
    {
        Some(actual) if actual == expected => check(
            "model_rewrite",
            "模型改写检测",
            "pass",
            Some("响应模型字段一致；这不证明中转没有改写模型。".to_string()),
        ),
        Some(actual) => check(
            "model_rewrite",
            "模型改写检测",
            "warn",
            Some(format!("疑似模型被改写：请求 {expected}，响应 {actual}")),
        ),
        None => check(
            "model_rewrite",
            "模型改写检测",
            "warn",
            Some(format!(
                "响应缺少模型字段，无法判断是否改写；请求模型: {expected}"
            )),
        ),
    }
}

pub(super) fn check(
    id: &str,
    label: &str,
    status: &str,
    detail: Option<String>,
) -> ChannelApiTestCheck {
    ChannelApiTestCheck {
        id: id.to_string(),
        label: label.to_string(),
        status: status.to_string(),
        detail,
    }
}

pub(super) fn truncate_text(text: &str, max_chars: usize) -> String {
    text.chars().take(max_chars).collect()
}

pub(super) fn display_base_url(base_url: &str) -> String {
    base_url.trim().trim_end_matches('/').to_string()
}

pub(super) fn sanitize_text(text: &str, api_key: &str) -> String {
    let mut sanitized = text.to_string();
    let key = api_key.trim();
    if !key.is_empty() {
        sanitized = sanitized.replace(key, "[masked-api-key]");
    }
    sanitized
        .replace("Authorization", "[masked-authorization]")
        .replace("authorization", "[masked-authorization]")
        .replace("x-api-key", "[masked-api-key-header]")
}

pub(super) fn size_from_usage_or_chars(
    usage: Option<&Value>,
    usage_field: &str,
    text: &str,
) -> (i64, String) {
    let usage_value = usage
        .and_then(|value| value.get(usage_field))
        .and_then(Value::as_i64);
    if let Some(value) = usage_value {
        return (value, SIZE_USAGE.to_string());
    }
    (text.chars().count() as i64, SIZE_CHARS.to_string())
}
