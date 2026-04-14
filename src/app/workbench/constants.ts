import type { SettingsCategory } from "../../features/shell/types";
import type { SkillOpenMode } from "../../shared/types";

export const AGENT_RULES_PAGE_SIZE = 10;
export const PROMPTS_PAGE_SIZE = 10;
export const SKILLS_PAGE_SIZE = 10;

export const SELECT_BASE_CLASS =
  "h-10 w-full appearance-none rounded-lg border border-border bg-background px-3 pr-9 text-sm text-foreground transition-colors hover:border-ring focus:outline-none";

export const SETTING_CATEGORY_KEYS: SettingsCategory[] = ["general", "data", "agents", "model", "about"];

export const SKILL_OPEN_MODE_STORAGE_KEY = "agentnexus.skills.open-mode";
export const SKILL_SCAN_DIR_STORAGE_KEY = "agentnexus.skills.scan.directories";
export const APP_LANGUAGE_STORAGE_KEY = "agentnexus.app.language";
export const APP_THEME_STORAGE_KEY = "agentnexus.app.theme";
export const TRANSLATION_TARGET_LANGUAGE_STORAGE_KEY = "agentnexus.translation.target-language";

export const DEFAULT_SKILL_SCAN_SUFFIXES = [".codex", ".claude", ".agents"] as const;

export const PROJECT_BOOTING_ZH = "项目初始化中，请稍后重试";
export const PROJECT_BOOTING_EN = "Project is initializing. Please try again shortly.";

export const AUTO_CHECK_APP_UPDATES = true;

export const PROMPT_TABLE_COLUMN_SETTINGS_KEY = "agentnexus.prompts.table.columns.v1";
export const LOCAL_AGENT_TRANSLATION_STREAM_EVENT = "local-agent-translation-stream";

export const DEFAULT_TRANSLATION_PROFILE_KEY = "codex";
export const DEFAULT_TRANSLATION_PROMPT_TEMPLATE = [
  "You are a strict translation engine.",
  "Translate source text into target language.",
  "Preserve the original content format exactly, including line breaks, indentation, markdown syntax, lists, tables, and code blocks.",
  "You MUST output exactly one valid JSON object and nothing else.",
  "Do not wrap JSON in markdown code fences.",
  "Do not output explanation text.",
  "",
  "Target language:",
  "{{target_language}}",
  "",
  "Source text:",
  "{{source_text}}",
  "",
  "Schema:",
  "{{output_schema_json}}",
].join("\n");

export const SKILL_OPEN_MODE_OPTIONS: Array<{
  value: SkillOpenMode;
  zh: string;
  en: string;
}> = [
  { value: "vscode", zh: "VS Code", en: "VS Code" },
  { value: "cursor", zh: "Cursor", en: "Cursor" },
  { value: "zed", zh: "Zed", en: "Zed" },
  { value: "finder", zh: "Finder", en: "Finder" },
  { value: "terminal", zh: "Terminal", en: "Terminal" },
  { value: "iterm2", zh: "iTerm2", en: "iTerm2" },
  { value: "xcode", zh: "Xcode", en: "Xcode" },
  { value: "goland", zh: "GoLand", en: "GoLand" },
  { value: "default", zh: "默认应用", en: "Default App" },
];

export const MODEL_TEST_TARGET_LANGUAGE_PRESETS: Array<{
  value: string;
  zh: string;
  en: string;
}> = [
  { value: "English", zh: "英语", en: "English" },
  { value: "中文", zh: "中文", en: "Chinese" },
  { value: "日本語", zh: "日语", en: "Japanese" },
  { value: "한국어", zh: "韩语", en: "Korean" },
  { value: "Français", zh: "法语", en: "French" },
  { value: "Deutsch", zh: "德语", en: "German" },
  { value: "Español", zh: "西班牙语", en: "Spanish" },
  { value: "Português", zh: "葡萄牙语", en: "Portuguese" },
  { value: "Русский", zh: "俄语", en: "Russian" },
];
