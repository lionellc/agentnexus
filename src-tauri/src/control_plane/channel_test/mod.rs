use std::time::{Duration, Instant};

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;
use uuid::Uuid;

use crate::{db::AppState, error::AppError, utils::now_rfc3339};

const PROTOCOL_OPENAI: &str = "openai";
const PROTOCOL_ANTHROPIC: &str = "anthropic";

const CATEGORY_SMALL: &str = "small";
const CATEGORY_MEDIUM: &str = "medium";
const CATEGORY_LARGE: &str = "large";
const CATEGORY_FOLLOWUP: &str = "followup";
const RUN_MODE_STANDARD: &str = "standard";
const RUN_MODE_DIAGNOSTIC: &str = "diagnostic";
const RUN_MODE_SAMPLING: &str = "sampling";

const STATUS_SUCCESS: &str = "success";
const STATUS_FAILED: &str = "failed";
const STATUS_PARTIAL_FAILED: &str = "partial_failed";

const FIRST_TOKEN: &str = "first_token";
const FIRST_RESPONSE: &str = "first_response";
const SIZE_USAGE: &str = "usage";
const SIZE_CHARS: &str = "chars";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChannelApiTestMessageInput {
    role: String,
    content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChannelApiTestRoundInput {
    id: String,
    prompt: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelApiTestCasesQueryInput {}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelApiTestCaseUpsertInput {
    id: Option<String>,
    category: String,
    label: String,
    messages: Option<Vec<ChannelApiTestMessageInput>>,
    rounds: Option<Vec<ChannelApiTestRoundInput>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelApiTestCaseDeleteInput {
    case_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelApiTestRunInput {
    protocol: String,
    model: String,
    base_url: String,
    api_key: String,
    stream: bool,
    category: String,
    case_id: String,
    run_mode: Option<String>,
    messages: Option<Vec<ChannelApiTestMessageInput>>,
    rounds: Option<Vec<ChannelApiTestRoundInput>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelApiTestRunsQueryInput {
    page: i64,
    page_size: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChannelApiTestCheck {
    id: String,
    label: String,
    status: String,
    detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChannelApiTestRoundResult {
    id: String,
    status: String,
    total_duration_ms: i64,
    first_token_ms: Option<i64>,
    first_metric_kind: String,
    input_size: i64,
    input_size_source: String,
    output_size: i64,
    output_size_source: String,
    prompt_preview: String,
    response_preview: String,
    error_reason: Option<String>,
}

#[derive(Debug, Clone)]
struct ChannelApiTestRunRecord {
    id: String,
    workspace_id: String,
    started_at: String,
    completed_at: String,
    protocol: String,
    model: String,
    base_url_display: String,
    category: String,
    case_id: String,
    run_mode: String,
    stream: bool,
    status: String,
    error_reason: Option<String>,
    http_status: Option<i64>,
    total_duration_ms: i64,
    first_token_ms: Option<i64>,
    first_metric_kind: String,
    input_size: i64,
    input_size_source: String,
    output_size: i64,
    output_size_source: String,
    response_text: Option<String>,
    response_json_excerpt: Option<String>,
    raw_error_excerpt: Option<String>,
    usage_json: Option<String>,
    conversation_json: Option<String>,
    checks: Vec<ChannelApiTestCheck>,
    rounds: Vec<ChannelApiTestRoundResult>,
}

#[derive(Debug, Clone)]
struct ProtocolResponse {
    http_status: Option<i64>,
    model: Option<String>,
    text: String,
    raw_excerpt: String,
    usage: Option<Value>,
    finish_reason: Option<String>,
    first_metric_kind: String,
    first_token_ms: Option<i64>,
    error_reason: Option<String>,
    request_json: Value,
    response_json: Value,
    header_ms: Option<i64>,
    first_event_ms: Option<i64>,
    first_text_delta_ms: Option<i64>,
    completed_ms: Option<i64>,
    response_headers: Value,
}

mod anthropic;
mod api;
mod attribution;
mod checks;
mod http;
mod openai;
mod persistence;
mod probes;
mod query;
mod sampling;

pub use api::{
    channel_test_case_delete, channel_test_case_upsert, channel_test_cases_list,
    channel_test_query_runs, channel_test_run,
};

#[cfg(test)]
mod tests;
