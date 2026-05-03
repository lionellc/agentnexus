use serde::{Deserialize, Serialize};

const BUILTIN_CODEX: &str = "codex";
const BUILTIN_CLAUDE: &str = "claude";
const CODEX_SKIP_GIT_REPO_CHECK_FLAG: &str = "--skip-git-repo-check";
const CODEX_JSON_MODE_FLAG: &str = "--json";
const DEFAULT_TIMEOUT_SECONDS: u64 = 30 * 60;
const MAX_STD_STREAM_BYTES: usize = 32 * 1024;
const FORMAT_PRESERVATION_RULE: &str =
    "Preserve the original content format exactly, including line breaks, indentation, markdown syntax, lists, tables, and code blocks.";

mod config;
mod executor;
mod profile;
mod prompt_translation;
mod validation;

pub use config::{translation_config_get, translation_config_update};
pub use profile::{
    local_agent_profile_delete, local_agent_profile_list, local_agent_profile_upsert,
};
pub use prompt_translation::{
    local_agent_translation_test, prompt_translation_list, prompt_translation_retranslate,
    prompt_translation_run,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAgentProfileDto {
    pub id: String,
    pub workspace_id: String,
    pub profile_key: String,
    pub name: String,
    pub executable: String,
    pub args_template: Vec<String>,
    pub is_builtin: bool,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationConfigDto {
    pub workspace_id: String,
    pub default_profile_key: String,
    pub prompt_template: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptTranslationDto {
    pub id: String,
    pub workspace_id: String,
    pub prompt_id: String,
    pub prompt_version: i64,
    pub target_language: String,
    pub variant_no: i64,
    pub variant_label: String,
    pub translated_text: String,
    pub source_text_hash: String,
    pub profile_key: String,
    pub apply_mode: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationExecutionResult {
    pub translated_text: String,
    pub target_language: String,
    pub stdout_preview: String,
    pub stderr_preview: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAgentProfileUpsertInput {
    pub profile_key: Option<String>,
    pub name: String,
    pub executable: String,
    pub args_template: Vec<String>,
    pub enabled: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAgentProfileDeleteInput {
    pub profile_key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationConfigUpdateInput {
    pub default_profile_key: String,
    pub prompt_template: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAgentTranslationTestInput {
    pub profile_key: String,
    pub source_text: String,
    pub target_language: String,
    pub timeout_seconds: Option<u64>,
    pub request_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptTranslationListInput {
    pub prompt_id: String,
    pub prompt_version: Option<i64>,
    pub target_language: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PromptTranslationRunInput {
    pub prompt_id: String,
    pub prompt_version: Option<i64>,
    pub source_text: Option<String>,
    pub target_language: String,
    pub profile_key: Option<String>,
    pub strategy: Option<String>,
    pub apply_mode: Option<String>,
    pub timeout_seconds: Option<u64>,
    pub request_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptTranslationRetranslateInput {
    pub translation_id: String,
    pub source_text: Option<String>,
    pub profile_key: Option<String>,
    pub strategy: Option<String>,
    pub timeout_seconds: Option<u64>,
}

#[cfg(test)]
mod tests {
    use super::executor::{
        append_cli_path_fallbacks, apply_execution_compatibility, format_running_duration,
        parse_translation_protocol, prepend_executable_parent_to_path, resolve_executable_path,
    };
    use super::validation::{contains_forbidden_exec_pattern, normalize_profile_key};
    use std::time::Duration;
    use std::{fs, path::PathBuf};

    #[test]
    fn forbidden_patterns_are_detected() {
        assert!(contains_forbidden_exec_pattern("cat a | cat b"));
        assert!(contains_forbidden_exec_pattern("--output=/tmp/a.txt"));
        assert!(contains_forbidden_exec_pattern("$(whoami)"));
        assert!(!contains_forbidden_exec_pattern("--json"));
    }

    #[test]
    fn profile_key_is_normalized() {
        assert_eq!(
            normalize_profile_key(" Codex ").expect("normalize"),
            "codex"
        );
        assert!(normalize_profile_key("bad key").is_err());
    }

    #[test]
    fn codex_args_auto_append_skip_git_repo_check() {
        let args =
            apply_execution_compatibility("codex", vec!["exec".to_string(), "--json".to_string()]);
        assert!(args.iter().any(|arg| arg == "--skip-git-repo-check"));
        assert!(!args.iter().any(|arg| arg == "--json"));

        let args_again = apply_execution_compatibility(
            "codex",
            vec![
                "exec".to_string(),
                "--json".to_string(),
                "--skip-git-repo-check".to_string(),
            ],
        );
        let count = args_again
            .iter()
            .filter(|arg| arg.as_str() == "--skip-git-repo-check")
            .count();
        assert_eq!(count, 1);
    }

    #[test]
    fn protocol_requires_translated_text() {
        let result = parse_translation_protocol("{\"foo\":\"bar\"}", "中文", "");
        assert!(result.is_err());

        let ok = parse_translation_protocol(
            "{\"translatedText\":\"hello\",\"targetLanguage\":\"English\"}",
            "中文",
            "",
        )
        .expect("protocol");
        assert_eq!(ok.translated_text, "hello");
        assert_eq!(ok.target_language, "English");
    }

    #[test]
    fn running_duration_is_formatted_as_min_sec() {
        assert_eq!(
            format_running_duration(Duration::from_millis(29_554)),
            "running:0 min 29 s"
        );
        assert_eq!(
            format_running_duration(Duration::from_secs(125)),
            "running:2 min 5 s"
        );
    }

    #[test]
    fn executable_parent_dir_is_prepended_to_path() {
        let mut env_pairs = vec![("PATH".to_string(), "/usr/bin:/bin".to_string())];
        let executable = "/Users/liuc/.deskclaw/node/bin/codex";

        prepend_executable_parent_to_path(&mut env_pairs, executable);

        let path_value = env_pairs
            .iter()
            .find(|(key, _)| key == "PATH")
            .map(|(_, value)| value.as_str())
            .expect("path");
        let mut path_iter = std::env::split_paths(path_value);
        assert_eq!(
            path_iter.next(),
            Some(PathBuf::from("/Users/liuc/.deskclaw/node/bin"))
        );
    }

    #[test]
    fn executable_parent_dir_is_not_duplicated_in_path() {
        let mut env_pairs = vec![(
            "PATH".to_string(),
            "/Users/liuc/.deskclaw/node/bin:/usr/bin:/bin".to_string(),
        )];
        let executable = "/Users/liuc/.deskclaw/node/bin/codex";

        prepend_executable_parent_to_path(&mut env_pairs, executable);

        let path_value = env_pairs
            .iter()
            .find(|(key, _)| key == "PATH")
            .map(|(_, value)| value.as_str())
            .expect("path");
        let count = std::env::split_paths(path_value)
            .filter(|path| *path == PathBuf::from("/Users/liuc/.deskclaw/node/bin"))
            .count();
        assert_eq!(count, 1);
    }

    #[test]
    fn executable_parent_dir_creates_path_when_missing() {
        let mut env_pairs = vec![("HOME".to_string(), "/Users/liuc".to_string())];
        let executable = "/Users/liuc/.deskclaw/node/bin/codex";

        prepend_executable_parent_to_path(&mut env_pairs, executable);

        let path_value = env_pairs
            .iter()
            .find(|(key, _)| key == "PATH")
            .map(|(_, value)| value.as_str())
            .expect("path");
        assert_eq!(path_value, "/Users/liuc/.deskclaw/node/bin");
    }

    #[test]
    fn append_cli_path_fallbacks_adds_homebrew_and_home_bins() {
        let mut env_pairs = vec![("HOME".to_string(), "/Users/liuc".to_string())];
        append_cli_path_fallbacks(&mut env_pairs);

        let path_value = env_pairs
            .iter()
            .find(|(key, _)| key == "PATH")
            .map(|(_, value)| value.clone())
            .expect("path");
        let paths = std::env::split_paths(&path_value).collect::<Vec<PathBuf>>();
        assert!(paths.contains(&PathBuf::from("/opt/homebrew/bin")));
        assert!(paths.contains(&PathBuf::from("/Users/liuc/.deskclaw/node/bin")));
    }

    #[test]
    fn resolve_executable_path_finds_binary_in_home_fallback_dir() {
        let temp = tempfile::tempdir().expect("temp dir");
        let home = temp.path().to_path_buf();
        let bin_dir = home.join(".deskclaw").join("node").join("bin");
        fs::create_dir_all(&bin_dir).expect("create bin dir");
        let executable_path = bin_dir.join("codex");
        fs::write(&executable_path, "#!/bin/sh\necho ok").expect("write codex");

        let env_pairs = vec![
            ("HOME".to_string(), home.to_string_lossy().to_string()),
            ("PATH".to_string(), "/usr/bin:/bin".to_string()),
        ];
        let resolved = resolve_executable_path("codex", &env_pairs);
        assert_eq!(PathBuf::from(resolved), executable_path);
    }
}
