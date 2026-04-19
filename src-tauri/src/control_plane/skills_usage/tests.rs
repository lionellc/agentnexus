    use serde_json::json;

    use super::{
        build_parse_failure_summary, extract_claude_skill_calls, extract_codex_skill_calls,
        normalize_skill_alias_candidates, truncate_text, ParsedSkillCall, RESULT_STATUS_SUCCESS,
    };

    #[test]
    fn normalize_skill_alias_candidates_supports_colon_and_dash() {
        let list = normalize_skill_alias_candidates("$ce:work");
        assert!(list.contains(&"ce:work".to_string()));
        assert!(list.contains(&"ce-work".to_string()));
        assert!(list.contains(&"work".to_string()));
    }

    #[test]
    fn extract_codex_skill_calls_from_function_call() {
        let value = json!({
            "type": "response_item",
            "payload": {
                "type": "function_call",
                "arguments": "{\"command\":\"~/.codex/superpowers/.codex/superpowers-codex use-skill ce:work\"}"
            }
        });

        let calls = extract_codex_skill_calls(&value);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].skill_token, "ce:work");
        assert_eq!(calls[0].result_status, RESULT_STATUS_SUCCESS);
    }

    #[test]
    fn extract_codex_skill_calls_from_exec_command_cmd_field() {
        let value = json!({
            "type": "response_item",
            "payload": {
                "type": "function_call",
                "name": "exec_command",
                "arguments": "{\"cmd\":\"~/.codex/superpowers/.codex/superpowers-codex use-skill uoc-page-style\",\"yield_time_ms\":1000,\"max_output_tokens\":2000}"
            }
        });

        let calls = extract_codex_skill_calls(&value);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].skill_token, "uoc-page-style");
        assert_eq!(calls[0].result_status, RESULT_STATUS_SUCCESS);
    }

    #[test]
    fn extract_codex_skill_calls_ignores_code_snippet_loading_skill_literal() {
        let value = json!({
            "type": "response_item",
            "payload": {
                "type": "function_call_output",
                "output": "if lowered.contains(\"loading superpowers skill:\") {\n  // code snippet only\n}\n"
            }
        });

        let calls = extract_codex_skill_calls(&value);
        assert!(calls.is_empty());
    }

    #[test]
    fn extract_codex_skill_calls_from_function_call_output_loading_line() {
        let value = json!({
            "type": "response_item",
            "payload": {
                "type": "function_call_output",
                "output": "Loading superpowers skill: ce:work\n"
            }
        });

        let calls = extract_codex_skill_calls(&value);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].skill_token, "ce:work");
        assert_eq!(calls[0].result_status, RESULT_STATUS_SUCCESS);
    }

    #[test]
    fn extract_claude_skill_calls_from_user_content() {
        let value = json!({
            "type": "user",
            "content": "请执行 [$ce:work](/Users/demo/.codex/skills/ce-work/SKILL.md)"
        });

        let calls: Vec<ParsedSkillCall> = extract_claude_skill_calls(&value);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].skill_token, "ce:work");
    }

    #[test]
    fn truncate_text_handles_utf8_char_boundary() {
        let text = "abc发票xyz";

        assert_eq!(truncate_text(text, 5), "abc");
        assert_eq!(truncate_text(text, 6), "abc发");
    }

    #[test]
    fn truncate_text_does_not_panic_when_limit_hits_multibyte_middle() {
        let text = format!("{}发票{}", "a".repeat(399), "xyz");
        let truncated = truncate_text(&text, 400);

        assert_eq!(truncated.len(), 399);
        assert!(truncated.is_char_boundary(truncated.len()));
    }

    #[test]
    fn build_parse_failure_summary_contains_top_reasons() {
        let mut counts = std::collections::HashMap::new();
        counts.insert("skill-not-mapped: a".to_string(), 5_u64);
        counts.insert("skill-not-mapped: b".to_string(), 3_u64);
        counts.insert("json-parse-failed".to_string(), 2_u64);
        counts.insert("skill-not-mapped: c".to_string(), 1_u64);

        let summary = build_parse_failure_summary(11, &counts);
        assert!(summary.contains("发现 11 条解析异常"));
        assert!(summary.contains("skill-not-mapped: a ×5"));
        assert!(summary.contains("其余 1 类已省略"));
    }
