use super::*;

pub(super) fn validate_input(input: &ChannelApiTestRunInput) -> Result<(), AppError> {
    if !matches!(
        input.protocol.as_str(),
        PROTOCOL_OPENAI | PROTOCOL_ANTHROPIC
    ) {
        return Err(AppError::invalid_argument("协议只支持 openai 或 anthropic"));
    }
    if !matches!(
        input.category.as_str(),
        CATEGORY_SMALL | CATEGORY_MEDIUM | CATEGORY_LARGE | CATEGORY_FOLLOWUP
    ) {
        return Err(AppError::invalid_argument("未知测试题型"));
    }
    for (label, value) in [
        ("model", input.model.as_str()),
        ("baseUrl", input.base_url.as_str()),
        ("apiKey", input.api_key.as_str()),
        ("caseId", input.case_id.as_str()),
    ] {
        if value.trim().is_empty() {
            return Err(AppError::invalid_argument(format!("{label} 不能为空")));
        }
    }
    if !matches!(
        input.run_mode.as_deref().unwrap_or(RUN_MODE_STANDARD),
        RUN_MODE_STANDARD | RUN_MODE_DIAGNOSTIC | RUN_MODE_SAMPLING
    ) {
        return Err(AppError::invalid_argument("未知测试模式"));
    }
    if input.run_mode.as_deref().unwrap_or(RUN_MODE_STANDARD) != RUN_MODE_STANDARD {
        return Ok(());
    }
    if input.category == CATEGORY_FOLLOWUP {
        if input.rounds.as_ref().map(Vec::is_empty).unwrap_or(true) {
            return Err(AppError::invalid_argument("连续追问型必须包含 rounds"));
        }
    } else if input.messages.as_ref().map(Vec::is_empty).unwrap_or(true) {
        return Err(AppError::invalid_argument("测试请求必须包含 messages"));
    }
    Ok(())
}

pub(super) fn validate_case_input(input: &ChannelApiTestCaseUpsertInput) -> Result<(), AppError> {
    if !matches!(
        input.category.as_str(),
        CATEGORY_SMALL | CATEGORY_MEDIUM | CATEGORY_LARGE | CATEGORY_FOLLOWUP
    ) {
        return Err(AppError::invalid_argument("未知测试题型"));
    }
    if input.label.trim().is_empty() {
        return Err(AppError::invalid_argument("题目名称不能为空"));
    }
    if input.category == CATEGORY_FOLLOWUP {
        let rounds = input
            .rounds
            .as_ref()
            .ok_or_else(|| AppError::invalid_argument("连续追问型必须包含 rounds"))?;
        if rounds.is_empty() || rounds.iter().any(|round| round.prompt.trim().is_empty()) {
            return Err(AppError::invalid_argument(
                "连续追问型必须至少包含一个有效追问",
            ));
        }
        return Ok(());
    }

    let messages = input
        .messages
        .as_ref()
        .ok_or_else(|| AppError::invalid_argument("普通题目必须包含 messages"))?;
    if messages.is_empty()
        || messages
            .iter()
            .any(|message| message.content.trim().is_empty())
    {
        return Err(AppError::invalid_argument(
            "普通题目必须至少包含一条有效消息",
        ));
    }
    Ok(())
}

