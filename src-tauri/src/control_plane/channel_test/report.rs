use super::*;

pub(super) fn build_conversation_json(
    input: &ChannelApiTestRunInput,
    messages: &[ChannelApiTestMessageInput],
    responses: &[ProtocolResponse],
    rounds: Option<&[ChannelApiTestRoundResult]>,
) -> Value {
    build_conversation_json_with_details(
        input,
        messages,
        responses,
        rounds,
        None,
        input.run_mode.as_deref().unwrap_or(RUN_MODE_STANDARD),
    )
}

pub(super) fn build_conversation_json_with_details(
    input: &ChannelApiTestRunInput,
    messages: &[ChannelApiTestMessageInput],
    responses: &[ProtocolResponse],
    rounds: Option<&[ChannelApiTestRoundResult]>,
    diagnostic_details: Option<Value>,
    run_mode: &str,
) -> Value {
    let round_values = rounds
        .map(|items| {
            items
                .iter()
                .map(|round| serde_json::to_value(round).unwrap_or(Value::Null))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    json!({
        "protocol": input.protocol,
        "model": input.model,
        "baseUrl": checks::display_base_url(&input.base_url),
        "category": input.category,
        "caseId": input.case_id,
        "runMode": run_mode,
        "stream": input.stream,
        "metricNote": if input.stream {
            "首字为首个非空增量文本到达时间；输入/输出优先取 usage，缺失时回退字符数。"
        } else {
            "首字列展示完整响应返回时间；输入/输出优先取 usage，缺失时回退字符数。"
        },
        "messages": messages.iter().map(|message| json!({
            "role": message.role,
            "content": message.content,
        })).collect::<Vec<_>>(),
        "rounds": round_values,
        "requests": responses.iter().map(|response| response.request_json.clone()).collect::<Vec<_>>(),
        "responses": responses.iter().map(|response| json!({
            "httpStatus": response.http_status,
            "model": response.model,
            "text": response.text,
            "usage": response.usage,
            "finishReason": response.finish_reason,
            "firstMetricKind": response.first_metric_kind,
            "firstTokenMs": response.first_token_ms,
            "errorReason": response.error_reason,
            "raw": response.response_json,
        })).collect::<Vec<_>>(),
        "metrics": responses.iter().enumerate().map(|(index, response)| json!({
            "round": index + 1,
            "httpHeadersMs": response.header_ms,
            "firstSseEventMs": response.first_event_ms,
            "firstTextDeltaMs": response.first_text_delta_ms,
            "bedrockLatencyMs": response
                .bedrock
                .as_ref()
                .and_then(|value| value.get("latencyMs"))
                .and_then(Value::as_i64),
            "completedMs": response.completed_ms,
            "displayFirstMs": response.first_token_ms,
            "displayTotalMs": response.completed_ms,
        })).collect::<Vec<_>>(),
        "bedrock": responses.iter().find_map(|response| response.bedrock.clone()).unwrap_or(Value::Null),
        "connectionDiagnostics": build_connection_diagnostics(input, responses),
        "diagnosticDetails": diagnostic_details,
        "attributionReport": attribution::build_attribution_report(input, responses, diagnostic_details_for_attribution(run_mode, &diagnostic_details)),
    })
}

fn diagnostic_details_for_attribution(run_mode: &str, details: &Option<Value>) -> Option<Value> {
    if run_mode == RUN_MODE_SAMPLING {
        details.clone()
    } else {
        None
    }
}

fn build_connection_diagnostics(
    input: &ChannelApiTestRunInput,
    responses: &[ProtocolResponse],
) -> Value {
    let host = base_url_host(&input.base_url);
    let official = is_official_host(input.protocol.as_str(), host.as_deref());
    let header_sets = responses
        .iter()
        .map(|response| response.response_headers.clone())
        .collect::<Vec<_>>();
    let has_proxy_headers = header_sets.iter().any(has_proxy_header);
    let connection_type = if official && !has_proxy_headers {
        "official_direct_candidate"
    } else if !official || has_proxy_headers {
        "proxy_candidate"
    } else {
        "unknown"
    };
    let mut reasons = Vec::new();
    match host.as_deref() {
        Some(value) => reasons.push(format!("baseUrl host: {value}")),
        None => reasons.push("baseUrl host 无法解析".to_string()),
    }
    if official {
        reasons.push("host 匹配官方 API 域名候选".to_string());
    } else {
        reasons.push("host 不是当前协议的官方 API 域名".to_string());
    }
    if has_proxy_headers {
        reasons.push("响应头包含 via/x-cache/cf-ray 等代理线索".to_string());
    }
    json!({
        "connectionType": connection_type,
        "baseUrlHost": host,
        "officialHostCandidate": official,
        "proxyHeaderCandidate": has_proxy_headers,
        "headers": header_sets,
        "reasons": reasons,
        "note": "这是基于 baseUrl 和响应头的候选判断；透明反代可能无法被普通请求可靠识别。"
    })
}

fn base_url_host(base_url: &str) -> Option<String> {
    reqwest::Url::parse(base_url.trim())
        .ok()
        .and_then(|url| url.host_str().map(str::to_string))
}

fn is_official_host(protocol: &str, host: Option<&str>) -> bool {
    matches!(
        (protocol, host),
        (PROTOCOL_OPENAI, Some("api.openai.com")) | (PROTOCOL_ANTHROPIC, Some("api.anthropic.com"))
    )
}

pub(super) fn has_proxy_header(value: &Value) -> bool {
    value.as_object().is_some_and(|headers| {
        ["via", "x-cache", "cf-ray", "server"]
            .iter()
            .any(|name| headers.contains_key(*name))
    })
}
