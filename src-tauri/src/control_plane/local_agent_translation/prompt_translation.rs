use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use tauri::State;
use uuid::Uuid;

use crate::{
    db::AppState,
    error::AppError,
    utils::{now_rfc3339, sha256_hex},
};

use super::{
    config::{ensure_default_translation_config, get_translation_config},
    executor::{build_translation_payload, execute_translation, new_request_id, StreamSink},
    profile::{
        ensure_default_profiles, ensure_prompt_exists, ensure_workspace_exists, profile_by_key,
    },
    validation::{
        clamp_timeout, json_to_sql_value, normalize_apply_mode, normalize_profile_key,
        normalize_source_text, normalize_strategy, normalize_target_language,
        TranslationConflictStrategy,
    },
    LocalAgentTranslationTestInput, PromptTranslationDto, PromptTranslationListInput,
    PromptTranslationRetranslateInput, PromptTranslationRunInput, DEFAULT_TIMEOUT_SECONDS,
};

#[tauri::command]
pub async fn local_agent_translation_test(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    input: LocalAgentTranslationTestInput,
) -> Result<Value, AppError> {
    let app_state = state.inner().clone();
    let (profile_key, profile, target_language, payload) = {
        let conn = app_state.open()?;
        ensure_workspace_exists(&conn, &input.workspace_id)?;
        ensure_default_profiles(&conn, &input.workspace_id)?;
        ensure_default_translation_config(&conn, &input.workspace_id)?;

        let profile_key = normalize_profile_key(&input.profile_key)?;
        let profile = profile_by_key(&conn, &input.workspace_id, &profile_key)?;
        if !profile.enabled {
            return Err(AppError::new(
                "AGENT_UNAVAILABLE",
                "当前 profile 已禁用，请先启用",
            ));
        }

        let target_language = normalize_target_language(&input.target_language)?;
        let source_text = normalize_source_text(&input.source_text)?;
        let config = get_translation_config(&conn, &input.workspace_id)?;

        let payload =
            build_translation_payload(&config.prompt_template, &source_text, &target_language);
        (profile_key, profile, target_language, payload)
    };
    let request_id = new_request_id(input.request_id.as_deref());
    let stream_sink = StreamSink::new(app, request_id.clone());
    let timeout_seconds = clamp_timeout(input.timeout_seconds.unwrap_or(DEFAULT_TIMEOUT_SECONDS));
    let result = tauri::async_runtime::spawn_blocking(move || {
        execute_translation(
            &profile,
            &payload,
            timeout_seconds,
            &target_language,
            Some(&stream_sink),
        )
    })
    .await
    .map_err(|err| AppError::internal(format!("本地 Agent 执行线程异常: {err}")))??;

    let conn = app_state.open()?;
    append_audit_event(
        &conn,
        Some(&input.workspace_id),
        "local_agent_translation_test",
        "system",
        json!({
            "triggeredAt": now_rfc3339(),
            "profileKey": profile_key,
            "targetLanguage": result.target_language,
            "status": "success"
        }),
    )?;

    Ok(json!({
        "ok": true,
        "requestId": request_id,
        "profileKey": profile_key,
        "targetLanguage": result.target_language,
        "translatedText": result.translated_text,
        "stdoutPreview": result.stdout_preview,
        "stderrPreview": result.stderr_preview,
    }))
}

#[tauri::command]
pub fn prompt_translation_list(
    state: State<'_, AppState>,
    input: PromptTranslationListInput,
) -> Result<Vec<PromptTranslationDto>, AppError> {
    let conn = state.open()?;
    ensure_workspace_exists(&conn, &input.workspace_id)?;
    ensure_prompt_exists(&conn, &input.prompt_id)?;

    let mut sql = String::from(
        "SELECT id, workspace_id, prompt_id, prompt_version, target_language, variant_no, variant_label,
                translated_text, source_text_hash, profile_key, apply_mode, created_at, updated_at
         FROM prompt_translations
         WHERE workspace_id = ?1 AND prompt_id = ?2",
    );

    let mut params_vec: Vec<Value> = vec![
        Value::String(input.workspace_id.clone()),
        Value::String(input.prompt_id.clone()),
    ];

    if let Some(version) = input.prompt_version {
        sql.push_str(" AND prompt_version = ?3");
        params_vec.push(Value::Number(version.into()));
    }

    if let Some(language) = input.target_language.as_ref() {
        let trimmed = language.trim();
        if !trimmed.is_empty() {
            let idx = params_vec.len() + 1;
            sql.push_str(&format!(" AND target_language = ?{idx}"));
            params_vec.push(Value::String(trimmed.to_string()));
        }
    }

    sql.push_str(" ORDER BY updated_at DESC");
    let limit = input.limit.unwrap_or(50).clamp(1, 200);
    let idx = params_vec.len() + 1;
    sql.push_str(&format!(" LIMIT ?{idx}"));
    params_vec.push(Value::Number(limit.into()));

    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query(rusqlite::params_from_iter(
        params_vec.iter().map(json_to_sql_value),
    ))?;

    let mut list = Vec::new();
    while let Some(row) = rows.next()? {
        list.push(prompt_translation_from_row(row)?);
    }

    Ok(list)
}

#[tauri::command]
pub async fn prompt_translation_run(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    input: PromptTranslationRunInput,
) -> Result<Value, AppError> {
    let app_state = state.inner().clone();
    let request_id = new_request_id(input.request_id.as_deref());
    let stream_sink = StreamSink::new(app, request_id);
    let run_input = input.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let conn = app_state.open()?;
        run_prompt_translation(&conn, &run_input, Some(&stream_sink))
    })
    .await
    .map_err(|err| AppError::internal(format!("本地 Agent 执行线程异常: {err}")))??;
    Ok(json!(result))
}

#[tauri::command]
pub fn prompt_translation_retranslate(
    state: State<'_, AppState>,
    input: PromptTranslationRetranslateInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    let base = conn
        .query_row(
            "SELECT prompt_id, prompt_version, target_language
             FROM prompt_translations
             WHERE workspace_id = ?1 AND id = ?2",
            params![input.workspace_id, input.translation_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| AppError::invalid_argument("译文记录不存在"))?;

    let run_input = PromptTranslationRunInput {
        workspace_id: input.workspace_id,
        prompt_id: base.0,
        prompt_version: Some(base.1),
        source_text: input.source_text,
        target_language: base.2,
        profile_key: input.profile_key,
        strategy: input.strategy,
        apply_mode: Some("immersive".to_string()),
        timeout_seconds: input.timeout_seconds,
        request_id: None,
    };

    let result = run_prompt_translation(&conn, &run_input, None)?;
    Ok(json!(result))
}

fn run_prompt_translation(
    conn: &Connection,
    input: &PromptTranslationRunInput,
    stream_sink: Option<&StreamSink>,
) -> Result<PromptTranslationDto, AppError> {
    ensure_workspace_exists(conn, &input.workspace_id)?;
    ensure_default_profiles(conn, &input.workspace_id)?;
    ensure_default_translation_config(conn, &input.workspace_id)?;
    ensure_prompt_exists(conn, &input.prompt_id)?;

    let prompt_version = resolve_prompt_version(conn, &input.prompt_id, input.prompt_version)?;
    let source_text = resolve_source_text(
        conn,
        &input.prompt_id,
        prompt_version,
        input.source_text.as_deref(),
    )?;
    let target_language = normalize_target_language(&input.target_language)?;

    let config = get_translation_config(conn, &input.workspace_id)?;
    let profile_key = if let Some(value) = input.profile_key.as_ref() {
        normalize_profile_key(value)?
    } else {
        config.default_profile_key.clone()
    };
    let profile = profile_by_key(conn, &input.workspace_id, &profile_key)?;
    if !profile.enabled {
        return Err(AppError::new(
            "AGENT_UNAVAILABLE",
            "当前 profile 已禁用，请先启用",
        ));
    }

    let payload =
        build_translation_payload(&config.prompt_template, &source_text, &target_language);
    let timeout_seconds = clamp_timeout(input.timeout_seconds.unwrap_or(DEFAULT_TIMEOUT_SECONDS));
    let execution = execute_translation(
        &profile,
        &payload,
        timeout_seconds,
        &target_language,
        stream_sink,
    )?;

    let strategy = normalize_strategy(input.strategy.as_deref())?;
    let apply_mode = normalize_apply_mode(input.apply_mode.as_deref());

    let existing = list_prompt_translations_by_identity(
        conn,
        &input.workspace_id,
        &input.prompt_id,
        prompt_version,
        &target_language,
    )?;

    if !existing.is_empty() && strategy.is_none() {
        return Err(AppError::new(
            "TRANSLATION_CONFLICT",
            "同版本同语言已存在译文，请选择覆盖或另存新译文",
        ));
    }

    let source_hash = sha256_hex(&source_text);
    let now = now_rfc3339();

    let record = if existing.is_empty() {
        insert_prompt_translation(
            conn,
            PromptTranslationInsert {
                id: Uuid::new_v4().to_string(),
                workspace_id: input.workspace_id.clone(),
                prompt_id: input.prompt_id.clone(),
                prompt_version,
                target_language: target_language.clone(),
                variant_no: 1,
                variant_label: format!("{} · 译文 #1", target_language),
                translated_text: execution.translated_text,
                source_text_hash: source_hash,
                profile_key: profile.profile_key.clone(),
                apply_mode: apply_mode.clone(),
                created_at: now.clone(),
                updated_at: now.clone(),
            },
        )?
    } else {
        match strategy.unwrap_or(TranslationConflictStrategy::SaveAs) {
            TranslationConflictStrategy::Overwrite => {
                let latest = existing
                    .first()
                    .ok_or_else(|| AppError::internal("读取冲突记录失败"))?;
                conn.execute(
                    "UPDATE prompt_translations
                     SET translated_text = ?2,
                         source_text_hash = ?3,
                         profile_key = ?4,
                         apply_mode = ?5,
                         updated_at = ?6
                     WHERE id = ?1",
                    params![
                        latest.id,
                        execution.translated_text,
                        source_hash,
                        profile.profile_key,
                        apply_mode,
                        now,
                    ],
                )?;
                prompt_translation_by_id(conn, &latest.id)?
            }
            TranslationConflictStrategy::SaveAs => {
                let next_variant = existing
                    .iter()
                    .map(|item| item.variant_no)
                    .max()
                    .unwrap_or(0)
                    + 1;
                insert_prompt_translation(
                    conn,
                    PromptTranslationInsert {
                        id: Uuid::new_v4().to_string(),
                        workspace_id: input.workspace_id.clone(),
                        prompt_id: input.prompt_id.clone(),
                        prompt_version,
                        target_language: target_language.clone(),
                        variant_no: next_variant,
                        variant_label: format!("{} · 译文 #{}", target_language, next_variant),
                        translated_text: execution.translated_text,
                        source_text_hash: source_hash,
                        profile_key: profile.profile_key.clone(),
                        apply_mode: apply_mode.clone(),
                        created_at: now.clone(),
                        updated_at: now.clone(),
                    },
                )?
            }
        }
    };

    let event_type = match strategy {
        Some(TranslationConflictStrategy::Overwrite) => "prompt_translation_conflict_overwrite",
        Some(TranslationConflictStrategy::SaveAs) if !existing.is_empty() => {
            "prompt_translation_conflict_save_as"
        }
        _ => "prompt_translation_run",
    };

    append_audit_event(
        conn,
        Some(&input.workspace_id),
        event_type,
        "system",
        json!({
            "triggeredAt": now_rfc3339(),
            "promptId": input.prompt_id,
            "promptVersion": prompt_version,
            "targetLanguage": target_language,
            "agentType": profile.profile_key,
            "status": "success"
        }),
    )?;

    Ok(record)
}

fn resolve_prompt_version(
    conn: &Connection,
    prompt_id: &str,
    provided: Option<i64>,
) -> Result<i64, AppError> {
    if let Some(version) = provided {
        if version <= 0 {
            return Err(AppError::invalid_argument("promptVersion 必须大于 0"));
        }
        let exists: i64 = conn.query_row(
            "SELECT COUNT(1) FROM prompts_versions WHERE asset_id = ?1 AND version = ?2",
            params![prompt_id, version],
            |row| row.get(0),
        )?;
        if exists == 0 {
            return Err(AppError::invalid_argument("指定的 promptVersion 不存在"));
        }
        return Ok(version);
    }

    conn.query_row(
        "SELECT active_version FROM prompts_assets WHERE id = ?1",
        params![prompt_id],
        |row| row.get::<_, i64>(0),
    )
    .optional()?
    .ok_or_else(|| AppError::invalid_argument("prompt 不存在"))
}

fn resolve_source_text(
    conn: &Connection,
    prompt_id: &str,
    prompt_version: i64,
    provided: Option<&str>,
) -> Result<String, AppError> {
    if let Some(source_text) = provided {
        if !source_text.trim().is_empty() {
            return Ok(source_text.to_string());
        }
    }

    conn.query_row(
        "SELECT content FROM prompts_versions WHERE asset_id = ?1 AND version = ?2",
        params![prompt_id, prompt_version],
        |row| row.get::<_, String>(0),
    )
    .optional()?
    .ok_or_else(|| AppError::invalid_argument("无法读取指定版本原文"))
}

fn insert_prompt_translation(
    conn: &Connection,
    input: PromptTranslationInsert,
) -> Result<PromptTranslationDto, AppError> {
    conn.execute(
        "INSERT INTO prompt_translations(
            id, workspace_id, prompt_id, prompt_version, target_language, variant_no, variant_label,
            translated_text, source_text_hash, profile_key, apply_mode, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            input.id,
            input.workspace_id,
            input.prompt_id,
            input.prompt_version,
            input.target_language,
            input.variant_no,
            input.variant_label,
            input.translated_text,
            input.source_text_hash,
            input.profile_key,
            input.apply_mode,
            input.created_at,
            input.updated_at,
        ],
    )?;

    prompt_translation_by_id(conn, &input.id)
}

fn prompt_translation_by_id(conn: &Connection, id: &str) -> Result<PromptTranslationDto, AppError> {
    conn.query_row(
        "SELECT id, workspace_id, prompt_id, prompt_version, target_language, variant_no, variant_label,
                translated_text, source_text_hash, profile_key, apply_mode, created_at, updated_at
         FROM prompt_translations
         WHERE id = ?1",
        params![id],
        prompt_translation_from_row,
    )
    .optional()?
    .ok_or_else(|| AppError::internal("译文记录不存在"))
}

fn list_prompt_translations_by_identity(
    conn: &Connection,
    workspace_id: &str,
    prompt_id: &str,
    prompt_version: i64,
    target_language: &str,
) -> Result<Vec<PromptTranslationDto>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, prompt_id, prompt_version, target_language, variant_no, variant_label,
                translated_text, source_text_hash, profile_key, apply_mode, created_at, updated_at
         FROM prompt_translations
         WHERE workspace_id = ?1 AND prompt_id = ?2 AND prompt_version = ?3 AND target_language = ?4
         ORDER BY updated_at DESC",
    )?;

    let rows = stmt.query_map(
        params![workspace_id, prompt_id, prompt_version, target_language],
        prompt_translation_from_row,
    )?;

    let mut list = Vec::new();
    for row in rows {
        list.push(row?);
    }

    Ok(list)
}

fn prompt_translation_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<PromptTranslationDto> {
    Ok(PromptTranslationDto {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        prompt_id: row.get(2)?,
        prompt_version: row.get(3)?,
        target_language: row.get(4)?,
        variant_no: row.get(5)?,
        variant_label: row.get(6)?,
        translated_text: row.get(7)?,
        source_text_hash: row.get(8)?,
        profile_key: row.get(9)?,
        apply_mode: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

struct PromptTranslationInsert {
    id: String,
    workspace_id: String,
    prompt_id: String,
    prompt_version: i64,
    target_language: String,
    variant_no: i64,
    variant_label: String,
    translated_text: String,
    source_text_hash: String,
    profile_key: String,
    apply_mode: String,
    created_at: String,
    updated_at: String,
}

fn append_audit_event(
    conn: &Connection,
    workspace_id: Option<&str>,
    event_type: &str,
    operator: &str,
    payload: Value,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO audit_events(id, workspace_id, event_type, operator, payload, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            Uuid::new_v4().to_string(),
            workspace_id,
            event_type,
            operator,
            payload.to_string(),
            now_rfc3339(),
        ],
    )?;

    Ok(())
}
