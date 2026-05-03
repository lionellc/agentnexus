use std::collections::HashSet;

use rusqlite::{params, OptionalExtension};
use serde_json::{json, Value};
use tauri::State;
use uuid::Uuid;

use crate::{
    db::AppState,
    domain::models::{
        PromptCreateInput, PromptDeleteInput, PromptRenderInput, PromptRestoreInput,
        PromptSearchInput, PromptUpdateInput,
    },
    error::AppError,
    utils::{now_rfc3339, render_template},
};

use super::shared::{bool_to_int, get_workspace};

#[tauri::command]
pub fn prompt_create(
    state: State<'_, AppState>,
    input: PromptCreateInput,
) -> Result<Value, AppError> {
    let mut conn = state.open()?;
    let tx = conn.transaction()?;

    get_workspace(&tx, crate::domain::models::APP_SCOPE_ID)?;

    let now = now_rfc3339();
    let prompt_id = Uuid::new_v4().to_string();
    let tags = input.tags.unwrap_or_default();
    let category = input.category.unwrap_or_else(|| "default".to_string());
    let favorite = input.favorite.unwrap_or(false);

    tx.execute(
        "INSERT INTO prompts_assets(id, workspace_id, name, tags, category, favorite, active_version, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8)",
        params![
            prompt_id,
            crate::domain::models::APP_SCOPE_ID.to_string(),
            input.name,
            serde_json::to_string(&tags).map_err(|err| AppError::internal(err.to_string()))?,
            category,
            bool_to_int(favorite),
            now,
            now,
        ],
    )?;

    tx.execute(
        "INSERT INTO prompts_versions(asset_id, version, content, metadata, created_at)
         VALUES (?1, 1, ?2, ?3, ?4)",
        params![
            prompt_id,
            input.content,
            json!({"action": "create"}).to_string(),
            now,
        ],
    )?;

    tx.commit()?;
    get_prompt_with_active_content(&conn, &prompt_id)
}

#[tauri::command]
pub fn prompt_update(
    state: State<'_, AppState>,
    input: PromptUpdateInput,
) -> Result<Value, AppError> {
    let mut conn = state.open()?;
    let tx = conn.transaction()?;

    let prompt = get_prompt_asset_row(&tx, &input.prompt_id)?;
    let current_content: String = tx.query_row(
        "SELECT content FROM prompts_versions WHERE asset_id = ?1 AND version = ?2",
        params![prompt.id, prompt.active_version],
        |row| row.get(0),
    )?;
    let content_changed = current_content != input.content;
    let next_version = if content_changed {
        prompt.active_version + 1
    } else {
        prompt.active_version
    };
    let name = input.name.map(|item| item.trim().to_string());
    if let Some(candidate) = name.as_ref() {
        if candidate.is_empty() {
            return Err(AppError::invalid_argument("prompt 标题不能为空"));
        }
    }
    let tags = input.tags.unwrap_or(prompt.tags.clone());
    let category = input.category.unwrap_or(prompt.category.clone());
    let favorite = input.favorite.unwrap_or(prompt.favorite);
    let now = now_rfc3339();

    if content_changed {
        tx.execute(
            "INSERT INTO prompts_versions(asset_id, version, content, metadata, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                prompt.id,
                next_version,
                input.content,
                json!({"action": "update"}).to_string(),
                now,
            ],
        )?;
    }

    tx.execute(
        "UPDATE prompts_assets
         SET name = COALESCE(?2, name), tags = ?3, category = ?4, favorite = ?5, active_version = ?6, updated_at = ?7
         WHERE id = ?1",
        params![
            prompt.id,
            name,
            serde_json::to_string(&tags).map_err(|err| AppError::internal(err.to_string()))?,
            category,
            bool_to_int(favorite),
            next_version,
            now,
        ],
    )?;

    tx.commit()?;
    get_prompt_with_active_content(&conn, &input.prompt_id)
}

#[tauri::command]
pub fn prompt_delete(
    state: State<'_, AppState>,
    input: PromptDeleteInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    let affected = conn.execute(
        "DELETE FROM prompts_assets WHERE id = ?1",
        params![input.prompt_id],
    )?;

    if affected == 0 {
        return Err(AppError::invalid_argument("prompt 不存在"));
    }

    Ok(json!({ "deleted": true }))
}

#[tauri::command]
pub fn prompt_list(state: State<'_, AppState>) -> Result<Vec<Value>, AppError> {
    let conn = state.open()?;
    let workspace_id = crate::domain::models::APP_SCOPE_ID;
    get_workspace(&conn, &workspace_id)?;

    let mut stmt = conn.prepare(
        "SELECT p.id, p.workspace_id, p.name, p.tags, p.category, p.favorite, p.active_version, p.created_at, p.updated_at, v.content
         FROM prompts_assets p
         JOIN prompts_versions v ON v.asset_id = p.id AND v.version = p.active_version
         WHERE p.workspace_id = ?1
         ORDER BY p.updated_at DESC",
    )?;

    let rows = stmt.query_map(params![workspace_id], |row| {
        let tags_raw: String = row.get(3)?;
        let tags: Vec<String> = serde_json::from_str(&tags_raw).unwrap_or_default();

        Ok(json!({
            "id": row.get::<_, String>(0)?,
            "workspaceId": row.get::<_, String>(1)?,
            "name": row.get::<_, String>(2)?,
            "tags": tags,
            "category": row.get::<_, String>(4)?,
            "favorite": row.get::<_, i64>(5)? == 1,
            "activeVersion": row.get::<_, i64>(6)?,
            "createdAt": row.get::<_, String>(7)?,
            "updatedAt": row.get::<_, String>(8)?,
            "content": row.get::<_, String>(9)?,
        }))
    })?;

    let mut list = Vec::new();
    for row in rows {
        list.push(row?);
    }

    Ok(list)
}

#[tauri::command]
pub fn prompt_versions(
    state: State<'_, AppState>,
    prompt_id: String,
) -> Result<Vec<Value>, AppError> {
    let conn = state.open()?;
    get_prompt_asset_row(&conn, &prompt_id)?;

    let mut stmt = conn.prepare(
        "SELECT version, content, metadata, created_at
         FROM prompts_versions
         WHERE asset_id = ?1
         ORDER BY version DESC",
    )?;

    let rows = stmt.query_map(params![prompt_id], |row| {
        let metadata_raw: String = row.get(2)?;
        let metadata =
            serde_json::from_str::<Value>(&metadata_raw).unwrap_or(Value::String(metadata_raw));

        Ok(json!({
            "version": row.get::<_, i64>(0)?,
            "content": row.get::<_, String>(1)?,
            "metadata": metadata,
            "createdAt": row.get::<_, String>(3)?,
        }))
    })?;

    let mut list = Vec::new();
    for row in rows {
        list.push(row?);
    }

    Ok(list)
}

#[tauri::command]
pub fn prompt_restore_version(
    state: State<'_, AppState>,
    input: PromptRestoreInput,
) -> Result<Value, AppError> {
    let mut conn = state.open()?;
    let tx = conn.transaction()?;

    let prompt = get_prompt_asset_row(&tx, &input.prompt_id)?;
    let restored_content = tx
        .query_row(
            "SELECT content FROM prompts_versions WHERE asset_id = ?1 AND version = ?2",
            params![input.prompt_id, input.version],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .ok_or_else(|| AppError::invalid_argument("指定版本不存在"))?;

    let next_version = prompt.active_version + 1;
    let now = now_rfc3339();

    tx.execute(
        "INSERT INTO prompts_versions(asset_id, version, content, metadata, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            prompt.id,
            next_version,
            restored_content,
            json!({"action": "restore", "fromVersion": input.version}).to_string(),
            now,
        ],
    )?;

    tx.execute(
        "UPDATE prompts_assets SET active_version = ?2, updated_at = ?3 WHERE id = ?1",
        params![prompt.id, next_version, now],
    )?;

    tx.commit()?;
    get_prompt_with_active_content(&conn, &input.prompt_id)
}

#[tauri::command]
pub fn prompt_search(
    state: State<'_, AppState>,
    input: PromptSearchInput,
) -> Result<Vec<Value>, AppError> {
    let list = prompt_list(state)?;

    let keyword = input.keyword.unwrap_or_default().to_lowercase();
    let category = input.category.unwrap_or_default();
    let tag_filter: HashSet<String> = input
        .tags
        .unwrap_or_default()
        .into_iter()
        .map(|item| item.to_lowercase())
        .collect();

    let mut filtered = Vec::new();
    for item in list {
        let matches_keyword = if keyword.is_empty() {
            true
        } else {
            let name = item
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_lowercase();
            let content = item
                .get("content")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_lowercase();
            name.contains(&keyword) || content.contains(&keyword)
        };

        if !matches_keyword {
            continue;
        }

        if !category.is_empty()
            && item
                .get("category")
                .and_then(Value::as_str)
                .unwrap_or_default()
                != category
        {
            continue;
        }

        if let Some(favorite_filter) = input.favorite {
            let favorite = item
                .get("favorite")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            if favorite != favorite_filter {
                continue;
            }
        }

        if !tag_filter.is_empty() {
            let tags = item
                .get("tags")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();

            let present: HashSet<String> = tags
                .iter()
                .filter_map(|entry| entry.as_str().map(|item| item.to_lowercase()))
                .collect();

            if !tag_filter.iter().all(|tag| present.contains(tag)) {
                continue;
            }
        }

        filtered.push(item);
    }

    Ok(filtered)
}

#[tauri::command]
pub fn prompt_render(
    state: State<'_, AppState>,
    input: PromptRenderInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;

    let content = conn
        .query_row(
            "SELECT v.content
             FROM prompts_assets p
             JOIN prompts_versions v ON v.asset_id = p.id AND v.version = p.active_version
             WHERE p.id = ?1",
            params![input.prompt_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .ok_or_else(|| AppError::invalid_argument("prompt 不存在"))?;

    let rendered = render_template(&content, &input.variables);
    Ok(json!({ "rendered": rendered }))
}

struct PromptAssetRow {
    id: String,
    tags: Vec<String>,
    category: String,
    favorite: bool,
    active_version: i64,
}

fn get_prompt_asset_row(
    conn: &rusqlite::Connection,
    prompt_id: &str,
) -> Result<PromptAssetRow, AppError> {
    conn.query_row(
        "SELECT id, tags, category, favorite, active_version
         FROM prompts_assets
         WHERE id = ?1",
        params![prompt_id],
        |row| {
            let tags_raw: String = row.get(1)?;
            let tags = serde_json::from_str(&tags_raw).unwrap_or_default();
            Ok(PromptAssetRow {
                id: row.get(0)?,
                tags,
                category: row.get(2)?,
                favorite: row.get::<_, i64>(3)? == 1,
                active_version: row.get(4)?,
            })
        },
    )
    .optional()?
    .ok_or_else(|| AppError::invalid_argument("prompt 不存在"))
}

fn get_prompt_with_active_content(
    conn: &rusqlite::Connection,
    prompt_id: &str,
) -> Result<Value, AppError> {
    conn.query_row(
        "SELECT p.id, p.workspace_id, p.name, p.tags, p.category, p.favorite, p.active_version, p.created_at, p.updated_at, v.content
         FROM prompts_assets p
         JOIN prompts_versions v ON v.asset_id = p.id AND v.version = p.active_version
         WHERE p.id = ?1",
        params![prompt_id],
        |row| {
            let tags_raw: String = row.get(3)?;
            let tags: Vec<String> = serde_json::from_str(&tags_raw).unwrap_or_default();
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "workspaceId": row.get::<_, String>(1)?,
                "name": row.get::<_, String>(2)?,
                "tags": tags,
                "category": row.get::<_, String>(4)?,
                "favorite": row.get::<_, i64>(5)? == 1,
                "activeVersion": row.get::<_, i64>(6)?,
                "createdAt": row.get::<_, String>(7)?,
                "updatedAt": row.get::<_, String>(8)?,
                "content": row.get::<_, String>(9)?,
            }))
        },
    )
    .optional()?
    .ok_or_else(|| AppError::invalid_argument("prompt 不存在"))
}
