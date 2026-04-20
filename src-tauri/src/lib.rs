mod control_plane;
mod db;
mod domain;
mod error;
mod execution_plane;
mod security;
mod utils;

use std::io;
use tauri::Manager;

use control_plane::agent_rules_v2::{
    agent_connection_delete, agent_connection_list, agent_connection_preview,
    agent_connection_redetect, agent_connection_restore_defaults, agent_connection_toggle,
    agent_connection_upsert, agent_rule_apply, agent_rule_asset_create, agent_rule_asset_delete,
    agent_rule_asset_list, agent_rule_asset_rename, agent_rule_publish_version, agent_rule_refresh,
    agent_rule_retry, agent_rule_rollback, agent_rule_status, agent_rule_versions,
};
use control_plane::commands::{
    agent_doc_hash, agent_doc_read, agent_doc_save, audit_query, distribution_detect_drift,
    distribution_retry_failed, distribution_run, distribution_status, prompt_create, prompt_delete,
    prompt_list, prompt_render, prompt_restore_version, prompt_search, prompt_update,
    prompt_versions, release_create, release_list, release_rollback, runtime_flags_get,
    runtime_flags_update, security_check_external_source, skills_asset_detail, skills_distribute,
    skills_file_read, skills_files_tree, skills_list, skills_open, skills_scan, skills_uninstall,
    target_delete, target_list, target_upsert, workspace_activate, workspace_create,
    workspace_list, workspace_update,
};
use control_plane::local_agent_translation::{
    local_agent_profile_delete, local_agent_profile_list, local_agent_profile_upsert,
    local_agent_translation_test, prompt_translation_list, prompt_translation_retranslate,
    prompt_translation_run, translation_config_get, translation_config_update,
};
use control_plane::skills_manager::{
    skills_manager_batch_link, skills_manager_batch_unlink, skills_manager_check_external_updates,
    skills_manager_clean, skills_manager_delete, skills_manager_diff_cancel,
    skills_manager_diff_progress, skills_manager_diff_start, skills_manager_link_preview,
    skills_manager_purge, skills_manager_restore, skills_manager_rules_update,
    skills_manager_state, skills_manager_sync, skills_manager_update_then_link,
};
use control_plane::skills_usage::{
    skills_usage_query_calls, skills_usage_query_stats, skills_usage_sync_progress,
    skills_usage_sync_start,
};
use db::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let state =
                AppState::from_app(&app.handle()).map_err(|err| io::Error::other(err.message))?;
            app.manage(state);
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
            }
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            workspace_create,
            workspace_update,
            workspace_activate,
            workspace_list,
            runtime_flags_get,
            runtime_flags_update,
            target_upsert,
            target_delete,
            target_list,
            agent_connection_list,
            agent_connection_upsert,
            agent_connection_toggle,
            agent_connection_delete,
            agent_connection_redetect,
            agent_connection_restore_defaults,
            agent_connection_preview,
            agent_rule_asset_list,
            agent_rule_asset_create,
            agent_rule_asset_delete,
            agent_rule_asset_rename,
            agent_rule_publish_version,
            agent_rule_versions,
            agent_rule_rollback,
            agent_rule_apply,
            agent_rule_status,
            agent_rule_retry,
            agent_rule_refresh,
            agent_doc_read,
            agent_doc_save,
            agent_doc_hash,
            release_create,
            release_list,
            release_rollback,
            distribution_run,
            distribution_status,
            distribution_retry_failed,
            distribution_detect_drift,
            skills_scan,
            skills_list,
            skills_asset_detail,
            skills_files_tree,
            skills_file_read,
            skills_open,
            skills_distribute,
            skills_uninstall,
            skills_manager_state,
            skills_manager_sync,
            skills_manager_clean,
            skills_manager_batch_link,
            skills_manager_batch_unlink,
            skills_manager_delete,
            skills_manager_purge,
            skills_manager_restore,
            skills_manager_rules_update,
            skills_manager_diff_start,
            skills_manager_diff_progress,
            skills_manager_diff_cancel,
            skills_manager_link_preview,
            skills_manager_update_then_link,
            skills_manager_check_external_updates,
            prompt_create,
            prompt_update,
            prompt_delete,
            prompt_list,
            prompt_versions,
            prompt_restore_version,
            prompt_search,
            prompt_render,
            local_agent_profile_list,
            local_agent_profile_upsert,
            local_agent_profile_delete,
            translation_config_get,
            translation_config_update,
            local_agent_translation_test,
            prompt_translation_list,
            prompt_translation_run,
            prompt_translation_retranslate,
            skills_usage_sync_start,
            skills_usage_sync_progress,
            skills_usage_query_stats,
            skills_usage_query_calls,
            audit_query,
            security_check_external_source,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
