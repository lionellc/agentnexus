use super::*;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, CONTENT_TYPE};
use reqwest::StatusCode;
use serde_json::json;
use std::io::Read;

#[derive(Debug, Clone)]
pub(super) struct BedrockEvent {
    event_type: String,
    payload: Value,
    observed_ms: Option<i64>,
}

pub(super) fn run_bedrock(
    input: &ChannelApiTestRunInput,
    messages: &[ChannelApiTestMessageInput],
) -> ProtocolResponse {
    let started = Instant::now();
    let client = match http::build_client_with_timeout(input.timeout_ms) {
        Ok(client) => client,
        Err(err) => return protocol_error(started, None, err.message, Value::Null),
    };
    let url = bedrock_endpoint(input);
    let headers = match bedrock_headers(&input.api_key) {
        Ok(headers) => headers,
        Err(err) => return protocol_error(started, None, err.message, Value::Null),
    };
    let body = bedrock_body(input, messages);
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
    parse_bedrock_response(
        response,
        status,
        started,
        body,
        Some(header_ms),
        response_headers,
    )
}

fn bedrock_endpoint(input: &ChannelApiTestRunInput) -> String {
    let region = input.region.as_deref().unwrap_or_default().trim();
    let model = input.model.trim();
    format!("https://bedrock-runtime.{region}.amazonaws.com/model/{model}/converse-stream")
}

fn bedrock_headers(api_key: &str) -> Result<HeaderMap, AppError> {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(
        ACCEPT,
        HeaderValue::from_static("application/vnd.amazon.eventstream"),
    );
    headers.insert(
        "authorization",
        http::header_value(&format!("Bearer {}", api_key.trim()))?,
    );
    Ok(headers)
}

fn bedrock_body(input: &ChannelApiTestRunInput, messages: &[ChannelApiTestMessageInput]) -> Value {
    json!({
        "modelId": input.model,
        "messages": messages.iter()
            .filter(|message| message.role != "system")
            .map(|message| json!({
                "role": if message.role == "assistant" { "assistant" } else { "user" },
                "content": [{ "text": message.content }],
            }))
            .collect::<Vec<_>>(),
        "inferenceConfig": {
            "maxTokens": input.max_tokens.unwrap_or(1024),
        },
    })
}

fn parse_bedrock_response(
    mut response: reqwest::blocking::Response,
    status: StatusCode,
    started: Instant,
    request_json: Value,
    header_ms: Option<i64>,
    response_headers: Value,
) -> ProtocolResponse {
    if !status.is_success() {
        let mut bytes = Vec::new();
        let read_result = response.read_to_end(&mut bytes);
        if let Err(err) = read_result {
            return protocol_error(started, Some(status), err.to_string(), request_json);
        }
        let raw = String::from_utf8_lossy(&bytes).to_string();
        return ProtocolResponse {
            http_status: Some(status.as_u16() as i64),
            model: None,
            text: String::new(),
            raw_excerpt: checks::truncate_text(&raw, 4_000),
            usage: None,
            finish_reason: None,
            first_metric_kind: FIRST_TOKEN.to_string(),
            first_token_ms: None,
            error_reason: Some(format!("HTTP {}", status.as_u16())),
            request_json,
            response_json: json!({ "raw": checks::truncate_text(&raw, 16_000) }),
            header_ms,
            first_event_ms: None,
            first_text_delta_ms: None,
            completed_ms: Some(elapsed_ms(started)),
            response_headers,
            bedrock: None,
        };
    }
    match read_event_stream(&mut response, started) {
        Ok((events, completed_ms)) => response_from_events(
            events,
            status,
            started,
            request_json,
            header_ms,
            Some(completed_ms),
            response_headers,
        ),
        Err(message) => ProtocolResponse {
            http_status: Some(status.as_u16() as i64),
            model: None,
            text: String::new(),
            raw_excerpt: checks::truncate_text(&message, 4_000),
            usage: None,
            finish_reason: None,
            first_metric_kind: FIRST_TOKEN.to_string(),
            first_token_ms: None,
            error_reason: Some(message.clone()),
            request_json,
            response_json: json!({ "parseError": message }),
            header_ms,
            first_event_ms: None,
            first_text_delta_ms: None,
            completed_ms: Some(elapsed_ms(started)),
            response_headers,
            bedrock: Some(json!({
                "eventStreamParsed": false,
                "parseError": message,
            })),
        },
    }
}

fn response_from_events(
    events: Vec<BedrockEvent>,
    status: StatusCode,
    started: Instant,
    request_json: Value,
    header_ms: Option<i64>,
    completed_ms: Option<i64>,
    response_headers: Value,
) -> ProtocolResponse {
    let mut text = String::new();
    let mut usage = None;
    let mut finish_reason = None;
    let mut latency_ms = None;
    let mut first_event_ms = None;
    let mut first_text_delta_ms = None;
    let mut exception = None;
    let mut timeline = Vec::new();
    let mut samples = Vec::new();
    for (index, event) in events.iter().enumerate() {
        let payload = event_payload(event);
        let observed_ms = event.observed_ms.unwrap_or_else(|| elapsed_ms(started));
        if first_event_ms.is_none() {
            first_event_ms = Some(observed_ms);
        }
        let delta = text_delta(event);
        if first_text_delta_ms.is_none() && delta.as_deref().is_some_and(|value| !value.is_empty())
        {
            first_text_delta_ms = Some(observed_ms);
        }
        if let Some(value) = delta {
            text.push_str(&value);
        }
        if event.event_type == "metadata" {
            usage = payload.get("usage").cloned().or(usage);
            latency_ms = payload
                .get("metrics")
                .and_then(|metrics| metrics.get("latencyMs"))
                .and_then(Value::as_i64)
                .or(latency_ms);
        }
        if event.event_type == "messageStop" {
            finish_reason = payload
                .get("stopReason")
                .and_then(Value::as_str)
                .map(str::to_string)
                .or(finish_reason);
        }
        if event.event_type.ends_with("Exception") {
            exception = Some(exception_message(event));
        }
        timeline.push(json!({
            "index": index + 1,
            "type": event.event_type,
            "observedMs": observed_ms,
        }));
        if samples.len() < 12 {
            samples.push(json!({
                "type": event.event_type,
                "payload": event.payload,
            }));
        }
    }
    let bedrock = json!({
        "eventStreamParsed": true,
        "firstEventMs": first_event_ms,
        "firstTextDeltaMs": first_text_delta_ms,
        "latencyMs": latency_ms,
        "usage": usage,
        "stopReason": finish_reason,
        "eventCounts": event_counts(&events),
        "timeline": timeline,
        "eventSamples": samples,
        "streamException": exception,
    });
    ProtocolResponse {
        http_status: Some(status.as_u16() as i64),
        model: None,
        text,
        raw_excerpt: checks::truncate_text(&bedrock.to_string(), 4_000),
        usage,
        finish_reason,
        first_metric_kind: FIRST_TOKEN.to_string(),
        first_token_ms: first_text_delta_ms,
        error_reason: exception,
        request_json,
        response_json: bedrock.clone(),
        header_ms,
        first_event_ms,
        first_text_delta_ms,
        completed_ms,
        response_headers,
        bedrock: Some(bedrock),
    }
}

fn read_event_stream<R: Read>(
    reader: &mut R,
    started: Instant,
) -> Result<(Vec<BedrockEvent>, i64), String> {
    let mut buffer = Vec::new();
    let mut chunk = [0_u8; 8192];
    let mut events = Vec::new();
    loop {
        match reader.read(&mut chunk) {
            Ok(0) => break,
            Ok(size) => {
                buffer.extend_from_slice(&chunk[..size]);
                drain_event_stream_frames(&mut buffer, elapsed_ms(started), &mut events)?;
            }
            Err(err) => return Err(err.to_string()),
        }
    }
    if !buffer.is_empty() {
        if buffer.len() < 16 {
            return Err("event-stream frame 长度不足".to_string());
        }
        return Err("event-stream frame 被截断".to_string());
    }
    Ok((events, elapsed_ms(started)))
}

#[cfg(test)]
fn parse_event_stream(bytes: &[u8]) -> Result<Vec<BedrockEvent>, String> {
    let mut offset = 0;
    let mut events = Vec::new();
    while offset < bytes.len() {
        if bytes.len() - offset < 16 {
            return Err("event-stream frame 长度不足".to_string());
        }
        let total_len = u32::from_be_bytes(bytes[offset..offset + 4].try_into().unwrap()) as usize;
        let headers_len =
            u32::from_be_bytes(bytes[offset + 4..offset + 8].try_into().unwrap()) as usize;
        if total_len < 16 || offset + total_len > bytes.len() {
            return Err("event-stream frame 长度非法".to_string());
        }
        if 12 + headers_len > total_len.saturating_sub(4) {
            return Err("event-stream headers 长度非法".to_string());
        }
        events.push(parse_event_stream_frame(
            &bytes[offset..offset + total_len],
            None,
        )?);
        offset += total_len;
    }
    Ok(events)
}

fn drain_event_stream_frames(
    buffer: &mut Vec<u8>,
    observed_ms: i64,
    events: &mut Vec<BedrockEvent>,
) -> Result<(), String> {
    loop {
        if buffer.len() < 12 {
            return Ok(());
        }
        let total_len = u32::from_be_bytes(buffer[0..4].try_into().unwrap()) as usize;
        let headers_len = u32::from_be_bytes(buffer[4..8].try_into().unwrap()) as usize;
        if total_len < 16 {
            return Err("event-stream frame 长度非法".to_string());
        }
        if 12 + headers_len > total_len.saturating_sub(4) {
            return Err("event-stream headers 长度非法".to_string());
        }
        if buffer.len() < total_len {
            return Ok(());
        }
        events.push(parse_event_stream_frame(
            &buffer[..total_len],
            Some(observed_ms),
        )?);
        buffer.drain(..total_len);
    }
}

fn parse_event_stream_frame(
    bytes: &[u8],
    observed_ms: Option<i64>,
) -> Result<BedrockEvent, String> {
    if bytes.len() < 16 {
        return Err("event-stream frame 长度不足".to_string());
    }
    let total_len = u32::from_be_bytes(bytes[0..4].try_into().unwrap()) as usize;
    let headers_len = u32::from_be_bytes(bytes[4..8].try_into().unwrap()) as usize;
    if total_len != bytes.len() || total_len < 16 {
        return Err("event-stream frame 长度非法".to_string());
    }
    if 12 + headers_len > total_len.saturating_sub(4) {
        return Err("event-stream headers 长度非法".to_string());
    }
    let headers_start = 12;
    let payload_start = headers_start + headers_len;
    let payload_end = total_len - 4;
    let headers = parse_headers(&bytes[headers_start..payload_start])?;
    let payload = if payload_start == payload_end {
        Value::Null
    } else {
        serde_json::from_slice::<Value>(&bytes[payload_start..payload_end])
            .map_err(|err| format!("event-stream payload 不是合法 JSON: {err}"))?
    };
    let event_type = headers
        .iter()
        .find(|(name, _)| name == ":event-type")
        .map(|(_, value)| value.clone())
        .or_else(|| event_type_from_payload(&payload))
        .unwrap_or_else(|| "unknown".to_string());
    Ok(BedrockEvent {
        event_type,
        payload,
        observed_ms,
    })
}

fn parse_headers(bytes: &[u8]) -> Result<Vec<(String, String)>, String> {
    let mut offset = 0;
    let mut headers = Vec::new();
    while offset < bytes.len() {
        let name_len = *bytes
            .get(offset)
            .ok_or_else(|| "event-stream header name 长度缺失".to_string())?
            as usize;
        offset += 1;
        if offset + name_len + 3 > bytes.len() {
            return Err("event-stream header 长度非法".to_string());
        }
        let name = String::from_utf8_lossy(&bytes[offset..offset + name_len]).to_string();
        offset += name_len;
        let value_type = bytes[offset];
        offset += 1;
        if value_type != 7 {
            return Err("event-stream header 仅支持 string 类型".to_string());
        }
        let value_len = u16::from_be_bytes(bytes[offset..offset + 2].try_into().unwrap()) as usize;
        offset += 2;
        if offset + value_len > bytes.len() {
            return Err("event-stream header value 长度非法".to_string());
        }
        let value = String::from_utf8_lossy(&bytes[offset..offset + value_len]).to_string();
        offset += value_len;
        headers.push((name, value));
    }
    Ok(headers)
}

fn event_type_from_payload(payload: &Value) -> Option<String> {
    let object = payload.as_object()?;
    if object.len() == 1 {
        object.keys().next().cloned()
    } else {
        None
    }
}

fn text_delta(event: &BedrockEvent) -> Option<String> {
    let payload = event_payload(event);
    payload
        .get("contentBlockDelta")
        .and_then(|value| value.get("delta"))
        .and_then(|delta| delta.get("text"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            payload
                .get("delta")
                .and_then(|delta| delta.get("text"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
}

fn exception_message(event: &BedrockEvent) -> String {
    event_payload(event)
        .get("message")
        .and_then(Value::as_str)
        .map(|message| format!("{}: {}", event.event_type, message))
        .unwrap_or_else(|| event.event_type.clone())
}

fn event_payload(event: &BedrockEvent) -> &Value {
    event
        .payload
        .get(&event.event_type)
        .unwrap_or(&event.payload)
}

fn event_counts(events: &[BedrockEvent]) -> Value {
    let mut counts = serde_json::Map::new();
    for event in events {
        let next = counts
            .get(&event.event_type)
            .and_then(Value::as_i64)
            .unwrap_or(0)
            + 1;
        counts.insert(event.event_type.clone(), Value::from(next));
    }
    Value::Object(counts)
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
        first_metric_kind: FIRST_TOKEN.to_string(),
        first_token_ms: None,
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
pub(super) fn parse_event_stream_for_test(bytes: &[u8]) -> Result<Vec<BedrockEvent>, String> {
    parse_event_stream(bytes)
}

#[cfg(test)]
pub(super) fn response_from_events_for_test(events: Vec<BedrockEvent>) -> ProtocolResponse {
    response_from_events(
        events,
        StatusCode::OK,
        Instant::now(),
        json!({}),
        Some(1),
        Some(1),
        json!({}),
    )
}

#[cfg(test)]
pub(super) fn response_from_reader_for_test<R: Read>(
    reader: &mut R,
) -> Result<ProtocolResponse, String> {
    let started = Instant::now();
    let (events, completed_ms) = read_event_stream(reader, started)?;
    Ok(response_from_events(
        events,
        StatusCode::OK,
        started,
        json!({}),
        Some(1),
        Some(completed_ms),
        json!({}),
    ))
}
