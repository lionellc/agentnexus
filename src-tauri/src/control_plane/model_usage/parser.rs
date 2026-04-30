use super::*;
use std::{
    fs::File,
    io::{BufRead, BufReader},
};

const FAILURE_JSON_PARSE_FAILED: &str = "json-parse-failed";

mod codex;

pub(super) struct ParseFileResult {
    pub(super) facts: Vec<ModelUsageFactDraft>,
    pub(super) failures: Vec<ParseFailureEvent>,
    pub(super) parsed_events: usize,
    pub(super) parse_failures: usize,
}

pub(super) fn parse_session_file(
    file: &SessionFile,
    workspace_id: &str,
) -> Result<ParseFileResult, AppError> {
    let handle = File::open(&file.path)?;
    let mut reader = BufReader::new(handle);
    let fallback_session_id = std::path::Path::new(&file.path)
        .file_stem()
        .and_then(|item| item.to_str())
        .map(str::to_string)
        .unwrap_or_else(|| "unknown-session".to_string());
    let mut failures = Vec::new();
    let mut facts = Vec::new();
    let mut line = String::new();
    let mut line_no: i64 = 0;
    let mut byte_offset: usize = 0;
    let mut codex_state = if file.source == SOURCE_SESSION_JSONL && file.agent == AGENT_CODEX {
        Some(codex::CodexSessionParseState::default())
    } else {
        None
    };

    loop {
        line.clear();
        let bytes = reader.read_line(&mut line)?;
        if bytes == 0 {
            break;
        }
        line_no += 1;
        let line_start = byte_offset;
        byte_offset += bytes;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let value: Value = match serde_json::from_str(trimmed) {
            Ok(value) => value,
            Err(_err) => {
                failures.push(ParseFailureEvent {
                    workspace_id: workspace_id.to_string(),
                    source: file.source.clone(),
                    source_path: file.path.clone(),
                    reason: FAILURE_JSON_PARSE_FAILED.to_string(),
                    raw_excerpt: truncate_text(trimmed, 400),
                });
                continue;
            }
        };

        let extracted = if let Some(state) = codex_state.as_mut() {
            codex::extract_session_usage_event(&value, state, &fallback_session_id)
        } else {
            extract_model_usage_event(&value)
        };
        let Some(extracted) = extracted else {
            continue;
        };

        let fact_session_id = extracted
            .session_id
            .clone()
            .unwrap_or_else(|| fallback_session_id.clone());
        let event_ref = format!("{line_start}:{line_no}");
        let dedupe_seed = if let Some(request_id) = extracted.request_id.as_deref() {
            if !request_id.trim().is_empty() {
                format!("{}|{}", workspace_id, request_id.trim())
            } else {
                fallback_dedupe_seed(
                    workspace_id,
                    &file.agent,
                    &fact_session_id,
                    &event_ref,
                    &extracted,
                )
            }
        } else {
            fallback_dedupe_seed(
                workspace_id,
                &file.agent,
                &fact_session_id,
                &event_ref,
                &extracted,
            )
        };

        facts.push(ModelUsageFactDraft {
            workspace_id: workspace_id.to_string(),
            timestamp: extracted.called_at,
            agent: file.agent.clone(),
            provider: extracted.provider,
            model: extracted.model,
            status: extracted.status,
            input_tokens: extracted.input_tokens,
            output_tokens: extracted.output_tokens,
            source: file.source.clone(),
            source_path: file.path.clone(),
            session_id: fact_session_id,
            event_ref,
            request_id: extracted.request_id,
            attempt_key: extracted.attempt_key,
            raw_payload: truncate_text(trimmed, 4000),
            dedupe_key: sha256_hex(&dedupe_seed),
        });
    }

    Ok(ParseFileResult {
        parsed_events: facts.len(),
        parse_failures: failures.len(),
        facts,
        failures,
    })
}

#[derive(Debug, Clone)]
pub(super) struct ExtractedModelUsageEvent {
    pub(super) called_at: String,
    pub(super) provider: String,
    pub(super) model: String,
    pub(super) status: String,
    pub(super) input_tokens: Option<i64>,
    pub(super) output_tokens: Option<i64>,
    pub(super) request_id: Option<String>,
    pub(super) attempt_key: Option<String>,
    pub(super) session_id: Option<String>,
}

pub(super) fn extract_model_usage_event(value: &Value) -> Option<ExtractedModelUsageEvent> {
    let model = find_first_string(
        value,
        &[
            "model",
            "payload.model",
            "payload.response.model",
            "payload.metadata.model",
            "response.model",
            "event.model",
            "item.model",
        ],
    )
    .unwrap_or_default();
    let input_tokens = find_first_i64(
        value,
        &[
            "input_tokens",
            "inputTokens",
            "usage.input_tokens",
            "usage.inputTokens",
            "usage.prompt_tokens",
            "usage.promptTokens",
            "payload.input_tokens",
            "payload.inputTokens",
            "payload.usage.input_tokens",
            "payload.usage.inputTokens",
            "payload.usage.prompt_tokens",
            "payload.usage.promptTokens",
        ],
    );
    let output_tokens = find_first_i64(
        value,
        &[
            "output_tokens",
            "outputTokens",
            "usage.output_tokens",
            "usage.outputTokens",
            "usage.completion_tokens",
            "usage.completionTokens",
            "payload.output_tokens",
            "payload.outputTokens",
            "payload.usage.output_tokens",
            "payload.usage.outputTokens",
            "payload.usage.completion_tokens",
            "payload.usage.completionTokens",
        ],
    );

    if model.trim().is_empty() && input_tokens.is_none() && output_tokens.is_none() {
        return None;
    }

    let provider = find_first_string(
        value,
        &[
            "provider",
            "payload.provider",
            "payload.response.provider",
            "response.provider",
        ],
    )
    .unwrap_or_else(|| infer_provider_from_model(&model));
    let status_raw = find_first_string(
        value,
        &[
            "status",
            "payload.status",
            "payload.response.status",
            "response.status",
        ],
    )
    .unwrap_or_default();
    let status = normalize_status(&status_raw);
    let called_at = find_first_string(
        value,
        &[
            "timestamp",
            "called_at",
            "created_at",
            "payload.timestamp",
            "payload.created_at",
        ],
    )
    .unwrap_or_else(now_rfc3339);
    let request_id = find_first_string(
        value,
        &[
            "request_id",
            "requestId",
            "trace_id",
            "traceId",
            "payload.request_id",
            "payload.requestId",
            "payload.trace_id",
            "payload.traceId",
        ],
    );
    let attempt_key = find_first_string(
        value,
        &[
            "attempt",
            "attempt_key",
            "payload.attempt",
            "payload.attempt_key",
            "payload.retry",
            "payload.retry_index",
        ],
    );
    let session_id = find_first_string(
        value,
        &[
            "session_id",
            "sessionId",
            "payload.session_id",
            "payload.sessionId",
            "payload.id",
        ],
    );

    Some(ExtractedModelUsageEvent {
        called_at,
        provider,
        model,
        status,
        input_tokens,
        output_tokens,
        request_id,
        attempt_key,
        session_id,
    })
}

fn fallback_dedupe_seed(
    workspace_id: &str,
    agent: &str,
    session_id: &str,
    event_ref: &str,
    extracted: &ExtractedModelUsageEvent,
) -> String {
    format!(
        "{}|{}|{}|{}|{}|{}|{}|{}|{}",
        workspace_id,
        agent,
        session_id,
        event_ref,
        extracted.model,
        extracted.called_at,
        extracted.input_tokens.unwrap_or(0),
        extracted.output_tokens.unwrap_or(0),
        extracted.status,
    )
}

pub(super) fn truncate_text(text: &str, limit: usize) -> String {
    if text.len() <= limit {
        return text.to_string();
    }
    let boundary = text
        .char_indices()
        .take_while(|(idx, _)| *idx <= limit)
        .map(|(idx, _)| idx)
        .last()
        .unwrap_or(0);
    text[..boundary].to_string()
}

fn find_first_string(value: &Value, paths: &[&str]) -> Option<String> {
    for path in paths {
        if let Some(raw) = value_by_path(value, path) {
            if let Some(text) = raw.as_str() {
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
                continue;
            }
            if let Some(number) = raw.as_i64() {
                return Some(number.to_string());
            }
        }
    }
    None
}

fn find_first_i64(value: &Value, paths: &[&str]) -> Option<i64> {
    for path in paths {
        if let Some(raw) = value_by_path(value, path) {
            if let Some(number) = parse_non_negative_i64(raw) {
                return Some(number);
            }
        }
    }
    None
}

fn parse_non_negative_i64(value: &Value) -> Option<i64> {
    if let Some(number) = value.as_i64() {
        return Some(number.max(0));
    }
    if let Some(number) = value.as_u64() {
        return Some(number.min(i64::MAX as u64) as i64);
    }
    if let Some(text) = value.as_str() {
        if let Ok(number) = text.trim().parse::<i64>() {
            return Some(number.max(0));
        }
    }
    None
}

fn value_by_path<'a>(value: &'a Value, path: &str) -> Option<&'a Value> {
    let mut current = value;
    for key in path.split('.') {
        current = current.get(key)?;
    }
    Some(current)
}

fn infer_provider_from_model(model: &str) -> String {
    let lowered = model.to_lowercase();
    if lowered.contains("claude") {
        "anthropic".to_string()
    } else if lowered.contains("gemini") {
        "google".to_string()
    } else if lowered.contains("gpt") || lowered.contains("o1") || lowered.contains("o3") {
        "openai".to_string()
    } else {
        "unknown".to_string()
    }
}

fn normalize_status(raw: &str) -> String {
    let lowered = raw.trim().to_lowercase();
    if lowered.is_empty() {
        return STATUS_UNKNOWN.to_string();
    }
    if lowered.contains("fail") || lowered.contains("error") || lowered.contains("cancel") {
        return STATUS_FAILED.to_string();
    }
    if lowered.contains("success") || lowered.contains("ok") || lowered.contains("complete") {
        return STATUS_SUCCESS.to_string();
    }
    STATUS_UNKNOWN.to_string()
}
