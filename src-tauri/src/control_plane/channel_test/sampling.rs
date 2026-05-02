use super::api::run_protocol;
use super::*;

const DEFAULT_SAMPLE_COUNT: usize = 3;

pub(super) fn run_sampling(
    input: &ChannelApiTestRunInput,
) -> (
    Vec<ChannelApiTestMessageInput>,
    Vec<ProtocolResponse>,
    Value,
) {
    let messages = input.messages.clone().unwrap_or_else(default_messages);
    let mut responses = Vec::new();
    for _ in 0..DEFAULT_SAMPLE_COUNT {
        responses.push(run_protocol(input, &messages));
    }
    let sample_items = responses
        .iter()
        .enumerate()
        .map(|(index, response)| {
            let headers = response.response_headers.as_object();
            json!({
                "sample": index + 1,
                "httpStatus": response.http_status,
                "responseModel": response.model,
                "headers": response.response_headers,
                "server": header_value(headers, "server"),
                "xCache": header_value(headers, "x-cache"),
                "requestId": header_value(headers, "x-request-id").or_else(|| header_value(headers, "cf-ray")),
                "ratelimit": ratelimit_summary(headers),
                "usage": response.usage,
                "firstTokenMs": response.first_token_ms,
                "completedMs": response.completed_ms,
                "errorReason": response.error_reason,
            })
        })
        .collect::<Vec<_>>();
    let summary = attribution::sampling_summary(&responses);
    (
        messages,
        responses,
        json!({ "summary": summary, "items": sample_items }),
    )
}

fn header_value(headers: Option<&serde_json::Map<String, Value>>, name: &str) -> Option<String> {
    headers
        .and_then(|items| items.get(name))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn ratelimit_summary(headers: Option<&serde_json::Map<String, Value>>) -> Option<String> {
    let headers = headers?;
    let keys = [
        "x-ratelimit-remaining-requests",
        "x-ratelimit-reset-requests",
        "anthropic-ratelimit-requests-remaining",
        "anthropic-ratelimit-requests-reset",
    ];
    let values = keys
        .iter()
        .filter_map(|key| {
            headers
                .get(*key)
                .and_then(Value::as_str)
                .map(|value| format!("{key}={value}"))
        })
        .collect::<Vec<_>>();
    if values.is_empty() {
        None
    } else {
        Some(values.join("; "))
    }
}

fn default_messages() -> Vec<ChannelApiTestMessageInput> {
    vec![ChannelApiTestMessageInput {
        role: "user".to_string(),
        content: "请只回复 pong。".to_string(),
    }]
}
