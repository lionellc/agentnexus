use super::*;

#[tauri::command]
pub fn channel_test_query_runs(
    state: State<'_, AppState>,
    input: ChannelApiTestRunsQueryInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    persistence::get_workspace(&conn, &input.workspace_id)?;
    query::query_runs(&conn, &input.workspace_id, input.page, input.page_size)
}

#[tauri::command]
pub fn channel_test_cases_list(
    state: State<'_, AppState>,
    input: ChannelApiTestCasesQueryInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    persistence::get_workspace(&conn, &input.workspace_id)?;
    persistence::seed_default_cases_once(&conn, &input.workspace_id)?;
    persistence::query_custom_cases(&conn, &input.workspace_id)
}

#[tauri::command]
pub fn channel_test_case_upsert(
    state: State<'_, AppState>,
    input: ChannelApiTestCaseUpsertInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    persistence::get_workspace(&conn, &input.workspace_id)?;
    validate_case_input(&input)?;
    persistence::upsert_custom_case(&conn, &input)
}

#[tauri::command]
pub fn channel_test_case_delete(
    state: State<'_, AppState>,
    input: ChannelApiTestCaseDeleteInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    persistence::get_workspace(&conn, &input.workspace_id)?;
    if input.case_id.trim().is_empty() {
        return Err(AppError::invalid_argument("题目 ID 不能为空"));
    }
    persistence::delete_custom_case(&conn, &input.workspace_id, &input.case_id)
}

#[tauri::command]
pub async fn channel_test_run(
    state: State<'_, AppState>,
    input: ChannelApiTestRunInput,
) -> Result<Value, AppError> {
    let app_state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || run_and_persist(app_state, input))
        .await
        .map_err(|err| AppError::internal(format!("渠道测试任务异常退出: {err}")))?
}

fn run_and_persist(state: AppState, input: ChannelApiTestRunInput) -> Result<Value, AppError> {
    let conn = state.open()?;
    persistence::get_workspace(&conn, &input.workspace_id)?;
    validate_input(&input)?;

    let started_at = now_rfc3339();
    let started = Instant::now();
    let record = match input.run_mode.as_deref().unwrap_or(RUN_MODE_STANDARD) {
        RUN_MODE_DIAGNOSTIC => run_probe(&input, started_at, started),
        RUN_MODE_SAMPLING => run_sampling(&input, started_at, started),
        _ if input.category == CATEGORY_FOLLOWUP => run_followup(&input, started_at, started),
        _ => run_single(&input, started_at, started),
    };
    persistence::persist_run(&conn, &record)?;
    Ok(persistence::record_to_value(&record))
}

fn validate_input(input: &ChannelApiTestRunInput) -> Result<(), AppError> {
    if !matches!(
        input.protocol.as_str(),
        PROTOCOL_OPENAI | PROTOCOL_ANTHROPIC
    ) {
        return Err(AppError::invalid_argument("协议只支持 openai 或 anthropic"));
    }
    if !matches!(
        input.category.as_str(),
        CATEGORY_SMALL | CATEGORY_MEDIUM | CATEGORY_LARGE | CATEGORY_FOLLOWUP
    ) {
        return Err(AppError::invalid_argument("未知测试题型"));
    }
    for (label, value) in [
        ("model", input.model.as_str()),
        ("baseUrl", input.base_url.as_str()),
        ("apiKey", input.api_key.as_str()),
        ("caseId", input.case_id.as_str()),
    ] {
        if value.trim().is_empty() {
            return Err(AppError::invalid_argument(format!("{label} 不能为空")));
        }
    }
    if !matches!(
        input.run_mode.as_deref().unwrap_or(RUN_MODE_STANDARD),
        RUN_MODE_STANDARD | RUN_MODE_DIAGNOSTIC | RUN_MODE_SAMPLING
    ) {
        return Err(AppError::invalid_argument("未知测试模式"));
    }
    if input.run_mode.as_deref().unwrap_or(RUN_MODE_STANDARD) != RUN_MODE_STANDARD {
        return Ok(());
    }
    if input.category == CATEGORY_FOLLOWUP {
        if input.rounds.as_ref().map(Vec::is_empty).unwrap_or(true) {
            return Err(AppError::invalid_argument("连续追问型必须包含 rounds"));
        }
    } else if input.messages.as_ref().map(Vec::is_empty).unwrap_or(true) {
        return Err(AppError::invalid_argument("测试请求必须包含 messages"));
    }
    Ok(())
}

fn validate_case_input(input: &ChannelApiTestCaseUpsertInput) -> Result<(), AppError> {
    if !matches!(
        input.category.as_str(),
        CATEGORY_SMALL | CATEGORY_MEDIUM | CATEGORY_LARGE | CATEGORY_FOLLOWUP
    ) {
        return Err(AppError::invalid_argument("未知测试题型"));
    }
    if input.label.trim().is_empty() {
        return Err(AppError::invalid_argument("题目名称不能为空"));
    }
    if input.category == CATEGORY_FOLLOWUP {
        let rounds = input
            .rounds
            .as_ref()
            .ok_or_else(|| AppError::invalid_argument("连续追问型必须包含 rounds"))?;
        if rounds.is_empty() || rounds.iter().any(|round| round.prompt.trim().is_empty()) {
            return Err(AppError::invalid_argument(
                "连续追问型必须至少包含一个有效追问",
            ));
        }
        return Ok(());
    }

    let messages = input
        .messages
        .as_ref()
        .ok_or_else(|| AppError::invalid_argument("普通题目必须包含 messages"))?;
    if messages.is_empty()
        || messages
            .iter()
            .any(|message| message.content.trim().is_empty())
    {
        return Err(AppError::invalid_argument(
            "普通题目必须至少包含一条有效消息",
        ));
    }
    Ok(())
}

fn run_probe(
    input: &ChannelApiTestRunInput,
    started_at: String,
    started: Instant,
) -> ChannelApiTestRunRecord {
    let (messages, responses, details) = probes::run_probe(input);
    build_multi_response_record(
        input,
        started_at,
        started,
        messages,
        responses,
        Some(details),
        RUN_MODE_DIAGNOSTIC,
    )
}

fn run_sampling(
    input: &ChannelApiTestRunInput,
    started_at: String,
    started: Instant,
) -> ChannelApiTestRunRecord {
    let (messages, responses, details) = sampling::run_sampling(input);
    build_multi_response_record(
        input,
        started_at,
        started,
        messages,
        responses,
        Some(details),
        RUN_MODE_SAMPLING,
    )
}

fn run_single(
    input: &ChannelApiTestRunInput,
    started_at: String,
    started: Instant,
) -> ChannelApiTestRunRecord {
    let messages = input.messages.clone().unwrap_or_default();
    let response = run_protocol(input, &messages);
    let checks = checks::build_checks(&response, &input.model);
    let status =
        if response.error_reason.is_some() || checks.iter().any(|item| item.status == "fail") {
            STATUS_FAILED
        } else {
            STATUS_SUCCESS
        };
    let input_text = messages
        .iter()
        .map(|item| item.content.as_str())
        .collect::<Vec<_>>()
        .join("\n");
    let input_usage_field = if input.protocol == PROTOCOL_ANTHROPIC {
        "input_tokens"
    } else {
        "prompt_tokens"
    };
    let (input_size, input_source) =
        checks::size_from_usage_or_chars(response.usage.as_ref(), input_usage_field, &input_text);
    let (output_size, output_source) = output_size(
        input.protocol.as_str(),
        response.usage.as_ref(),
        &response.text,
    );
    let response_text = checks::sanitize_text(&response.text, &input.api_key);
    let raw_excerpt = checks::sanitize_text(&response.raw_excerpt, &input.api_key);
    let conversation_json =
        build_conversation_json(input, &messages, std::slice::from_ref(&response), None);
    let error_excerpt = response
        .error_reason
        .as_ref()
        .map(|message| checks::sanitize_text(message, &input.api_key));

    ChannelApiTestRunRecord {
        id: Uuid::new_v4().to_string(),
        workspace_id: input.workspace_id.clone(),
        started_at,
        completed_at: now_rfc3339(),
        protocol: input.protocol.clone(),
        model: input.model.clone(),
        base_url_display: checks::display_base_url(&input.base_url),
        category: input.category.clone(),
        case_id: input.case_id.clone(),
        run_mode: input
            .run_mode
            .clone()
            .unwrap_or_else(|| RUN_MODE_STANDARD.to_string()),
        stream: input.stream,
        status: status.to_string(),
        error_reason: response.error_reason.clone(),
        http_status: response.http_status,
        total_duration_ms: started.elapsed().as_millis() as i64,
        first_token_ms: response.first_token_ms,
        first_metric_kind: response.first_metric_kind.clone(),
        input_size,
        input_size_source: input_source,
        output_size,
        output_size_source: output_source,
        response_text: Some(checks::truncate_text(&response_text, 8_000)),
        response_json_excerpt: Some(checks::truncate_text(&raw_excerpt, 4_000)),
        raw_error_excerpt: error_excerpt
            .as_ref()
            .map(|message| checks::truncate_text(message, 2_000)),
        usage_json: response.usage.as_ref().map(Value::to_string),
        conversation_json: Some(conversation_json.to_string()),
        checks,
        rounds: Vec::new(),
    }
}

fn run_followup(
    input: &ChannelApiTestRunInput,
    started_at: String,
    started: Instant,
) -> ChannelApiTestRunRecord {
    let mut messages = Vec::<ChannelApiTestMessageInput>::new();
    let mut rounds = Vec::new();
    let mut final_response = ProtocolResponse {
        http_status: None,
        model: None,
        text: String::new(),
        raw_excerpt: String::new(),
        usage: None,
        finish_reason: None,
        first_metric_kind: if input.stream {
            FIRST_TOKEN.to_string()
        } else {
            FIRST_RESPONSE.to_string()
        },
        first_token_ms: None,
        error_reason: None,
        request_json: Value::Null,
        response_json: Value::Null,
        header_ms: None,
        first_event_ms: None,
        first_text_delta_ms: None,
        completed_ms: None,
        response_headers: Value::Null,
    };
    let mut round_responses = Vec::new();

    for round in input.rounds.clone().unwrap_or_default() {
        messages.push(ChannelApiTestMessageInput {
            role: "user".to_string(),
            content: round.prompt.clone(),
        });
        let round_started = Instant::now();
        let response = run_protocol(input, &messages);
        round_responses.push(response.clone());
        let input_usage_field = if input.protocol == PROTOCOL_ANTHROPIC {
            "input_tokens"
        } else {
            "prompt_tokens"
        };
        let (input_size, input_source) = checks::size_from_usage_or_chars(
            response.usage.as_ref(),
            input_usage_field,
            &round.prompt,
        );
        let (output_size, output_source) = output_size(
            input.protocol.as_str(),
            response.usage.as_ref(),
            &response.text,
        );
        let response_preview = checks::sanitize_text(&response.text, &input.api_key);
        let error_reason = response
            .error_reason
            .as_ref()
            .map(|message| checks::sanitize_text(message, &input.api_key));
        let status = if response.error_reason.is_some() {
            STATUS_FAILED
        } else {
            STATUS_SUCCESS
        };
        rounds.push(ChannelApiTestRoundResult {
            id: round.id,
            status: status.to_string(),
            total_duration_ms: round_started.elapsed().as_millis() as i64,
            first_token_ms: response.first_token_ms,
            first_metric_kind: response.first_metric_kind.clone(),
            input_size,
            input_size_source: input_source,
            output_size,
            output_size_source: output_source,
            prompt_preview: checks::truncate_text(&round.prompt, 600),
            response_preview: checks::truncate_text(&response_preview, 1_200),
            error_reason,
        });
        final_response = response.clone();
        if final_response.error_reason.is_some() {
            break;
        }
        messages.push(ChannelApiTestMessageInput {
            role: "assistant".to_string(),
            content: final_response.text.clone(),
        });
    }

    let checks = checks::build_checks(&final_response, &input.model);
    let failed_rounds = rounds
        .iter()
        .filter(|round| round.status != STATUS_SUCCESS)
        .count();
    let status = if failed_rounds == 0 {
        STATUS_SUCCESS
    } else if failed_rounds < rounds.len() {
        STATUS_PARTIAL_FAILED
    } else {
        STATUS_FAILED
    };
    let input_size = rounds.iter().map(|round| round.input_size).sum();
    let output_size = rounds.iter().map(|round| round.output_size).sum();
    let response_text = checks::sanitize_text(&final_response.text, &input.api_key);
    let raw_excerpt = checks::sanitize_text(&final_response.raw_excerpt, &input.api_key);
    let conversation_json =
        build_conversation_json(input, &messages, &round_responses, Some(&rounds));
    let error_excerpt = final_response
        .error_reason
        .as_ref()
        .map(|message| checks::sanitize_text(message, &input.api_key));

    ChannelApiTestRunRecord {
        id: Uuid::new_v4().to_string(),
        workspace_id: input.workspace_id.clone(),
        started_at,
        completed_at: now_rfc3339(),
        protocol: input.protocol.clone(),
        model: input.model.clone(),
        base_url_display: checks::display_base_url(&input.base_url),
        category: input.category.clone(),
        case_id: input.case_id.clone(),
        run_mode: input
            .run_mode
            .clone()
            .unwrap_or_else(|| RUN_MODE_STANDARD.to_string()),
        stream: input.stream,
        status: status.to_string(),
        error_reason: error_excerpt.clone(),
        http_status: final_response.http_status,
        total_duration_ms: started.elapsed().as_millis() as i64,
        first_token_ms: rounds.iter().find_map(|round| round.first_token_ms),
        first_metric_kind: final_response.first_metric_kind.clone(),
        input_size,
        input_size_source: SIZE_CHARS.to_string(),
        output_size,
        output_size_source: SIZE_CHARS.to_string(),
        response_text: Some(checks::truncate_text(&response_text, 8_000)),
        response_json_excerpt: Some(checks::truncate_text(&raw_excerpt, 4_000)),
        raw_error_excerpt: error_excerpt
            .as_ref()
            .map(|message| checks::truncate_text(message, 2_000)),
        usage_json: final_response.usage.as_ref().map(Value::to_string),
        conversation_json: Some(conversation_json.to_string()),
        checks,
        rounds,
    }
}

fn build_multi_response_record(
    input: &ChannelApiTestRunInput,
    started_at: String,
    started: Instant,
    messages: Vec<ChannelApiTestMessageInput>,
    responses: Vec<ProtocolResponse>,
    details: Option<Value>,
    run_mode: &str,
) -> ChannelApiTestRunRecord {
    let final_response = responses
        .last()
        .cloned()
        .unwrap_or_else(|| ProtocolResponse {
            http_status: None,
            model: None,
            text: String::new(),
            raw_excerpt: String::new(),
            usage: None,
            finish_reason: None,
            first_metric_kind: if input.stream {
                FIRST_TOKEN.to_string()
            } else {
                FIRST_RESPONSE.to_string()
            },
            first_token_ms: None,
            error_reason: Some("未执行任何诊断请求".to_string()),
            request_json: Value::Null,
            response_json: Value::Null,
            header_ms: None,
            first_event_ms: None,
            first_text_delta_ms: None,
            completed_ms: None,
            response_headers: Value::Null,
        });
    let checks = checks::build_checks(&final_response, &input.model);
    let failed_count = responses
        .iter()
        .filter(|response| response.error_reason.is_some())
        .count();
    let status = if responses.is_empty() || failed_count == responses.len() {
        STATUS_FAILED
    } else if failed_count > 0 {
        STATUS_PARTIAL_FAILED
    } else {
        STATUS_SUCCESS
    };
    let input_text = messages
        .iter()
        .map(|item| item.content.as_str())
        .collect::<Vec<_>>()
        .join("\n");
    let input_usage_field = if input.protocol == PROTOCOL_ANTHROPIC {
        "input_tokens"
    } else {
        "prompt_tokens"
    };
    let (input_size, input_source) = checks::size_from_usage_or_chars(
        final_response.usage.as_ref(),
        input_usage_field,
        &input_text,
    );
    let (output_size, output_source) = output_size(
        input.protocol.as_str(),
        final_response.usage.as_ref(),
        &final_response.text,
    );
    let response_text = checks::sanitize_text(&final_response.text, &input.api_key);
    let raw_excerpt = checks::sanitize_text(&final_response.raw_excerpt, &input.api_key);
    let conversation_json =
        build_conversation_json_with_details(input, &messages, &responses, None, details, run_mode);
    let error_excerpt = final_response
        .error_reason
        .as_ref()
        .map(|message| checks::sanitize_text(message, &input.api_key));

    ChannelApiTestRunRecord {
        id: Uuid::new_v4().to_string(),
        workspace_id: input.workspace_id.clone(),
        started_at,
        completed_at: now_rfc3339(),
        protocol: input.protocol.clone(),
        model: input.model.clone(),
        base_url_display: checks::display_base_url(&input.base_url),
        category: input.category.clone(),
        case_id: input.case_id.clone(),
        run_mode: run_mode.to_string(),
        stream: input.stream,
        status: status.to_string(),
        error_reason: error_excerpt.clone(),
        http_status: final_response.http_status,
        total_duration_ms: started.elapsed().as_millis() as i64,
        first_token_ms: responses
            .iter()
            .find_map(|response| response.first_token_ms),
        first_metric_kind: final_response.first_metric_kind.clone(),
        input_size,
        input_size_source: input_source,
        output_size,
        output_size_source: output_source,
        response_text: Some(checks::truncate_text(&response_text, 8_000)),
        response_json_excerpt: Some(checks::truncate_text(&raw_excerpt, 4_000)),
        raw_error_excerpt: error_excerpt
            .as_ref()
            .map(|message| checks::truncate_text(message, 2_000)),
        usage_json: final_response.usage.as_ref().map(Value::to_string),
        conversation_json: Some(conversation_json.to_string()),
        checks,
        rounds: Vec::new(),
    }
}

pub(super) fn run_protocol(
    input: &ChannelApiTestRunInput,
    messages: &[ChannelApiTestMessageInput],
) -> ProtocolResponse {
    match input.protocol.as_str() {
        PROTOCOL_OPENAI => openai::run_openai(input, messages),
        PROTOCOL_ANTHROPIC => anthropic::run_anthropic(input, messages),
        _ => ProtocolResponse {
            http_status: None,
            model: None,
            text: String::new(),
            raw_excerpt: String::new(),
            usage: None,
            finish_reason: None,
            first_metric_kind: FIRST_RESPONSE.to_string(),
            first_token_ms: Some(0),
            error_reason: Some("未知协议".to_string()),
            request_json: Value::Null,
            response_json: Value::Null,
            header_ms: None,
            first_event_ms: None,
            first_text_delta_ms: None,
            completed_ms: Some(0),
            response_headers: Value::Null,
        },
    }
}

fn output_size(protocol: &str, usage: Option<&Value>, text: &str) -> (i64, String) {
    let usage_field = if protocol == PROTOCOL_ANTHROPIC {
        "output_tokens"
    } else {
        "completion_tokens"
    };
    checks::size_from_usage_or_chars(usage, usage_field, text)
}

fn build_conversation_json(
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

fn build_conversation_json_with_details(
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
            "completedMs": response.completed_ms,
            "displayFirstMs": response.first_token_ms,
            "displayTotalMs": response.completed_ms,
        })).collect::<Vec<_>>(),
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

fn has_proxy_header(value: &Value) -> bool {
    value.as_object().is_some_and(|headers| {
        ["via", "x-cache", "cf-ray", "server"]
            .iter()
            .any(|name| headers.contains_key(*name))
    })
}
