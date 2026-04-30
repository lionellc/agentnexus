use std::{
    collections::HashMap,
    sync::{Arc, Mutex, OnceLock},
};

use chrono::{Duration, Utc};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use uuid::Uuid;

use crate::{
    db::AppState,
    domain::models::{
        ModelPricingOverrideUpsertInput, ModelPricingQueryInput, ModelPricingSyncInput,
        ModelUsageDashboardQueryInput, ModelUsageRequestLogsQueryInput,
        ModelUsageSyncProgressInput, ModelUsageSyncStartInput,
    },
    error::AppError,
    utils::{now_rfc3339, sha256_hex},
};

const AGENT_CODEX: &str = "codex";
const AGENT_CLAUDE: &str = "claude";

const SOURCE_SESSION_JSONL: &str = "session_jsonl";
const SOURCE_INSTRUMENTATION_EVENT: &str = "instrumentation_event";

const JOB_STATUS_RUNNING: &str = "running";
const JOB_STATUS_COMPLETED: &str = "completed";
const JOB_STATUS_COMPLETED_WITH_ERRORS: &str = "completed_with_errors";
const JOB_STATUS_FAILED: &str = "failed";

const STATUS_SUCCESS: &str = "success";
const STATUS_FAILED: &str = "failed";
const STATUS_UNKNOWN: &str = "unknown";

static MODEL_USAGE_SYNC_JOBS: OnceLock<Mutex<HashMap<String, ModelUsageSyncJobHandle>>> =
    OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelUsageSyncJobState {
    job_id: String,
    workspace_id: String,
    status: String,
    total_files: u64,
    processed_files: u64,
    parsed_events: u64,
    inserted_events: u64,
    merged_events: u64,
    parse_failures: u64,
    current_source: String,
    error_message: String,
    started_at: String,
    updated_at: String,
}

#[derive(Clone)]
struct ModelUsageSyncJobHandle {
    state: Arc<Mutex<ModelUsageSyncJobState>>,
}

#[derive(Debug, Clone)]
struct WorkspaceScope {
    id: String,
    root_path: String,
}

#[derive(Debug, Clone)]
struct AgentRootDirScope {
    agent: String,
    root_dir: String,
}

#[derive(Debug, Clone)]
struct ModelUsageFactDraft {
    workspace_id: String,
    timestamp: String,
    agent: String,
    provider: String,
    model: String,
    status: String,
    input_tokens: Option<i64>,
    output_tokens: Option<i64>,
    source: String,
    source_path: String,
    session_id: String,
    event_ref: String,
    request_id: Option<String>,
    attempt_key: Option<String>,
    raw_payload: String,
    dedupe_key: String,
}

#[derive(Debug, Clone)]
struct ParseFailureEvent {
    workspace_id: String,
    source: String,
    source_path: String,
    reason: String,
    raw_excerpt: String,
}

#[derive(Debug, Clone)]
struct SessionFile {
    agent: String,
    source: String,
    path: String,
}

#[derive(Debug, Clone)]
struct SessionDiscoverIssue {
    source: String,
    source_path: String,
    reason: String,
}

fn normalize_filter_value(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(str::to_string)
}

mod api;
mod dashboard;
mod jobs;
mod parser;
mod persistence;
mod pricing;
mod query;
mod request_logs;

use jobs::*;
use parser::*;
use persistence::*;
use pricing::*;
use query::*;

pub use api::{
    model_pricing_override_upsert, model_pricing_query, model_pricing_sync_trigger,
    model_usage_sync_progress, model_usage_sync_start,
};
pub use dashboard::model_usage_query_dashboard;
pub use request_logs::model_usage_query_request_logs;

#[cfg(test)]
mod tests;
