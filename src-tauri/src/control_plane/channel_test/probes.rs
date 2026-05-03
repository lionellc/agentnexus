use super::runner::run_protocol;
use super::*;

pub(super) fn run_probe(
    input: &ChannelApiTestRunInput,
) -> (
    Vec<ChannelApiTestMessageInput>,
    Vec<ProtocolResponse>,
    Value,
) {
    let messages = input.messages.clone().unwrap_or_else(default_messages);
    let normal = run_protocol(input, &messages);
    let invalid_model_input = ChannelApiTestRunInput {
        model: format!("{}-agentnexus-diagnostic-invalid", input.model.trim()),
        ..input.clone()
    };
    let boundary = run_protocol(&invalid_model_input, &messages);
    let details = json!([
        probe_detail("normal_small_request", "正常小请求", &normal),
        probe_detail("invalid_model_boundary", "非法模型边界请求", &boundary),
    ]);
    (messages, vec![normal, boundary], details)
}

fn default_messages() -> Vec<ChannelApiTestMessageInput> {
    vec![ChannelApiTestMessageInput {
        role: "user".to_string(),
        content: "请用一句话回复 pong。".to_string(),
    }]
}

fn probe_detail(id: &str, label: &str, response: &ProtocolResponse) -> Value {
    json!({
        "id": id,
        "label": label,
        "httpStatus": response.http_status,
        "responseModel": response.model,
        "errorReason": response.error_reason,
        "errorFingerprint": error_fingerprint(response),
        "headers": response.response_headers,
        "usage": response.usage,
        "completedMs": response.completed_ms,
    })
}

fn error_fingerprint(response: &ProtocolResponse) -> Value {
    let error = response.response_json.get("error");
    json!({
        "type": error.and_then(|value| value.get("type")).and_then(Value::as_str),
        "code": error.and_then(|value| value.get("code")).and_then(Value::as_str),
        "param": error.and_then(|value| value.get("param")).and_then(Value::as_str),
        "message": error
            .and_then(|value| value.get("message"))
            .and_then(Value::as_str)
            .or(response.error_reason.as_deref()),
    })
}
