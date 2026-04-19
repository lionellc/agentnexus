    use std::{
        collections::{HashMap, HashSet},
        fs,
        path::PathBuf,
    };

    use crate::domain::models::SkillsManagerBatchItemInput;

    use super::{
        build_link_preview, collect_skill_files, compare_skill_file_pair, compute_status,
        is_allowed, replace_source_skill_from_target, run_single_batch_item, sanitize_rule_map,
        SkillRuntime, SkillsManagerConfig, SkillsManagerRuleValue, SkillsManagerToolRuleValue,
        ToolTarget, STATUS_LINKED, STATUS_MISSING,
    };

    fn build_rule(only: Option<Vec<&str>>, exclude: Option<Vec<&str>>) -> SkillsManagerRuleValue {
        SkillsManagerRuleValue {
            only: only.map(|items| items.into_iter().map(str::to_string).collect()),
            exclude: exclude.map(|items| items.into_iter().map(str::to_string).collect()),
        }
    }

    #[test]
    fn tool_rule_block_all_honors_allow_and_allow_groups() {
        let rules = HashMap::new();
        let group_rules = HashMap::new();
        let mut tool_rules = HashMap::new();
        tool_rules.insert(
            "codex".to_string(),
            SkillsManagerToolRuleValue {
                block_all: Some(true),
                allow: Some(vec!["core-skill".to_string()]),
                allow_groups: Some(vec!["platform".to_string()]),
            },
        );

        assert!(is_allowed(
            "core-skill",
            "codex",
            "other",
            &tool_rules,
            &group_rules,
            &rules
        ));
        assert!(is_allowed(
            "unknown",
            "codex",
            "platform",
            &tool_rules,
            &group_rules,
            &rules
        ));
        assert!(!is_allowed(
            "unknown",
            "codex",
            "other",
            &tool_rules,
            &group_rules,
            &rules
        ));
    }

    #[test]
    fn group_rule_takes_precedence_before_skill_rule() {
        let rules = HashMap::new();

        let mut group_rules = HashMap::new();
        group_rules.insert(
            "platform".to_string(),
            build_rule(Some(vec!["claude"]), None),
        );

        let tool_rules = HashMap::new();
        assert!(!is_allowed(
            "skill-a",
            "codex",
            "platform",
            &tool_rules,
            &group_rules,
            &rules
        ));
        assert!(is_allowed(
            "skill-b",
            "claude",
            "platform",
            &tool_rules,
            &group_rules,
            &rules
        ));
    }

    #[test]
    fn sanitize_rule_map_rejects_conflicting_rule() {
        let mut incoming = HashMap::new();
        incoming.insert(
            "x".to_string(),
            build_rule(Some(vec!["codex"]), Some(vec!["claude"])),
        );

        let result = sanitize_rule_map(incoming);
        assert!(result.is_err());
    }

    #[test]
    fn compare_skill_file_pair_identifies_added_removed_and_changed() {
        let temp = tempfile::tempdir().expect("temp dir");
        let left_file = temp.path().join("left.md");
        let right_file = temp.path().join("right.md");
        fs::write(&left_file, "left").expect("write left");
        fs::write(&right_file, "right").expect("write right");

        let changed =
            compare_skill_file_pair(Some(&left_file), Some(&right_file), "x.md").expect("compare");
        assert!(changed.is_some());
        assert_eq!(changed.expect("changed").status, "changed");

        let removed = compare_skill_file_pair(Some(&left_file), None, "x.md").expect("compare");
        assert_eq!(removed.expect("removed").status, "removed");

        let added = compare_skill_file_pair(None, Some(&right_file), "x.md").expect("compare");
        assert_eq!(added.expect("added").status, "added");
    }

    #[test]
    fn collect_skill_files_returns_relative_paths() {
        let temp = tempfile::tempdir().expect("temp dir");
        let nested = temp.path().join("sub");
        fs::create_dir_all(&nested).expect("create nested");
        fs::write(nested.join("SKILL.md"), "version: 1.0.0").expect("write");

        let files = collect_skill_files(temp.path()).expect("collect");
        assert!(files.contains_key("sub/SKILL.md"));
    }

    #[test]
    fn build_link_preview_requires_confirm_when_target_differs() {
        let workspace = tempfile::tempdir().expect("workspace");
        let source_skill = workspace.path().join("source").join("demo-skill");
        let target_skill = workspace
            .path()
            .join("targets")
            .join("skills")
            .join("demo-skill");
        fs::create_dir_all(&source_skill).expect("create source");
        fs::create_dir_all(&target_skill).expect("create target");
        fs::write(source_skill.join("SKILL.md"), "version: 1.0.0\nsource").expect("write source");
        fs::write(target_skill.join("SKILL.md"), "version: 1.0.0\ntarget").expect("write target");

        let skill = SkillRuntime {
            id: "s1".to_string(),
            name: "demo-skill".to_string(),
            source: workspace
                .path()
                .join("source")
                .to_string_lossy()
                .to_string(),
            local_path: PathBuf::from(&source_skill),
            group: "source".to_string(),
        };
        let tool = ToolTarget {
            id: "t1".to_string(),
            platform: "codex".to_string(),
            skills_path: workspace
                .path()
                .join("targets")
                .join("skills")
                .to_string_lossy()
                .to_string(),
            install_mode: "symlink".to_string(),
        };
        let config = SkillsManagerConfig::default();

        let preview = build_link_preview(workspace.path(), "w1", &skill, &tool, &config, 16)
            .expect("build preview");

        assert!(preview.can_link);
        assert!(preview.requires_confirm);
        assert!(preview.diff_files > 0);
        assert_eq!(preview.target_kind, "directory");
    }

    #[test]
    fn replace_source_skill_from_target_overwrites_source_content() {
        let workspace = tempfile::tempdir().expect("workspace");
        let source_skill = workspace.path().join("source").join("demo-skill");
        let target_skill = workspace.path().join("target").join("demo-skill");
        fs::create_dir_all(&source_skill).expect("create source");
        fs::create_dir_all(&target_skill).expect("create target");
        fs::write(source_skill.join("SKILL.md"), "source").expect("write source");
        fs::write(target_skill.join("SKILL.md"), "target").expect("write target");

        let updated =
            replace_source_skill_from_target(&source_skill, &target_skill).expect("replace source");
        assert!(updated);
        assert_eq!(
            fs::read_to_string(source_skill.join("SKILL.md")).expect("read source"),
            "target"
        );
    }

    #[test]
    fn replace_source_skill_from_target_returns_false_when_paths_same() {
        let workspace = tempfile::tempdir().expect("workspace");
        let source_skill = workspace.path().join("source").join("demo-skill");
        fs::create_dir_all(&source_skill).expect("create source");
        fs::write(source_skill.join("SKILL.md"), "source").expect("write source");

        let updated =
            replace_source_skill_from_target(&source_skill, &source_skill).expect("replace source");
        assert!(!updated);
        assert_eq!(
            fs::read_to_string(source_skill.join("SKILL.md")).expect("read source"),
            "source"
        );
    }

    #[test]
    fn run_single_batch_item_copy_mode_link_creates_directory_copy() {
        let workspace = tempfile::tempdir().expect("workspace");
        let source_skill = workspace.path().join("source").join("demo-skill");
        fs::create_dir_all(&source_skill).expect("create source");
        fs::write(source_skill.join("SKILL.md"), "version: 1.0.0").expect("write source");

        let skill = SkillRuntime {
            id: "s1".to_string(),
            name: "demo-skill".to_string(),
            source: workspace
                .path()
                .join("source")
                .to_string_lossy()
                .to_string(),
            local_path: source_skill.clone(),
            group: "source".to_string(),
        };
        let tool = ToolTarget {
            id: "t1".to_string(),
            platform: "codex".to_string(),
            skills_path: workspace
                .path()
                .join("targets")
                .join("skills")
                .to_string_lossy()
                .to_string(),
            install_mode: "copy".to_string(),
        };

        let mut skill_map = HashMap::new();
        skill_map.insert(skill.id.clone(), skill.clone());
        let mut tool_map = HashMap::new();
        tool_map.insert(tool.platform.clone(), tool);
        let mut config = SkillsManagerConfig::default();
        let deleted = HashSet::new();
        let item = SkillsManagerBatchItemInput {
            skill_id: skill.id.clone(),
            tool: "codex".to_string(),
            force: Some(true),
        };

        let result = run_single_batch_item(
            workspace.path(),
            &item,
            &skill_map,
            &tool_map,
            &mut config,
            &deleted,
            true,
        );
        assert!(result.ok, "{}", result.message);

        let target = workspace
            .path()
            .join("targets")
            .join("skills")
            .join("demo-skill");
        let metadata = fs::symlink_metadata(&target).expect("target metadata");
        assert!(metadata.is_dir());
        assert!(!metadata.file_type().is_symlink());
        assert_eq!(
            fs::read_to_string(target.join("SKILL.md")).expect("read target"),
            "version: 1.0.0"
        );
    }

    #[test]
    fn compute_status_copy_mode_returns_linked_when_directory_matches_source() {
        let workspace = tempfile::tempdir().expect("workspace");
        let source_skill = workspace.path().join("source").join("demo-skill");
        let target_skill = workspace
            .path()
            .join("targets")
            .join("skills")
            .join("demo-skill");
        fs::create_dir_all(&source_skill).expect("create source");
        fs::create_dir_all(&target_skill).expect("create target");
        fs::write(source_skill.join("SKILL.md"), "version: 1.0.0\nsource").expect("write source");
        fs::write(target_skill.join("SKILL.md"), "version: 1.0.0\nsource").expect("write target");

        let skill = SkillRuntime {
            id: "s1".to_string(),
            name: "demo-skill".to_string(),
            source: workspace
                .path()
                .join("source")
                .to_string_lossy()
                .to_string(),
            local_path: source_skill,
            group: "source".to_string(),
        };

        let tool = ToolTarget {
            id: "t1".to_string(),
            platform: "codex".to_string(),
            skills_path: workspace
                .path()
                .join("targets")
                .join("skills")
                .to_string_lossy()
                .to_string(),
            install_mode: "copy".to_string(),
        };

        let config = SkillsManagerConfig::default();
        let status = compute_status(workspace.path(), &skill, &tool, &config);
        assert_eq!(status, STATUS_LINKED);
    }

    #[test]
    fn compute_status_returns_missing_when_manual_unlink_and_target_absent() {
        let workspace = tempfile::tempdir().expect("workspace");
        let source_skill = workspace.path().join("source").join("demo-skill");
        fs::create_dir_all(&source_skill).expect("create source");

        let skill = SkillRuntime {
            id: "s1".to_string(),
            name: "demo-skill".to_string(),
            source: workspace
                .path()
                .join("source")
                .to_string_lossy()
                .to_string(),
            local_path: source_skill,
            group: "source".to_string(),
        };

        let tool = ToolTarget {
            id: "t1".to_string(),
            platform: "codex".to_string(),
            skills_path: "targets/skills".to_string(),
            install_mode: "symlink".to_string(),
        };

        let mut config = SkillsManagerConfig::default();
        config
            .manual_unlinks
            .insert("demo-skill".to_string(), vec!["codex".to_string()]);

        let status = compute_status(workspace.path(), &skill, &tool, &config);
        assert_eq!(status, STATUS_MISSING);
    }
