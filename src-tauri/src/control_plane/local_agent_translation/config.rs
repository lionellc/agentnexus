use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;

use crate::{db::AppState, error::AppError, utils::now_rfc3339};

use super::{
    profile::{ensure_default_profiles, ensure_workspace_exists, profile_by_key},
    validation::{normalize_profile_key, validate_translation_template},
    TranslationConfigDto, TranslationConfigUpdateInput, BUILTIN_CODEX, FORMAT_PRESERVATION_RULE,
};

#[tauri::command]
pub fn translation_config_get(
    state: State<'_, AppState>,
) -> Result<TranslationConfigDto, AppError> {
    let conn = state.open()?;
    let workspace_id = crate::domain::models::APP_SCOPE_ID;
    ensure_workspace_exists(&conn, &workspace_id)?;
    ensure_default_profiles(&conn, &workspace_id)?;
    ensure_default_translation_config(&conn, &workspace_id)?;
    get_translation_config(&conn, &workspace_id)
}

#[tauri::command]
pub fn translation_config_update(
    state: State<'_, AppState>,
    input: TranslationConfigUpdateInput,
) -> Result<TranslationConfigDto, AppError> {
    let conn = state.open()?;
    ensure_workspace_exists(&conn, crate::domain::models::APP_SCOPE_ID)?;
    ensure_default_profiles(&conn, crate::domain::models::APP_SCOPE_ID)?;

    let profile_key = normalize_profile_key(&input.default_profile_key)?;
    validate_translation_template(&input.prompt_template)?;
    profile_by_key(&conn, crate::domain::models::APP_SCOPE_ID, &profile_key)?;

    let now = now_rfc3339();
    conn.execute(
        "INSERT INTO translation_configs(workspace_id, default_profile_key, prompt_template, updated_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(workspace_id) DO UPDATE SET
            default_profile_key = excluded.default_profile_key,
            prompt_template = excluded.prompt_template,
            updated_at = excluded.updated_at",
        params![
            crate::domain::models::APP_SCOPE_ID.to_string(),
            profile_key,
            input.prompt_template.trim(),
            now,
        ],
    )?;

    get_translation_config(&conn, crate::domain::models::APP_SCOPE_ID)
}

fn default_prompt_template() -> String {
    format!(
        "You are a strict translation engine.\nTranslate source text into target language.\n{FORMAT_PRESERVATION_RULE}\nYou MUST output exactly one valid JSON object and nothing else.\nDo not wrap JSON in markdown code fences.\nDo not output explanation text.\n\nTarget language:\n{{target_language}}\n\nSource text:\n{{source_text}}\n\nSchema:\n{{output_schema_json}}"
    )
}

pub(super) fn ensure_default_translation_config(
    conn: &Connection,
    workspace_id: &str,
) -> Result<(), AppError> {
    let now = now_rfc3339();
    conn.execute(
        "INSERT INTO translation_configs(workspace_id, default_profile_key, prompt_template, updated_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(workspace_id) DO NOTHING",
        params![workspace_id, BUILTIN_CODEX, default_prompt_template(), now],
    )?;
    Ok(())
}

pub(super) fn get_translation_config(
    conn: &Connection,
    workspace_id: &str,
) -> Result<TranslationConfigDto, AppError> {
    conn.query_row(
        "SELECT workspace_id, default_profile_key, prompt_template, updated_at
         FROM translation_configs WHERE workspace_id = ?1",
        params![workspace_id],
        |row| {
            Ok(TranslationConfigDto {
                workspace_id: row.get(0)?,
                default_profile_key: row.get(1)?,
                prompt_template: row.get(2)?,
                updated_at: row.get(3)?,
            })
        },
    )
    .optional()?
    .ok_or_else(|| AppError::internal("翻译配置不存在"))
}
