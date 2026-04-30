use serde::{Deserialize, Serialize};

mod api;
mod apply;
mod normalize;
mod publish;

pub use api::{
    agent_connection_delete, agent_connection_list, agent_connection_preview,
    agent_connection_redetect, agent_connection_restore_defaults, agent_connection_toggle,
    agent_connection_upsert,
};
pub use apply::{agent_rule_apply, agent_rule_refresh, agent_rule_retry, agent_rule_status};
pub use publish::{
    agent_rule_asset_create, agent_rule_asset_delete, agent_rule_asset_list,
    agent_rule_asset_rename, agent_rule_publish_version, agent_rule_rollback, agent_rule_versions,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConnectionSearchDirDto {
    pub path: String,
    pub enabled: bool,
    pub priority: i64,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConnectionDto {
    pub id: String,
    pub workspace_id: String,
    pub agent_type: String,
    pub root_dir: String,
    pub rule_file: String,
    pub root_dir_source: String,
    pub rule_file_source: String,
    pub detection_status: String,
    pub detected_at: Option<String>,
    pub skill_search_dirs: Vec<AgentConnectionSearchDirDto>,
    pub enabled: bool,
    pub resolved_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleTagDto {
    pub agent_type: String,
    pub drift_status: String,
    pub drift_reason: String,
    pub last_checked_at: Option<String>,
    pub resolved_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleAssetDto {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub latest_version: i64,
    pub latest_content_hash: String,
    pub created_at: String,
    pub updated_at: String,
    pub tags: Vec<AgentRuleTagDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleVersionDto {
    pub id: String,
    pub asset_id: String,
    pub version: i64,
    pub content: String,
    pub content_hash: String,
    pub operator: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleApplyRecordDto {
    pub id: String,
    pub agent_type: String,
    pub resolved_path: String,
    pub status: String,
    pub message: String,
    pub expected_hash: String,
    pub actual_hash: String,
    pub used_mode: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleApplyJobDto {
    pub id: String,
    pub workspace_id: String,
    pub asset_id: Option<String>,
    pub release_version: String,
    pub mode: String,
    pub status: String,
    pub retry_of_job_id: Option<String>,
    pub operator: String,
    pub records: Vec<AgentRuleApplyRecordDto>,
    pub tags: Vec<AgentRuleTagDto>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRulePreviewResult {
    pub agent_type: String,
    pub resolved_path: String,
    pub status: String,
    pub content: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConnectionUpsertInput {
    pub workspace_id: String,
    pub agent_type: String,
    pub root_dir: String,
    pub rule_file: Option<String>,
    pub enabled: bool,
    pub root_dir_source: Option<String>,
    pub rule_file_source: Option<String>,
    pub detection_status: Option<String>,
    pub skill_search_dirs: Option<Vec<AgentConnectionSearchDirInput>>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConnectionSearchDirInput {
    pub path: String,
    pub enabled: bool,
    pub priority: Option<i64>,
    pub source: Option<String>,
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
pub struct AgentConnectionDeleteInput {
    pub workspace_id: String,
    pub agent_type: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConnectionPresetActionInput {
    pub workspace_id: String,
    pub agent_type: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRulePreviewInput {
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
pub struct AgentRuleAssetPublishInput {
    pub asset_id: String,
    pub content: String,
    pub operator: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleAssetDeleteInput {
    pub workspace_id: String,
    pub asset_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleAssetRenameInput {
    pub workspace_id: String,
    pub asset_id: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleAssetRollbackInput {
    pub asset_id: String,
    pub version: i64,
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
pub struct AgentRuleRetryInput {
    pub job_id: String,
    pub operator: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuleRefreshInput {
    pub workspace_id: String,
    pub asset_id: String,
}

#[derive(Debug, Clone)]
pub(super) struct ConnectionRow {
    pub id: String,
    pub workspace_id: String,
    pub agent_type: String,
    pub root_dir: String,
    pub rule_file: String,
    pub root_dir_source: String,
    pub rule_file_source: String,
    pub detection_status: String,
    pub detected_at: Option<String>,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub(super) struct VersionBundle {
    pub workspace_id: String,
    pub asset_id: String,
    pub version: i64,
    pub content: String,
    pub content_hash: String,
}

#[cfg(test)]
mod tests {
    use super::{
        apply::{summarize_apply_status, summarize_refresh_status},
        normalize::{normalize_agent_type, normalize_rule_file, resolve_rule_file_path},
        AgentRuleApplyRecordDto,
    };

    fn record(agent_type: &str, status: &str) -> AgentRuleApplyRecordDto {
        AgentRuleApplyRecordDto {
            id: format!("{agent_type}-{status}"),
            agent_type: agent_type.to_string(),
            resolved_path: format!("/tmp/{agent_type}.md"),
            status: status.to_string(),
            message: String::new(),
            expected_hash: "expected".to_string(),
            actual_hash: "actual".to_string(),
            used_mode: "copy".to_string(),
        }
    }

    #[test]
    fn normalize_agent_type_works() {
        assert_eq!(normalize_agent_type("codex").expect("codex"), "codex");
        assert_eq!(normalize_agent_type("CLAUDE").expect("claude"), "claude");
        assert_eq!(
            normalize_agent_type("  CoDeX  ").expect("trim+case"),
            "codex"
        );
        assert_eq!(normalize_agent_type(" claude ").expect("trim"), "claude");
        assert_eq!(normalize_agent_type("cursor").expect("custom"), "cursor");
        assert!(normalize_agent_type("").is_err());
        assert!(normalize_agent_type("cursor role").is_err());
    }

    #[test]
    fn normalize_rule_file_works() {
        assert_eq!(
            normalize_rule_file(Some("AGENTS.md"), "codex").expect("codex"),
            "AGENTS.md"
        );
        assert_eq!(
            normalize_rule_file(Some("roles/CURSOR.md"), "cursor").expect("custom"),
            "roles/CURSOR.md"
        );
        assert_eq!(
            normalize_rule_file(None, "claude").expect("default"),
            "CLAUDE.md"
        );
        assert!(normalize_rule_file(Some("../bad.md"), "codex").is_err());
        assert!(normalize_rule_file(Some("/abs/path.md"), "codex").is_err());
    }

    #[test]
    fn resolve_rule_file_path_handles_root_boundary() {
        let codex_path = resolve_rule_file_path("/tmp/workspace/.codex", "AGENTS.md", "codex")
            .expect("codex path should resolve");
        assert_eq!(
            codex_path.to_string_lossy(),
            "/tmp/workspace/.codex/AGENTS.md"
        );

        let claude_path = resolve_rule_file_path("/tmp/workspace/.claude", "CLAUDE.md", "claude")
            .expect("claude path should resolve");
        assert_eq!(
            claude_path.to_string_lossy(),
            "/tmp/workspace/.claude/CLAUDE.md"
        );

        assert!(resolve_rule_file_path("relative/path", "AGENTS.md", "codex").is_err());
        assert!(resolve_rule_file_path("/tmp/workspace", "../escape.md", "codex").is_err());
    }

    #[test]
    fn summarize_apply_status_success_failed_partial() {
        let all_success = vec![record("codex", "success"), record("claude", "success")];
        assert_eq!(summarize_apply_status(&all_success), "success");

        let all_failed = vec![record("codex", "failed"), record("claude", "failed")];
        assert_eq!(summarize_apply_status(&all_failed), "failed");

        let partial = vec![record("codex", "success"), record("claude", "failed")];
        assert_eq!(summarize_apply_status(&partial), "partial_failed");
    }

    #[test]
    fn summarize_refresh_status_clean_drifted_error_partial() {
        let clean = vec![record("codex", "clean"), record("claude", "clean")];
        assert_eq!(summarize_refresh_status(&clean), "success");

        let drifted = vec![record("codex", "drifted"), record("claude", "drifted")];
        assert_eq!(summarize_refresh_status(&drifted), "drifted");

        let error = vec![record("codex", "error"), record("claude", "error")];
        assert_eq!(summarize_refresh_status(&error), "failed");

        let records = vec![
            record("codex", "clean"),
            record("claude", "error"),
            record("codex", "drifted"),
        ];
        assert_eq!(summarize_refresh_status(&records), "partial_failed");
    }
}
