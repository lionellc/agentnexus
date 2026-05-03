use super::*;

#[tauri::command]
pub fn skills_manager_check_external_updates(
    state: State<'_, AppState>,
    input: SkillsManagerCheckExternalUpdatesInput,
) -> Result<Value, AppError> {
    let conn = state.open()?;
    let skills = list_skills_for_external_update_check(&conn, input.skill_ids.as_deref())?;
    if skills.is_empty() {
        return Ok(json!({
            "results": [],
            "summary": {
                "total": 0,
                "updateAvailable": 0,
                "upToDate": 0,
                "sourceMissing": 0,
                "localMissing": 0,
            },
        }));
    }

    let checked_at = now_rfc3339();
    let mut rows: Vec<Value> = Vec::new();
    let mut update_available = 0usize;
    let mut up_to_date = 0usize;
    let mut source_missing = 0usize;
    let mut local_missing = 0usize;

    for skill in skills {
        let local_hash =
            crate::utils::sha256_directory(Path::new(&skill.local_path)).unwrap_or_default();
        let remote_hash =
            crate::utils::sha256_directory(Path::new(&skill.source_local_path)).unwrap_or_default();

        let (status, update_candidate) = if local_hash.is_empty() {
            local_missing += 1;
            ("local_missing", false)
        } else if remote_hash.is_empty() {
            source_missing += 1;
            ("source_missing", false)
        } else if local_hash != remote_hash {
            update_available += 1;
            ("update_available", true)
        } else {
            up_to_date += 1;
            ("up_to_date", false)
        };

        save_skill_external_hash_check(
            &conn,
            &skill,
            &local_hash,
            &remote_hash,
            update_candidate,
            &checked_at,
        )?;

        rows.push(json!({
            "skillId": skill.asset_id,
            "identity": skill.identity,
            "name": skill.name,
            "status": status,
            "updateCandidate": update_candidate,
            "sourceType": skill.source_type,
            "source": skill.source,
            "sourceUrl": skill.source_url,
            "repoOwner": skill.repo_owner,
            "repoName": skill.repo_name,
            "repoRef": skill.repo_ref,
            "skillPath": skill.skill_path,
            "sourceLocalPath": skill.source_local_path,
            "localContentHash": local_hash,
            "remoteContentHash": remote_hash,
            "hashCheckedAt": checked_at,
        }));
    }

    let summary = json!({
        "total": rows.len(),
        "updateAvailable": update_available,
        "upToDate": up_to_date,
        "sourceMissing": source_missing,
        "localMissing": local_missing,
    });

    append_audit_event(
        &conn,
        Some(crate::domain::models::APP_SCOPE_ID),
        "skills_manager_check_external_updates",
        input.operator.as_deref().unwrap_or("system"),
        json!({
            "workspaceId": crate::domain::models::APP_SCOPE_ID.to_string(),
            "skillIds": input.skill_ids,
            "summary": summary,
        }),
    )?;

    Ok(json!({
        "results": rows,
        "summary": summary,
    }))
}
