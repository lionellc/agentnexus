use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub install_mode: String,
    pub platform_overrides: HashMap<String, String>,
    pub active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeFlags {
    pub local_mode: bool,
    pub external_sources_enabled: bool,
    pub experimental_enabled: bool,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DistributionTarget {
    pub id: String,
    pub workspace_id: String,
    pub platform: String,
    pub target_path: String,
    pub skills_path: String,
    pub install_mode: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDocRelease {
    pub id: String,
    pub workspace_id: String,
    pub version: String,
    pub title: String,
    pub notes: String,
    pub content_hash: String,
    pub operator: String,
    pub active: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DistributionRecordResult {
    pub id: String,
    pub target_id: String,
    pub status: String,
    pub message: String,
    pub expected_hash: String,
    pub actual_hash: String,
    pub used_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DistributionJobResult {
    pub id: String,
    pub workspace_id: String,
    pub release_version: String,
    pub mode: String,
    pub status: String,
    pub retry_of_job_id: Option<String>,
    pub records: Vec<DistributionRecordResult>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConnection {
    pub id: String,
    pub workspace_id: String,
    pub agent_type: String,
    pub root_dir: String,
    pub enabled: bool,
    pub resolved_path: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleTag {
    pub agent_type: String,
    pub status: String,
    pub reason: Option<String>,
    pub last_checked_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleAssetSummary {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub latest_version: String,
    pub latest_content_hash: String,
    pub latest_updated_at: String,
    pub tags: Vec<AgentRuleTag>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleVersion {
    pub id: String,
    pub asset_id: String,
    pub version: String,
    pub content: String,
    pub content_hash: String,
    pub operator: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleJobRecordResult {
    pub id: String,
    pub agent_type: String,
    pub connection_id: String,
    pub resolved_path: String,
    pub status: String,
    pub message: String,
    pub expected_hash: String,
    pub actual_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleJobResult {
    pub id: String,
    pub workspace_id: String,
    pub asset_id: String,
    pub version: String,
    pub mode: String,
    pub status: String,
    pub retry_of_job_id: Option<String>,
    pub records: Vec<AgentRuleJobRecordResult>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillAsset {
    pub id: String,
    pub identity: String,
    pub name: String,
    pub version: String,
    pub latest_version: String,
    pub source: String,
    pub source_parent: String,
    pub local_path: String,
    pub source_local_path: String,
    pub source_is_symlink: bool,
    pub is_symlink: bool,
    pub update_candidate: bool,
    pub last_used_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsFileTreeInput {
    pub skill_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsFileReadInput {
    pub skill_id: String,
    pub relative_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsOpenInput {
    pub skill_id: String,
    pub relative_path: Option<String>,
    pub mode: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceCreateInput {
    pub name: String,
    pub root_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceUpdateInput {
    pub id: String,
    pub name: Option<String>,
    pub root_path: Option<String>,
    pub install_mode: Option<String>,
    pub platform_overrides: Option<HashMap<String, String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceActivateInput {
    pub id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeFlagsInput {
    pub local_mode: bool,
    pub external_sources_enabled: bool,
    pub experimental_enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetUpsertInput {
    pub workspace_id: String,
    pub id: Option<String>,
    pub platform: String,
    pub target_path: String,
    pub skills_path: Option<String>,
    pub install_mode: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetDeleteInput {
    pub workspace_id: String,
    pub id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDocSaveInput {
    pub workspace_id: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseCreateInput {
    pub workspace_id: String,
    pub title: String,
    pub notes: Option<String>,
    pub operator: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseRollbackInput {
    pub workspace_id: String,
    pub release_version: String,
    pub operator: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DistributionRunInput {
    pub workspace_id: String,
    pub release_version: String,
    pub target_ids: Option<Vec<String>>,
    pub mode: Option<String>,
    pub allow_fallback: Option<bool>,
    pub operator: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DistributionRetryInput {
    pub job_id: String,
    pub operator: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriftDetectInput {
    pub workspace_id: String,
    pub target_ids: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConnectionUpsertInput {
    pub workspace_id: String,
    pub agent_type: String,
    pub root_dir: String,
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConnectionToggleInput {
    pub workspace_id: String,
    pub agent_type: String,
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleFilePreviewInput {
    pub workspace_id: String,
    pub agent_type: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleAssetCreateInput {
    pub workspace_id: String,
    pub name: String,
    pub content: String,
    pub operator: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRulePublishVersionInput {
    pub asset_id: String,
    pub content: String,
    pub operator: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleRollbackAssetInput {
    pub asset_id: String,
    pub version: String,
    pub operator: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleApplyInput {
    pub workspace_id: String,
    pub asset_id: String,
    pub agent_types: Option<Vec<String>>,
    pub operator: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleRefreshInput {
    pub workspace_id: String,
    pub asset_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleRetryInput {
    pub job_id: String,
    pub operator: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsScanInput {
    pub workspace_id: String,
    pub directories: Option<Vec<String>>,
    pub latest_versions: Option<HashMap<String, String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsBatchInput {
    pub workspace_id: String,
    pub skill_ids: Vec<String>,
    pub target_ids: Vec<String>,
    pub operator: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SkillsManagerRuleValue {
    pub only: Option<Vec<String>>,
    pub exclude: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SkillsManagerToolRuleValue {
    pub block_all: Option<bool>,
    pub allow: Option<Vec<String>>,
    pub allow_groups: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsManagerStateInput {
    pub workspace_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsManagerActionInput {
    pub workspace_id: String,
    pub operator: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsManagerBatchItemInput {
    pub skill_id: String,
    pub tool: String,
    pub force: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsManagerBatchInput {
    pub workspace_id: String,
    pub items: Vec<SkillsManagerBatchItemInput>,
    pub operator: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsManagerDeleteInput {
    pub workspace_id: String,
    pub skill_id: String,
    pub operator: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsManagerRestoreInput {
    pub workspace_id: String,
    pub skill_name: String,
    pub operator: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsManagerRulesUpdateInput {
    pub workspace_id: String,
    pub rules: Option<HashMap<String, SkillsManagerRuleValue>>,
    pub group_rules: Option<HashMap<String, SkillsManagerRuleValue>>,
    pub tool_rules: Option<HashMap<String, SkillsManagerToolRuleValue>>,
    pub operator: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsManagerDiffStartInput {
    pub workspace_id: String,
    pub left_skill_id: String,
    pub right_skill_id: String,
    pub operator: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsManagerDiffJobInput {
    pub workspace_id: String,
    pub job_id: String,
    pub operator: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsManagerLinkPreviewInput {
    pub workspace_id: String,
    pub skill_id: String,
    pub tool: String,
    pub max_entries: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsManagerUpdateThenLinkInput {
    pub workspace_id: String,
    pub skill_id: String,
    pub tool: String,
    pub operator: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptCreateInput {
    pub workspace_id: String,
    pub name: String,
    pub content: String,
    pub tags: Option<Vec<String>>,
    pub category: Option<String>,
    pub favorite: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptUpdateInput {
    pub prompt_id: String,
    pub name: Option<String>,
    pub content: String,
    pub tags: Option<Vec<String>>,
    pub category: Option<String>,
    pub favorite: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptDeleteInput {
    pub prompt_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptRestoreInput {
    pub prompt_id: String,
    pub version: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptSearchInput {
    pub workspace_id: String,
    pub keyword: Option<String>,
    pub tags: Option<Vec<String>>,
    pub category: Option<String>,
    pub favorite: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptRenderInput {
    pub prompt_id: String,
    pub variables: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsUsageSyncStartInput {
    pub workspace_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsUsageSyncProgressInput {
    pub workspace_id: String,
    pub job_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsUsageStatsQueryInput {
    pub workspace_id: String,
    pub agent: Option<String>,
    pub source: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsUsageCallsQueryInput {
    pub workspace_id: String,
    pub skill_id: String,
    pub agent: Option<String>,
    pub source: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditQueryInput {
    pub workspace_id: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalSourceCheckInput {
    pub url: String,
}
