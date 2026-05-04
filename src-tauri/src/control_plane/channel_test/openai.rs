use super::*;
use reqwest::StatusCode;
use serde_json::json;
use std::io::Read;

pub(super) fn run_openai(
    input: &ChannelApiTestRunInput,
    messages: &[ChannelApiTestMessageInput],
) -> ProtocolResponse {
    let started = Instant::now();
    let client = match http::build_client() {
        Ok(client) => client,
        Err(err) => return protocol_error(started, None, err.message, Value::Null),
    };
    let url = http::endpoint(&input.base_url, "/v1/chat/completions");
    let headers = match http::headers(&[("authorization", format!("Bearer {}", input.api_key))]) {
        Ok(headers) => headers,
        Err(err) => return protocol_error(started, None, err.message, Value::Null),
    };
    let body = request_body(input, messages);

    let response = client.post(url).headers(headers).json(&body).send();
    let Ok(response) = response else {
        return protocol_error(
            started,
            None,
            response
                .err()
                .map(|err| err.to_string())
                .unwrap_or_default(),
            body,
        );
    };
    let header_ms = elapsed_ms(started);
    let response_headers = http::diagnostic_headers(response.headers());
    let status = response.status();
    if input.stream {
        parse_openai_stream(
            response,
            status,
            started,
            body,
            Some(header_ms),
            response_headers,
        )
    } else {
        let text = match http::response_text(response) {
            Ok(text) => text,
            Err(err) => return protocol_error(started, Some(status), err.message, body),
        };
        let completed_ms = elapsed_ms(started);
        parse_openai_json(
            &text,
            Some(status),
            FIRST_RESPONSE,
            Some(completed_ms),
            body,
            Some(header_ms),
            Some(completed_ms),
            response_headers,
        )
    }
}

fn parse_openai_json(
    raw: &str,
    http_status: Option<StatusCode>,
    first_metric_kind: &str,
    first_token_ms: Option<i64>,
    request_json: Value,
    header_ms: Option<i64>,
    completed_ms: Option<i64>,
    response_headers: Value,
) -> ProtocolResponse {
    let parsed = serde_json::from_str::<Value>(raw);
    let Ok(value) = parsed else {
        return ProtocolResponse {
            http_status: http_status.map(|status| status.as_u16() as i64),
            model: None,
            text: String::new(),
            raw_excerpt: checks::truncate_text(raw, 4_000),
            usage: None,
            finish_reason: None,
            first_metric_kind: first_metric_kind.to_string(),
            first_token_ms,
            error_reason: Some("响应不是合法 JSON".to_string()),
            request_json,
            response_json: json!({ "raw": checks::truncate_text(raw, 16_000) }),
            header_ms,
            first_event_ms: None,
            first_text_delta_ms: None,
            completed_ms,
            response_headers,
            bedrock: None,
        };
    };
    let error_reason = value
        .get("error")
        .and_then(|error| error.get("message").or_else(|| error.get("type")))
        .and_then(Value::as_str)
        .map(str::to_string);
    let text = value
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|items| items.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let finish_reason = value
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|items| items.first())
        .and_then(|choice| choice.get("finish_reason"))
        .and_then(Value::as_str)
        .map(str::to_string);
    ProtocolResponse {
        http_status: http_status.map(|status| status.as_u16() as i64),
        model: value
            .get("model")
            .and_then(Value::as_str)
            .map(str::to_string),
        text,
        raw_excerpt: checks::truncate_text(raw, 4_000),
        usage: value.get("usage").cloned(),
        finish_reason,
        first_metric_kind: first_metric_kind.to_string(),
        first_token_ms,
        error_reason,
        request_json,
        response_json: value,
        header_ms,
        first_event_ms: None,
        first_text_delta_ms: None,
        completed_ms,
        response_headers,
        bedrock: None,
    }
}

fn parse_openai_stream(
    mut response: reqwest::blocking::Response,
    status: StatusCode,
    started: Instant,
    request_json: Value,
    header_ms: Option<i64>,
    response_headers: Value,
) -> ProtocolResponse {
    let mut buffer = String::new();
    let mut chunk = [0_u8; 1024];
    let mut text = String::new();
    let mut raw = String::new();
    let mut model = None;
    let mut usage = None;
    let mut finish_reason = None;
    let mut first_token_ms = None;
    let mut first_event_ms = None;
    loop {
        match response.read(&mut chunk) {
            Ok(0) => break,
            Ok(size) => {
                buffer.push_str(&String::from_utf8_lossy(&chunk[..size]));
                while let Some(index) = buffer.find('\n') {
                    let line = buffer[..index].trim().to_string();
                    buffer = buffer[index + 1..].to_string();
                    if !line.starts_with("data:") {
                        continue;
                    }
                    let data = line.trim_start_matches("data:").trim();
                    if data == "[DONE]" {
                        break;
                    }
                    if first_event_ms.is_none() {
                        first_event_ms = Some(elapsed_ms(started));
                    }
                    raw.push_str(data);
                    raw.push('\n');
                    if let Ok(value) = serde_json::from_str::<Value>(data) {
                        if model.is_none() {
                            model = value
                                .get("model")
                                .and_then(Value::as_str)
                                .map(str::to_string);
                        }
                        if usage.is_none() {
                            usage = value.get("usage").cloned();
                        }
                        if let Some(choice) = value
                            .get("choices")
                            .and_then(Value::as_array)
                            .and_then(|items| items.first())
                        {
                            if let Some(reason) =
                                choice.get("finish_reason").and_then(Value::as_str)
                            {
                                finish_reason = Some(reason.to_string());
                            }
                            if let Some(delta) = choice
                                .get("delta")
                                .and_then(|delta| delta.get("content"))
                                .and_then(Value::as_str)
                            {
                                if first_token_ms.is_none() && !delta.is_empty() {
                                    first_token_ms = Some(elapsed_ms(started));
                                }
                                text.push_str(delta);
                            }
                        }
                    }
                }
            }
            Err(err) => {
                return ProtocolResponse {
                    http_status: Some(status.as_u16() as i64),
                    model,
                    text,
                    raw_excerpt: checks::truncate_text(&raw, 4_000),
                    usage,
                    finish_reason,
                    first_metric_kind: FIRST_TOKEN.to_string(),
                    first_token_ms,
                    error_reason: Some(err.to_string()),
                    request_json,
                    response_json: json!({ "streamEvents": raw.lines().collect::<Vec<_>>() }),
                    header_ms,
                    first_event_ms,
                    first_text_delta_ms: first_token_ms,
                    completed_ms: Some(elapsed_ms(started)),
                    response_headers,
                    bedrock: None,
                };
            }
        }
    }
    let completed_ms = elapsed_ms(started);

    ProtocolResponse {
        http_status: Some(status.as_u16() as i64),
        model,
        text,
        raw_excerpt: checks::truncate_text(&raw, 4_000),
        usage,
        finish_reason,
        first_metric_kind: FIRST_TOKEN.to_string(),
        first_token_ms,
        error_reason: if status.is_success() {
            None
        } else {
            Some(format!("HTTP {}", status.as_u16()))
        },
        request_json,
        response_json: json!({ "streamEvents": raw.lines().collect::<Vec<_>>() }),
        header_ms,
        first_event_ms,
        first_text_delta_ms: first_token_ms,
        completed_ms: Some(completed_ms),
        response_headers,
        bedrock: None,
    }
}

fn protocol_error(
    started: Instant,
    status: Option<StatusCode>,
    message: String,
    request_json: Value,
) -> ProtocolResponse {
    ProtocolResponse {
        http_status: status.map(|status| status.as_u16() as i64),
        model: None,
        text: String::new(),
        raw_excerpt: checks::truncate_text(&message, 4_000),
        usage: None,
        finish_reason: None,
        first_metric_kind: FIRST_RESPONSE.to_string(),
        first_token_ms: Some(elapsed_ms(started)),
        error_reason: Some(message),
        request_json,
        response_json: Value::Null,
        header_ms: status.map(|_| elapsed_ms(started)),
        first_event_ms: None,
        first_text_delta_ms: None,
        completed_ms: Some(elapsed_ms(started)),
        response_headers: Value::Null,
        bedrock: None,
    }
}

fn elapsed_ms(started: Instant) -> i64 {
    started.elapsed().as_millis() as i64
}

#[cfg(test)]
pub(super) fn parse_openai_json_for_test(raw: &str) -> ProtocolResponse {
    parse_openai_json(
        raw,
        Some(StatusCode::OK),
        FIRST_RESPONSE,
        Some(1),
        json!({}),
        Some(1),
        Some(1),
        json!({}),
    )
}

#[cfg(test)]
pub(super) fn request_body_for_test(
    input: &ChannelApiTestRunInput,
    messages: &[ChannelApiTestMessageInput],
) -> Value {
    request_body(input, messages)
}

fn request_body(input: &ChannelApiTestRunInput, messages: &[ChannelApiTestMessageInput]) -> Value {
    json!({
        "model": input.model,
        "messages": messages.iter().map(|message| json!({
            "role": message.role,
            "content": message.content,
        })).collect::<Vec<_>>(),
        "stream": input.stream,
        "stream_options": if input.stream { Some(json!({ "include_usage": true })) } else { None },
        "max_tokens": input.max_tokens.unwrap_or(1024),
    })
}
