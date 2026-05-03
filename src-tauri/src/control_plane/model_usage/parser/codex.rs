use serde_json::Value;

use super::{
    find_first_string, infer_provider_from_model, parse_non_negative_i64, ExtractedModelUsageEvent,
};
use crate::{control_plane::model_usage::STATUS_SUCCESS, utils::now_rfc3339};

#[derive(Debug, Clone, Default)]
struct CumulativeTokens {
    input_tokens: i64,
    output_tokens: i64,
}

#[derive(Debug, Clone, Default)]
pub(super) struct CodexSessionParseState {
    session_id: Option<String>,
    current_model: String,
    prev_total: Option<CumulativeTokens>,
    event_index: u64,
}

pub(super) fn extract_session_usage_event(
    value: &Value,
    state: &mut CodexSessionParseState,
    fallback_session_id: &str,
) -> Option<ExtractedModelUsageEvent> {
    match value.get("type").and_then(|item| item.as_str()) {
        Some("session_meta") => {
            if state.session_id.is_none() {
                state.session_id = find_first_string(
                    value,
                    &["payload.session_id", "payload.sessionId", "payload.id"],
                );
            }
            None
        }
        Some("turn_context") => {
            if let Some(model) = find_first_string(value, &["payload.model", "payload.info.model"])
            {
                state.current_model = normalize_model(&model);
            }
            None
        }
        Some("event_msg") => extract_token_count_event(value, state, fallback_session_id),
        _ => None,
    }
}

fn extract_token_count_event(
    value: &Value,
    state: &mut CodexSessionParseState,
    fallback_session_id: &str,
) -> Option<ExtractedModelUsageEvent> {
    let payload = value.get("payload")?;
    if payload.get("type").and_then(|item| item.as_str()) != Some("token_count") {
        return None;
    }

    let info = payload.get("info")?;
    if info.is_null() {
        return None;
    }

    if let Some(model) = find_first_string(info, &["model", "model_name"])
        .or_else(|| find_first_string(payload, &["model"]))
    {
        state.current_model = normalize_model(&model);
    }

    let (current, is_total) = if let Some(total) = info.get("total_token_usage") {
        (parse_cumulative_tokens(total)?, true)
    } else if let Some(last) = info.get("last_token_usage") {
        (parse_cumulative_tokens(last)?, false)
    } else {
        return None;
    };

    let delta = if is_total {
        let delta = compute_delta(state.prev_total.as_ref(), &current);
        state.prev_total = Some(current);
        delta
    } else {
        current
    };
    if delta.input_tokens <= 0 && delta.output_tokens <= 0 {
        return None;
    }

    state.event_index += 1;
    let session_id = state
        .session_id
        .clone()
        .unwrap_or_else(|| fallback_session_id.to_string());
    let model = if state.current_model.trim().is_empty() {
        "unknown".to_string()
    } else {
        state.current_model.clone()
    };
    let called_at = find_first_string(value, &["timestamp"]).unwrap_or_else(now_rfc3339);

    Some(ExtractedModelUsageEvent {
        called_at,
        provider: infer_provider_from_model(&model),
        model,
        status: STATUS_SUCCESS.to_string(),
        input_tokens: Some(delta.input_tokens),
        output_tokens: Some(delta.output_tokens),
        request_id: Some(format!("codex_session:{session_id}:{}", state.event_index)),
        attempt_key: None,
        session_id: Some(session_id),
    })
}

fn parse_cumulative_tokens(value: &Value) -> Option<CumulativeTokens> {
    if !value.is_object() {
        return None;
    }
    Some(CumulativeTokens {
        input_tokens: value
            .get("input_tokens")
            .and_then(parse_non_negative_i64)
            .unwrap_or(0),
        output_tokens: value
            .get("output_tokens")
            .and_then(parse_non_negative_i64)
            .unwrap_or(0),
    })
}

fn compute_delta(
    prev_total: Option<&CumulativeTokens>,
    current: &CumulativeTokens,
) -> CumulativeTokens {
    match prev_total {
        None => current.clone(),
        Some(previous) => CumulativeTokens {
            input_tokens: current.input_tokens.saturating_sub(previous.input_tokens),
            output_tokens: current.output_tokens.saturating_sub(previous.output_tokens),
        },
    }
}

fn normalize_model(raw: &str) -> String {
    let mut model = raw.to_lowercase();
    if let Some(idx) = model.rfind('/') {
        model = model[idx + 1..].to_string();
    }

    if model.len() > 11 {
        let suffix = &model[model.len() - 11..];
        if suffix.as_bytes()[0] == b'-'
            && suffix[1..5].chars().all(|c| c.is_ascii_digit())
            && suffix.as_bytes()[5] == b'-'
            && suffix[6..8].chars().all(|c| c.is_ascii_digit())
            && suffix.as_bytes()[8] == b'-'
            && suffix[9..11].chars().all(|c| c.is_ascii_digit())
        {
            model.truncate(model.len() - 11);
        }
    }

    if model.len() > 9 {
        let parts: Vec<&str> = model.rsplitn(2, '-').collect();
        if parts.len() == 2 {
            if let Some(suffix) = parts.first() {
                if suffix.len() == 8 && suffix.chars().all(|c| c.is_ascii_digit()) {
                    model = parts[1].to_string();
                }
            }
        }
    }

    model
}
