pub(super) const INITIAL_SCHEMA_SQL: &str = r#"
        CREATE TABLE IF NOT EXISTS migration_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            root_path TEXT NOT NULL UNIQUE,
            install_mode TEXT NOT NULL DEFAULT 'copy',
            platform_overrides TEXT NOT NULL DEFAULT '{}',
            active INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS runtime_config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            local_mode INTEGER NOT NULL,
            external_sources_enabled INTEGER NOT NULL,
            experimental_enabled INTEGER NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS agent_doc (
            workspace_id TEXT PRIMARY KEY,
            content TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS agent_doc_versions (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            version TEXT NOT NULL,
            title TEXT NOT NULL,
            notes TEXT NOT NULL,
            content TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            operator TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            UNIQUE(workspace_id, version),
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS distribution_targets (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            platform TEXT NOT NULL,
            target_path TEXT NOT NULL,
            skills_path TEXT NOT NULL,
            install_mode TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(workspace_id, platform),
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS distribution_jobs (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            release_version TEXT NOT NULL,
            mode TEXT NOT NULL,
            status TEXT NOT NULL,
            fallback_enabled INTEGER NOT NULL,
            retry_of_job_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS distribution_records (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            target_id TEXT NOT NULL,
            status TEXT NOT NULL,
            message TEXT NOT NULL,
            expected_hash TEXT NOT NULL,
            actual_hash TEXT NOT NULL,
            used_mode TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(job_id) REFERENCES distribution_jobs(id) ON DELETE CASCADE,
            FOREIGN KEY(target_id) REFERENCES distribution_targets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS skills_assets (
            id TEXT PRIMARY KEY,
            identity TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            version TEXT NOT NULL,
            latest_version TEXT NOT NULL,
            source TEXT NOT NULL,
            local_path TEXT NOT NULL,
            source_local_path TEXT,
            source_is_symlink INTEGER NOT NULL DEFAULT 0,
            update_candidate INTEGER NOT NULL,
            last_used_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS skills_versions (
            id TEXT PRIMARY KEY,
            asset_id TEXT NOT NULL,
            version TEXT NOT NULL,
            source TEXT NOT NULL,
            installed_at TEXT NOT NULL,
            FOREIGN KEY(asset_id) REFERENCES skills_assets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS skills_asset_sources (
            id TEXT PRIMARY KEY,
            asset_id TEXT NOT NULL UNIQUE,
            source_type TEXT NOT NULL DEFAULT 'local',
            source TEXT NOT NULL DEFAULT '',
            source_url TEXT NOT NULL DEFAULT '',
            skill_path TEXT NOT NULL DEFAULT '',
            repo_owner TEXT NOT NULL DEFAULT '',
            repo_name TEXT NOT NULL DEFAULT '',
            repo_ref TEXT NOT NULL DEFAULT '',
            source_local_path TEXT NOT NULL DEFAULT '',
            local_content_hash TEXT NOT NULL DEFAULT '',
            remote_content_hash TEXT NOT NULL DEFAULT '',
            hash_checked_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(asset_id) REFERENCES skills_assets(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_skills_asset_sources_source
            ON skills_asset_sources(source_type, source);

        CREATE TABLE IF NOT EXISTS skills_manager_configs (
            workspace_id TEXT PRIMARY KEY,
            rules_json TEXT NOT NULL DEFAULT '{}',
            group_rules_json TEXT NOT NULL DEFAULT '{}',
            tool_rules_json TEXT NOT NULL DEFAULT '{}',
            manual_unlinks_json TEXT NOT NULL DEFAULT '{}',
            deleted_skills_json TEXT NOT NULL DEFAULT '[]',
            updated_at TEXT NOT NULL,
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS prompts_assets (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            name TEXT NOT NULL,
            tags TEXT NOT NULL,
            category TEXT NOT NULL,
            favorite INTEGER NOT NULL,
            active_version INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(workspace_id, name),
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS prompts_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            asset_id TEXT NOT NULL,
            version INTEGER NOT NULL,
            content TEXT NOT NULL,
            metadata TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(asset_id, version),
            FOREIGN KEY(asset_id) REFERENCES prompts_assets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS local_agent_profiles (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            profile_key TEXT NOT NULL,
            name TEXT NOT NULL,
            executable TEXT NOT NULL,
            args_template TEXT NOT NULL,
            is_builtin INTEGER NOT NULL DEFAULT 0,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(workspace_id, profile_key),
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS translation_configs (
            workspace_id TEXT PRIMARY KEY,
            default_profile_key TEXT NOT NULL,
            prompt_template TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS prompt_translations (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            prompt_id TEXT NOT NULL,
            prompt_version INTEGER NOT NULL,
            target_language TEXT NOT NULL,
            variant_no INTEGER NOT NULL DEFAULT 1,
            variant_label TEXT NOT NULL,
            translated_text TEXT NOT NULL,
            source_text_hash TEXT NOT NULL,
            profile_key TEXT NOT NULL,
            apply_mode TEXT NOT NULL DEFAULT 'immersive',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(workspace_id, prompt_id, prompt_version, target_language, variant_no),
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
            FOREIGN KEY(prompt_id) REFERENCES prompts_assets(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_prompt_translations_lookup
            ON prompt_translations(workspace_id, prompt_id, prompt_version, target_language, updated_at DESC);

        CREATE TABLE IF NOT EXISTS skill_call_facts (
            id TEXT PRIMARY KEY,
            workspace_id TEXT,
            agent TEXT NOT NULL,
            source TEXT NOT NULL,
            source_path TEXT NOT NULL,
            session_id TEXT NOT NULL,
            event_ref TEXT NOT NULL,
            skill_id TEXT NOT NULL,
            skill_identity TEXT NOT NULL,
            skill_name TEXT NOT NULL,
            called_at TEXT NOT NULL,
            result_status TEXT NOT NULL,
            evidence_source TEXT NOT NULL DEFAULT 'observed',
            evidence_kind TEXT NOT NULL DEFAULT 'explicit_use_skill',
            confidence REAL NOT NULL DEFAULT 0,
            raw_ref TEXT NOT NULL,
            dedupe_key TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_skill_call_facts_workspace_skill_called_at
            ON skill_call_facts(workspace_id, skill_id, called_at DESC);

        CREATE INDEX IF NOT EXISTS idx_skill_call_facts_agent_source_called_at
            ON skill_call_facts(agent, source, called_at DESC);

        CREATE TABLE IF NOT EXISTS skill_call_sync_checkpoints (
            id TEXT PRIMARY KEY,
            agent TEXT NOT NULL,
            source_path TEXT NOT NULL,
            byte_offset INTEGER NOT NULL DEFAULT 0,
            file_size INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL,
            UNIQUE(agent, source_path)
        );

        CREATE TABLE IF NOT EXISTS skill_call_parse_failures (
            id TEXT PRIMARY KEY,
            workspace_id TEXT,
            agent TEXT NOT NULL,
            source_path TEXT NOT NULL,
            session_id TEXT,
            line_no INTEGER NOT NULL,
            event_ref TEXT NOT NULL,
            reason TEXT NOT NULL,
            raw_excerpt TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_skill_call_parse_failures_created_at
            ON skill_call_parse_failures(created_at DESC);

        CREATE TABLE IF NOT EXISTS model_call_facts (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            called_at TEXT NOT NULL,
            agent TEXT NOT NULL,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            status TEXT NOT NULL,
            input_tokens INTEGER,
            output_tokens INTEGER,
            total_duration_ms INTEGER,
            first_token_ms INTEGER,
            total_tokens INTEGER NOT NULL DEFAULT 0,
            is_complete INTEGER NOT NULL DEFAULT 0,
            source TEXT NOT NULL,
            source_path TEXT NOT NULL,
            session_id TEXT NOT NULL,
            event_ref TEXT NOT NULL,
            request_id TEXT,
            attempt_key TEXT,
            raw_payload TEXT NOT NULL,
            dedupe_key TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_model_call_facts_workspace_called_at
            ON model_call_facts(workspace_id, called_at DESC);

        CREATE INDEX IF NOT EXISTS idx_model_call_facts_workspace_agent_model_status
            ON model_call_facts(workspace_id, agent, model, status, called_at DESC);

        CREATE TABLE IF NOT EXISTS model_call_source_status (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            source TEXT NOT NULL,
            source_path TEXT NOT NULL,
            status TEXT NOT NULL,
            error_message TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL,
            UNIQUE(workspace_id, source, source_path),
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS model_call_parse_failures (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            source TEXT NOT NULL,
            source_path TEXT NOT NULL,
            reason TEXT NOT NULL,
            raw_excerpt TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_model_call_parse_failures_created_at
            ON model_call_parse_failures(created_at DESC);

        CREATE TABLE IF NOT EXISTS audit_events (
            id TEXT PRIMARY KEY,
            workspace_id TEXT,
            event_type TEXT NOT NULL,
            operator TEXT NOT NULL,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS agent_connections (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            agent_type TEXT NOT NULL,
            root_dir TEXT NOT NULL DEFAULT '',
            rule_file TEXT NOT NULL DEFAULT '',
            root_dir_source TEXT NOT NULL DEFAULT 'inferred',
            rule_file_source TEXT NOT NULL DEFAULT 'inferred',
            detection_status TEXT NOT NULL DEFAULT 'undetected',
            detected_at TEXT,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(workspace_id, agent_type),
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS agent_connection_search_dirs (
            id TEXT PRIMARY KEY,
            connection_id TEXT NOT NULL,
            path TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            priority INTEGER NOT NULL DEFAULT 0,
            source TEXT NOT NULL DEFAULT 'inferred',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(connection_id, path),
            FOREIGN KEY(connection_id) REFERENCES agent_connections(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS global_rule_assets (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            name TEXT NOT NULL,
            latest_version INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(workspace_id, name),
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS global_rule_versions (
            id TEXT PRIMARY KEY,
            asset_id TEXT NOT NULL,
            version INTEGER NOT NULL,
            content TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            operator TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(asset_id, version),
            FOREIGN KEY(asset_id) REFERENCES global_rule_assets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS global_rule_agent_tags (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            agent_type TEXT NOT NULL,
            asset_id TEXT NOT NULL,
            last_applied_version INTEGER NOT NULL,
            last_applied_hash TEXT NOT NULL,
            drift_status TEXT NOT NULL DEFAULT 'unchecked',
            drift_reason TEXT NOT NULL DEFAULT '',
            last_checked_at TEXT,
            updated_at TEXT NOT NULL,
            UNIQUE(workspace_id, agent_type),
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
            FOREIGN KEY(asset_id) REFERENCES global_rule_assets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS global_rule_apply_jobs (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            asset_id TEXT,
            release_version TEXT NOT NULL,
            mode TEXT NOT NULL,
            status TEXT NOT NULL,
            retry_of_job_id TEXT,
            operator TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
            FOREIGN KEY(asset_id) REFERENCES global_rule_assets(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS global_rule_apply_records (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            agent_type TEXT NOT NULL,
            resolved_path TEXT NOT NULL,
            status TEXT NOT NULL,
            message TEXT NOT NULL,
            expected_hash TEXT NOT NULL,
            actual_hash TEXT NOT NULL,
            used_mode TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(job_id) REFERENCES global_rule_apply_jobs(id) ON DELETE CASCADE
        );
"#;
