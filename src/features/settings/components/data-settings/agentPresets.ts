export type AgentPreset = {
  id: string;
  name: string;
  defaultEnabled: boolean;
  rootDirSuffix: string;
  ruleFile: string;
};

export const AGENT_PRESETS: AgentPreset[] = [
  {
    id: "codex",
    name: "Codex",
    defaultEnabled: true,
    rootDirSuffix: ".codex",
    ruleFile: "AGENTS.md",
  },
  {
    id: "claude",
    name: "Claude Codex",
    defaultEnabled: true,
    rootDirSuffix: ".claude",
    ruleFile: "CLAUDE.md",
  },
  {
    id: "gemini",
    name: "Gemini",
    defaultEnabled: true,
    rootDirSuffix: ".gemini",
    ruleFile: "AGENTS.md",
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    defaultEnabled: false,
    rootDirSuffix: ".copilot",
    ruleFile: "AGENTS.md",
  },
  {
    id: "cursor",
    name: "Cursor",
    defaultEnabled: false,
    rootDirSuffix: ".cursor",
    ruleFile: "AGENTS.md",
  },
  {
    id: "windsurf",
    name: "Windsurf",
    defaultEnabled: false,
    rootDirSuffix: ".codeium/windsurf",
    ruleFile: "AGENTS.md",
  },
  {
    id: "kiro",
    name: "Kiro",
    defaultEnabled: false,
    rootDirSuffix: ".kiro",
    ruleFile: "AGENTS.md",
  },
  {
    id: "trae",
    name: "Trae",
    defaultEnabled: false,
    rootDirSuffix: ".trae",
    ruleFile: "AGENTS.md",
  },
  {
    id: "opencode",
    name: "OpenCode",
    defaultEnabled: false,
    rootDirSuffix: ".config/opencode",
    ruleFile: "AGENTS.md",
  },
  {
    id: "roo",
    name: "Roo Code",
    defaultEnabled: false,
    rootDirSuffix: ".roo",
    ruleFile: "AGENTS.md",
  },
  {
    id: "amp",
    name: "Amp",
    defaultEnabled: false,
    rootDirSuffix: ".config/agents",
    ruleFile: "AGENTS.md",
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    defaultEnabled: false,
    rootDirSuffix: ".openclaw",
    ruleFile: "AGENTS.md",
  },
  {
    id: "qoder",
    name: "Qoder",
    defaultEnabled: false,
    rootDirSuffix: ".qoder",
    ruleFile: "AGENTS.md",
  },
  {
    id: "codebuddy",
    name: "CodeBuddy",
    defaultEnabled: false,
    rootDirSuffix: ".codebuddy",
    ruleFile: "AGENTS.md",
  },
];

export const DEFAULT_ENABLED_AGENT_PRESET_IDS = AGENT_PRESETS.filter((preset) => preset.defaultEnabled).map(
  (preset) => preset.id,
);

const AGENT_PRESET_BY_ID = new Map(AGENT_PRESETS.map((preset) => [preset.id, preset]));

export function normalizeAgentPresetId(value: string): string {
  return value.trim().toLowerCase();
}

export function isBuiltInAgentPreset(agentType: string): boolean {
  return AGENT_PRESET_BY_ID.has(normalizeAgentPresetId(agentType));
}

export function getAgentPresetById(agentType: string): AgentPreset | undefined {
  return AGENT_PRESET_BY_ID.get(normalizeAgentPresetId(agentType));
}

export function resolveAgentPresetRootDir(homePath: string, agentType: string): string {
  const preset = getAgentPresetById(agentType);
  if (!preset) {
    return "";
  }
  const normalizedHome = homePath.trim().replace(/[\\/]+$/, "");
  if (!normalizedHome) {
    return "";
  }
  return `${normalizedHome}/${preset.rootDirSuffix}`;
}

export function resolveAgentPresetRuleFile(agentType: string): string {
  return getAgentPresetById(agentType)?.ruleFile ?? "AGENTS.md";
}

export function toAgentPresetSortWeight(agentType: string): number {
  const normalized = normalizeAgentPresetId(agentType);
  const index = AGENT_PRESETS.findIndex((preset) => preset.id === normalized);
  if (index >= 0) {
    return index;
  }
  return AGENT_PRESETS.length;
}
