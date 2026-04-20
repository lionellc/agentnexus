use std::path::PathBuf;

#[derive(Debug, Clone, Copy)]
pub struct AgentPreset {
    pub id: &'static str,
    pub home_suffix: &'static str,
    pub rule_file: &'static str,
    pub default_enabled: bool,
}

pub const BUILTIN_AGENT_PRESETS: [AgentPreset; 14] = [
    AgentPreset {
        id: "codex",
        home_suffix: ".codex",
        rule_file: "AGENTS.md",
        default_enabled: true,
    },
    AgentPreset {
        id: "claude",
        home_suffix: ".claude",
        rule_file: "CLAUDE.md",
        default_enabled: true,
    },
    AgentPreset {
        id: "gemini",
        home_suffix: ".gemini",
        rule_file: "AGENTS.md",
        default_enabled: true,
    },
    AgentPreset {
        id: "copilot",
        home_suffix: ".copilot",
        rule_file: "AGENTS.md",
        default_enabled: false,
    },
    AgentPreset {
        id: "cursor",
        home_suffix: ".cursor",
        rule_file: "AGENTS.md",
        default_enabled: false,
    },
    AgentPreset {
        id: "windsurf",
        home_suffix: ".codeium/windsurf",
        rule_file: "AGENTS.md",
        default_enabled: false,
    },
    AgentPreset {
        id: "kiro",
        home_suffix: ".kiro",
        rule_file: "AGENTS.md",
        default_enabled: false,
    },
    AgentPreset {
        id: "trae",
        home_suffix: ".trae",
        rule_file: "AGENTS.md",
        default_enabled: false,
    },
    AgentPreset {
        id: "opencode",
        home_suffix: ".config/opencode",
        rule_file: "AGENTS.md",
        default_enabled: false,
    },
    AgentPreset {
        id: "roo",
        home_suffix: ".roo",
        rule_file: "AGENTS.md",
        default_enabled: false,
    },
    AgentPreset {
        id: "amp",
        home_suffix: ".config/agents",
        rule_file: "AGENTS.md",
        default_enabled: false,
    },
    AgentPreset {
        id: "openclaw",
        home_suffix: ".openclaw",
        rule_file: "AGENTS.md",
        default_enabled: false,
    },
    AgentPreset {
        id: "qoder",
        home_suffix: ".qoder",
        rule_file: "AGENTS.md",
        default_enabled: false,
    },
    AgentPreset {
        id: "codebuddy",
        home_suffix: ".codebuddy",
        rule_file: "AGENTS.md",
        default_enabled: false,
    },
];

pub fn all_builtin_agent_presets() -> &'static [AgentPreset] {
    &BUILTIN_AGENT_PRESETS
}

pub fn find_builtin_agent_preset(agent_type: &str) -> Option<&'static AgentPreset> {
    let normalized = agent_type.trim().to_lowercase();
    BUILTIN_AGENT_PRESETS
        .iter()
        .find(|preset| preset.id == normalized)
}

pub fn is_builtin_agent_preset(agent_type: &str) -> bool {
    find_builtin_agent_preset(agent_type).is_some()
}

pub fn default_agent_enabled(agent_type: &str) -> bool {
    find_builtin_agent_preset(agent_type)
        .map(|preset| preset.default_enabled)
        .unwrap_or(false)
}

pub fn default_agent_rule_file(agent_type: &str) -> String {
    find_builtin_agent_preset(agent_type)
        .map(|preset| preset.rule_file.to_string())
        .unwrap_or_else(|| "AGENTS.md".to_string())
}

pub fn default_agent_root_dir(agent_type: &str) -> String {
    let Some(preset) = find_builtin_agent_preset(agent_type) else {
        return String::new();
    };

    let Some(home) = dirs::home_dir() else {
        return String::new();
    };

    let suffix = preset.home_suffix;
    if suffix.is_empty() {
        return String::new();
    }

    let path = PathBuf::from(home).join(suffix);
    path.to_string_lossy().to_string()
}
