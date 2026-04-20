    use std::fs;

    use crate::execution_plane::skills::DiscoveredSkill;

    use super::{
        build_skill_source_candidate_paths, dedupe_skills, derive_skill_source_parent,
        detect_skill_source_symlink, detect_skill_source_symlink_by_name,
        ingest_skill_into_workspace_storage, is_path_under_root, normalize_fs_path,
        resolve_skill_display_source_path,
    };

    #[test]
    fn derive_skill_source_parent_prefers_source_basename() {
        assert_eq!(derive_skill_source_parent("/Users/liuc/.codex"), ".codex");
        assert_eq!(derive_skill_source_parent("/Users/liuc/.claude"), ".claude");
        assert_eq!(
            derive_skill_source_parent("/Users/liuc/.codex/skills"),
            ".codex"
        );
        assert_eq!(
            derive_skill_source_parent("/Users/liuc/.claude/skills"),
            ".claude"
        );
    }

    #[test]
    fn derive_skill_source_parent_falls_back_to_unknown() {
        assert_eq!(derive_skill_source_parent(""), "unknown");
    }

    #[test]
    fn ingest_skill_into_workspace_storage_writes_under_workspace_skills_and_overrides() {
        let workspace = tempfile::tempdir().expect("workspace tempdir");
        let external = tempfile::tempdir().expect("external tempdir");
        let external_skill = external.path().join("demo-skill");
        fs::create_dir_all(external_skill.join("nested")).expect("create external skill");
        fs::write(external_skill.join("SKILL.md"), "version: \"1.0.0\"\n").expect("write skill");
        fs::write(external_skill.join("nested/info.txt"), "v1").expect("write nested");

        let managed_root = workspace.path().join("skills");
        fs::create_dir_all(&managed_root).expect("create managed root");

        let discovered = DiscoveredSkill {
            identity: "demo-skill".to_string(),
            name: "demo-skill".to_string(),
            version: "1.0.0".to_string(),
            source: external.path().to_string_lossy().to_string(),
            local_path: external_skill.to_string_lossy().to_string(),
        };

        let managed_path =
            ingest_skill_into_workspace_storage(&discovered, &managed_root).expect("ingest first");
        let managed_skill = workspace.path().join("skills").join("demo-skill");
        assert_eq!(
            managed_skill,
            std::path::PathBuf::from(managed_path.clone())
        );
        assert_eq!(
            fs::read_to_string(managed_skill.join("nested/info.txt")).expect("read managed file"),
            "v1"
        );

        fs::write(external_skill.join("nested/info.txt"), "v2").expect("update external");
        let managed_path_2 =
            ingest_skill_into_workspace_storage(&discovered, &managed_root).expect("ingest second");
        assert_eq!(managed_path, managed_path_2);
        assert_eq!(
            fs::read_to_string(managed_skill.join("nested/info.txt")).expect("read managed file"),
            "v2"
        );
    }

    #[test]
    fn is_path_under_root_identifies_workspace_managed_skills() {
        let workspace = tempfile::tempdir().expect("workspace tempdir");
        let managed_root = workspace.path().join("skills");
        let managed_skill = managed_root.join("demo-skill");
        let external_skill = workspace.path().join("external").join("demo-skill");
        fs::create_dir_all(&managed_skill).expect("create managed skill");
        fs::create_dir_all(&external_skill).expect("create external skill");

        let normalized_root = normalize_fs_path(&managed_root);
        assert!(is_path_under_root(&managed_skill, &normalized_root));
        assert!(!is_path_under_root(&external_skill, &normalized_root));
    }

    #[test]
    fn dedupe_skills_prefers_codex_when_versions_equal() {
        let codex_skill = DiscoveredSkill {
            identity: "aaaaaaa1".to_string(),
            name: "aaaaaaa1".to_string(),
            version: "0.0.0".to_string(),
            source: "/Users/liuc/.codex".to_string(),
            local_path: "/Users/liuc/.codex/skills/aaaaaaa1".to_string(),
        };
        let claude_skill = DiscoveredSkill {
            identity: "aaaaaaa1".to_string(),
            name: "aaaaaaa1".to_string(),
            version: "0.0.0".to_string(),
            source: "/Users/liuc/.claude".to_string(),
            local_path: "/Users/liuc/.claude/skills/aaaaaaa1".to_string(),
        };

        let deduped = dedupe_skills(vec![claude_skill, codex_skill]);
        assert_eq!(deduped.len(), 1);
        assert_eq!(deduped[0].source, "/Users/liuc/.codex");
        assert_eq!(deduped[0].local_path, "/Users/liuc/.codex/skills/aaaaaaa1");
    }

    #[cfg(unix)]
    #[test]
    fn detect_skill_source_symlink_identifies_symlink_skill_dir() {
        let workspace = tempfile::tempdir().expect("workspace tempdir");
        let source_root = workspace.path().join(".claude");
        let skills_root = source_root.join("skills");
        let target = workspace.path().join("real-skill");
        std::fs::create_dir_all(&skills_root).expect("create skills root");
        std::fs::create_dir_all(&target).expect("create target");

        let link_path = skills_root.join("aaaaaaa1");
        std::os::unix::fs::symlink(&target, &link_path).expect("create symlink");

        assert!(detect_skill_source_symlink(
            &link_path.to_string_lossy(),
            &source_root.to_string_lossy()
        ));
    }

    #[cfg(unix)]
    #[test]
    fn detect_skill_source_symlink_by_name_identifies_skills_link() {
        let workspace = tempfile::tempdir().expect("workspace tempdir");
        let source_root = workspace.path().join(".claude");
        let skills_root = source_root.join("skills");
        let target = workspace.path().join("real-skill");
        std::fs::create_dir_all(&skills_root).expect("create skills root");
        std::fs::create_dir_all(&target).expect("create target");

        let link_path = skills_root.join("aaaaaaa1");
        std::os::unix::fs::symlink(&target, &link_path).expect("create symlink");

        assert!(detect_skill_source_symlink_by_name(
            &source_root.to_string_lossy(),
            "aaaaaaa1"
        ));
    }

    #[test]
    fn build_skill_source_candidate_paths_supports_source_root_and_skills_root() {
        let from_codex = build_skill_source_candidate_paths("/Users/liuc/.codex", "demo");
        assert_eq!(
            from_codex
                .iter()
                .map(|item| item.to_string_lossy().to_string())
                .collect::<Vec<_>>(),
            vec![
                "/Users/liuc/.codex/skills/demo".to_string(),
                "/Users/liuc/.codex/demo".to_string(),
            ]
        );

        let from_skills = build_skill_source_candidate_paths("/Users/liuc/.codex/skills", "demo");
        assert_eq!(
            from_skills
                .iter()
                .map(|item| item.to_string_lossy().to_string())
                .collect::<Vec<_>>(),
            vec!["/Users/liuc/.codex/skills/demo".to_string()]
        );
    }

    #[cfg(unix)]
    #[test]
    fn resolve_skill_display_source_path_prefers_existing_source_candidate() {
        let workspace = tempfile::tempdir().expect("workspace tempdir");
        let source_root = workspace.path().join(".codex");
        let skills_root = source_root.join("skills");
        let target = workspace.path().join("real-skill");
        std::fs::create_dir_all(&skills_root).expect("create skills root");
        std::fs::create_dir_all(&target).expect("create target");

        let link_path = skills_root.join("aaaaaaa1");
        std::os::unix::fs::symlink(&target, &link_path).expect("create symlink");

        let resolved = resolve_skill_display_source_path(
            &source_root.to_string_lossy(),
            "aaaaaaa1",
            "/tmp/fallback",
        );
        assert_eq!(resolved, link_path.to_string_lossy());
    }
