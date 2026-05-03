use super::*;
use rusqlite::{params, OptionalExtension};

struct DefaultCase {
    id: &'static str,
    category: &'static str,
    label: &'static str,
    messages: &'static [(&'static str, &'static str)],
    rounds: &'static [(&'static str, &'static str)],
}

const EMPTY_MESSAGES: &[(&str, &str)] = &[];
const EMPTY_ROUNDS: &[(&str, &str)] = &[];
const DEFAULT_CASES: &[DefaultCase] = &[
    DefaultCase {
        id: "small-basic",
        category: CATEGORY_SMALL,
        label: "算术短答",
        messages: &[("user", "用一句中文回答：1+1 等于几？")],
        rounds: EMPTY_ROUNDS,
    },
    DefaultCase {
        id: "small-json",
        category: CATEGORY_SMALL,
        label: "JSON 短答",
        messages: &[("user", "只返回 JSON：{\"status\":\"ok\",\"value\":3}，不要解释。")],
        rounds: EMPTY_ROUNDS,
    },
    DefaultCase {
        id: "small-english-basic",
        category: CATEGORY_SMALL,
        label: "English short answer",
        messages: &[("user", "Answer in one short English sentence: what is 2 + 2?")],
        rounds: EMPTY_ROUNDS,
    },
    DefaultCase {
        id: "medium-summary",
        category: CATEGORY_MEDIUM,
        label: "指标总结",
        messages: &[(
            "user",
            "请用 5 条要点总结一个 API 渠道测试台应该关注哪些指标，并给出每条指标的原因。",
        )],
        rounds: EMPTY_ROUNDS,
    },
    DefaultCase {
        id: "medium-english-bullets",
        category: CATEGORY_MEDIUM,
        label: "English bullet summary",
        messages: &[(
            "user",
            "List five practical metrics for testing an LLM API gateway. Use concise English bullet points.",
        )],
        rounds: EMPTY_ROUNDS,
    },
    DefaultCase {
        id: "medium-table",
        category: CATEGORY_MEDIUM,
        label: "表格输出",
        messages: &[(
            "user",
            "请用 Markdown 表格列出 OpenAI 协议和 Anthropic 协议的 5 个响应字段差异，包含字段名、含义、是否影响统计。",
        )],
        rounds: EMPTY_ROUNDS,
    },
    DefaultCase {
        id: "large-structure",
        category: CATEGORY_LARGE,
        label: "测试方案",
        messages: &[(
            "user",
            "请生成一份 800 字左右的渠道 API 稳定性测试方案，包含测试目标、输入规模、流式首字、错误处理、响应体检查和验收标准。",
        )],
        rounds: EMPTY_ROUNDS,
    },
    DefaultCase {
        id: "large-analysis",
        category: CATEGORY_LARGE,
        label: "响应分析",
        messages: &[(
            "user",
            "请分析一个大模型 API 渠道测试系统的设计，要求包含数据模型、异步执行、首字统计、usage 对账、错误分类、题库管理和验收标准，约 1000 字。",
        )],
        rounds: EMPTY_ROUNDS,
    },
    DefaultCase {
        id: "large-english-plan",
        category: CATEGORY_LARGE,
        label: "English test plan",
        messages: &[(
            "user",
            "Write an English test plan for evaluating an LLM API channel. Cover latency, streaming first token, response validation, token usage, and failure handling.",
        )],
        rounds: EMPTY_ROUNDS,
    },
    DefaultCase {
        id: "followup-context",
        category: CATEGORY_FOLLOWUP,
        label: "风险追问",
        messages: EMPTY_MESSAGES,
        rounds: &[
            ("round-1", "我们要测试一个大模型 API 渠道，请先列出 3 个关键风险。"),
            ("round-2", "基于上面的风险，补充每个风险对应的响应体检查项。"),
            ("round-3", "把这些检查项整理成一个简短的验收清单。"),
        ],
    },
    DefaultCase {
        id: "followup-debug",
        category: CATEGORY_FOLLOWUP,
        label: "排障追问",
        messages: EMPTY_MESSAGES,
        rounds: &[
            ("round-1", "一个 API 渠道响应慢，请先给出 3 个可能原因。"),
            ("round-2", "针对每个原因，给出一个可观测指标。"),
            ("round-3", "最后给出一个按优先级排序的排障步骤。"),
        ],
    },
    DefaultCase {
        id: "followup-english-routing",
        category: CATEGORY_FOLLOWUP,
        label: "English routing follow-up",
        messages: EMPTY_MESSAGES,
        rounds: &[
            ("round-1", "We are testing an LLM API gateway. Name three signs that requests may be routed through multiple upstream providers."),
            ("round-2", "For each sign, suggest one observable field or timing metric to collect."),
            ("round-3", "Turn the observations into a short investigation checklist."),
        ],
    },
];

pub(super) fn get_workspace(conn: &Connection, workspace_id: &str) -> Result<(), AppError> {
    let exists: Option<String> = conn
        .query_row(
            "SELECT id FROM workspaces WHERE id = ?1",
            params![workspace_id],
            |row| row.get(0),
        )
        .optional()?;
    exists.map(|_| ()).ok_or_else(AppError::workspace_not_found)
}

pub(super) fn seed_default_cases_once(
    conn: &Connection,
    workspace_id: &str,
) -> Result<(), AppError> {
    let key = format!("channel_api_test_cases_seeded_v2:{workspace_id}");
    let exists: i64 = conn.query_row(
        "SELECT COUNT(1) FROM migration_meta WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )?;
    if exists > 0 {
        return Ok(());
    }

    let now = now_rfc3339();
    for item in DEFAULT_CASES {
        let messages = item
            .messages
            .iter()
            .map(|(role, content)| ChannelApiTestMessageInput {
                role: (*role).to_string(),
                content: (*content).to_string(),
            })
            .collect::<Vec<_>>();
        let rounds = item
            .rounds
            .iter()
            .map(|(id, prompt)| ChannelApiTestRoundInput {
                id: (*id).to_string(),
                prompt: (*prompt).to_string(),
            })
            .collect::<Vec<_>>();
        conn.execute(
            "INSERT OR IGNORE INTO channel_api_test_cases(
                id, workspace_id, category, label, messages_json, rounds_json, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                item.id,
                workspace_id,
                item.category,
                item.label,
                serde_json::to_string(&messages).map_err(|err| AppError::internal(err.to_string()))?,
                serde_json::to_string(&rounds).map_err(|err| AppError::internal(err.to_string()))?,
                now,
                now,
            ],
        )?;
    }

    conn.execute(
        "INSERT INTO migration_meta(key, value, updated_at) VALUES (?1, ?2, ?3)",
        params![key, "done", now_rfc3339()],
    )?;
    Ok(())
}

pub(super) fn persist_run(
    conn: &Connection,
    record: &ChannelApiTestRunRecord,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO channel_api_test_runs(
            id,
            workspace_id,
            started_at,
            completed_at,
            protocol,
            model,
            base_url_display,
            category,
            case_id,
            run_mode,
            stream,
            status,
            error_reason,
            http_status,
            total_duration_ms,
            first_token_ms,
            first_metric_kind,
            input_size,
            input_size_source,
            output_size,
            output_size_source,
            response_text,
            response_json_excerpt,
            raw_error_excerpt,
            usage_json,
            conversation_json,
            checks_json,
            rounds_json,
            created_at
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
            ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18,
            ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29
        )",
        params![
            record.id,
            record.workspace_id,
            record.started_at,
            record.completed_at,
            record.protocol,
            record.model,
            record.base_url_display,
            record.category,
            record.case_id,
            record.run_mode,
            if record.stream { 1 } else { 0 },
            record.status,
            record.error_reason,
            record.http_status,
            record.total_duration_ms,
            record.first_token_ms,
            record.first_metric_kind,
            record.input_size,
            record.input_size_source,
            record.output_size,
            record.output_size_source,
            record.response_text,
            record.response_json_excerpt,
            record.raw_error_excerpt,
            record.usage_json,
            record.conversation_json,
            serde_json::to_string(&record.checks)
                .map_err(|err| AppError::internal(err.to_string()))?,
            serde_json::to_string(&record.rounds)
                .map_err(|err| AppError::internal(err.to_string()))?,
            now_rfc3339(),
        ],
    )?;
    Ok(())
}

pub(super) fn query_custom_cases(conn: &Connection, workspace_id: &str) -> Result<Value, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, category, label, messages_json, rounds_json, created_at, updated_at
         FROM channel_api_test_cases
         WHERE workspace_id = ?1
         ORDER BY updated_at DESC, id DESC",
    )?;
    let rows = stmt.query_map(params![workspace_id], |row| {
        let messages_json: String = row.get(4)?;
        let rounds_json: String = row.get(5)?;
        let messages = serde_json::from_str::<Vec<ChannelApiTestMessageInput>>(&messages_json)
            .unwrap_or_default();
        let rounds =
            serde_json::from_str::<Vec<ChannelApiTestRoundInput>>(&rounds_json).unwrap_or_default();
        Ok(json!({
            "id": row.get::<_, String>(0)?,
            "workspaceId": row.get::<_, String>(1)?,
            "category": row.get::<_, String>(2)?,
            "label": row.get::<_, String>(3)?,
            "messages": messages,
            "rounds": rounds,
            "createdAt": row.get::<_, String>(6)?,
            "updatedAt": row.get::<_, String>(7)?,
        }))
    })?;

    let mut cases = Vec::new();
    for row in rows {
        cases.push(row?);
    }
    Ok(json!(cases))
}

pub(super) fn upsert_custom_case(
    conn: &Connection,
    input: &ChannelApiTestCaseUpsertInput,
) -> Result<Value, AppError> {
    let id = input
        .id
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = now_rfc3339();
    let created_at = conn
        .query_row(
            "SELECT created_at FROM channel_api_test_cases WHERE id = ?1 AND workspace_id = ?2",
            params![id, crate::domain::models::APP_SCOPE_ID.to_string()],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .unwrap_or_else(|| now.clone());
    let messages = input.messages.clone().unwrap_or_default();
    let rounds = input.rounds.clone().unwrap_or_default();

    conn.execute(
        "INSERT INTO channel_api_test_cases(
            id, workspace_id, category, label, messages_json, rounds_json, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        ON CONFLICT(id) DO UPDATE SET
            category = excluded.category,
            label = excluded.label,
            messages_json = excluded.messages_json,
            rounds_json = excluded.rounds_json,
            updated_at = excluded.updated_at
        WHERE workspace_id = excluded.workspace_id",
        params![
            id,
            crate::domain::models::APP_SCOPE_ID.to_string(),
            input.category,
            input.label.trim(),
            serde_json::to_string(&messages).map_err(|err| AppError::internal(err.to_string()))?,
            serde_json::to_string(&rounds).map_err(|err| AppError::internal(err.to_string()))?,
            created_at,
            now,
        ],
    )?;

    Ok(json!({
        "id": id,
        "workspaceId": crate::domain::models::APP_SCOPE_ID.to_string(),
        "category": input.category,
        "label": input.label.trim(),
        "messages": messages,
        "rounds": rounds,
        "createdAt": created_at,
        "updatedAt": now,
    }))
}

pub(super) fn delete_custom_case(
    conn: &Connection,
    workspace_id: &str,
    case_id: &str,
) -> Result<Value, AppError> {
    let deleted = conn.execute(
        "DELETE FROM channel_api_test_cases WHERE workspace_id = ?1 AND id = ?2",
        params![workspace_id, case_id],
    )?;
    Ok(json!({
        "workspaceId": workspace_id,
        "caseId": case_id,
        "deleted": deleted > 0,
    }))
}

pub(super) fn record_to_value(record: &ChannelApiTestRunRecord) -> Value {
    json!({
        "id": record.id,
        "workspaceId": record.workspace_id,
        "startedAt": record.started_at,
        "completedAt": record.completed_at,
        "protocol": record.protocol,
        "model": record.model,
            "baseUrlDisplay": record.base_url_display,
            "category": record.category,
            "caseId": record.case_id,
            "runMode": record.run_mode,
            "stream": record.stream,
        "status": record.status,
        "errorReason": record.error_reason,
        "httpStatus": record.http_status,
        "totalDurationMs": record.total_duration_ms,
        "firstTokenMs": record.first_token_ms,
        "firstMetricKind": record.first_metric_kind,
        "inputSize": record.input_size,
        "inputSizeSource": record.input_size_source,
        "outputSize": record.output_size,
        "outputSizeSource": record.output_size_source,
        "responseText": record.response_text,
        "responseJsonExcerpt": record.response_json_excerpt,
        "rawErrorExcerpt": record.raw_error_excerpt,
        "usageJson": record.usage_json,
        "conversationJson": record.conversation_json,
        "checks": record.checks,
        "rounds": record.rounds,
    })
}
