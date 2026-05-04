use super::*;

pub(super) fn run_and_persist(
    state: AppState,
    input: ChannelApiTestRunInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    persistence::get_workspace(&conn, crate::domain::models::APP_SCOPE_ID)?;
    validation::validate_input(&input)?;

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
    let input_usage_field = input_usage_field(input.protocol.as_str());
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
        report::build_conversation_json(input, &messages, std::slice::from_ref(&response), None);
    let error_excerpt = response
        .error_reason
        .as_ref()
        .map(|message| checks::sanitize_text(message, &input.api_key));

    ChannelApiTestRunRecord {
        id: Uuid::new_v4().to_string(),
        workspace_id: crate::domain::models::APP_SCOPE_ID.to_string(),
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
        bedrock: None,
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
        let input_usage_field = input_usage_field(input.protocol.as_str());
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
        report::build_conversation_json(input, &messages, &round_responses, Some(&rounds));
    let error_excerpt = final_response
        .error_reason
        .as_ref()
        .map(|message| checks::sanitize_text(message, &input.api_key));

    ChannelApiTestRunRecord {
        id: Uuid::new_v4().to_string(),
        workspace_id: crate::domain::models::APP_SCOPE_ID.to_string(),
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
            bedrock: None,
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
    let input_usage_field = input_usage_field(input.protocol.as_str());
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
    let conversation_json = report::build_conversation_json_with_details(
        input, &messages, &responses, None, details, run_mode,
    );
    let error_excerpt = final_response
        .error_reason
        .as_ref()
        .map(|message| checks::sanitize_text(message, &input.api_key));

    ChannelApiTestRunRecord {
        id: Uuid::new_v4().to_string(),
        workspace_id: crate::domain::models::APP_SCOPE_ID.to_string(),
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
        PROTOCOL_BEDROCK => bedrock::run_bedrock(input, messages),
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
            bedrock: None,
        },
    }
}

fn output_size(protocol: &str, usage: Option<&Value>, text: &str) -> (i64, String) {
    let usage_field = match protocol {
        PROTOCOL_ANTHROPIC => "output_tokens",
        PROTOCOL_BEDROCK => "outputTokens",
        _ => "completion_tokens",
    };
    checks::size_from_usage_or_chars(usage, usage_field, text)
}

fn input_usage_field(protocol: &str) -> &'static str {
    match protocol {
        PROTOCOL_ANTHROPIC => "input_tokens",
        PROTOCOL_BEDROCK => "inputTokens",
        _ => "prompt_tokens",
    }
}
