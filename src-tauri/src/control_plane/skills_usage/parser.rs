use super::*;

const FAILURE_TOKEN_INVALID: &str = "token-invalid";
const FAILURE_TOKEN_EMPTY_OR_NOISE: &str = "token-empty-or-noise";
const FAILURE_SEARCH_DIRS_EMPTY: &str = "search-dirs-empty";
const FAILURE_ALIAS_CONFLICT: &str = "alias-conflict";
const FAILURE_ALIAS_NOT_FOUND: &str = "alias-not-found";
const FAILURE_JSON_PARSE_FAILED: &str = "json-parse-failed";

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
    skill_aliases: &HashMap<String, Vec<SkillAliasCandidate>>,
    agent_search_dirs: &HashMap<String, Vec<AgentSearchDirScope>>,
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
            Err(_err) => {
                failures.push(ParseFailureEvent {
                    workspace_id: Some(workspace_scope.id.clone()),
                    agent: agent.to_string(),
                    source_path: source_path.clone(),
                    session_id: Some(parse_state.session_id.clone()),
                    line_no,
                    event_ref: format!("{line_start}:json-parse"),
                    reason: FAILURE_JSON_PARSE_FAILED.to_string(),
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
            let search_dirs = agent_search_dirs
                .get(agent)
                .cloned()
                .unwrap_or_default();
            if search_dirs.is_empty() {
                failures.push(ParseFailureEvent {
                    workspace_id: matched_workspace.clone(),
                    agent: agent.to_string(),
                    source_path: source_path.clone(),
                    session_id: Some(parse_state.session_id.clone()),
                    line_no,
                    event_ref: format!("{line_start}:{idx}"),
                    reason: FAILURE_SEARCH_DIRS_EMPTY.to_string(),
                    raw_excerpt: truncate_text(trimmed, 400),
                });
                continue;
            }

            if skill_call.skill_token.trim().is_empty() {
                failures.push(ParseFailureEvent {
                    workspace_id: matched_workspace.clone(),
                    agent: agent.to_string(),
                    source_path: source_path.clone(),
                    session_id: Some(parse_state.session_id.clone()),
                    line_no,
                    event_ref: format!("{line_start}:{idx}"),
                    reason: FAILURE_TOKEN_INVALID.to_string(),
                    raw_excerpt: truncate_text(trimmed, 400),
                });
                continue;
            }

            let normalized_candidates = normalize_skill_alias_candidates(&skill_call.skill_token);
            if normalized_candidates.is_empty() {
                failures.push(ParseFailureEvent {
                    workspace_id: matched_workspace.clone(),
                    agent: agent.to_string(),
                    source_path: source_path.clone(),
                    session_id: Some(parse_state.session_id.clone()),
                    line_no,
                    event_ref: format!("{line_start}:{idx}"),
                    reason: FAILURE_TOKEN_EMPTY_OR_NOISE.to_string(),
                    raw_excerpt: truncate_text(trimmed, 400),
                });
                continue;
            }

            let mut alias_candidates = Vec::<SkillAliasCandidate>::new();
            for token in normalized_candidates {
                if let Some(items) = skill_aliases.get(&token) {
                    alias_candidates.extend(items.iter().cloned());
                }
            }
            alias_candidates.sort_by(|left, right| {
                left.skill_id
                    .cmp(&right.skill_id)
                    .then_with(|| left.alias_quality.cmp(&right.alias_quality))
                    .then_with(|| left.identity.cmp(&right.identity))
            });
            alias_candidates.dedup_by(|left, right| {
                left.skill_id == right.skill_id
                    && left.alias_quality == right.alias_quality
                    && left.local_path == right.local_path
                    && left.source_local_path == right.source_local_path
            });

            if alias_candidates.is_empty() {
                failures.push(ParseFailureEvent {
                    workspace_id: matched_workspace.clone(),
                    agent: agent.to_string(),
                    source_path: source_path.clone(),
                    session_id: Some(parse_state.session_id.clone()),
                    line_no,
                    event_ref: format!("{line_start}:{idx}"),
                    reason: FAILURE_ALIAS_NOT_FOUND.to_string(),
                    raw_excerpt: truncate_text(trimmed, 400),
                });
                continue;
            }

            let mut scoped = Vec::new();
            for candidate in &alias_candidates {
                if let Some((priority, source_rank)) =
                    resolve_candidate_scope_rank(candidate, &search_dirs)
                {
                    scoped.push((candidate.clone(), priority, source_rank));
                }
            }
            let alias = if scoped.is_empty() {
                match resolve_alias_without_search_dirs(&alias_candidates) {
                    Ok(candidate) => candidate,
                    Err(reason) => {
                        failures.push(ParseFailureEvent {
                            workspace_id: matched_workspace.clone(),
                            agent: agent.to_string(),
                            source_path: source_path.clone(),
                            session_id: Some(parse_state.session_id.clone()),
                            line_no,
                            event_ref: format!("{line_start}:{idx}"),
                            reason: reason.to_string(),
                            raw_excerpt: truncate_text(trimmed, 400),
                        });
                        continue;
                    }
                }
            } else {
                scoped.sort_by(|left, right| {
                    left.0
                        .alias_quality
                        .cmp(&right.0.alias_quality)
                        .then_with(|| left.1.cmp(&right.1))
                        .then_with(|| left.2.cmp(&right.2))
                        .then_with(|| left.0.skill_id.cmp(&right.0.skill_id))
                });

                let chosen = scoped.first().cloned();
                let Some((alias, first_priority, first_source_rank)) = chosen else {
                    continue;
                };

                if scoped.len() > 1 {
                    let (_, second_priority, second_source_rank) = &scoped[1];
                    let second = &scoped[1].0;
                    if alias.alias_quality == second.alias_quality
                        && first_priority == *second_priority
                        && first_source_rank == *second_source_rank
                        && alias.skill_id != second.skill_id
                    {
                        failures.push(ParseFailureEvent {
                            workspace_id: matched_workspace.clone(),
                            agent: agent.to_string(),
                            source_path: source_path.clone(),
                            session_id: Some(parse_state.session_id.clone()),
                            line_no,
                            event_ref: format!("{line_start}:{idx}"),
                            reason: FAILURE_ALIAS_CONFLICT.to_string(),
                            raw_excerpt: truncate_text(trimmed, 400),
                        });
                        continue;
                    }
                }
                alias
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
                evidence_source: skill_call.evidence_source.clone(),
                evidence_kind: skill_call.evidence_kind.clone(),
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
    pub(super) evidence_source: String,
    pub(super) evidence_kind: String,
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
                let skill_token = sanitize_skill_token(token).unwrap_or_else(|| token.trim().to_string());
                calls.push(ParsedSkillCall {
                    skill_token,
                    result_status: RESULT_STATUS_UNKNOWN.to_string(),
                    evidence_source: "inferred".to_string(),
                    evidence_kind: "skill_md_link".to_string(),
                    confidence: 0.72,
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
                    evidence_source: "observed".to_string(),
                    evidence_kind: "explicit_use_skill".to_string(),
                    confidence: 0.99,
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
                evidence_source: "observed".to_string(),
                evidence_kind: "tool_output_signal".to_string(),
                confidence: 0.9,
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

pub(super) fn resolve_alias_without_search_dirs(
    alias_candidates: &[SkillAliasCandidate],
) -> Result<SkillAliasCandidate, &'static str> {
    if alias_candidates.is_empty() {
        return Err(FAILURE_ALIAS_NOT_FOUND);
    }

    let mut ranked = alias_candidates.to_vec();
    ranked.sort_by(|left, right| {
        left.alias_quality
            .cmp(&right.alias_quality)
            .then_with(|| left.skill_id.cmp(&right.skill_id))
            .then_with(|| left.identity.cmp(&right.identity))
    });

    let Some(best) = ranked.first().cloned() else {
        return Err(FAILURE_ALIAS_NOT_FOUND);
    };

    let best_quality = best.alias_quality;
    let mut top_skill_ids = ranked
        .iter()
        .filter(|item| item.alias_quality == best_quality)
        .map(|item| item.skill_id.clone())
        .collect::<Vec<_>>();
    top_skill_ids.sort();
    top_skill_ids.dedup();

    if top_skill_ids.len() > 1 {
        return Err(FAILURE_ALIAS_CONFLICT);
    }

    Ok(best)
}

fn resolve_candidate_scope_rank(
    candidate: &SkillAliasCandidate,
    search_dirs: &[AgentSearchDirScope],
) -> Option<(i64, i32)> {
    let mut best: Option<(i64, i32)> = None;
    let mut check = |path: &Option<String>| {
        let Some(path_value) = path.as_ref() else {
            return;
        };
        let normalized_candidate = normalize_path(path_value);
        let Some(normalized_candidate) = normalized_candidate else {
            return;
        };
        for dir in search_dirs {
            let Some(normalized_dir) = normalize_path(&dir.path) else {
                continue;
            };
            if !path_in_dir_scope(&normalized_candidate, &normalized_dir) {
                continue;
            }
            let source_rank = if dir.source.eq_ignore_ascii_case("manual") {
                0
            } else {
                1
            };
            let rank = (dir.priority, source_rank);
            if best.map(|current| rank < current).unwrap_or(true) {
                best = Some(rank);
            }
        }
    };
    check(&candidate.local_path);
    check(&candidate.source_local_path);
    best
}

fn path_in_dir_scope(candidate_path: &str, search_dir: &str) -> bool {
    if candidate_path == search_dir {
        return true;
    }
    candidate_path.starts_with(&format!("{search_dir}/"))
        || candidate_path.starts_with(&format!("{search_dir}\\"))
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

pub(super) fn discover_session_files(
    agent_search_dirs: &HashMap<String, Vec<AgentSearchDirScope>>,
) -> (Vec<SessionFile>, Vec<SessionDiscoverIssue>) {
    let mut files = Vec::new();
    let mut issues = Vec::new();
    let mut visited_paths = HashSet::new();

    let mut agents = agent_search_dirs.keys().cloned().collect::<Vec<_>>();
    agents.sort();
    for agent in agents {
        let dirs = agent_search_dirs.get(&agent).cloned().unwrap_or_default();
        if dirs.is_empty() {
            issues.push(SessionDiscoverIssue {
                agent: agent.clone(),
                source_path: String::new(),
                reason: FAILURE_SEARCH_DIRS_EMPTY.to_string(),
            });
            continue;
        }

        let source = if agent == AGENT_CODEX {
            SOURCE_CODEX_JSONL
        } else if agent == AGENT_CLAUDE {
            SOURCE_CLAUDE_TRANSCRIPT
        } else {
            // 仅解析当前支持的 session 格式；其它 agent 先静默跳过，避免把能力缺口计为解析异常。
            continue;
        };

        for dir in dirs {
            let base = PathBuf::from(&dir.path);
            let root = if agent == AGENT_CODEX {
                base.join("sessions")
            } else {
                base.join("transcripts")
            };
            for file in discover_jsonl_files(&root, &agent, source) {
                let key = file.path.to_string_lossy().to_string();
                if visited_paths.insert(key) {
                    files.push(file);
                }
            }
        }
    }

    (files, issues)
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
