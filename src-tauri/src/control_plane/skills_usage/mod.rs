use std::{
    collections::{HashMap, HashSet},
    fs::{self, File},
    io::{BufRead, BufReader, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
};

use chrono::{Duration, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;
use uuid::Uuid;
use walkdir::WalkDir;

use crate::{
    db::AppState,
    domain::models::{
        SkillsUsageCallsQueryInput, SkillsUsageStatsQueryInput, SkillsUsageSyncProgressInput,
        SkillsUsageSyncStartInput,
    },
    error::AppError,
    utils::{now_rfc3339, sha256_hex},
};

const AGENT_CODEX: &str = "codex";
const AGENT_CLAUDE: &str = "claude";
const SOURCE_CODEX_JSONL: &str = "codex_jsonl";
const SOURCE_CLAUDE_TRANSCRIPT: &str = "claude_transcript";

const JOB_STATUS_RUNNING: &str = "running";
const JOB_STATUS_COMPLETED: &str = "completed";
const JOB_STATUS_COMPLETED_WITH_ERRORS: &str = "completed_with_errors";
const JOB_STATUS_FAILED: &str = "failed";

const RESULT_STATUS_SUCCESS: &str = "success";
const RESULT_STATUS_UNKNOWN: &str = "unknown";

static SKILLS_USAGE_SYNC_JOBS: OnceLock<Mutex<HashMap<String, SkillsUsageSyncJobHandle>>> =
    OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillsUsageSyncJobState {
    job_id: String,
    workspace_id: String,
    status: String,
    total_files: u64,
    processed_files: u64,
    parsed_events: u64,
    inserted_events: u64,
    duplicate_events: u64,
    parse_failures: u64,
    current_source: String,
    error_message: String,
    started_at: String,
    updated_at: String,
}

#[derive(Clone)]
struct SkillsUsageSyncJobHandle {
    state: Arc<Mutex<SkillsUsageSyncJobState>>,
}

#[derive(Debug, Clone)]
struct WorkspaceScope {
    id: String,
    root_path: PathBuf,
}

#[derive(Debug, Clone)]
struct SkillAliasCandidate {
    skill_id: String,
    identity: String,
    name: String,
    alias_quality: i32,
    local_path: Option<String>,
    source_local_path: Option<String>,
}

#[derive(Debug, Clone)]
struct AgentSearchDirScope {
    path: String,
    priority: i64,
    source: String,
}

#[derive(Debug, Clone)]
struct SessionSkillCallEvent {
    workspace_id: Option<String>,
    agent: String,
    source: String,
    source_path: String,
    session_id: String,
    event_ref: String,
    skill_id: String,
    skill_identity: String,
    skill_name: String,
    called_at: String,
    result_status: String,
    evidence_source: String,
    evidence_kind: String,
    confidence: f64,
    raw_ref: String,
    dedupe_key: String,
}

#[derive(Debug, Clone)]
struct ParseFailureEvent {
    workspace_id: Option<String>,
    agent: String,
    source_path: String,
    session_id: Option<String>,
    line_no: i64,
    event_ref: String,
    reason: String,
    raw_excerpt: String,
}

#[derive(Debug, Clone)]
struct SessionFile {
    agent: String,
    source: String,
    path: PathBuf,
}

#[derive(Debug, Clone)]
struct SessionDiscoverIssue {
    agent: String,
    source_path: String,
    reason: String,
}

#[derive(Debug, Clone)]
struct FileParseState {
    session_id: String,
    session_cwd: Option<String>,
}

fn normalize_filter_value(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(str::to_string)
}


mod api;
mod jobs;
mod parser;
mod persistence;

use jobs::*;
use parser::*;
use persistence::*;

pub use api::{
    skills_usage_query_calls, skills_usage_query_stats, skills_usage_sync_progress,
    skills_usage_sync_start,
};

#[cfg(test)]
mod tests;
