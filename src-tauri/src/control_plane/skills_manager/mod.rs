use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;
use uuid::Uuid;
use walkdir::WalkDir;

use crate::{
    db::AppState,
    domain::models::{
        SkillsManagerActionInput, SkillsManagerBatchInput, SkillsManagerBatchItemInput,
        SkillsManagerDeleteInput, SkillsManagerDiffJobInput, SkillsManagerDiffStartInput,
        SkillsManagerLinkPreviewInput, SkillsManagerRestoreInput, SkillsManagerRuleValue,
        SkillsManagerRulesUpdateInput, SkillsManagerStateInput, SkillsManagerToolRuleValue,
        SkillsManagerUpdateThenLinkInput,
    },
    error::AppError,
    security::resolve_distribution_target_path,
    utils::now_rfc3339,
};

const STATUS_LINKED: &str = "linked";
const STATUS_MISSING: &str = "missing";
const STATUS_BLOCKED: &str = "blocked";
const STATUS_WRONG: &str = "wrong";
const STATUS_DIRECTORY: &str = "directory";
const DIFF_STATUS_RUNNING: &str = "running";
const DIFF_STATUS_CANCELLING: &str = "cancelling";
const DIFF_STATUS_CANCELLED: &str = "cancelled";
const DIFF_STATUS_COMPLETED: &str = "completed";
const DIFF_STATUS_FAILED: &str = "failed";

static SKILLS_MANAGER_DIFF_JOBS: OnceLock<Mutex<HashMap<String, SkillsManagerDiffJobHandle>>> =
    OnceLock::new();

#[derive(Debug, Clone)]
struct ToolTarget {
    id: String,
    platform: String,
    skills_path: String,
    install_mode: String,
}

#[derive(Debug, Clone)]
struct SkillRow {
    id: String,
    name: String,
    source: String,
    local_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct SkillsManagerConfig {
    rules: HashMap<String, SkillsManagerRuleValue>,
    group_rules: HashMap<String, SkillsManagerRuleValue>,
    tool_rules: HashMap<String, SkillsManagerToolRuleValue>,
    manual_unlinks: HashMap<String, Vec<String>>,
    deleted_skills: Vec<String>,
}

#[derive(Debug, Clone)]
struct SkillRuntime {
    id: String,
    name: String,
    source: String,
    local_path: PathBuf,
    group: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillsManagerDiffEntry {
    relative_path: String,
    status: String,
    left_bytes: u64,
    right_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillsManagerDiffJobState {
    job_id: String,
    workspace_id: String,
    left_skill_id: String,
    right_skill_id: String,
    left_skill_name: String,
    right_skill_name: String,
    status: String,
    total_files: u64,
    processed_files: u64,
    current_file: String,
    diff_files: u64,
    same_skill: Option<bool>,
    error_message: String,
    started_at: String,
    updated_at: String,
    entries: Vec<SkillsManagerDiffEntry>,
}

#[derive(Clone)]
struct SkillsManagerDiffJobHandle {
    state: Arc<Mutex<SkillsManagerDiffJobState>>,
    cancel_flag: Arc<AtomicBool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillsManagerLinkPreview {
    workspace_id: String,
    skill_id: String,
    skill_name: String,
    tool: String,
    target_path: String,
    target_kind: String,
    can_link: bool,
    requires_confirm: bool,
    same_target: bool,
    total_files: u64,
    diff_files: u64,
    entries: Vec<SkillsManagerDiffEntry>,
    entries_truncated: bool,
    message: String,
}


mod api;
mod batch_ops;
mod diff_worker;
mod fs_helper;
mod rules;
mod store;

use batch_ops::*;
use diff_worker::*;
use fs_helper::*;
use rules::*;
use store::*;

pub use api::{
    skills_manager_batch_link, skills_manager_batch_unlink, skills_manager_clean,
    skills_manager_delete, skills_manager_diff_cancel, skills_manager_diff_progress,
    skills_manager_diff_start, skills_manager_link_preview, skills_manager_purge,
    skills_manager_restore, skills_manager_rules_update, skills_manager_state, skills_manager_sync,
    skills_manager_update_then_link,
};

#[cfg(test)]
mod tests;
