use super::*;

pub(super) struct ParseFileResult {
    pub(super) calls: Vec<SessionSkillCallEvent>,
    pub(super) failures: Vec<ParseFailureEvent>,
    pub(super) parsed_events: usize,
    pub(super) inserted_events: usize,
    pub(super) duplicate_events: usize,
    pub(super) parse_failures: usize,
}

pub(super) fn parse_session_file(
    path: &Path,
    agent: &str,
    source: &str,
    workspace_scope: &WorkspaceScope,
    workspace_scopes: &[WorkspaceScope],
    skill_aliases: &HashMap<String, SkillAliasEntry>,
    force_full_scan: bool,
    conn: &Connection,
) -> Result<ParseFileResult, AppError> {
    let metadata = fs::metadata(path)?;
    let file_size = metadata.len();
    let source_path = path.to_string_lossy().to_string();
    let checkpoint = if force_full_scan {
        None
    } else {
        load_checkpoint(conn, agent, &source_path)?
    };
    let mut start_offset = checkpoint.unwrap_or(0);
    if start_offset > file_size {
        start_offset = 0;
    }

    let file = File::open(path)?;
    let mut reader = BufReader::new(file);
    reader.seek(SeekFrom::Start(start_offset))?;

    let fallback_session_id = path
        .file_stem()
        .map(|item| item.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown-session".to_string());
    let mut parse_state = FileParseState {
        session_id: fallback_session_id,
        session_cwd: None,
    };

    let mut line = String::new();
    let mut bytes_offset = start_offset;
    let mut line_no: i64 = 0;
    let mut calls = Vec::new();
    let mut failures = Vec::new();

    loop {
        line.clear();
        let bytes = reader.read_line(&mut line)?;
        if bytes == 0 {
            break;
        }
        line_no += 1;
        let line_start = bytes_offset;
        bytes_offset += bytes as u64;

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let value: Value = match serde_json::from_str(trimmed) {
            Ok(parsed) => parsed,
            Err(err) => {
                failures.push(ParseFailureEvent {
                    workspace_id: Some(workspace_scope.id.clone()),
                    agent: agent.to_string(),
                    source_path: source_path.clone(),
                    session_id: Some(parse_state.session_id.clone()),
                    line_no,
                    event_ref: format!("{line_start}:json-parse"),
                    reason: format!("json-parse-failed: {err}"),
                    raw_excerpt: truncate_text(trimmed, 400),
                });
                continue;
            }
        };

        update_parse_state(&mut parse_state, &value);

        let skill_calls = if agent == AGENT_CLAUDE {
            extract_claude_skill_calls(&value)
        } else {
            extract_codex_skill_calls(&value)
        };

        if skill_calls.is_empty() {
            continue;
        }

        let called_at = value
            .get("timestamp")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(now_rfc3339);

        let workspace_hint = extract_workspace_hint(&value)
            .or_else(|| parse_state.session_cwd.clone())
            .or_else(|| {
                value
                    .get("payload")
                    .and_then(|item| item.get("cwd"))
                    .and_then(Value::as_str)
                    .map(str::to_string)
            });
        let matched_workspace = workspace_hint
            .as_deref()
            .and_then(|hint| map_workspace_id(hint, workspace_scopes))
            .map(str::to_string)
            .or_else(|| {
                parse_state
                    .session_cwd
                    .as_deref()
                    .and_then(|hint| map_workspace_id(hint, workspace_scopes))
                    .map(str::to_string)
            });

        for (idx, skill_call) in skill_calls.iter().enumerate() {
            let normalized_candidates = normalize_skill_alias_candidates(&skill_call.skill_token);
            let alias = normalized_candidates
                .iter()
                .find_map(|candidate| skill_aliases.get(candidate));

            let Some(alias) = alias else {
                failures.push(ParseFailureEvent {
                    workspace_id: matched_workspace.clone(),
                    agent: agent.to_string(),
                    source_path: source_path.clone(),
                    session_id: Some(parse_state.session_id.clone()),
                    line_no,
                    event_ref: format!("{line_start}:{idx}"),
                    reason: format!("skill-not-mapped: {}", skill_call.skill_token),
                    raw_excerpt: truncate_text(trimmed, 400),
                });
                continue;
            };

            let event_workspace_id = workspace_scope.id.clone();
            let event_ref = format!("{line_start}:{idx}");
            let dedupe_seed = format!(
                "{}|{}|{}|{}|{}|{}|{}",
                event_workspace_id,
                agent,
                source_path,
                parse_state.session_id,
                event_ref,
                alias.skill_id,
                called_at
            );

            calls.push(SessionSkillCallEvent {
                workspace_id: Some(event_workspace_id),
                agent: agent.to_string(),
                source: source.to_string(),
                source_path: source_path.clone(),
                session_id: parse_state.session_id.clone(),
                event_ref,
                skill_id: alias.skill_id.clone(),
                skill_identity: alias.identity.clone(),
                skill_name: alias.name.clone(),
                called_at: called_at.clone(),
                result_status: skill_call.result_status.clone(),
                confidence: skill_call.confidence,
                raw_ref: truncate_text(trimmed, 400),
                dedupe_key: sha256_hex(&dedupe_seed),
            });
        }
    }

    let (inserted_events, duplicate_events) = count_insert_projection(conn, &calls)?;
    save_checkpoint(conn, agent, &source_path, file_size)?;

    Ok(ParseFileResult {
        parsed_events: calls.len(),
        inserted_events,
        duplicate_events,
        parse_failures: failures.len(),
        calls,
        failures,
    })
}

#[derive(Debug, Clone)]
pub(super) struct ParsedSkillCall {
    pub(super) skill_token: String,
    pub(super) result_status: String,
    pub(super) confidence: f64,
}

pub(super) fn update_parse_state(state: &mut FileParseState, value: &Value) {
    let event_type = value
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if event_type == "session_meta" {
        if let Some(session_id) = value
            .get("payload")
            .and_then(|item| item.get("id"))
            .and_then(Value::as_str)
        {
            state.session_id = session_id.to_string();
        }
        if let Some(cwd) = value
            .get("payload")
            .and_then(|item| item.get("cwd"))
            .and_then(Value::as_str)
        {
            state.session_cwd = Some(cwd.to_string());
        }
    }

    if let Some(cwd) = value
        .get("payload")
        .and_then(|item| item.get("cwd"))
        .and_then(Value::as_str)
    {
        state.session_cwd = Some(cwd.to_string());
    }
}

pub(super) fn extract_codex_skill_calls(value: &Value) -> Vec<ParsedSkillCall> {
    let mut calls = Vec::new();
    if value.get("type").and_then(Value::as_str) != Some("response_item") {
        return calls;
    }
    let payload = match value.get("payload") {
        Some(item) => item,
        None => return calls,
    };

    let payload_type = payload
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if payload_type == "function_call" {
        let arguments = payload
            .get("arguments")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let command =
            extract_command_from_arguments(arguments).unwrap_or_else(|| arguments.to_string());
        calls.extend(extract_from_shell_command(&command));
    } else if payload_type == "function_call_output" {
        let output = payload
            .get("output")
            .and_then(Value::as_str)
            .unwrap_or_default();
        calls.extend(extract_from_use_skill_output(output));
    } else if payload_type == "message" {
        let role = payload
            .get("role")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if role != "user" {
            return calls;
        }
        if let Some(content) = payload.get("content").and_then(Value::as_array) {
            for item in content {
                let text = item.get("text").and_then(Value::as_str).unwrap_or_default();
                calls.extend(extract_from_markdown_skill_links(text));
            }
        }
    }

    calls
}

pub(super) fn extract_claude_skill_calls(value: &Value) -> Vec<ParsedSkillCall> {
    let mut calls = Vec::new();
    let event_type = value
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if event_type == "user" {
        let text = value
            .get("content")
            .and_then(Value::as_str)
            .unwrap_or_default();
        calls.extend(extract_from_markdown_skill_links(text));
        return calls;
    }

    if event_type == "tool_use" {
        let tool_name = value
            .get("tool_name")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if matches!(tool_name, "bash" | "shell_command" | "task") {
            let command = value
                .get("tool_input")
                .and_then(|item| item.get("command"))
                .and_then(Value::as_str)
                .unwrap_or_default();
            calls.extend(extract_from_shell_command(command));

            let prompt = value
                .get("tool_input")
                .and_then(|item| item.get("prompt"))
                .and_then(Value::as_str)
                .unwrap_or_default();
            calls.extend(extract_from_markdown_skill_links(prompt));
        }
        return calls;
    }

    calls
}

pub(super) fn extract_from_markdown_skill_links(text: &str) -> Vec<ParsedSkillCall> {
    let mut calls = Vec::new();
    let mut remain = text;
    while let Some(start) = remain.find("[$") {
        let after_start = &remain[start + 2..];
        let Some(end_bracket) = after_start.find(']') else {
            break;
        };
        let token = &after_start[..end_bracket];
        let after_bracket = &after_start[end_bracket + 1..];
        if let Some(close_paren) = after_bracket.find(')') {
            let target = &after_bracket[..close_paren];
            if target.to_ascii_lowercase().contains("skill.md") {
                calls.push(ParsedSkillCall {
                    skill_token: token.trim().to_string(),
                    result_status: RESULT_STATUS_UNKNOWN.to_string(),
                    confidence: 0.92,
                });
            }
            remain = &after_bracket[close_paren + 1..];
        } else {
            break;
        }
    }
    calls
}

pub(super) fn extract_from_shell_command(text: &str) -> Vec<ParsedSkillCall> {
    let mut calls = Vec::new();
    let lower = text.to_ascii_lowercase();
    if !lower.contains("use-skill") {
        return calls;
    }

    let mut segments = text.split_whitespace();
    while let Some(segment) = segments.next() {
        if segment.eq_ignore_ascii_case("use-skill") {
            if let Some(skill) = segments.next() {
                let Some(skill_token) = sanitize_skill_token(skill) else {
                    continue;
                };
                calls.push(ParsedSkillCall {
                    skill_token,
                    result_status: RESULT_STATUS_SUCCESS.to_string(),
                    confidence: 0.98,
                });
            }
        }
    }

    calls
}

pub(super) fn sanitize_skill_token(raw: &str) -> Option<String> {
    let trimmed = raw
        .trim()
        .trim_matches(|ch| matches!(ch, '"' | '\'' | '`'))
        .trim_start_matches('$');
    if trimmed.is_empty() {
        return None;
    }

    let mut token = String::new();
    for ch in trimmed.chars() {
        if ch.is_whitespace() || matches!(ch, ',' | '}' | ']' | ')' | '"' | '\'' | '`') {
            break;
        }
        token.push(ch);
    }

    let cleaned = token.trim_end_matches('\\').trim();
    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned.to_string())
    }
}

pub(super) fn extract_from_use_skill_output(text: &str) -> Vec<ParsedSkillCall> {
    let mut calls = Vec::new();
    for line in text.lines() {
        if let Some(skill_token) = parse_skill_token_from_use_skill_output_line(line) {
            calls.push(ParsedSkillCall {
                skill_token,
                result_status: RESULT_STATUS_SUCCESS.to_string(),
                confidence: 0.96,
            });
        }
    }
    calls
}

fn parse_skill_token_from_use_skill_output_line(line: &str) -> Option<String> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }

    let lowered = trimmed.to_ascii_lowercase();
    let is_skill_loading_line = lowered.starts_with("loading personal skill:")
        || lowered.starts_with("loading superpowers skill:");
    if !is_skill_loading_line {
        return None;
    }

    let (_, raw_token) = trimmed.split_once(':')?;
    sanitize_skill_token(raw_token)
}

pub(super) fn extract_workspace_hint(value: &Value) -> Option<String> {
    if let Some(workdir) = value
        .get("payload")
        .and_then(|item| item.get("arguments"))
        .and_then(Value::as_str)
        .and_then(extract_workdir_from_arguments)
    {
        return Some(workdir);
    }

    if let Some(workdir) = value
        .get("tool_input")
        .and_then(|item| item.get("workdir"))
        .and_then(Value::as_str)
    {
        return Some(workdir.to_string());
    }

    if let Some(cwd) = value
        .get("payload")
        .and_then(|item| item.get("cwd"))
        .and_then(Value::as_str)
    {
        return Some(cwd.to_string());
    }

    None
}

pub(super) fn extract_workdir_from_arguments(arguments: &str) -> Option<String> {
    if arguments.trim().is_empty() {
        return None;
    }
    let parsed: Value = serde_json::from_str(arguments).ok()?;
    parsed
        .get("workdir")
        .and_then(Value::as_str)
        .map(str::to_string)
}

pub(super) fn extract_command_from_arguments(arguments: &str) -> Option<String> {
    if arguments.trim().is_empty() {
        return None;
    }
    let parsed: Value = serde_json::from_str(arguments).ok()?;
    parsed
        .get("command")
        .or_else(|| parsed.get("cmd"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

pub(super) fn should_force_full_scan(conn: &Connection, workspace_id: &str) -> Result<bool, AppError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(1) FROM skill_call_facts WHERE workspace_id = ?1",
        params![workspace_id],
        |row| row.get(0),
    )?;
    Ok(count == 0)
}

pub(super) fn map_workspace_id<'a>(path: &str, scopes: &'a [WorkspaceScope]) -> Option<&'a str> {
    let normalized = normalize_path(path)?;
    let mut best: Option<(&str, usize)> = None;

    for scope in scopes {
        let scope_path = normalize_path(scope.root_path.to_string_lossy().as_ref())?;
        if normalized == scope_path
            || normalized.starts_with(&format!("{scope_path}/"))
            || normalized.starts_with(&format!("{scope_path}\\"))
        {
            let score = scope_path.len();
            if best.map(|(_, size)| score > size).unwrap_or(true) {
                best = Some((scope.id.as_str(), score));
            }
        }
    }

    best.map(|item| item.0)
}

pub(super) fn normalize_path(path: &str) -> Option<String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.replace('\\', "/").trim_end_matches('/').to_string())
}

pub(super) fn normalize_skill_alias_candidates(token: &str) -> Vec<String> {
    let trimmed = token.trim().trim_start_matches('$').trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    let mut variants = Vec::new();
    let lower = trimmed.to_ascii_lowercase();
    variants.push(lower.clone());

    if lower.contains(':') {
        variants.push(lower.replace(':', "-"));
        if let Some(last) = lower.rsplit(':').next() {
            variants.push(last.to_string());
        }
    }

    if lower.contains('-') {
        variants.push(lower.replace('-', ":"));
    }

    if lower.ends_with("/skill.md") {
        if let Some(name) = lower
            .trim_end_matches("/skill.md")
            .split('/')
            .next_back()
            .filter(|item| !item.trim().is_empty())
        {
            variants.push(name.to_string());
        }
    }

    variants.sort();
    variants.dedup();
    variants
}

pub(super) fn truncate_text(value: &str, limit: usize) -> String {
    if value.len() <= limit {
        return value.to_string();
    }
    let end = value
        .char_indices()
        .map(|(idx, _)| idx)
        .chain(std::iter::once(value.len()))
        .take_while(|idx| *idx <= limit)
        .last()
        .unwrap_or(0);
    value[..end].to_string()
}

pub(super) fn discover_session_files() -> Vec<SessionFile> {
    let mut files = Vec::new();

    if let Some(home) = dirs::home_dir() {
        let codex_root = home.join(".codex").join("sessions");
        files.extend(discover_jsonl_files(
            &codex_root,
            AGENT_CODEX,
            SOURCE_CODEX_JSONL,
        ));

        let claude_root = home.join(".claude").join("transcripts");
        files.extend(discover_jsonl_files(
            &claude_root,
            AGENT_CLAUDE,
            SOURCE_CLAUDE_TRANSCRIPT,
        ));
    }

    files
}

pub(super) fn discover_jsonl_files(root: &Path, agent: &str, source: &str) -> Vec<SessionFile> {
    if !root.exists() || !root.is_dir() {
        return Vec::new();
    }

    let mut files = Vec::new();
    for entry in WalkDir::new(root)
        .follow_links(true)
        .into_iter()
        .flatten()
        .filter(|item| item.file_type().is_file())
    {
        let path = entry.path();
        if path
            .extension()
            .and_then(|item| item.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("jsonl"))
            .unwrap_or(false)
        {
            files.push(SessionFile {
                agent: agent.to_string(),
                source: source.to_string(),
                path: path.to_path_buf(),
            });
        }
    }

    files
}
