use super::AgentRuleApplyRecordDto;

pub(super) fn summarize_apply_status(records: &[AgentRuleApplyRecordDto]) -> String {
    if records.is_empty() {
        return "failed".to_string();
    }

    let success = records
        .iter()
        .filter(|record| record.status == "success")
        .count();
    if success == records.len() {
        return "success".to_string();
    }
    if success == 0 {
        return "failed".to_string();
    }
    "partial_failed".to_string()
}

pub(super) fn summarize_refresh_status(records: &[AgentRuleApplyRecordDto]) -> String {
    if records.is_empty() {
        return "failed".to_string();
    }

    let clean = records
        .iter()
        .filter(|record| record.status == "clean")
        .count();
    let drifted = records
        .iter()
        .filter(|record| record.status == "drifted")
        .count();
    let error = records
        .iter()
        .filter(|record| record.status == "error")
        .count();

    if clean == records.len() {
        return "success".to_string();
    }
    if drifted > 0 && error == 0 {
        return "drifted".to_string();
    }
    if clean > 0 {
        return "partial_failed".to_string();
    }
    "failed".to_string()
}
