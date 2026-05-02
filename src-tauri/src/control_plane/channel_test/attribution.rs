use super::*;
use serde_json::Map;

pub(super) fn build_attribution_report(
    input: &ChannelApiTestRunInput,
    responses: &[ProtocolResponse],
    samples: Option<Value>,
) -> Value {
    let host = base_url_host(&input.base_url);
    let model_rewrite = build_model_rewrite(
        &input.model,
        responses
            .last()
            .and_then(|response| response.model.as_deref()),
    );
    let header_sets = responses
        .iter()
        .map(|response| response.response_headers.clone())
        .collect::<Vec<_>>();
    let evidences = build_evidences(input, responses, host.as_deref(), &header_sets);
    let candidates = build_candidates(input, responses, host.as_deref(), &header_sets);

    json!({
        "version": 1,
        "summary": summary_label(&candidates),
        "evidenceLevels": [
            { "id": "observed_fact", "label": "已观测事实" },
            { "id": "strong_inference", "label": "强推断" },
            { "id": "weak_inference", "label": "弱推断" },
            { "id": "unknown", "label": "不确定" },
            { "id": "client_unverifiable", "label": "客户端不可判断" }
        ],
        "modelRewrite": model_rewrite,
        "candidates": candidates,
        "evidences": evidences,
        "samples": samples,
        "diagnosticDetails": samples,
        "unverifiableItems": [
            "真实账号池",
            "真实额度来源",
            "中转出口网络路径",
            "中转完整请求改写"
        ],
        "note": "本报告只基于客户端可见证据。候选上游和号池迹象是归因推断，不等于中转侧或上游账单证明。"
    })
}

pub(super) fn build_model_rewrite(expected_model: &str, response_model: Option<&str>) -> Value {
    let expected = expected_model.trim();
    match response_model
        .map(str::trim)
        .filter(|model| !model.is_empty())
    {
        Some(actual) if actual == expected => json!({
            "status": "same_field",
            "label": "响应模型字段一致",
            "severity": "info",
            "requestModel": expected,
            "responseModel": actual,
            "note": "响应模型字段一致，但不能证明中转没有改写模型；中转可能回填或伪造该字段。"
        }),
        Some(actual) => json!({
            "status": "suspected_rewrite",
            "label": "疑似模型被改写",
            "severity": "warn",
            "requestModel": expected,
            "responseModel": actual,
            "note": "请求模型与响应模型字段不一致，这是模型被路由或改写的强证据。"
        }),
        None => json!({
            "status": "unknown",
            "label": "无法通过响应模型字段判断",
            "severity": "warn",
            "requestModel": expected,
            "responseModel": Value::Null,
            "note": "响应没有模型字段，不能默认认为中转未改写模型。"
        }),
    }
}

fn build_evidences(
    input: &ChannelApiTestRunInput,
    responses: &[ProtocolResponse],
    host: Option<&str>,
    header_sets: &[Value],
) -> Vec<Value> {
    let mut items = Vec::new();
    items.push(evidence(
        "host",
        "observed_fact",
        "Base URL Host",
        host.unwrap_or("无法解析"),
    ));
    items.push(evidence(
        "protocol",
        "observed_fact",
        "协议",
        &input.protocol,
    ));
    items.push(evidence(
        "request_model",
        "observed_fact",
        "请求模型",
        &input.model,
    ));
    if let Some(model) = responses
        .last()
        .and_then(|response| response.model.as_deref())
    {
        items.push(evidence(
            "response_model",
            "observed_fact",
            "响应模型字段",
            model,
        ));
    } else {
        items.push(evidence(
            "response_model_missing",
            "unknown",
            "响应模型字段",
            "缺失",
        ));
    }
    if let Some(status) = responses.last().and_then(|response| response.http_status) {
        items.push(evidence(
            "http_status",
            "observed_fact",
            "HTTP 状态",
            &status.to_string(),
        ));
    }
    if header_sets.iter().any(has_proxy_header) {
        items.push(evidence(
            "proxy_headers",
            "strong_inference",
            "代理响应头线索",
            "响应包含 server/via/x-cache/cf-ray 等代理或网关线索",
        ));
    }
    if responses.iter().any(|response| response.usage.is_some()) {
        items.push(evidence(
            "usage_shape",
            "observed_fact",
            "usage 字段",
            "响应包含 usage，可用于观察 provider 形态",
        ));
    } else {
        items.push(evidence(
            "usage_missing",
            "weak_inference",
            "usage 字段",
            "响应未返回 usage，可能是上游缺失或中转归一化",
        ));
    }
    if let Some(error) = responses
        .iter()
        .find_map(|response| response.error_reason.as_deref())
    {
        let sanitized = checks::sanitize_text(error, &input.api_key);
        items.push(evidence(
            "error_shape",
            "observed_fact",
            "错误体摘要",
            &checks::truncate_text(&sanitized, 400),
        ));
    }
    if responses
        .iter()
        .any(|response| response.first_event_ms.is_some())
    {
        items.push(evidence(
            "stream_shape",
            "observed_fact",
            "流式事件",
            "已观测到 SSE 事件到达时间",
        ));
    }
    items.push(evidence(
        "client_limit",
        "client_unverifiable",
        "客户端观测边界",
        "无法仅凭客户端请求证明真实账号池、额度来源或中转出口路径",
    ));
    items
}

fn build_candidates(
    input: &ChannelApiTestRunInput,
    responses: &[ProtocolResponse],
    host: Option<&str>,
    header_sets: &[Value],
) -> Vec<Value> {
    let mut candidates = Vec::new();
    let host_value = host.unwrap_or_default();
    let official_host = is_official_host(input.protocol.as_str(), host);
    let proxy_headers = header_sets.iter().any(has_proxy_header);
    if official_host && !proxy_headers {
        candidates.push(candidate(
            "official_api",
            "官方 API 候选",
            86,
            "high",
            vec!["host 匹配官方 API 域名".to_string()],
        ));
    }
    if !official_host || proxy_headers {
        let mut reasons = Vec::new();
        if !official_host {
            reasons.push("Base URL 不是当前协议官方域名".to_string());
        }
        if proxy_headers {
            reasons.push("响应头包含代理或网关线索".to_string());
        }
        candidates.push(candidate(
            "relay_or_proxy",
            "中转/反代候选",
            76,
            "medium",
            reasons,
        ));
    }
    if host_value.contains("openrouter") || response_text_contains(responses, "openrouter") {
        candidates.push(candidate(
            "openrouter_like",
            "OpenRouter 类路由候选",
            72,
            "medium",
            vec!["host 或响应体出现 OpenRouter 线索".to_string()],
        ));
    }
    if host_value.contains("bedrock")
        || response_has_path(responses, &["metrics", "latencyMs"])
        || response_has_usage_key(responses, "inputTokens")
    {
        candidates.push(candidate(
            "bedrock_like",
            "AWS Bedrock 类候选",
            64,
            "low",
            vec!["响应形态出现 Bedrock Converse 类字段".to_string()],
        ));
    }
    if host_value.contains("aiplatform.googleapis.com") || input.model.starts_with("google/") {
        candidates.push(candidate(
            "vertex_like",
            "Google Vertex 类候选",
            64,
            "low",
            vec!["host 或模型名出现 Vertex OpenAI-compatible 线索".to_string()],
        ));
    }
    if candidates.is_empty() {
        candidates.push(candidate(
            "unknown",
            "未知",
            0,
            "unknown",
            vec!["没有足够客户端证据归因上游".to_string()],
        ));
    }
    candidates
}

fn evidence(id: &str, level: &str, label: &str, detail: &str) -> Value {
    json!({
        "id": id,
        "level": level,
        "label": label,
        "detail": detail,
    })
}

fn candidate(
    id: &str,
    label: &str,
    confidence: i64,
    confidence_label: &str,
    reasons: Vec<String>,
) -> Value {
    json!({
        "id": id,
        "label": label,
        "confidence": confidence,
        "confidenceLabel": confidence_label,
        "reasons": reasons,
        "proven": false,
    })
}

fn summary_label(candidates: &[Value]) -> String {
    candidates
        .first()
        .and_then(|value| value.get("label"))
        .and_then(Value::as_str)
        .unwrap_or("未知")
        .to_string()
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

fn has_proxy_header(value: &Value) -> bool {
    value.as_object().is_some_and(|headers| {
        ["via", "x-cache", "cf-ray", "server"]
            .iter()
            .any(|name| headers.contains_key(*name))
    })
}

fn response_text_contains(responses: &[ProtocolResponse], needle: &str) -> bool {
    let needle = needle.to_ascii_lowercase();
    responses.iter().any(|response| {
        response.raw_excerpt.to_ascii_lowercase().contains(&needle)
            || response
                .error_reason
                .as_deref()
                .unwrap_or_default()
                .to_ascii_lowercase()
                .contains(&needle)
    })
}

fn response_has_path(responses: &[ProtocolResponse], path: &[&str]) -> bool {
    responses.iter().any(|response| {
        let mut current = &response.response_json;
        for item in path {
            let Some(next) = current.get(*item) else {
                return false;
            };
            current = next;
        }
        true
    })
}

fn response_has_usage_key(responses: &[ProtocolResponse], key: &str) -> bool {
    responses
        .iter()
        .filter_map(|response| response.usage.as_ref())
        .any(|usage| usage.get(key).is_some())
}

pub(super) fn sampling_summary(samples: &[ProtocolResponse]) -> Value {
    let mut groups = Map::new();
    let mut model_groups = Map::new();
    let mut header_groups = Map::new();
    let mut request_id_groups = Map::new();
    let mut ratelimit_groups = Map::new();
    let mut durations = Vec::new();
    for response in samples {
        let headers = response.response_headers.as_object();
        let header_key = header_fingerprint(headers);
        let request_id = header_value(headers, "x-request-id")
            .or_else(|| header_value(headers, "cf-ray"))
            .unwrap_or_else(|| "missing".to_string());
        let ratelimit = ratelimit_fingerprint(headers);
        let model = response
            .model
            .clone()
            .unwrap_or_else(|| "unknown-model".to_string());
        let key = format!("{model}::{header_key}");
        increment(&mut groups, &key);
        increment(&mut model_groups, &model);
        increment(&mut header_groups, &header_key);
        increment(&mut request_id_groups, &request_id);
        increment(&mut ratelimit_groups, &ratelimit);
        if let Some(value) = response.completed_ms {
            durations.push(value);
        }
    }
    let cluster_count = groups.len();
    let duration_spread = duration_spread(&durations);
    json!({
        "clusterCount": cluster_count,
        "clusters": groups,
        "dimensions": [
            dimension("模型字段", model_groups.len(), model_groups),
            dimension("Header 组合", header_groups.len(), header_groups),
            dimension("Request ID", request_id_groups.len(), request_id_groups),
            dimension("Ratelimit", ratelimit_groups.len(), ratelimit_groups),
            json!({
                "name": "完成耗时",
                "status": if duration_spread > 2_000 { "波动明显" } else { "相对稳定" },
                "spreadMs": duration_spread,
                "note": "耗时波动只能作为辅助信号，不能单独证明多路由。"
            })
        ],
        "label": if cluster_count > 1 { "疑似多路由/负载均衡/号池分发" } else { "未发现明显分簇" },
        "note": if cluster_count > 1 {
            "这是基于客户端可见响应头、模型字段和请求表现的行为推断，不是账号池证明。"
        } else {
            "采样结果未发现明显分簇；这不能证明没有中转或号池。"
        }
    })
}

fn increment(groups: &mut Map<String, Value>, key: &str) {
    let count = groups.get(key).and_then(Value::as_i64).unwrap_or(0) + 1;
    groups.insert(key.to_string(), Value::Number(count.into()));
}

fn header_fingerprint(headers: Option<&Map<String, Value>>) -> String {
    headers
        .map(|headers| {
            ["server", "via", "cf-ray", "x-cache", "x-request-id"]
                .iter()
                .filter_map(|name| {
                    headers
                        .get(*name)
                        .and_then(Value::as_str)
                        .map(|value| format!("{name}:{value}"))
                })
                .collect::<Vec<_>>()
                .join("|")
        })
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "missing".to_string())
}

fn header_value(headers: Option<&Map<String, Value>>, name: &str) -> Option<String> {
    headers
        .and_then(|items| items.get(name))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn ratelimit_fingerprint(headers: Option<&Map<String, Value>>) -> String {
    let Some(headers) = headers else {
        return "missing".to_string();
    };
    let values = [
        "x-ratelimit-limit-requests",
        "x-ratelimit-remaining-requests",
        "x-ratelimit-reset-requests",
        "anthropic-ratelimit-requests-limit",
        "anthropic-ratelimit-requests-remaining",
        "anthropic-ratelimit-requests-reset",
    ]
    .iter()
    .filter_map(|key| {
        headers
            .get(*key)
            .and_then(Value::as_str)
            .map(|value| format!("{key}:{value}"))
    })
    .collect::<Vec<_>>();
    if values.is_empty() {
        "missing".to_string()
    } else {
        values.join("|")
    }
}

fn dimension(name: &str, distinct_count: usize, groups: Map<String, Value>) -> Value {
    json!({
        "name": name,
        "status": if distinct_count > 1 { "分簇" } else { "稳定" },
        "distinctCount": distinct_count,
        "groups": groups,
    })
}

fn duration_spread(values: &[i64]) -> i64 {
    let Some(min) = values.iter().min() else {
        return 0;
    };
    let Some(max) = values.iter().max() else {
        return 0;
    };
    max - min
}
