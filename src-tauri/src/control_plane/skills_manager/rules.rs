use super::*;

pub(super) fn is_manual_unlinked(
    manual_unlinks: &HashMap<String, Vec<String>>,
    skill_name: &str,
    tool: &str,
) -> bool {
    manual_unlinks
        .get(skill_name)
        .map(|items| items.iter().any(|item| item == tool))
        .unwrap_or(false)
}

pub(super) fn add_manual_unlink(config: &mut SkillsManagerConfig, skill_name: &str, tool: &str) {
    let entry = config
        .manual_unlinks
        .entry(skill_name.to_string())
        .or_default();
    if !entry.iter().any(|item| item == tool) {
        entry.push(tool.to_string());
        entry.sort();
    }
}

pub(super) fn remove_manual_unlink(config: &mut SkillsManagerConfig, skill_name: &str, tool: &str) {
    if let Some(entry) = config.manual_unlinks.get_mut(skill_name) {
        entry.retain(|item| item != tool);
        if entry.is_empty() {
            config.manual_unlinks.remove(skill_name);
        }
    }
}

pub(super) fn is_allowed(
    skill_name: &str,
    tool: &str,
    group: &str,
    tool_rules: &HashMap<String, SkillsManagerToolRuleValue>,
    group_rules: &HashMap<String, SkillsManagerRuleValue>,
    rules: &HashMap<String, SkillsManagerRuleValue>,
) -> bool {
    if let Some(tool_rule) = tool_rules.get(tool) {
        if tool_rule.block_all.unwrap_or(false) {
            if list_contains(tool_rule.allow.as_ref(), skill_name) {
                return true;
            }
            if !group.is_empty() && list_contains(tool_rule.allow_groups.as_ref(), group) {
                return true;
            }
            return false;
        }
    }

    if !group.is_empty() {
        if let Some(rule) = group_rules.get(group) {
            if let Some(only) = &rule.only {
                if !only.iter().any(|item| item == tool) {
                    return false;
                }
            }
            if let Some(exclude) = &rule.exclude {
                if exclude.iter().any(|item| item == tool) {
                    return false;
                }
            }
        }
    }

    if let Some(rule) = rules.get(skill_name) {
        if let Some(only) = &rule.only {
            return only.iter().any(|item| item == tool);
        }
        if let Some(exclude) = &rule.exclude {
            return !exclude.iter().any(|item| item == tool);
        }
    }
    true
}

pub(super) fn list_contains(values: Option<&Vec<String>>, target: &str) -> bool {
    values
        .map(|items| items.iter().any(|item| item == target))
        .unwrap_or(false)
}

pub(super) fn to_runtime_skill(skill: &SkillRow) -> SkillRuntime {
    SkillRuntime {
        id: skill.id.clone(),
        name: skill.name.clone(),
        source: skill.source.clone(),
        local_path: PathBuf::from(&skill.local_path),
        group: derive_skill_group(&skill.source),
    }
}

pub(super) fn derive_skill_group(source: &str) -> String {
    let path = Path::new(source);
    path.parent()
        .and_then(|parent| parent.file_name())
        .or_else(|| path.file_name())
        .map(|name| name.to_string_lossy().to_string())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| "default".to_string())
}

pub(super) fn normalize_install_mode(mode: &str) -> &str {
    if mode.eq_ignore_ascii_case("symlink") {
        "symlink"
    } else {
        "copy"
    }
}
pub(super) fn sanitize_rule_map(
    incoming: HashMap<String, SkillsManagerRuleValue>,
) -> Result<HashMap<String, SkillsManagerRuleValue>, AppError> {
    let mut next = HashMap::new();
    for (key, mut value) in incoming {
        let normalized_key = key.trim().to_string();
        if normalized_key.is_empty() {
            continue;
        }
        value.only = normalize_string_list(value.only);
        value.exclude = normalize_string_list(value.exclude);
        validate_rule_value(&value)?;
        if value.only.is_none() && value.exclude.is_none() {
            continue;
        }
        next.insert(normalized_key, value);
    }
    Ok(next)
}

pub(super) fn sanitize_tool_rule_map(
    incoming: HashMap<String, SkillsManagerToolRuleValue>,
) -> Result<HashMap<String, SkillsManagerToolRuleValue>, AppError> {
    let mut next = HashMap::new();
    for (key, mut value) in incoming {
        let normalized_key = key.trim().to_string();
        if normalized_key.is_empty() {
            continue;
        }
        value.allow = normalize_string_list(value.allow);
        value.allow_groups = normalize_string_list(value.allow_groups);
        if value.block_all.is_none() {
            value.block_all = Some(false);
        }
        validate_tool_rule_value(&value)?;
        let is_default = !value.block_all.unwrap_or(false)
            && value.allow.is_none()
            && value.allow_groups.is_none();
        if is_default {
            continue;
        }
        next.insert(normalized_key, value);
    }
    Ok(next)
}

pub(super) fn normalize_string_list(values: Option<Vec<String>>) -> Option<Vec<String>> {
    let mut normalized = values
        .unwrap_or_default()
        .into_iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .collect::<Vec<String>>();
    if normalized.is_empty() {
        return None;
    }
    normalized.sort();
    normalized.dedup();
    Some(normalized)
}

pub(super) fn validate_rule_value(rule: &SkillsManagerRuleValue) -> Result<(), AppError> {
    if rule.only.is_some() && rule.exclude.is_some() {
        return Err(AppError::invalid_argument(
            "规则 only 与 exclude 不能同时存在",
        ));
    }
    Ok(())
}

pub(super) fn validate_tool_rule_value(rule: &SkillsManagerToolRuleValue) -> Result<(), AppError> {
    if let Some(groups) = &rule.allow_groups {
        if groups.iter().any(|item| item.trim().is_empty()) {
            return Err(AppError::invalid_argument("allowGroups 不能为空字符串"));
        }
    }
    if let Some(skills) = &rule.allow {
        if skills.iter().any(|item| item.trim().is_empty()) {
            return Err(AppError::invalid_argument("allow 不能为空字符串"));
        }
    }
    Ok(())
}
