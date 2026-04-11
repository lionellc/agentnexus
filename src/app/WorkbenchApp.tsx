import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  AppWindow,
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Code2,
  Command,
  Copy,
  FileCode2,
  Folder,
  FolderOpen,
  Hammer,
  History,
  Pencil,
  RefreshCw,
  Save,
  Sparkles,
  Square,
  Terminal,
  Star,
  Trash2,
} from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { appDataDir, homeDir } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { flushSync } from "react-dom";

import { AppShell } from "../features/shell/AppShell";
import type { AppLanguage, SettingsCategory } from "../features/shell/types";
import { DataTable } from "../features/common/components/DataTable";
import { EmptyState } from "../features/common/components/EmptyState";
import { MarkdownEditor, MarkdownPreview } from "../features/common/components/MarkdownEditor";
import { TranslatableTextViewer } from "../features/common/components/TranslatableTextViewer";
import { VersionDiffViewer } from "../features/common/components/VersionDiffViewer";
import { SectionTitle } from "../features/common/components/SectionTitle";
import { ModelWorkbenchPanel } from "../features/settings/components/ModelWorkbenchPanel";
import { agentConnectionApi, skillsApi, translationApi, workspaceApi } from "../shared/services/api";
import {
  usePromptsStore,
  useAgentRulesStore,
  useSettingsStore,
  useShellStore,
  useSkillsStore,
} from "../shared/stores";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  useToast,
} from "../shared/ui";
import { buildLineDiff } from "../shared/utils/diff";
import { extractTemplateVariables, renderTemplatePreview } from "../shared/utils/template";
import { getPromptRunHistory, writePromptRunHistory } from "../shared/utils/promptRunHistory";
import type {
  LocalAgentProfileDto,
  LocalAgentTranslationTestResult,
  PromptTranslationConflictStrategy,
  PromptTranslationDto,
  SkillAsset,
  SkillOpenMode,
  SkillsFileReadResult,
  SkillsFileTreeNode,
  SkillsFileTreeResult,
} from "../shared/types";

const AGENT_RULES_PAGE_SIZE = 10;
const PROMPTS_PAGE_SIZE = 10;
const SKILLS_PAGE_SIZE = 10;
const SELECT_BASE_CLASS =
  "h-10 w-full appearance-none rounded-lg border border-border bg-background px-3 pr-9 text-sm text-foreground transition-colors hover:border-ring focus:outline-none";

const settingCategoryKeys: SettingsCategory[] = ["general", "data", "agents", "model", "about"];

const SKILL_OPEN_MODE_STORAGE_KEY = "agentnexus.skills.open-mode";
const SKILL_SCAN_DIR_STORAGE_KEY = "agentnexus.skills.scan.directories";
const APP_LANGUAGE_STORAGE_KEY = "agentnexus.app.language";
const APP_THEME_STORAGE_KEY = "agentnexus.app.theme";
const TRANSLATION_TARGET_LANGUAGE_STORAGE_KEY = "agentnexus.translation.target-language";
const DEFAULT_SKILL_SCAN_SUFFIXES = [".codex", ".claude", ".agents"] as const;
const PROJECT_BOOTING_ZH = "项目初始化中，请稍后重试";
const PROJECT_BOOTING_EN = "Project is initializing. Please try again shortly.";
const AUTO_CHECK_APP_UPDATES = true;
const PROMPT_TABLE_COLUMN_SETTINGS_KEY = "agentnexus.prompts.table.columns.v1";
const LOCAL_AGENT_TRANSLATION_STREAM_EVENT = "local-agent-translation-stream";
const MODEL_TEST_STREAM_FLUSH_INTERVAL_MS = 80;
const DEFAULT_TRANSLATION_PROFILE_KEY = "codex";
const DEFAULT_TRANSLATION_PROMPT_TEMPLATE = [
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

type LocalAgentTranslationStreamEvent = {
  requestId: string;
  stream: "stdout" | "stderr" | "lifecycle" | string;
  chunk: string;
  done: boolean;
  ts: string;
};

type SkillScanDirectory = {
  path: string;
  selected: boolean;
  source: "default" | "custom";
};
type AppTheme = "light" | "dark";
type AppUpdateStage =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "restarting"
  | "latest"
  | "error";
type AppUpdateProgress = {
  downloadedBytes: number;
  totalBytes?: number;
};
type PromptTranslationStage = "idle" | "running" | "reviewing";
type PromptBrowseScope = "all" | "categories" | "favorites";
type PromptBatchJumpSuggestion =
  | { type: "favorites" }
  | { type: "category"; categoryKey: string };
type PromptCategoryOption = {
  key: string;
  label: string;
  count: number;
  sortValue: string;
};

const PROMPT_BROWSE_CONTEXT_STORAGE_PREFIX = "agentnexus.prompts.browse-context.";
const PROMPT_CATEGORY_ALL_KEY = "__all__";
const PROMPT_CATEGORY_UNCATEGORIZED_KEY = "__uncategorized__";

const SKILL_OPEN_MODE_OPTIONS: Array<{
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

const MODEL_TEST_TARGET_LANGUAGE_PRESETS: Array<{
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

function renderSkillOpenModeIcon(mode: SkillOpenMode): ReactElement {
  switch (mode) {
    case "vscode":
      return <FileCode2 className="h-4 w-4" />;
    case "cursor":
      return <Sparkles className="h-4 w-4" />;
    case "zed":
      return <Square className="h-4 w-4" />;
    case "finder":
      return <FolderOpen className="h-4 w-4" />;
    case "terminal":
      return <Terminal className="h-4 w-4" />;
    case "iterm2":
      return <Command className="h-4 w-4" />;
    case "xcode":
      return <Hammer className="h-4 w-4" />;
    case "goland":
      return <Code2 className="h-4 w-4" />;
    default:
      return <AppWindow className="h-4 w-4" />;
  }
}

function toLocalTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function resolveInitialSkillOpenMode(): SkillOpenMode {
  if (typeof window === "undefined") {
    return "vscode";
  }
  const raw = window.localStorage.getItem(SKILL_OPEN_MODE_STORAGE_KEY);
  const found = SKILL_OPEN_MODE_OPTIONS.find((item) => item.value === raw);
  return found?.value ?? "vscode";
}

function resolveInitialLanguage(): AppLanguage {
  if (typeof window === "undefined") {
    return "zh-CN";
  }
  const raw = window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
  return raw === "en-US" ? "en-US" : "zh-CN";
}

function resolveInitialTheme(): AppTheme {
  if (typeof window === "undefined") {
    return "light";
  }
  const raw = window.localStorage.getItem(APP_THEME_STORAGE_KEY);
  if (raw === "dark") {
    return "dark";
  }
  if (raw === "light") {
    return "light";
  }
  if (typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveInitialTranslationTargetLanguage(): string {
  if (typeof window === "undefined") {
    return "English";
  }
  const raw = window.localStorage.getItem(TRANSLATION_TARGET_LANGUAGE_STORAGE_KEY)?.trim();
  return raw || "English";
}

async function waitForUiPaint(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
      return;
    }
    window.setTimeout(resolve, 0);
  });
}

function shouldUseMarkdownPreview(language: string): boolean {
  return language === "markdown";
}

function normalizeDirectoryInput(value: string): string {
  return value.trim().replace(/[\\/]+$/, "");
}

function buildDefaultSkillScanDirectories(home: string): SkillScanDirectory[] {
  const normalizedHome = normalizeDirectoryInput(home);
  if (!normalizedHome) {
    return [];
  }
  return DEFAULT_SKILL_SCAN_SUFFIXES.map((suffix) => ({
    path: `${normalizedHome}/${suffix}`,
    selected: true,
    source: "default" as const,
  }));
}

function migrateLegacySkillScanDirectory(path: string, home: string): string {
  const normalizedPath = normalizeDirectoryInput(path);
  const normalizedHome = normalizeDirectoryInput(home);
  if (!normalizedPath || !normalizedHome) {
    return normalizedPath;
  }
  const legacy = `${normalizedHome}/.agent`;
  if (normalizedPath !== legacy) {
    return normalizedPath;
  }
  return `${normalizedHome}/.agents`;
}

function mergeSkillScanDirectories(
  defaults: SkillScanDirectory[],
  persisted: SkillScanDirectory[],
): SkillScanDirectory[] {
  const defaultMap = new Map(
    defaults.map((item) => [normalizeDirectoryInput(item.path), item]),
  );
  const merged = defaults.map((item) => ({ ...item }));
  const mergedMap = new Map(
    merged.map((item) => [normalizeDirectoryInput(item.path), item]),
  );

  for (const item of persisted) {
    const normalized = normalizeDirectoryInput(item.path);
    if (!normalized) {
      continue;
    }
    const existing = mergedMap.get(normalized);
    if (existing) {
      existing.selected = Boolean(item.selected);
      continue;
    }
    const defaultItem = defaultMap.get(normalized);
    if (defaultItem) {
      merged.push({
        ...defaultItem,
        selected: Boolean(item.selected),
      });
      mergedMap.set(normalized, merged[merged.length - 1]);
      continue;
    }
    merged.push({
      path: normalized,
      selected: Boolean(item.selected),
      source: "custom",
    });
    mergedMap.set(normalized, merged[merged.length - 1]);
  }

  return merged;
}

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeAgentTypeInput(value: string): string {
  return value.trim().toLowerCase();
}

function defaultAgentConfigDir(home: string, agentType: string): string {
  const normalized = normalizeAgentTypeInput(agentType);
  const homeTrimmed = home.trim().replace(/[\\/]+$/, "");
  if (!homeTrimmed) {
    return "";
  }
  if (normalized === "codex") {
    return `${homeTrimmed}/.codex`;
  }
  if (normalized === "claude") {
    return `${homeTrimmed}/.claude`;
  }
  return "";
}

function defaultAgentRuleFile(agentType: string): string {
  const normalized = normalizeAgentTypeInput(agentType);
  if (normalized === "claude") {
    return "CLAUDE.md";
  }
  return "AGENTS.md";
}

function joinRuleFilePath(rootDir: string, ruleFile: string): string {
  const root = rootDir.trim().replace(/[\\/]+$/, "");
  const file = ruleFile.trim().replace(/^[\\/]+/, "");
  if (!root) {
    return file;
  }
  return `${root}/${file}`;
}

function isValidRuleFileInput(ruleFile: string): boolean {
  const trimmed = ruleFile.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith("/") || /^[A-Za-z]:[\\/]/.test(trimmed)) {
    return false;
  }
  return !trimmed.split(/[\\/]+/).some((segment) => segment === "..");
}

function toAgentSortWeight(agentType: string): number {
  const normalized = normalizeAgentTypeInput(agentType);
  if (normalized === "codex") {
    return 0;
  }
  if (normalized === "claude") {
    return 1;
  }
  return 2;
}

function isAbsolutePathInput(path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith("/")) {
    return true;
  }
  return /^[A-Za-z]:[\\/]/.test(trimmed);
}

function unknownToMessage(error: unknown, fallback = "Unknown error"): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  if (typeof error === "object" && error !== null) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return maybeMessage;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function unknownToCode(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.trim()) {
      return code.trim();
    }
    const nested = (error as { error?: { code?: unknown } }).error?.code;
    if (typeof nested === "string" && nested.trim()) {
      return nested.trim();
    }
  }
  return "";
}

function parseArgsTemplateInput(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }
  const parsed = JSON.parse(trimmed);
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    throw new Error("参数模板必须是字符串数组");
  }
  return parsed.map((item) => item.trim()).filter(Boolean);
}

function extractStdoutPreviewFromErrorMessage(message: string): string {
  const marker = "stdout 预览:\n";
  const idx = message.indexOf(marker);
  if (idx < 0) {
    return "";
  }
  return message.slice(idx + marker.length).trim();
}

function createRequestId(): string {
  const nativeCrypto = globalThis.crypto as Crypto | undefined;
  if (nativeCrypto?.randomUUID) {
    return nativeCrypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function appendPreviewChunk(previous: string, chunk: string, limit = 32 * 1024): string {
  if (!chunk) {
    return previous;
  }
  const combined = previous + chunk;
  if (combined.length <= limit) {
    return combined;
  }
  return combined.slice(combined.length - limit);
}

function formatElapsedMinSec(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes} min ${seconds} s`;
}

function formatElapsedCompact(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function parseRunningLifecycleSeconds(value: string): number | null {
  const matched = value.match(/^running:(\d+)\s+min\s+(\d+)\s+s$/);
  if (!matched) {
    return null;
  }
  const minutes = Number.parseInt(matched[1] ?? "0", 10);
  const seconds = Number.parseInt(matched[2] ?? "0", 10);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }
  return Math.max(0, minutes * 60 + seconds);
}

function normalizePromptCategoryKey(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return PROMPT_CATEGORY_UNCATEGORIZED_KEY;
  }
  const lowered = trimmed.toLowerCase();
  if (lowered === "default") {
    return PROMPT_CATEGORY_UNCATEGORIZED_KEY;
  }
  return lowered;
}

function parsePromptBrowseScope(value: string): PromptBrowseScope {
  if (value === "categories" || value === "favorites") {
    return value;
  }
  return "all";
}

function promptBrowseContextStorageKey(workspaceId: string): string {
  return `${PROMPT_BROWSE_CONTEXT_STORAGE_PREFIX}${workspaceId}.v1`;
}

function readPromptBrowseContext(workspaceId: string): { scope: PromptBrowseScope; categoryKey: string } | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(promptBrowseContextStorageKey(workspaceId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { scope?: string; categoryKey?: string };
    const scope = parsePromptBrowseScope(parsed.scope ?? "");
    const categoryKey = (parsed.categoryKey ?? "").trim() || PROMPT_CATEGORY_ALL_KEY;
    return {
      scope,
      categoryKey,
    };
  } catch {
    return null;
  }
}

function writePromptBrowseContext(
  workspaceId: string,
  context: { scope: PromptBrowseScope; categoryKey: string },
): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(promptBrowseContextStorageKey(workspaceId), JSON.stringify(context));
  } catch {
    // ignore storage write errors
  }
}

export function WorkbenchApp() {
  const { toast } = useToast();

  const activeModule = useShellStore((state) => state.activeModule);
  const setActiveModule = useShellStore((state) => state.setActiveModule);
  const promptViewMode = useShellStore((state) => state.promptViewMode);
  const setPromptViewMode = useShellStore((state) => state.setPromptViewMode);
  const skillDetailTab = useShellStore((state) => state.skillDetailTab);
  const setSkillDetailTab = useShellStore((state) => state.setSkillDetailTab);
  const settingsCategory = useShellStore((state) => state.settingsCategory);
  const setSettingsCategory = useShellStore((state) => state.setSettingsCategory);
  const sidebarOpen = useShellStore((state) => state.mobileSidebarOpen);
  const setSidebarOpen = useShellStore((state) => state.setMobileSidebarOpen);
  const mobileDetailOpen = useShellStore((state) => state.mobileDetailOpen);
  const setMobileDetailOpen = useShellStore((state) => state.setMobileDetailOpen);

  const prompts = usePromptsStore((state) => state.prompts);
  const promptsLoading = usePromptsStore((state) => state.loading);
  const selectedPromptId = usePromptsStore((state) => state.selectedPromptId);
  const promptVersions = usePromptsStore((state) => state.versionsByPromptId);
  const fetchPrompts = usePromptsStore((state) => state.fetchPrompts);
  const selectPrompt = usePromptsStore((state) => state.selectPrompt);
  const deletePrompt = usePromptsStore((state) => state.deletePrompt);
  const createPrompt = usePromptsStore((state) => state.createPrompt);
  const updatePrompt = usePromptsStore((state) => state.updatePrompt);
  const fetchPromptVersions = usePromptsStore((state) => state.fetchVersions);
  const restorePromptVersion = usePromptsStore((state) => state.restoreVersion);
  const promptSelectedIds = usePromptsStore((state) => state.selectedIds);
  const setPromptSelection = usePromptsStore((state) => state.setSelection);
  const clearPromptSelection = usePromptsStore((state) => state.clearSelection);
  const batchFavorite = usePromptsStore((state) => state.batchFavorite);
  const batchMove = usePromptsStore((state) => state.batchMove);
  const batchDelete = usePromptsStore((state) => state.batchDelete);
  const promptBatchResult = usePromptsStore((state) => state.lastBatchResult);

  const skills = useSkillsStore((state) => state.skills);
  const skillsLoading = useSkillsStore((state) => state.loading);
  const selectedSkillId = useSkillsStore((state) => state.selectedSkillId);
  const fetchSkills = useSkillsStore((state) => state.fetchSkills);
  const scanSkills = useSkillsStore((state) => state.scanSkills);
  const selectSkill = useSkillsStore((state) => state.selectSkill);

  const agentAssets = useAgentRulesStore((state) => state.assets);
  const agentTagsByAsset = useAgentRulesStore((state) => state.tagsByAsset);
  const agentVersionsByAsset = useAgentRulesStore((state) => state.versionsByAsset ?? {});
  const agentConnections = useAgentRulesStore((state) => state.connections);
  const agentRulesError = useAgentRulesStore((state) => state.lastActionError);
  const selectedAssetId = useAgentRulesStore((state) => state.selectedAssetId);
  const setSelectedAssetId = useAgentRulesStore((state) => state.setSelectedAssetId);
  const clearAgentRulesError = useAgentRulesStore((state) => state.clearError);
  const loadAgentModuleData = useAgentRulesStore((state) => state.loadModuleData);
  const loadAgentConnections = useAgentRulesStore((state) => state.loadConnections);
  const loadAgentVersions = useAgentRulesStore((state) => state.loadVersions);
  const createAgentAsset = useAgentRulesStore((state) => state.createAsset);
  const renameAgentAsset = useAgentRulesStore((state) => state.renameAsset);
  const deleteAgentAsset = useAgentRulesStore((state) => state.deleteAsset);
  const publishAgentVersion = useAgentRulesStore((state) => state.publishVersion);
  const rollbackAgentRuleVersion = useAgentRulesStore((state) => state.rollbackVersion);
  const refreshAgentAsset = useAgentRulesStore((state) => state.refreshAsset);
  const runAgentDistribution = useAgentRulesStore((state) => state.runDistribution);

  const workspaces = useSettingsStore((state) => state.workspaces);
  const activeWorkspaceId = useSettingsStore((state) => state.activeWorkspaceId);
  const settingsConnections = useSettingsStore((state) => state.connections);
  const dirty = useSettingsStore((state) => state.dirty);
  const settingsLoading = useSettingsStore((state) => state.loading);
  const loadAllSettings = useSettingsStore((state) => state.loadAll);
  const loadSettingsConnections = useSettingsStore((state) => state.loadConnections);
  const upsertConnection = useSettingsStore((state) => state.upsertConnection);
  const deleteConnection = useSettingsStore((state) => state.deleteConnection);
  const setDirty = useSettingsStore((state) => state.setDirty);
  const [language, setLanguage] = useState<AppLanguage>(() => resolveInitialLanguage());
  const [theme, setTheme] = useState<AppTheme>(() => resolveInitialTheme());
  const [appVersion, setAppVersion] = useState("-");
  const [appUpdateStage, setAppUpdateStage] = useState<AppUpdateStage>("idle");
  const [appUpdateVersion, setAppUpdateVersion] = useState("");
  const [appUpdateError, setAppUpdateError] = useState("");
  const [appUpdateProgress, setAppUpdateProgress] = useState<AppUpdateProgress | null>(null);
  const appUpdateRef = useRef<Update | null>(null);
  const appUpdateAutoCheckedRef = useRef(false);
  const skillOpenMenuRef = useRef<HTMLDivElement | null>(null);
  const showSkillOpenModeInStatusBar =
    typeof window !== "undefined" && window.innerWidth >= 1024 && /mac/i.test(navigator.platform);
  const isZh = language === "zh-CN";
  const isDarkTheme = theme === "dark";
  const l = (zh: string, en: string): string => (isZh ? zh : en);
  const projectBootingMessage = l(PROJECT_BOOTING_ZH, PROJECT_BOOTING_EN);
  const uiLanguage = isZh ? "zh" : "en";
  const markdownModeLabels = useMemo(
    () => ({
      edit: l("编辑", "Edit"),
      preview: l("预览", "Preview"),
      split: l("分栏", "Split"),
    }),
    [isZh],
  );
  const skillOpenModeOptions = useMemo(
    () =>
      SKILL_OPEN_MODE_OPTIONS.map((item) => ({
        value: item.value,
        label: isZh ? item.zh : item.en,
      })),
    [isZh],
  );

  const [createPromptOpen, setCreatePromptOpen] = useState(false);
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [agentVersionModalOpen, setAgentVersionModalOpen] = useState(false);
  const [agentDistributionModalOpen, setAgentDistributionModalOpen] = useState(false);
  const [agentRuleEditorModalOpen, setAgentRuleEditorModalOpen] = useState(false);
  const [agentRulesPage, setAgentRulesPage] = useState(1);
  const [promptPage, setPromptPage] = useState(1);
  const [skillsPage, setSkillsPage] = useState(1);
  const [deleteConfirmAssetId, setDeleteConfirmAssetId] = useState<string | null>(null);

  const [newPromptName, setNewPromptName] = useState("");
  const [newPromptContent, setNewPromptContent] = useState("");
  const [promptQuery, setPromptQuery] = useState("");
  const [promptBrowseScope, setPromptBrowseScope] = useState<PromptBrowseScope>("all");
  const [promptBrowseCategory, setPromptBrowseCategory] = useState<string>(PROMPT_CATEGORY_ALL_KEY);
  const [promptAllCategoryFilter, setPromptAllCategoryFilter] = useState<string>(PROMPT_CATEGORY_ALL_KEY);
  const [promptBatchJumpSuggestion, setPromptBatchJumpSuggestion] = useState<PromptBatchJumpSuggestion | null>(null);
  const [skillQuery, setSkillQuery] = useState("");
  const [skillSourceFilter, setSkillSourceFilter] = useState("all");
  const [promptDetailView, setPromptDetailView] = useState<"list" | "detail">("list");
  const [skillDetailView, setSkillDetailView] = useState<"list" | "detail">("list");
  const [skillOpenMode, setSkillOpenMode] = useState<SkillOpenMode>(() => resolveInitialSkillOpenMode());
  const [skillOpenMenuOpen, setSkillOpenMenuOpen] = useState(false);
  const [promptBatchCategory, setPromptBatchCategory] = useState("");
  const [promptRunOpen, setPromptRunOpen] = useState(false);
  const [promptRunFromDetail, setPromptRunFromDetail] = useState(false);
  const [promptRunPromptId, setPromptRunPromptId] = useState<string | null>(null);
  const [promptRunPromptName, setPromptRunPromptName] = useState("");
  const [promptRunContent, setPromptRunContent] = useState("");
  const [promptRunVariables, setPromptRunVariables] = useState<Record<string, string>>({});
  const [promptRunVariableOrder, setPromptRunVariableOrder] = useState<string[]>([]);
  const [promptRunVariableHistories, setPromptRunVariableHistories] = useState<Record<string, string[]>>({});
  const [skillTreeLoading, setSkillTreeLoading] = useState(false);
  const [skillTreeById, setSkillTreeById] = useState<Record<string, SkillsFileTreeResult>>({});
  const [skillExpandedDirsById, setSkillExpandedDirsById] = useState<Record<string, Record<string, boolean>>>({});
  const [skillSelectedFilePathById, setSkillSelectedFilePathById] = useState<Record<string, string>>({});
  const [skillFileReadLoading, setSkillFileReadLoading] = useState(false);
  const [skillFileReadByKey, setSkillFileReadByKey] = useState<Record<string, SkillsFileReadResult>>({});
  const [agentQuery, setAgentQuery] = useState("");
  const [storageDirDraft, setStorageDirDraft] = useState("");
  const [homePath, setHomePath] = useState("");
  const [homePathResolved, setHomePathResolved] = useState(false);
  const [settingsAgentType, setSettingsAgentType] = useState("codex");
  const [newSettingsAgentInput, setNewSettingsAgentInput] = useState("");
  const [skillScanDirectories, setSkillScanDirectories] = useState<SkillScanDirectory[]>([]);
  const [skillScanDirInput, setSkillScanDirInput] = useState("");
  const [skillScanDirsReady, setSkillScanDirsReady] = useState(false);

  const [detailName, setDetailName] = useState("");
  const [detailCategory, setDetailCategory] = useState("");
  const [detailTagsInput, setDetailTagsInput] = useState("");
  const [detailContent, setDetailContent] = useState("");
  const [detailFavorite, setDetailFavorite] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelSaving, setModelSaving] = useState(false);
  const [localAgentProfiles, setLocalAgentProfiles] = useState<LocalAgentProfileDto[]>([]);
  const [selectedModelProfileKey, setSelectedModelProfileKey] = useState("codex");
  const [modelProfileName, setModelProfileName] = useState("");
  const [modelExecutable, setModelExecutable] = useState("");
  const [modelArgsTemplateText, setModelArgsTemplateText] = useState("[]");
  const [newModelProfileKey, setNewModelProfileKey] = useState("");
  const [translationPromptTemplate, setTranslationPromptTemplate] = useState("");
  const [translationDefaultProfileKey, setTranslationDefaultProfileKey] = useState("codex");
  const [modelTestSourceText, setModelTestSourceText] = useState("");
  const [translationTargetLanguage, setTranslationTargetLanguage] = useState<string>(
    () => resolveInitialTranslationTargetLanguage(),
  );
  const [modelTestRunning, setModelTestRunning] = useState(false);
  const [modelScenarioSettingsOpen, setModelScenarioSettingsOpen] = useState(false);
  const [modelScenarioTestOpen, setModelScenarioTestOpen] = useState(false);
  const [modelTestOutputSheetOpen, setModelTestOutputSheetOpen] = useState(false);
  const [modelTestResult, setModelTestResult] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [modelTestOutput, setModelTestOutput] = useState<{
    stdout: string;
    stderr: string;
  } | null>(null);
  const [modelTestLifecycleText, setModelTestLifecycleText] = useState("");
  const modelTestOutputBufferRef = useRef<{ stdout: string; stderr: string }>({
    stdout: "",
    stderr: "",
  });
  const modelTestOutputFlushTimerRef = useRef<number | null>(null);
  const modelTestStderrRef = useRef<HTMLPreElement | null>(null);
  const translationTargetLanguageOptions = useMemo(() => {
    const presets = MODEL_TEST_TARGET_LANGUAGE_PRESETS.map((item) => ({
      value: item.value,
      label: isZh ? item.zh : item.en,
    }));
    const current = translationTargetLanguage.trim();
    if (!current || presets.some((item) => item.value === current)) {
      return presets;
    }
    return [{ value: current, label: current }, ...presets];
  }, [isZh, translationTargetLanguage]);
  const [promptTranslationLoading, setPromptTranslationLoading] = useState(false);
  const [promptTranslationRunning, setPromptTranslationRunning] = useState(false);
  const [promptTranslationStage, setPromptTranslationStage] = useState<PromptTranslationStage>("idle");
  const [promptTranslationResult, setPromptTranslationResult] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [promptTranslationElapsedSeconds, setPromptTranslationElapsedSeconds] = useState(0);
  const [promptTranslations, setPromptTranslations] = useState<PromptTranslationDto[]>([]);
  const [selectedPromptTranslationId, setSelectedPromptTranslationId] = useState<string | null>(null);
  const promptTranslationStartedAtRef = useRef<number | null>(null);
  const promptTranslationElapsedTimerRef = useRef<number | null>(null);

  const [compareLeftVersion, setCompareLeftVersion] = useState<number | null>(null);
  const [compareRightVersion, setCompareRightVersion] = useState<number | null>(null);
  const [promptVersionPreview, setPromptVersionPreview] = useState<number | null>(null);
  const [promptVersionCompareMode, setPromptVersionCompareMode] = useState(false);
  const [agentCompareLeftVersion, setAgentCompareLeftVersion] = useState<string>("");
  const [agentCompareRightVersion, setAgentCompareRightVersion] = useState<string>("");
  const [agentVersionPreview, setAgentVersionPreview] = useState<string>("");
  const [agentVersionCompareMode, setAgentVersionCompareMode] = useState(false);

  const [creatingAgentAsset, setCreatingAgentAsset] = useState(false);
  const [agentAssetNameInput, setAgentAssetNameInput] = useState("");
  const [agentEditorContent, setAgentEditorContent] = useState("");
  const [agentRuleTranslatedText, setAgentRuleTranslatedText] = useState("");
  const [skillFileTranslatedByKey, setSkillFileTranslatedByKey] = useState<Record<string, string>>({});
  const [agentTargetIds, setAgentTargetIds] = useState<string[]>([]);
  const [mappingPreviewOpen, setMappingPreviewOpen] = useState(false);
  const [mappingPreviewPlatform, setMappingPreviewPlatform] = useState("");
  const [mappingPreviewPath, setMappingPreviewPath] = useState("");
  const [mappingPreviewContent, setMappingPreviewContent] = useState("");
  const [mappingPreviewExists, setMappingPreviewExists] = useState(false);
  const [mappingPreviewMessage, setMappingPreviewMessage] = useState("");
  const [connectionDrafts, setConnectionDrafts] = useState<Record<string, string>>({
    codex: "",
    claude: "",
  });
  const [connectionRuleFileDrafts, setConnectionRuleFileDrafts] = useState<Record<string, string>>({
    codex: "AGENTS.md",
    claude: "CLAUDE.md",
  });

  useEffect(() => {
    return () => {
      const timer = modelTestOutputFlushTimerRef.current;
      if (timer !== null) {
        window.clearTimeout(timer);
        modelTestOutputFlushTimerRef.current = null;
      }
      const promptElapsedTimer = promptTranslationElapsedTimerRef.current;
      if (promptElapsedTimer !== null) {
        window.clearInterval(promptElapsedTimer);
        promptTranslationElapsedTimerRef.current = null;
      }
      promptTranslationStartedAtRef.current = null;
    };
  }, []);

  const selectedPrompt = useMemo(() => prompts.find((item) => item.id === selectedPromptId) ?? null, [prompts, selectedPromptId]);
  const selectedModelProfile = useMemo(
    () => localAgentProfiles.find((item) => item.profileKey === selectedModelProfileKey) ?? null,
    [localAgentProfiles, selectedModelProfileKey],
  );
  const modelTestRuntimeOutput = modelTestOutput ?? { stdout: "", stderr: "" };
  useEffect(() => {
    if (!modelTestOutputSheetOpen) {
      return;
    }
    const target = modelTestStderrRef.current;
    if (!target) {
      return;
    }
    target.scrollTop = target.scrollHeight;
  }, [modelTestOutputSheetOpen, modelTestRuntimeOutput.stderr]);
  const selectedPromptTranslation = useMemo(
    () => promptTranslations.find((item) => item.id === selectedPromptTranslationId) ?? null,
    [promptTranslations, selectedPromptTranslationId],
  );
  const promptTranslationElapsedLabel = useMemo(
    () => formatElapsedMinSec(promptTranslationElapsedSeconds),
    [promptTranslationElapsedSeconds],
  );
  useEffect(() => {
    if (promptTranslationRunning) {
      return;
    }
    if (selectedPromptTranslation) {
      setPromptTranslationStage("reviewing");
      return;
    }
    setPromptTranslationStage((prev) => (prev === "running" ? "running" : "idle"));
  }, [selectedPromptTranslation, promptTranslationRunning]);
  const selectedSkill = useMemo(() => skills.find((item) => item.id === selectedSkillId) ?? null, [skills, selectedSkillId]);
  const activeWorkspace = useMemo(
    () => workspaces.find((item) => item.id === activeWorkspaceId) ?? workspaces[0] ?? null,
    [workspaces, activeWorkspaceId],
  );
  const settingCategories = useMemo<Array<{ key: SettingsCategory; label: string }>>(
    () =>
      settingCategoryKeys.map((key) => {
        if (key === "general") {
          return { key, label: l("通用设置", "General") };
        }
        if (key === "data") {
          return { key, label: l("数据设置", "Data") };
        }
        if (key === "agents") {
          return { key, label: l("Agents", "Agents") };
        }
        if (key === "model") {
          return { key, label: l("AI 模型", "AI Models") };
        }
        if (key === "about") {
          return { key, label: l("关于", "About") };
        }
        return { key, label: key };
      }),
    [isZh],
  );

  const promptAllCategoryLabel = l("全部分类", "All Categories");
  const promptUncategorizedLabel = l("未分类", "Uncategorized");
  const formatPromptCategoryLabel = (category: string | null | undefined): string => {
    const normalized = normalizePromptCategoryKey(category);
    if (normalized === PROMPT_CATEGORY_UNCATEGORIZED_KEY) {
      return promptUncategorizedLabel;
    }
    const trimmed = (category ?? "").trim();
    return trimmed || category || "-";
  };

  const promptCategoryOptions = useMemo<PromptCategoryOption[]>(() => {
    const grouped = new Map<string, { label: string; count: number; sortValue: string }>();
    let uncategorizedCount = 0;

    for (const item of prompts) {
      const normalized = normalizePromptCategoryKey(item.category);
      if (normalized === PROMPT_CATEGORY_UNCATEGORIZED_KEY) {
        uncategorizedCount += 1;
        continue;
      }
      const trimmed = item.category.trim();
      const label = trimmed || normalized;
      const existing = grouped.get(normalized);
      if (!existing) {
        grouped.set(normalized, {
          label,
          count: 1,
          sortValue: normalized,
        });
        continue;
      }
      existing.count += 1;
      if (label.localeCompare(existing.label, undefined, { sensitivity: "base" }) < 0) {
        existing.label = label;
      }
    }

    const dynamicCategories = Array.from(grouped.entries())
      .map(([key, value]) => ({
        key,
        label: value.label,
        count: value.count,
        sortValue: value.sortValue,
      }))
      .sort((left, right) => left.sortValue.localeCompare(right.sortValue));

    return [
      {
        key: PROMPT_CATEGORY_ALL_KEY,
        label: promptAllCategoryLabel,
        count: prompts.length,
        sortValue: "",
      },
      {
        key: PROMPT_CATEGORY_UNCATEGORIZED_KEY,
        label: promptUncategorizedLabel,
        count: uncategorizedCount,
        sortValue: PROMPT_CATEGORY_UNCATEGORIZED_KEY,
      },
      ...dynamicCategories,
    ];
  }, [promptAllCategoryLabel, promptUncategorizedLabel, prompts]);

  const promptCategoryKeySet = useMemo(
    () => new Set(promptCategoryOptions.map((item) => item.key)),
    [promptCategoryOptions],
  );

  const promptBrowseContextLabel = useMemo(() => {
    if (promptBrowseScope === "favorites") {
      return l("Favorites", "Favorites");
    }
    if (promptBrowseScope === "categories") {
      const selectedCategory = promptCategoryOptions.find((item) => item.key === promptBrowseCategory);
      const selectedLabel = selectedCategory?.label ?? promptAllCategoryLabel;
      return l(`Categories > ${selectedLabel}`, `Categories > ${selectedLabel}`);
    }
    if (promptAllCategoryFilter !== PROMPT_CATEGORY_ALL_KEY) {
      const selectedCategory = promptCategoryOptions.find((item) => item.key === promptAllCategoryFilter);
      const selectedLabel = selectedCategory?.label ?? promptAllCategoryLabel;
      return l(`All > ${selectedLabel}`, `All > ${selectedLabel}`);
    }
    return l("All", "All");
  }, [
    l,
    promptAllCategoryFilter,
    promptAllCategoryLabel,
    promptBrowseCategory,
    promptBrowseScope,
    promptCategoryOptions,
  ]);

  const showPromptContextBar =
    promptBrowseScope !== "all" || promptAllCategoryFilter !== PROMPT_CATEGORY_ALL_KEY;

  const filteredPrompts = useMemo(() => {
    const keyword = promptQuery.trim().toLowerCase();
    return prompts.filter((item) => {
      const normalizedCategory = normalizePromptCategoryKey(item.category);
      if (promptBrowseScope === "favorites" && !item.favorite) {
        return false;
      }
      if (
        promptBrowseScope === "categories"
        && promptBrowseCategory !== PROMPT_CATEGORY_ALL_KEY
        && normalizedCategory !== promptBrowseCategory
      ) {
        return false;
      }
      if (
        promptBrowseScope === "all"
        && promptAllCategoryFilter !== PROMPT_CATEGORY_ALL_KEY
        && normalizedCategory !== promptAllCategoryFilter
      ) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      return (
        item.name.toLowerCase().includes(keyword)
        || item.content.toLowerCase().includes(keyword)
        || item.tags.some((tag) => tag.toLowerCase().includes(keyword))
      );
    });
  }, [promptAllCategoryFilter, promptBrowseCategory, promptBrowseScope, promptQuery, prompts]);
  const totalPromptPages = useMemo(
    () => Math.max(1, Math.ceil(filteredPrompts.length / PROMPTS_PAGE_SIZE)),
    [filteredPrompts.length],
  );
  const pagedPrompts = useMemo(() => {
    const start = (promptPage - 1) * PROMPTS_PAGE_SIZE;
    return filteredPrompts.slice(start, start + PROMPTS_PAGE_SIZE);
  }, [filteredPrompts, promptPage]);

  const skillSources = useMemo(() => {
    const set = new Set<string>();
    for (const item of skills) {
      const source = item.sourceParent?.trim();
      if (source) {
        set.add(source);
      }
    }
    return Array.from(set).sort((left, right) => left.localeCompare(right));
  }, [skills]);

  const filteredSkills = useMemo(() => {
    const lower = skillQuery.trim().toLowerCase();
    return skills.filter((item) => {
      if (skillSourceFilter !== "all" && item.sourceParent !== skillSourceFilter) {
        return false;
      }
      if (!lower) {
        return true;
      }
      return (
        item.name.toLowerCase().includes(lower) ||
        item.identity.toLowerCase().includes(lower) ||
        item.source.toLowerCase().includes(lower) ||
        item.sourceParent.toLowerCase().includes(lower)
      );
    });
  }, [skills, skillQuery, skillSourceFilter]);
  const totalSkillsPages = useMemo(
    () => Math.max(1, Math.ceil(filteredSkills.length / SKILLS_PAGE_SIZE)),
    [filteredSkills.length],
  );
  const pagedSkills = useMemo(() => {
    const start = (skillsPage - 1) * SKILLS_PAGE_SIZE;
    return filteredSkills.slice(start, start + SKILLS_PAGE_SIZE);
  }, [filteredSkills, skillsPage]);

  const filteredAgentAssets = useMemo(() => {
    if (!agentQuery.trim()) {
      return agentAssets;
    }
    const lower = agentQuery.toLowerCase();
    return agentAssets.filter((item) => {
      const latestVersion = String(item.latestVersion ?? "");
      return (
        item.name.toLowerCase().includes(lower) ||
        latestVersion.toLowerCase().includes(lower)
      );
    });
  }, [agentAssets, agentQuery]);
  const totalAgentPages = useMemo(
    () => Math.max(1, Math.ceil(filteredAgentAssets.length / AGENT_RULES_PAGE_SIZE)),
    [filteredAgentAssets.length],
  );
  const pagedAgentAssets = useMemo(() => {
    const start = (agentRulesPage - 1) * AGENT_RULES_PAGE_SIZE;
    return filteredAgentAssets.slice(start, start + AGENT_RULES_PAGE_SIZE);
  }, [filteredAgentAssets, agentRulesPage]);

  const selectedAgentAsset = useMemo(() => {
    if (!selectedAssetId) {
      return null;
    }
    return agentAssets.find((item) => item.id === selectedAssetId) ?? null;
  }, [agentAssets, selectedAssetId]);

  const settingsAgentTypes = useMemo(() => {
    const keys = Object.keys(connectionDrafts);
    keys.sort((left, right) => {
      const weightDiff = toAgentSortWeight(left) - toAgentSortWeight(right);
      if (weightDiff !== 0) {
        return weightDiff;
      }
      return left.localeCompare(right);
    });
    return keys;
  }, [connectionDrafts]);

  const selectedSettingsAgentType = settingsAgentTypes.includes(settingsAgentType)
    ? settingsAgentType
    : settingsAgentTypes[0] ?? "codex";
  const selectedSettingsRootDir = connectionDrafts[selectedSettingsAgentType] ?? "";
  const selectedSettingsRuleFile =
    connectionRuleFileDrafts[selectedSettingsAgentType] ?? defaultAgentRuleFile(selectedSettingsAgentType);
  const selectedSettingsResolvedPath = selectedSettingsRootDir.trim()
    ? joinRuleFilePath(selectedSettingsRootDir, selectedSettingsRuleFile)
    : selectedSettingsRuleFile;
  const selectedSkillScanDirectories = useMemo(
    () =>
      skillScanDirectories
        .filter((item) => item.selected)
        .map((item) => normalizeDirectoryInput(item.path))
        .filter(Boolean),
    [skillScanDirectories],
  );

  const selectedPromptVersions = selectedPrompt ? promptVersions[selectedPrompt.id] ?? [] : [];
  const selectedAgentVersions = selectedAssetId ? agentVersionsByAsset[selectedAssetId] ?? [] : [];
  const selectedPromptPreviewVersion = useMemo(
    () =>
      promptVersionPreview === null
        ? null
        : selectedPromptVersions.find((item) => item.version === promptVersionPreview) ?? null,
    [selectedPromptVersions, promptVersionPreview],
  );
  const selectedAgentPreviewVersion = useMemo(
    () =>
      agentVersionPreview
        ? selectedAgentVersions.find((item) => String(item.version) === agentVersionPreview) ?? null
        : null,
    [selectedAgentVersions, agentVersionPreview],
  );

  const promptDiffLines = useMemo(() => {
    if (!selectedPrompt || compareLeftVersion === null || compareRightVersion === null) {
      return [];
    }
    const left = selectedPromptVersions.find((item) => item.version === compareLeftVersion);
    const right = selectedPromptVersions.find((item) => item.version === compareRightVersion);
    if (!left || !right) {
      return [];
    }
    return buildLineDiff(left.content, right.content);
  }, [selectedPrompt, selectedPromptVersions, compareLeftVersion, compareRightVersion]);
  const promptCompareLeft = useMemo(
    () =>
      compareLeftVersion === null
        ? null
        : selectedPromptVersions.find((item) => item.version === compareLeftVersion) ?? null,
    [selectedPromptVersions, compareLeftVersion],
  );
  const promptCompareRight = useMemo(
    () =>
      compareRightVersion === null
        ? null
        : selectedPromptVersions.find((item) => item.version === compareRightVersion) ?? null,
    [selectedPromptVersions, compareRightVersion],
  );

  const selectedSkillTree = selectedSkillId ? skillTreeById[selectedSkillId] : undefined;
  const selectedSkillExpandedDirs = selectedSkillId ? skillExpandedDirsById[selectedSkillId] ?? {} : {};
  const selectedSkillFilePath = selectedSkillId ? skillSelectedFilePathById[selectedSkillId] ?? "SKILL.md" : "SKILL.md";
  const selectedSkillOverviewRead = selectedSkillId ? skillFileReadByKey[`${selectedSkillId}:SKILL.md`] ?? null : null;
  const selectedSkillFileRead = selectedSkillId
    ? skillFileReadByKey[`${selectedSkillId}:${selectedSkillFilePath}`] ?? null
    : null;
  const selectedSkillTranslationKey = selectedSkillId
    ? `${selectedSkillId}:${selectedSkillFilePath}`
    : "";
  const selectedSkillTranslatedText = selectedSkillTranslationKey
    ? skillFileTranslatedByKey[selectedSkillTranslationKey] ?? ""
    : "";
  const selectedSkillOpenModeOption = skillOpenModeOptions.find((item) => item.value === skillOpenMode) ?? skillOpenModeOptions[0];
  const skillOpenModeLabel = selectedSkillOpenModeOption?.label ?? "VS Code";
  const promptTableColumnSettingsKey = useMemo(
    () => `${PROMPT_TABLE_COLUMN_SETTINGS_KEY}:${activeWorkspaceId ?? "default"}`,
    [activeWorkspaceId],
  );
  const promptRunPreview = useMemo(
    () => renderTemplatePreview(promptRunContent, promptRunVariables),
    [promptRunContent, promptRunVariables],
  );

  const agentVersionDiffLines = useMemo(() => {
    if (!selectedAssetId || !agentCompareLeftVersion || !agentCompareRightVersion) {
      return [];
    }
    const left = selectedAgentVersions.find((item) => String(item.version) === agentCompareLeftVersion);
    const right = selectedAgentVersions.find((item) => String(item.version) === agentCompareRightVersion);
    if (!left || !right) {
      return [];
    }
    return buildLineDiff(left.content ?? "", right.content ?? "");
  }, [selectedAssetId, selectedAgentVersions, agentCompareLeftVersion, agentCompareRightVersion]);
  const agentCompareLeft = useMemo(
    () =>
      agentCompareLeftVersion
        ? selectedAgentVersions.find((item) => String(item.version) === agentCompareLeftVersion) ?? null
        : null,
    [selectedAgentVersions, agentCompareLeftVersion],
  );
  const agentCompareRight = useMemo(
    () =>
      agentCompareRightVersion
        ? selectedAgentVersions.find((item) => String(item.version) === agentCompareRightVersion) ?? null
        : null,
    [selectedAgentVersions, agentCompareRightVersion],
  );
  const promptDiffStats = useMemo(
    () =>
      promptDiffLines.reduce(
        (acc, line) => {
          if (line.type === "added") {
            acc.added += 1;
          }
          if (line.type === "removed") {
            acc.removed += 1;
          }
          return acc;
        },
        { added: 0, removed: 0 },
      ),
    [promptDiffLines],
  );
  const agentDiffStats = useMemo(
    () =>
      agentVersionDiffLines.reduce(
        (acc, line) => {
          if (line.type === "added") {
            acc.added += 1;
          }
          if (line.type === "removed") {
            acc.removed += 1;
          }
          return acc;
        },
        { added: 0, removed: 0 },
      ),
    [agentVersionDiffLines],
  );

  async function loadModelWorkbenchData(workspaceId: string) {
    setModelLoading(true);
    try {
      const [profiles, config] = await Promise.all([
        translationApi.listProfiles(workspaceId),
        translationApi.getConfig(workspaceId),
      ]);
      setLocalAgentProfiles(profiles);
      setTranslationPromptTemplate(config.promptTemplate);
      setTranslationDefaultProfileKey(config.defaultProfileKey);

      const nextProfileKey =
        profiles.some((item) => item.profileKey === selectedModelProfileKey)
          ? selectedModelProfileKey
          : profiles.some((item) => item.profileKey === config.defaultProfileKey)
            ? config.defaultProfileKey
            : profiles[0]?.profileKey ?? "codex";
      setSelectedModelProfileKey(nextProfileKey);
    } catch (error) {
      toast({
        title: l("加载模型工作台失败", "Failed to load model workbench"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    } finally {
      setModelLoading(false);
    }
  }

  async function loadPromptTranslationsByCurrentPrompt(nextLanguage?: string) {
    if (!activeWorkspaceId || !selectedPrompt) {
      setPromptTranslations([]);
      setSelectedPromptTranslationId(null);
      return;
    }

    setPromptTranslationLoading(true);
    try {
      const rows = await translationApi.listPromptTranslations({
        workspaceId: activeWorkspaceId,
        promptId: selectedPrompt.id,
        promptVersion: selectedPrompt.activeVersion,
        targetLanguage: nextLanguage?.trim() ? nextLanguage.trim() : undefined,
        limit: 50,
      });
      setPromptTranslations(rows);
      setSelectedPromptTranslationId((prev) => {
        if (prev && rows.some((item) => item.id === prev)) {
          return prev;
        }
        return rows[0]?.id ?? null;
      });
    } catch (error) {
      toast({
        title: l("读取译文失败", "Failed to load translations"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    } finally {
      setPromptTranslationLoading(false);
    }
  }

  async function runPromptTranslation(initialStrategy?: PromptTranslationConflictStrategy) {
    if (!activeWorkspaceId || !selectedPrompt) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    const targetLanguage = translationTargetLanguage.trim();
    if (!targetLanguage) {
      toast({
        title: l("请先输入目标语言", "Please input target language"),
        variant: "destructive",
      });
      return;
    }

    const requestId = createRequestId();
    let strategy = initialStrategy;
    let unlistenStream: UnlistenFn | null = null;

    flushSync(() => {
      setPromptTranslationRunning(true);
      setPromptTranslationStage("running");
      setPromptTranslationResult(null);
      startPromptTranslationElapsedTimer();
      setModelTestOutputSheetOpen(true);
      setModelTestRunning(true);
      setModelTestResult(null);
      setModelTestLifecycleText(l("准备运行...", "Preparing..."));
      clearModelTestOutputFlushTimer();
      modelTestOutputBufferRef.current = { stdout: "", stderr: "" };
      setModelTestOutput({ stdout: "", stderr: "" });
    });

    await waitForUiPaint();

    try {
      if (isTauri()) {
        unlistenStream = await listen<LocalAgentTranslationStreamEvent>(
          LOCAL_AGENT_TRANSLATION_STREAM_EVENT,
          (event) => {
            const payload = event.payload;
            if (!payload || payload.requestId !== requestId) {
              return;
            }
            if (payload.stream === "stdout") {
              appendModelTestOutputChunk("stdout", payload.chunk ?? "");
              return;
            }
            if (payload.stream === "stderr") {
              appendModelTestOutputChunk("stderr", payload.chunk ?? "");
              return;
            }
            if (payload.stream === "lifecycle") {
              const lifecycleText = (payload.chunk ?? "").trim();
              if (!lifecycleText) {
                return;
              }
              updateModelTestLifecycleText(lifecycleText);
              if (lifecycleText === "started") {
                setPromptTranslationStage("running");
                return;
              }
              const lifecycleSeconds = parseRunningLifecycleSeconds(lifecycleText);
              if (lifecycleSeconds !== null) {
                setPromptTranslationElapsedSeconds(lifecycleSeconds);
              }
            }
          },
        );
      }

      while (true) {
        try {
          const created = await translationApi.runPromptTranslation({
            workspaceId: activeWorkspaceId,
            promptId: selectedPrompt.id,
            promptVersion: selectedPrompt.activeVersion,
            sourceText: detailContent,
            targetLanguage,
            profileKey: selectedModelProfileKey || undefined,
            strategy,
            applyMode: "immersive",
            requestId,
          });
          await loadPromptTranslationsByCurrentPrompt(targetLanguage);
          setSelectedPromptTranslationId(created.id);
          setPromptTranslationStage("reviewing");
          setPromptTranslationResult({
            ok: true,
            text: l(
              "翻译完成，已保存为该 Prompt 的翻译资产，可直接复用。",
              "Translation completed and saved as a prompt translation asset for reuse.",
            ),
          });
          if (!modelTestOutputBufferRef.current.stdout) {
            modelTestOutputBufferRef.current.stdout = JSON.stringify(
              {
                translatedText: created.translatedText,
                targetLanguage: created.targetLanguage,
              },
              null,
              2,
            );
          }
          flushModelTestOutputBuffer();
          setModelTestResult({
            ok: true,
            text: l("翻译完成", "Translation completed"),
          });
          setModelTestLifecycleText(l("已完成", "Completed"));
          toast({ title: l("翻译完成", "Translation completed") });
          break;
        } catch (error) {
          const code = unknownToCode(error);
          if (code === "TRANSLATION_CONFLICT" && !strategy) {
            const overwrite = window.confirm(
              l(
                "同版本同语言已有译文。\n确定：覆盖现有译文\n取消：另存新译文",
                "A translation already exists for this version and language.\nOK: overwrite\nCancel: save as new variant",
              ),
            );
            strategy = overwrite ? "overwrite" : "save_as";
            continue;
          }
          throw error;
        }
      }
    } catch (error) {
      const message = unknownToMessage(error, l("未知错误", "Unknown error"));
      const stdout = extractStdoutPreviewFromErrorMessage(message);
      if (!modelTestOutputBufferRef.current.stdout && stdout) {
        modelTestOutputBufferRef.current.stdout = stdout;
      }
      if (!modelTestOutputBufferRef.current.stderr) {
        modelTestOutputBufferRef.current.stderr = message;
      }
      flushModelTestOutputBuffer();
      setPromptTranslationStage("idle");
      setPromptTranslationResult({ ok: false, text: message });
      setModelTestResult({
        ok: false,
        text: message,
      });
      setModelTestLifecycleText(l("执行失败", "Execution failed"));
      toast({
        title: l("翻译失败", "Translation failed"),
        description: message,
        variant: "destructive",
      });
    } finally {
      if (unlistenStream) {
        unlistenStream();
      }
      flushModelTestOutputBuffer();
      stopPromptTranslationElapsedTimer();
      setPromptTranslationRunning(false);
      setModelTestRunning(false);
    }
  }

  async function checkAppUpdates(announceNoUpdate = true) {
    if (!isTauri()) {
      toast({
        title: l("仅桌面端支持应用更新", "App updates are available only in desktop runtime"),
        variant: "destructive",
      });
      return;
    }

    const previousUpdate = appUpdateRef.current;
    appUpdateRef.current = null;
    if (previousUpdate) {
      try {
        await previousUpdate.close();
      } catch {
        // 忽略旧更新对象关闭失败
      }
    }

    let update: Update | null = null;
    try {
      setAppUpdateError("");
      setAppUpdateProgress(null);
      setAppUpdateStage("checking");
      update = await check();
      if (!update) {
        setAppUpdateVersion("");
        setAppUpdateStage(announceNoUpdate ? "latest" : "idle");
        return;
      }
      appUpdateRef.current = update;
      setAppUpdateVersion(update.version);
      setAppUpdateStage("available");
    } catch (error) {
      const message = unknownToMessage(error, l("检查更新失败", "Failed to check updates"));
      setAppUpdateError(message);
      setAppUpdateStage("error");
      toast({
        title: l("检查更新失败", "Failed to check updates"),
        description: message,
        variant: "destructive",
      });
    } finally {
      if (!appUpdateRef.current && update) {
        try {
          await update.close();
        } catch {
          // 忽略关闭失败
        }
      }
    }
  }

  async function installAppUpdate() {
    if (!isTauri()) {
      toast({
        title: l("仅桌面端支持应用更新", "App updates are available only in desktop runtime"),
        variant: "destructive",
      });
      return;
    }

    let update = appUpdateRef.current;
    if (!update) {
      await checkAppUpdates(false);
      update = appUpdateRef.current;
      if (!update) {
        return;
      }
    }

    try {
      setAppUpdateError("");
      setAppUpdateProgress({ downloadedBytes: 0 });
      setAppUpdateStage("downloading");
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          setAppUpdateProgress({
            downloadedBytes: 0,
            totalBytes: event.data.contentLength,
          });
          return;
        }
        if (event.event === "Progress") {
          setAppUpdateProgress((prev) => ({
            totalBytes: prev?.totalBytes,
            downloadedBytes: (prev?.downloadedBytes ?? 0) + event.data.chunkLength,
          }));
          return;
        }
        if (event.event === "Finished") {
          setAppUpdateStage("installing");
        }
      });

      setAppUpdateStage("restarting");
      await relaunch();
    } catch (error) {
      const message = unknownToMessage(error, l("安装更新失败", "Failed to install update"));
      setAppUpdateError(message);
      setAppUpdateStage("error");
      toast({
        title: l("安装更新失败", "Failed to install update"),
        description: message,
        variant: "destructive",
      });
    }
  }

  const appUpdateStatusText = useMemo(() => {
    if (appUpdateStage === "checking") {
      return l("正在检查更新...", "Checking for updates...");
    }
    if (appUpdateStage === "available") {
      return l(`发现新版本 v${appUpdateVersion}`, `New version v${appUpdateVersion} is available`);
    }
    if (appUpdateStage === "downloading") {
      const downloaded = appUpdateProgress?.downloadedBytes ?? 0;
      const total = appUpdateProgress?.totalBytes;
      if (total && total > 0) {
        const percent = Math.min(100, Math.round((downloaded / total) * 100));
        return l(
          `正在下载更新... ${percent}% (${formatBytes(downloaded)} / ${formatBytes(total)})`,
          `Downloading update... ${percent}% (${formatBytes(downloaded)} / ${formatBytes(total)})`,
        );
      }
      return l(
        `正在下载更新... (${formatBytes(downloaded)})`,
        `Downloading update... (${formatBytes(downloaded)})`,
      );
    }
    if (appUpdateStage === "installing") {
      return l("正在安装更新...", "Installing update...");
    }
    if (appUpdateStage === "restarting") {
      return l("安装完成，正在重启应用...", "Update installed, restarting app...");
    }
    if (appUpdateStage === "latest") {
      return l("当前已是最新版本", "You are on the latest version");
    }
    if (appUpdateStage === "error") {
      return appUpdateError || l("更新失败", "Update failed");
    }
    return l("启动时会自动检查更新，也可手动检查。", "App checks for updates on startup, and supports manual checks.");
  }, [appUpdateError, appUpdateProgress, appUpdateStage, appUpdateVersion, isZh]);

  useEffect(() => {
    void loadAllSettings();
  }, [loadAllSettings]);

  useEffect(() => {
    void (async () => {
      try {
        const path = await homeDir();
        setHomePath(path);
      } catch {
        setHomePath("");
      } finally {
        setHomePathResolved(true);
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const version = await getVersion();
        setAppVersion(version);
      } catch {
        setAppVersion("-");
      }
    })();
  }, []);

  useEffect(() => {
    if (!AUTO_CHECK_APP_UPDATES || appUpdateAutoCheckedRef.current || !isTauri()) {
      return;
    }
    appUpdateAutoCheckedRef.current = true;
    void checkAppUpdates(false);
  }, []);

  useEffect(() => {
    return () => {
      const update = appUpdateRef.current;
      appUpdateRef.current = null;
      if (update) {
        void update.close();
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, theme);
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const normalized = translationTargetLanguage.trim() || "English";
    window.localStorage.setItem(TRANSLATION_TARGET_LANGUAGE_STORAGE_KEY, normalized);
  }, [translationTargetLanguage]);

  useEffect(() => {
    if (!homePathResolved || skillScanDirsReady) {
      return;
    }
    const defaults = buildDefaultSkillScanDirectories(homePath);
    if (typeof window === "undefined") {
      setSkillScanDirectories(defaults);
      setSkillScanDirsReady(true);
      return;
    }
    try {
      const raw = window.localStorage.getItem(SKILL_SCAN_DIR_STORAGE_KEY);
      if (!raw) {
        setSkillScanDirectories(defaults);
        setSkillScanDirsReady(true);
        return;
      }
      const parsed = JSON.parse(raw) as Array<Partial<SkillScanDirectory>>;
      const persisted = Array.isArray(parsed)
        ? parsed
            .map((item) => {
              const path = migrateLegacySkillScanDirectory(String(item.path ?? ""), homePath);
              if (!path) {
                return null;
              }
              const source =
                item.source === "default" || item.source === "custom"
                  ? item.source
                  : "custom";
              return {
                path,
                selected: Boolean(item.selected),
                source,
              } satisfies SkillScanDirectory;
            })
            .filter((item): item is SkillScanDirectory => Boolean(item))
        : [];
      setSkillScanDirectories(mergeSkillScanDirectories(defaults, persisted));
      setSkillScanDirsReady(true);
    } catch {
      setSkillScanDirectories(defaults);
      setSkillScanDirsReady(true);
    }
  }, [homePath, homePathResolved, skillScanDirsReady]);

  useEffect(() => {
    if (!skillScanDirsReady || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      SKILL_SCAN_DIR_STORAGE_KEY,
      JSON.stringify(skillScanDirectories),
    );
  }, [skillScanDirsReady, skillScanDirectories]);

  useEffect(() => {
    if (!activeWorkspaceId) {
      return;
    }
    void fetchPrompts(activeWorkspaceId);
    void fetchSkills();
    void loadAgentModuleData(activeWorkspaceId);
    void loadModelWorkbenchData(activeWorkspaceId);
  }, [activeWorkspaceId, fetchPrompts, fetchSkills, loadAgentModuleData]);

  useEffect(() => {
    if (!selectedModelProfile) {
      setModelProfileName("");
      setModelExecutable("");
      setModelArgsTemplateText("[]");
      return;
    }
    setModelProfileName(selectedModelProfile.name);
    setModelExecutable(selectedModelProfile.executable);
    setModelArgsTemplateText(JSON.stringify(selectedModelProfile.argsTemplate, null, 2));
  }, [selectedModelProfile]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(SKILL_OPEN_MODE_STORAGE_KEY, skillOpenMode);
  }, [skillOpenMode]);

  useEffect(() => {
    if (!skillOpenMenuOpen || typeof document === "undefined") {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (skillOpenMenuRef.current?.contains(target)) {
        return;
      }
      setSkillOpenMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSkillOpenMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [skillOpenMenuOpen]);

  useEffect(() => {
    if (activeModule !== "prompts") {
      setPromptDetailView("list");
      selectPrompt(null);
    }
  }, [activeModule, selectPrompt]);

  useEffect(() => {
    setAgentRulesPage((prev) => Math.min(prev, totalAgentPages));
  }, [totalAgentPages]);
  useEffect(() => {
    setPromptPage((prev) => Math.min(prev, totalPromptPages));
  }, [totalPromptPages]);
  useEffect(() => {
    setSkillsPage((prev) => Math.min(prev, totalSkillsPages));
  }, [totalSkillsPages]);
  useEffect(() => {
    setPromptPage(1);
  }, [promptAllCategoryFilter, promptBrowseCategory, promptBrowseScope, promptQuery]);
  useEffect(() => {
    setSkillsPage(1);
  }, [skillQuery, skillSourceFilter]);

  useEffect(() => {
    if (!activeWorkspaceId) {
      return;
    }
    const context = readPromptBrowseContext(activeWorkspaceId);
    setPromptAllCategoryFilter(PROMPT_CATEGORY_ALL_KEY);
    if (context) {
      setPromptBrowseScope(context.scope);
      setPromptBrowseCategory(context.categoryKey || PROMPT_CATEGORY_ALL_KEY);
      return;
    }
    setPromptBrowseScope("all");
    setPromptBrowseCategory(PROMPT_CATEGORY_ALL_KEY);
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!activeWorkspaceId) {
      return;
    }
    writePromptBrowseContext(activeWorkspaceId, {
      scope: promptBrowseScope,
      categoryKey: promptBrowseCategory || PROMPT_CATEGORY_ALL_KEY,
    });
  }, [activeWorkspaceId, promptBrowseCategory, promptBrowseScope]);

  useEffect(() => {
    if (promptBrowseScope !== "categories") {
      return;
    }
    if (promptCategoryKeySet.has(promptBrowseCategory)) {
      return;
    }
    setPromptBrowseCategory(PROMPT_CATEGORY_ALL_KEY);
  }, [promptBrowseCategory, promptBrowseScope, promptCategoryKeySet]);

  useEffect(() => {
    if (!settingCategories.some((item) => item.key === settingsCategory)) {
      setSettingsCategory("general");
    }
  }, [settingsCategory, setSettingsCategory]);

  useEffect(() => {
    setStorageDirDraft(activeWorkspace?.rootPath ?? "");
  }, [activeWorkspace?.rootPath]);

  useEffect(() => {
    if (creatingAgentAsset) {
      return;
    }
    if (!selectedAgentAsset) {
      if (agentAssets.length > 0) {
        setSelectedAssetId(agentAssets[0].id);
      } else {
        setCreatingAgentAsset(true);
        setAgentAssetNameInput(l("规则文件 1", "Rule File 1"));
        setAgentEditorContent("");
      }
      return;
    }
    setAgentAssetNameInput(selectedAgentAsset.name);
    if (typeof selectedAgentAsset.latestContent === "string") {
      setAgentEditorContent(selectedAgentAsset.latestContent);
    }
  }, [creatingAgentAsset, selectedAgentAsset, agentAssets, setSelectedAssetId]);

  useEffect(() => {
    if (creatingAgentAsset || !selectedAssetId) {
      return;
    }
    const latestVersion = agentVersionsByAsset[selectedAssetId]?.[0];
    if (typeof latestVersion?.content === "string") {
      setAgentEditorContent(latestVersion.content);
    }
  }, [creatingAgentAsset, selectedAssetId, agentVersionsByAsset]);

  useEffect(() => {
    setAgentRuleTranslatedText("");
  }, [creatingAgentAsset, selectedAssetId]);

  useEffect(() => {
    setSkillFileTranslatedByKey({});
  }, [selectedSkillId]);

  useEffect(() => {
    if (!activeWorkspaceId) {
      setAgentTargetIds([]);
      return;
    }
    const next = agentConnections
      .filter((item) => item.enabled)
      .map((item) => item.agentType);
    setAgentTargetIds(next);
  }, [activeWorkspaceId, agentConnections]);

  useEffect(() => {
    const nextRoots: Record<string, string> = {};
    const nextRules: Record<string, string> = {};
    const defaults = ["codex", "claude"];
    defaults.forEach((agentType) => {
      nextRoots[agentType] = defaultAgentConfigDir(homePath, agentType);
      nextRules[agentType] = defaultAgentRuleFile(agentType);
    });
    settingsConnections.forEach((connection) => {
      const key = normalizeAgentTypeInput(connection.platform);
      nextRoots[key] = connection.rootDir || defaultAgentConfigDir(homePath, key);
      nextRules[key] = connection.ruleFile || defaultAgentRuleFile(key);
    });
    setConnectionDrafts(nextRoots);
    setConnectionRuleFileDrafts(nextRules);
  }, [settingsConnections, homePath]);

  useEffect(() => {
    const keys = Object.keys(connectionDrafts);
    if (keys.length === 0) {
      return;
    }
    if (!keys.includes(settingsAgentType)) {
      setSettingsAgentType(keys[0]);
    }
  }, [connectionDrafts, settingsAgentType]);

  useEffect(() => {
    if (!selectedPrompt) {
      setDetailName("");
      setDetailCategory("");
      setDetailTagsInput("");
      setDetailContent("");
      setDetailFavorite(false);
      setPromptTranslations([]);
      setSelectedPromptTranslationId(null);
      setPromptTranslationStage("idle");
      setPromptTranslationResult(null);
      setPromptTranslationElapsedSeconds(0);
      stopPromptTranslationElapsedTimer();
      return;
    }

    setDetailName(selectedPrompt.name);
    setDetailCategory(selectedPrompt.category);
    setDetailTagsInput(selectedPrompt.tags.join(", "));
    setDetailContent(selectedPrompt.content);
    setDetailFavorite(selectedPrompt.favorite);
    setPromptTranslationStage("idle");
    setPromptTranslationResult(null);
    setPromptTranslationElapsedSeconds(0);
    stopPromptTranslationElapsedTimer();
  }, [selectedPrompt]);

  useEffect(() => {
    if (!selectedPrompt || !activeWorkspaceId) {
      return;
    }
    void loadPromptTranslationsByCurrentPrompt(translationTargetLanguage);
  }, [selectedPrompt, activeWorkspaceId, translationTargetLanguage]);

  useEffect(() => {
    if (!versionModalOpen || promptVersionCompareMode) {
      return;
    }
    if (selectedPromptVersions.length === 0) {
      if (promptVersionPreview !== null) {
        setPromptVersionPreview(null);
      }
      return;
    }
    const exists = promptVersionPreview !== null
      && selectedPromptVersions.some((item) => item.version === promptVersionPreview);
    if (!exists) {
      setPromptVersionPreview(selectedPromptVersions[0]?.version ?? null);
    }
  }, [versionModalOpen, promptVersionCompareMode, selectedPromptVersions, promptVersionPreview]);

  useEffect(() => {
    if (!agentVersionModalOpen || agentVersionCompareMode) {
      return;
    }
    if (selectedAgentVersions.length === 0) {
      if (agentVersionPreview) {
        setAgentVersionPreview("");
      }
      return;
    }
    const exists = selectedAgentVersions.some((item) => String(item.version) === agentVersionPreview);
    if (!exists) {
      setAgentVersionPreview(String(selectedAgentVersions[0]?.version ?? ""));
    }
  }, [agentVersionModalOpen, agentVersionCompareMode, selectedAgentVersions, agentVersionPreview]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.body.classList.toggle("agent-rule-editor-open", agentRuleEditorModalOpen);
    return () => {
      document.body.classList.remove("agent-rule-editor-open");
    };
  }, [agentRuleEditorModalOpen]);


  function handleCreateNewAgentAsset() {
    setCreatingAgentAsset(true);
    setSelectedAssetId(null);
    setAgentAssetNameInput(l(`规则文件 ${agentAssets.length + 1}`, `Rule File ${agentAssets.length + 1}`));
    setAgentEditorContent("");
    setAgentRuleEditorModalOpen(true);
  }

  async function openAgentRuleEditor(assetId: string) {
    setCreatingAgentAsset(false);
    setSelectedAssetId(assetId);
    setAgentRuleEditorModalOpen(true);

    const currentAsset = agentAssets.find((item) => item.id === assetId);
    if (typeof currentAsset?.latestContent === "string") {
      setAgentEditorContent(currentAsset.latestContent);
      return;
    }

    try {
      await loadAgentVersions(assetId);
    } catch {
      // 忽略补读失败，保持当前内容。
    }
  }

  async function handleOpenAgentVersionDiff(assetId: string) {
    setCreatingAgentAsset(false);
    setSelectedAssetId(assetId);
    const cachedVersions = agentVersionsByAsset[assetId] ?? [];
    setAgentVersionCompareMode(false);
    setAgentVersionPreview(String(cachedVersions[0]?.version ?? ""));
    setAgentCompareLeftVersion("");
    setAgentCompareRightVersion("");
    try {
      await loadAgentVersions(assetId);
      setAgentVersionModalOpen(true);
    } catch (error) {
      toast({
        title: l("读取版本失败", "Failed to load versions"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  async function handleDeleteAgentRuleAsset(assetId: string, assetName: string) {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    try {
      await deleteAgentAsset(activeWorkspaceId, assetId);
      setDeleteConfirmAssetId(null);
      if (selectedAssetId === assetId) {
        setAgentRuleEditorModalOpen(false);
      }
      toast({
        title: l("删除成功", "Deleted"),
        description: l(`${assetName} 已删除`, `${assetName} deleted`),
      });
    } catch (error) {
      toast({
        title: l("删除失败", "Delete failed"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  async function handleSaveAgentRuleVersion() {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    const nextTitle = agentAssetNameInput.trim();
    if (!nextTitle) {
      toast({ title: l("请输入规则文件名称", "Please enter a rule file name"), variant: "destructive" });
      return;
    }
    try {
      if (!selectedAgentAsset || creatingAgentAsset) {
        const created = await createAgentAsset(
          activeWorkspaceId,
          nextTitle,
          agentEditorContent,
        );
        setCreatingAgentAsset(false);
        setSelectedAssetId(created.id);
        setAgentRuleEditorModalOpen(false);
        toast({
          title: l("规则文件已创建", "Rule file created"),
          description: l(`${created.name} 已创建并生成首个版本`, `${created.name} created with the first version`),
        });
        return;
      }
      if (nextTitle !== selectedAgentAsset.name) {
        await renameAgentAsset(activeWorkspaceId, selectedAgentAsset.id, nextTitle);
      }
      const version = await publishAgentVersion(
        selectedAgentAsset.id,
        agentEditorContent,
      );
      toast({
        title: l("保存成功", "Saved"),
        description: l(`${nextTitle} 已生成版本 ${version.version}`, `${nextTitle} generated version ${version.version}`),
      });
    } catch (error) {
      toast({
        title: l("保存失败", "Save failed"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  async function handleRunAgentDistribution() {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    if (!selectedAssetId) {
      toast({ title: l("请先选择规则资产", "Please select a rule asset first"), variant: "destructive" });
      return;
    }
    try {
      const job = await runAgentDistribution({
        workspaceId: activeWorkspaceId,
        releaseVersion: selectedAssetId,
        targetIds: agentTargetIds.length > 0 ? agentTargetIds : undefined,
      });
      await loadAgentModuleData(activeWorkspaceId);
      setAgentDistributionModalOpen(false);
      const total = Array.isArray(job.records) ? job.records.length : 0;
      const success = Array.isArray(job.records)
        ? job.records.filter((record) => record.status === "success").length
        : 0;
      const failed = Math.max(0, total - success);
      toast({
        title: l("应用完成", "Apply completed"),
        description:
          failed > 0
            ? l(`已更新 Agent 标签，成功 ${success} 个，失败 ${failed} 个。`, `Agent tags updated. Success ${success}, failed ${failed}.`)
            : l("已更新 Agent 标签。", "Agent tags updated."),
        variant: failed > 0 ? "destructive" : "default",
      });
    } catch (error) {
      toast({
        title: l("应用失败", "Apply failed"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  async function handleOpenAgentMappingPreview(platform: string) {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    const normalizedPlatform = normalizeAgentTypeInput(platform);
    const connection = agentConnections.find(
      (item) => normalizeAgentTypeInput(String(item.agentType ?? "")) === normalizedPlatform,
    );
    const fallbackPath = connection?.rootDir
      ? joinRuleFilePath(connection.rootDir, connection.ruleFile || defaultAgentRuleFile(normalizedPlatform))
      : connection?.ruleFile || defaultAgentRuleFile(normalizedPlatform);
    try {
      const result = await agentConnectionApi.preview({
        workspaceId: activeWorkspaceId,
        platform: normalizedPlatform,
      });
      setMappingPreviewPlatform(platform);
      setMappingPreviewPath(result.resolvedPath || fallbackPath);
      setMappingPreviewExists(result.exists);
      setMappingPreviewContent(result.content);
      setMappingPreviewMessage(
        result.exists
          ? l("读取成功", "Loaded successfully")
          : l("文件不存在或不可读取", "File does not exist or cannot be read"),
      );
      setMappingPreviewOpen(true);
    } catch (error) {
      setMappingPreviewPlatform(platform);
      setMappingPreviewPath(fallbackPath);
      setMappingPreviewExists(false);
      setMappingPreviewContent("");
      setMappingPreviewMessage(
        error instanceof Error ? error.message : l("读取失败", "Read failed"),
      );
      setMappingPreviewOpen(true);
    }
  }

  async function handleCreatePrompt() {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }

    if (!newPromptName.trim() || !newPromptContent.trim()) {
      toast({ title: l("请输入名称和内容", "Please enter name and content"), variant: "destructive" });
      return;
    }

    try {
      await createPrompt({
        workspaceId: activeWorkspaceId,
        name: newPromptName.trim(),
        content: newPromptContent,
      });
      toast({ title: l("Prompt 已创建", "Prompt created") });
      setCreatePromptOpen(false);
      setNewPromptName("");
      setNewPromptContent("");
    } catch (error) {
      toast({
        title: l("创建失败", "Create failed"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  async function handleSavePromptDetail() {
    if (!selectedPrompt) {
      return;
    }
    const trimmedName = detailName.trim();
    if (!trimmedName) {
      toast({ title: l("标题不能为空", "Title cannot be empty"), variant: "destructive" });
      return;
    }

    try {
      await updatePrompt({
        promptId: selectedPrompt.id,
        name: trimmedName,
        content: detailContent,
        category: detailCategory || "default",
        tags: parseTags(detailTagsInput),
        favorite: detailFavorite,
      });
      toast({ title: l("已保存", "Saved") });
      if (activeWorkspaceId) {
        await fetchPrompts(activeWorkspaceId);
      }
    } catch (error) {
      toast({
        title: l("保存失败", "Save failed"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  async function handleOpenPromptVersion() {
    if (!selectedPrompt) {
      return;
    }

    try {
      await fetchPromptVersions(selectedPrompt.id);
      const versions = promptVersions[selectedPrompt.id] ?? [];
      setPromptVersionCompareMode(false);
      setPromptVersionPreview(versions[0]?.version ?? null);
      setCompareLeftVersion(null);
      setCompareRightVersion(null);
      setVersionModalOpen(true);
    } catch (error) {
      toast({
        title: l("读取版本失败", "Failed to load versions"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  function togglePromptCompareCandidate(version: number) {
    if (compareLeftVersion === version) {
      setCompareLeftVersion(null);
      return;
    }
    if (compareRightVersion === version) {
      setCompareRightVersion(null);
      return;
    }
    if (compareLeftVersion === null) {
      setCompareLeftVersion(version);
      return;
    }
    if (compareRightVersion === null) {
      setCompareRightVersion(version);
      return;
    }
    setCompareLeftVersion(compareRightVersion);
    setCompareRightVersion(version);
  }

  function toggleAgentCompareCandidate(version: string) {
    if (agentCompareLeftVersion === version) {
      setAgentCompareLeftVersion("");
      return;
    }
    if (agentCompareRightVersion === version) {
      setAgentCompareRightVersion("");
      return;
    }
    if (!agentCompareLeftVersion) {
      setAgentCompareLeftVersion(version);
      return;
    }
    if (!agentCompareRightVersion) {
      setAgentCompareRightVersion(version);
      return;
    }
    setAgentCompareLeftVersion(agentCompareRightVersion);
    setAgentCompareRightVersion(version);
  }

  async function handleRestorePromptVersion(version: number) {
    if (!selectedPrompt) {
      return;
    }
    try {
      await restorePromptVersion(selectedPrompt.id, version);
      if (activeWorkspaceId) {
        await fetchPrompts(activeWorkspaceId);
      }
      toast({ title: l("已恢复指定版本", "Selected version restored") });
      setVersionModalOpen(false);
    } catch (error) {
      toast({
        title: l("恢复失败", "Restore failed"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  async function handleRestoreAgentRuleVersion(version: string) {
    if (!activeWorkspaceId || !selectedAssetId) {
      return;
    }
    try {
      await rollbackAgentRuleVersion(selectedAssetId, version);
      await loadAgentModuleData(activeWorkspaceId);
      toast({ title: l("已恢复指定版本", "Selected version restored") });
      setAgentVersionModalOpen(false);
    } catch (error) {
      toast({
        title: l("恢复失败", "Restore failed"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  async function handleDeletePrompt(promptId: string, promptName: string) {
    if (!window.confirm(l(`确认删除 Prompt「${promptName}」吗？`, `Delete prompt "${promptName}"?`))) {
      return;
    }
    try {
      await deletePrompt(promptId);
      setPromptDetailView("list");
      toast({ title: l("删除成功", "Deleted") });
    } catch (error) {
      toast({
        title: l("删除失败", "Delete failed"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  function openPromptRun(input: {
    promptId: string;
    promptName: string;
    content: string;
    fromDetail: boolean;
  }) {
    const histories: Record<string, string[]> = {};
    const nextVariables: Record<string, string> = {};
    const variableOrder = extractTemplateVariables(input.content);
    const previousForSamePrompt =
      promptRunPromptId === input.promptId ? promptRunVariables : {};

    for (const variableName of variableOrder) {
      const history = activeWorkspaceId
        ? getPromptRunHistory({
            workspaceId: activeWorkspaceId,
            promptId: input.promptId,
            variableName,
          })
        : [];
      histories[variableName] = history;
      const previous = previousForSamePrompt[variableName];
      nextVariables[variableName] = previous?.trim() ? previous : history[0] ?? "";
    }

    setPromptRunFromDetail(input.fromDetail);
    setPromptRunPromptId(input.promptId);
    setPromptRunPromptName(input.promptName);
    setPromptRunContent(input.content);
    setPromptRunVariableOrder(variableOrder);
    setPromptRunVariableHistories(histories);
    setPromptRunVariables(nextVariables);
    setPromptRunOpen(true);
  }

  async function handleCopyPromptDirect(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      toast({
        title: l("复制成功", "Copied"),
      });
    } catch (error) {
      toast({
        title: l("复制失败", "Copy failed"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    }
  }

  async function handleCopyPromptFromDetail() {
    if (!selectedPrompt) {
      return;
    }
    const promptId = selectedPrompt.id;
    const promptName = detailName.trim() || selectedPrompt.name;
    const content = detailContent;
    const variableOrder = extractTemplateVariables(content);
    if (variableOrder.length === 0) {
      await handleCopyPromptDirect(content);
      return;
    }
    openPromptRun({
      promptId,
      promptName,
      content,
      fromDetail: true,
    });
  }

  async function handleCopyPromptFromRow(row: {
    id: string;
    name: string;
    content: string;
  }) {
    const variableOrder = extractTemplateVariables(row.content);
    if (variableOrder.length === 0) {
      await handleCopyPromptDirect(row.content);
      return;
    }
    openPromptRun({
      promptId: row.id,
      promptName: row.name,
      content: row.content,
      fromDetail: false,
    });
  }

  function handleClosePromptRun() {
    setPromptRunOpen(false);
    setPromptRunFromDetail(false);
    setPromptRunPromptId(null);
    setPromptRunPromptName("");
    setPromptRunContent("");
    setPromptRunVariables({});
    setPromptRunVariableOrder([]);
    setPromptRunVariableHistories({});
  }

  function handlePromptRunVariableChange(variableName: string, value: string) {
    setPromptRunVariables((prev) => ({
      ...prev,
      [variableName]: value,
    }));
  }

  function handlePromptRunApplyHistory(variableName: string) {
    const latest = promptRunVariableHistories[variableName]?.[0];
    if (!latest) {
      return;
    }
    handlePromptRunVariableChange(variableName, latest);
  }

  async function handleCopyPromptRunPreview() {
    try {
      await navigator.clipboard.writeText(promptRunPreview);
      if (activeWorkspaceId && promptRunPromptId) {
        const refreshedHistories: Record<string, string[]> = {};
        for (const variableName of promptRunVariableOrder) {
          const value = promptRunVariables[variableName]?.trim();
          if (!value) {
            continue;
          }
          const nextHistory = writePromptRunHistory(
            {
              workspaceId: activeWorkspaceId,
              promptId: promptRunPromptId,
              variableName,
            },
            value,
            {
              max: 1,
            },
          );
          refreshedHistories[variableName] = nextHistory;
        }
        for (const variableName of promptRunVariableOrder) {
          if (refreshedHistories[variableName]) {
            continue;
          }
          refreshedHistories[variableName] = getPromptRunHistory({
            workspaceId: activeWorkspaceId,
            promptId: promptRunPromptId,
            variableName,
          });
        }
        setPromptRunVariableHistories(refreshedHistories);
      }
      toast({ title: l("复制成功", "Copied") });
    } catch (error) {
      toast({
        title: l("复制失败", "Copy failed"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    }
  }

  async function handleTogglePromptFavorite(row: {
    id: string;
    content: string;
    tags: string[];
    category: string;
    favorite: boolean;
  }) {
    try {
      await updatePrompt({
        promptId: row.id,
        content: row.content,
        tags: row.tags,
        category: row.category,
        favorite: !row.favorite,
      });
      if (activeWorkspaceId) {
        await fetchPrompts(activeWorkspaceId);
      }
      toast({
        title: !row.favorite ? l("已收藏", "Favorited") : l("已取消收藏", "Unfavorited"),
      });
    } catch (error) {
      toast({
        title: l("操作失败", "Action failed"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    }
  }

  async function runPromptBatchAction(
    action: "favorite_on" | "favorite_off" | "move" | "delete",
  ) {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    if (promptSelectedIds.length === 0) {
      toast({ title: l("请先选择 Prompt", "Please select prompts first"), variant: "destructive" });
      return;
    }
    if (action === "move" && !promptBatchCategory.trim()) {
      toast({ title: l("请输入目标分类", "Please enter target category"), variant: "destructive" });
      return;
    }
    if (action === "delete") {
      const confirmed = window.confirm(
        l(
          `确认删除选中的 ${promptSelectedIds.length} 条 Prompt 吗？`,
          `Delete ${promptSelectedIds.length} selected prompts?`,
        ),
      );
      if (!confirmed) {
        return;
      }
    }

    try {
      let moveTargetCategoryKey = "";
      if (action === "favorite_on") {
        await batchFavorite(true);
      } else if (action === "favorite_off") {
        await batchFavorite(false);
      } else if (action === "move") {
        moveTargetCategoryKey = normalizePromptCategoryKey(promptBatchCategory.trim());
        await batchMove(promptBatchCategory.trim());
      } else {
        await batchDelete();
      }
      await fetchPrompts(activeWorkspaceId);
      clearPromptSelection();
      const result = usePromptsStore.getState().lastBatchResult;
      if (result) {
        if (result.success > 0 && action === "favorite_on") {
          setPromptBatchJumpSuggestion({ type: "favorites" });
        } else if (result.success > 0 && action === "move") {
          setPromptBatchJumpSuggestion({
            type: "category",
            categoryKey: moveTargetCategoryKey || PROMPT_CATEGORY_UNCATEGORIZED_KEY,
          });
        } else {
          setPromptBatchJumpSuggestion(null);
        }
        toast({
          title: l("批量操作完成", "Batch action completed"),
          description: l(
            `成功 ${result.success} 条，失败 ${result.failed} 条`,
            `${result.success} succeeded, ${result.failed} failed`,
          ),
          variant: result.failed > 0 ? "destructive" : "default",
        });
      } else {
        setPromptBatchJumpSuggestion(null);
      }
    } catch (error) {
      toast({
        title: l("批量操作失败", "Batch action failed"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    }
  }

  function handleAddModelProfile() {
    const key = newModelProfileKey.trim().toLowerCase();
    if (!key) {
      toast({
        title: l("请输入 profile key", "Please input profile key"),
        variant: "destructive",
      });
      return;
    }
    if (!/^[a-z0-9_-]+$/.test(key)) {
      toast({
        title: l("profile key 仅支持字母、数字、-、_", "Profile key only allows letters, numbers, - and _"),
        variant: "destructive",
      });
      return;
    }
    if (localAgentProfiles.some((item) => item.profileKey === key)) {
      toast({
        title: l("profile 已存在", "Profile already exists"),
        variant: "destructive",
      });
      return;
    }

    setSelectedModelProfileKey(key);
    setModelProfileName(key);
    setModelExecutable(key);
    setModelArgsTemplateText("[]");
    setNewModelProfileKey("");
    setDirty("model", true);
  }

  async function handleSaveModelProfile() {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    const profileKey = selectedModelProfileKey.trim();
    const name = modelProfileName.trim();
    const executable = modelExecutable.trim();
    if (!profileKey || !name || !executable) {
      toast({
        title: l("请先补全 profile 信息", "Please complete profile fields"),
        variant: "destructive",
      });
      return;
    }

    let argsTemplate: string[] = [];
    try {
      argsTemplate = parseArgsTemplateInput(modelArgsTemplateText);
    } catch (error) {
      toast({
        title: l("参数模板格式错误", "Invalid args template"),
        description: unknownToMessage(error, l("参数模板必须是 JSON 字符串数组", "Args template must be a JSON string array")),
        variant: "destructive",
      });
      return;
    }

    setModelSaving(true);
    try {
      const profile = await translationApi.upsertProfile({
        workspaceId: activeWorkspaceId,
        profileKey,
        name,
        executable,
        argsTemplate,
        enabled: true,
      });
      await loadModelWorkbenchData(activeWorkspaceId);
      setSelectedModelProfileKey(profile.profileKey);
      setDirty("model", false);
      toast({ title: l("Profile 已保存", "Profile saved") });
    } catch (error) {
      toast({
        title: l("保存 Profile 失败", "Failed to save profile"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    } finally {
      setModelSaving(false);
    }
  }

  async function handleDeleteModelProfile(profileKey: string) {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    if (!window.confirm(l(`确认删除 profile "${profileKey}"？`, `Delete profile "${profileKey}"?`))) {
      return;
    }
    try {
      const rows = await translationApi.deleteProfile({
        workspaceId: activeWorkspaceId,
        profileKey,
      });
      setLocalAgentProfiles(rows);
      const nextKey = rows[0]?.profileKey ?? "codex";
      setSelectedModelProfileKey(nextKey);
      setDirty("model", false);
      toast({ title: l("Profile 已删除", "Profile deleted") });
    } catch (error) {
      toast({
        title: l("删除 Profile 失败", "Failed to delete profile"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    }
  }

  async function handleSaveTranslationConfig(): Promise<boolean> {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return false;
    }
    const defaultProfileKey = translationDefaultProfileKey.trim().toLowerCase();
    const promptTemplate = translationPromptTemplate.trim();
    if (!defaultProfileKey || !promptTemplate) {
      toast({
        title: l("请先补全翻译配置", "Please complete translation config"),
        variant: "destructive",
      });
      return false;
    }
    try {
      await translationApi.updateConfig({
        workspaceId: activeWorkspaceId,
        defaultProfileKey,
        promptTemplate,
      });
      setDirty("model", false);
      toast({ title: l("翻译配置已保存", "Translation config saved") });
      return true;
    } catch (error) {
      toast({
        title: l("保存翻译配置失败", "Failed to save translation config"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
      return false;
    }
  }

  function handleRestoreDefaultTranslationConfig() {
    setTranslationDefaultProfileKey(DEFAULT_TRANSLATION_PROFILE_KEY);
    setTranslationPromptTemplate(DEFAULT_TRANSLATION_PROMPT_TEMPLATE);
    setDirty("model", true);
  }

  async function handleSaveTranslationConfigFromDialog() {
    const saved = await handleSaveTranslationConfig();
    if (saved) {
      setModelScenarioSettingsOpen(false);
    }
  }

  function stopPromptTranslationElapsedTimer() {
    const timer = promptTranslationElapsedTimerRef.current;
    if (timer !== null) {
      window.clearInterval(timer);
      promptTranslationElapsedTimerRef.current = null;
    }
    promptTranslationStartedAtRef.current = null;
  }

  function startPromptTranslationElapsedTimer() {
    stopPromptTranslationElapsedTimer();
    const startedAt = Date.now();
    promptTranslationStartedAtRef.current = startedAt;
    setPromptTranslationElapsedSeconds(0);
    promptTranslationElapsedTimerRef.current = window.setInterval(() => {
      const now = Date.now();
      const begin = promptTranslationStartedAtRef.current ?? now;
      setPromptTranslationElapsedSeconds(Math.max(0, Math.floor((now - begin) / 1000)));
    }, 1000);
  }

  function clearModelTestOutputFlushTimer() {
    const timer = modelTestOutputFlushTimerRef.current;
    if (timer === null) {
      return;
    }
    window.clearTimeout(timer);
    modelTestOutputFlushTimerRef.current = null;
  }

  function flushModelTestOutputBuffer() {
    clearModelTestOutputFlushTimer();
    const next = {
      stdout: modelTestOutputBufferRef.current.stdout,
      stderr: modelTestOutputBufferRef.current.stderr,
    };
    setModelTestOutput(next);
  }

  function scheduleModelTestOutputFlush() {
    if (modelTestOutputFlushTimerRef.current !== null) {
      return;
    }
    modelTestOutputFlushTimerRef.current = window.setTimeout(() => {
      modelTestOutputFlushTimerRef.current = null;
      setModelTestOutput({
        stdout: modelTestOutputBufferRef.current.stdout,
        stderr: modelTestOutputBufferRef.current.stderr,
      });
    }, MODEL_TEST_STREAM_FLUSH_INTERVAL_MS);
  }

  function appendModelTestOutputChunk(stream: "stdout" | "stderr", chunk: string) {
    if (!chunk) {
      return;
    }
    if (stream === "stdout") {
      modelTestOutputBufferRef.current.stdout = appendPreviewChunk(
        modelTestOutputBufferRef.current.stdout,
        chunk,
      );
    } else {
      modelTestOutputBufferRef.current.stderr = appendPreviewChunk(
        modelTestOutputBufferRef.current.stderr,
        chunk,
      );
    }
    scheduleModelTestOutputFlush();
  }

  function updateModelTestLifecycleText(rawLifecycleText: string) {
    const lifecycleText = rawLifecycleText.trim();
    if (!lifecycleText) {
      return;
    }
    const runningSeconds = parseRunningLifecycleSeconds(lifecycleText);
    if (runningSeconds !== null) {
      const compact = formatElapsedCompact(runningSeconds);
      setModelTestLifecycleText(l(`已处理 ${compact}`, `Processed ${compact}`));
      return;
    }
    if (lifecycleText === "started") {
      setModelTestLifecycleText(l("已启动", "Started"));
      return;
    }
    if (lifecycleText === "completed") {
      setModelTestLifecycleText(l("已完成", "Completed"));
      return;
    }
    if (lifecycleText === "timeout") {
      setModelTestLifecycleText(l("已超时", "Timed out"));
      return;
    }
    if (lifecycleText === "auth-required") {
      setModelTestLifecycleText(l("需要登录", "Auth required"));
      return;
    }
    if (lifecycleText === "exec-failed") {
      setModelTestLifecycleText(l("执行失败", "Execution failed"));
      return;
    }
    if (lifecycleText === "protocol-invalid") {
      setModelTestLifecycleText(l("输出协议异常", "Protocol invalid"));
      return;
    }
    setModelTestLifecycleText(lifecycleText);
  }

  async function handleRunModelTranslationTest(input?: {
    profileKey?: string;
    sourceText?: string;
    targetLanguage?: string;
    syncModelTestForm?: boolean;
  }): Promise<LocalAgentTranslationTestResult | null> {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return null;
    }
    const syncModelTestForm = input?.syncModelTestForm ?? true;
    const profileKey = (input?.profileKey ?? selectedModelProfileKey).trim();
    const sourceTextRaw = input?.sourceText ?? modelTestSourceText;
    const targetLanguageRaw = input?.targetLanguage ?? translationTargetLanguage;
    const sourceText = sourceTextRaw.trim();
    const targetLanguage = targetLanguageRaw.trim();
    if (!profileKey || !sourceText || !targetLanguage) {
      toast({
        title: l("请先填写测试参数", "Please fill test parameters"),
        variant: "destructive",
      });
      return null;
    }
    if (syncModelTestForm && input?.sourceText !== undefined) {
      setModelTestSourceText(input.sourceText);
    }
    if (syncModelTestForm && input?.targetLanguage !== undefined) {
      setTranslationTargetLanguage(input.targetLanguage);
    }

    const requestId = createRequestId();
    let unlistenStream: UnlistenFn | null = null;

    flushSync(() => {
      setModelTestOutputSheetOpen(true);
      setModelTestRunning(true);
      setModelTestResult(null);
      setModelTestLifecycleText(l("准备运行...", "Preparing..."));
      clearModelTestOutputFlushTimer();
      modelTestOutputBufferRef.current = { stdout: "", stderr: "" };
      setModelTestOutput({ stdout: "", stderr: "" });
    });

    await waitForUiPaint();

    try {
      if (isTauri()) {
        unlistenStream = await listen<LocalAgentTranslationStreamEvent>(
          LOCAL_AGENT_TRANSLATION_STREAM_EVENT,
          (event) => {
            const payload = event.payload;
            if (!payload || payload.requestId !== requestId) {
              return;
            }
            if (payload.stream === "stdout") {
              appendModelTestOutputChunk("stdout", payload.chunk ?? "");
              return;
            }
            if (payload.stream === "stderr") {
              appendModelTestOutputChunk("stderr", payload.chunk ?? "");
              return;
            }
            if (payload.stream === "lifecycle") {
              const lifecycleText = (payload.chunk ?? "").trim();
              updateModelTestLifecycleText(lifecycleText);
            }
          },
        );
      }

      const result = await translationApi.testTranslation({
        workspaceId: activeWorkspaceId,
        profileKey,
        sourceText,
        targetLanguage,
        requestId,
      });
      setModelTestResult({
        ok: true,
        text: result.translatedText,
      });
      setModelTestLifecycleText(l("已完成", "Completed"));
      if (!modelTestOutputBufferRef.current.stdout && result.stdoutPreview) {
        modelTestOutputBufferRef.current.stdout = result.stdoutPreview;
      }
      if (!modelTestOutputBufferRef.current.stderr && result.stderrPreview) {
        modelTestOutputBufferRef.current.stderr = result.stderrPreview;
      }
      flushModelTestOutputBuffer();
      return result;
    } catch (error) {
      const message = unknownToMessage(error, l("未知错误", "Unknown error"));
      setModelTestResult({
        ok: false,
        text: message,
      });
      setModelTestLifecycleText(l("执行失败", "Execution failed"));
      const stdout = extractStdoutPreviewFromErrorMessage(message);
      if (!modelTestOutputBufferRef.current.stdout && stdout) {
        modelTestOutputBufferRef.current.stdout = stdout;
      }
      if (!modelTestOutputBufferRef.current.stderr) {
        modelTestOutputBufferRef.current.stderr = message;
      }
      flushModelTestOutputBuffer();
      return null;
    } finally {
      if (unlistenStream) {
        unlistenStream();
      }
      flushModelTestOutputBuffer();
      setModelTestRunning(false);
    }
  }

  async function handleSkillOpen(skillId: string, relativePath?: string) {
    try {
      await skillsApi.open({
        skillId,
        relativePath,
        mode: skillOpenMode,
      });
    } catch (error) {
      toast({
        title: l("打开失败", "Open failed"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  async function handleLoadSkillTree(skillId: string, force = false): Promise<SkillsFileTreeResult | null> {
    if (!force && skillTreeById[skillId]) {
      return skillTreeById[skillId];
    }
    setSkillTreeLoading(true);
    try {
      const result = await skillsApi.filesTree({ skillId });
      setSkillTreeById((prev) => ({ ...prev, [skillId]: result }));
      setSkillExpandedDirsById((prev) => ({
        ...prev,
        [skillId]: prev[skillId] ?? {},
      }));
      return result;
    } catch (error) {
      toast({
        title: l("读取文件树失败", "Failed to read file tree"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
      return null;
    } finally {
      setSkillTreeLoading(false);
    }
  }

  async function handleReadSkillFile(skillId: string, relativePath: string) {
    const key = `${skillId}:${relativePath}`;
    setSkillSelectedFilePathById((prev) => ({ ...prev, [skillId]: relativePath }));
    if (skillFileReadByKey[key]) {
      return;
    }
    setSkillFileReadLoading(true);
    try {
      const result = await skillsApi.fileRead({ skillId, relativePath });
      setSkillFileReadByKey((prev) => ({
        ...prev,
        [key]: result,
      }));
    } catch (error) {
      setSkillFileReadByKey((prev) => ({
        ...prev,
        [key]: {
          relativePath,
          absolutePath: "",
          language: "",
          supported: false,
          content: "",
          message: error instanceof Error ? error.message : l("读取失败", "Read failed"),
        },
      }));
    } finally {
      setSkillFileReadLoading(false);
    }
  }

  async function handleOpenSkillDetail(skill: SkillAsset) {
    selectSkill(skill.id);
    setSkillOpenMenuOpen(false);
    setSkillDetailView("detail");
    setSkillDetailTab("overview");
    await handleLoadSkillTree(skill.id);
    await handleReadSkillFile(skill.id, "SKILL.md");
  }

  function handleToggleSkillDir(skillId: string, relativePath: string) {
    setSkillExpandedDirsById((prev) => {
      const current = prev[skillId] ?? {};
      return {
        ...prev,
        [skillId]: {
          ...current,
          [relativePath]: !current[relativePath],
        },
      };
    });
  }

  function renderSkillTreeNodes(nodes: SkillsFileTreeNode[], skillId: string, depth = 0): ReactElement[] {
    return nodes.flatMap((node) => {
      const expanded = selectedSkillExpandedDirs[node.relativePath] ?? depth < 1;
      const row = (
        <button
          type="button"
          key={`${node.relativePath}-row`}
          className={`flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-xs transition-colors ${
            selectedSkillFilePath === node.relativePath
              ? "bg-blue-50 text-blue-700"
              : "text-slate-700 hover:bg-slate-100"
          }`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onClick={() => {
            if (node.isDir) {
              handleToggleSkillDir(skillId, node.relativePath);
              return;
            }
            void handleReadSkillFile(skillId, node.relativePath);
          }}
        >
          {node.isDir ? (
            expanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          ) : (
            <span className="inline-block h-3.5 w-3.5" />
          )}
          {node.isDir ? (
            expanded ? <FolderOpen className="h-3.5 w-3.5 text-amber-500" /> : <Folder className="h-3.5 w-3.5 text-amber-500" />
          ) : (
            <FileCode2 className="h-3.5 w-3.5 text-slate-400" />
          )}
          <span className="truncate">{node.name}</span>
          {node.isSymlink ? <span className="ml-auto rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-500">{l("软链", "Symlink")}</span> : null}
        </button>
      );

      if (!node.isDir || !expanded || !node.children?.length) {
        return [row];
      }
      return [row, ...renderSkillTreeNodes(node.children, skillId, depth + 1)];
    });
  }

  async function handleSaveStorageDirectory() {
    if (!activeWorkspaceId || !activeWorkspace) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    if (!isAbsolutePathInput(storageDirDraft)) {
      toast({ title: l("存储目录必须是绝对路径", "Storage directory must be an absolute path"), variant: "destructive" });
      return;
    }
    try {
      await workspaceApi.update({
        id: activeWorkspaceId,
        rootPath: storageDirDraft.trim(),
      });
      await loadAllSettings();
      setDirty("data", false);
      toast({ title: l("存储目录已保存", "Storage directory saved") });
    } catch (error) {
      toast({
        title: l("保存存储目录失败", "Failed to save storage directory"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  async function handleOpenStorageDirectoryInFinder() {
    const targetPath = normalizeDirectoryInput(storageDirDraft || activeWorkspace?.rootPath || "");
    if (!isAbsolutePathInput(targetPath)) {
      toast({ title: l("存储目录不是有效绝对路径", "Storage directory is not a valid absolute path"), variant: "destructive" });
      return;
    }
    try {
      await openPath(targetPath);
    } catch (error) {
      toast({
        title: l("打开目录失败", "Failed to open directory"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    }
  }

  async function handleSaveAgentConnections() {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }

    const agentTypes = Object.keys(connectionDrafts)
      .map((item) => normalizeAgentTypeInput(item))
      .filter(Boolean);
    for (const agentType of agentTypes) {
      const rootDir = (connectionDrafts[agentType] ?? "").trim();
      const ruleFile = (connectionRuleFileDrafts[agentType] ?? defaultAgentRuleFile(agentType)).trim();
      if (!isAbsolutePathInput(rootDir)) {
        toast({ title: l(`${agentType} Global Config file 必须是绝对路径`, `${agentType} Global Config file must be an absolute path`), variant: "destructive" });
        return;
      }
      if (!isValidRuleFileInput(ruleFile)) {
        toast({ title: l(`${agentType} 规则文件必须是相对路径，且不能包含 ..`, `${agentType} rule file must be a relative path and cannot include ..`), variant: "destructive" });
        return;
      }
    }

    for (const agentType of agentTypes) {
      const result = await upsertConnection({
        workspaceId: activeWorkspaceId,
        platform: agentType,
        rootDir: (connectionDrafts[agentType] ?? "").trim(),
        ruleFile: (connectionRuleFileDrafts[agentType] ?? defaultAgentRuleFile(agentType)).trim(),
        enabled: true,
      });
      if (!result.ok) {
        toast({ title: result.message, variant: "destructive" });
        return;
      }
    }

    await Promise.all([
      loadSettingsConnections(activeWorkspaceId),
      loadAgentConnections(activeWorkspaceId),
    ]);
    setDirty("agents", false);
    toast({ title: l("Agent 连接配置已保存", "Agent connection settings saved") });
  }

  function handleAddSettingsAgent() {
    const agentType = normalizeAgentTypeInput(newSettingsAgentInput);
    if (!agentType) {
      toast({ title: l("Agent 名称不能为空", "Agent name cannot be empty"), variant: "destructive" });
      return;
    }
    if (!/^[a-z0-9_-]+$/.test(agentType)) {
      toast({ title: l("Agent 名称仅允许字母/数字/-/_", "Agent name only allows letters/numbers/-/_"), variant: "destructive" });
      return;
    }
    if (connectionDrafts[agentType] !== undefined) {
      toast({ title: l("Agent 已存在", "Agent already exists"), variant: "destructive" });
      return;
    }
    setConnectionDrafts((prev) => ({
      ...prev,
      [agentType]: defaultAgentConfigDir(homePath, agentType),
    }));
    setConnectionRuleFileDrafts((prev) => ({
      ...prev,
      [agentType]: defaultAgentRuleFile(agentType),
    }));
    setSettingsAgentType(agentType);
    setNewSettingsAgentInput("");
    setDirty("agents", true);
  }

  async function handleRemoveSettingsAgent(agentType: string) {
    const normalized = normalizeAgentTypeInput(agentType);
    if (normalized === "codex" || normalized === "claude") {
      toast({ title: l("codex / claude 为内置 Agent，不能移除", "codex / claude are built-in agents and cannot be removed"), variant: "destructive" });
      return;
    }

    const isPersisted = settingsConnections.some(
      (item) => normalizeAgentTypeInput(item.platform) === normalized,
    );
    try {
      if (isPersisted) {
        if (!activeWorkspaceId) {
          toast({ title: projectBootingMessage, variant: "destructive" });
          return;
        }
        const result = await deleteConnection({
          workspaceId: activeWorkspaceId,
          platform: normalized,
        });
        if (!result.ok) {
          toast({ title: result.message, variant: "destructive" });
          return;
        }
        await Promise.all([
          loadSettingsConnections(activeWorkspaceId),
          loadAgentConnections(activeWorkspaceId),
        ]);
      } else {
        setConnectionDrafts((prev) => {
          const { [normalized]: _removed, ...next } = prev;
          return next;
        });
        setConnectionRuleFileDrafts((prev) => {
          const { [normalized]: _removed, ...next } = prev;
          return next;
        });
      }
      setDirty("agents", !isPersisted);
      toast({ title: l(`${normalized} 已移除`, `${normalized} removed`) });
    } catch (error) {
      toast({
        title: l("移除 Agent 失败", "Failed to remove agent"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  function handleToggleSkillScanDirectory(path: string, checked: boolean) {
    const normalized = normalizeDirectoryInput(path);
    setSkillScanDirectories((prev) =>
      prev.map((item) =>
        normalizeDirectoryInput(item.path) === normalized
          ? { ...item, selected: checked }
          : item,
      ),
    );
  }

  function handleAddSkillScanDirectory() {
    const path = normalizeDirectoryInput(skillScanDirInput);
    if (!path) {
      toast({ title: l("请输入目录路径", "Please enter a directory path"), variant: "destructive" });
      return;
    }
    if (!isAbsolutePathInput(path)) {
      toast({ title: l("目录必须是绝对路径", "Directory must be an absolute path"), variant: "destructive" });
      return;
    }
    const exists = skillScanDirectories.some(
      (item) => normalizeDirectoryInput(item.path) === path,
    );
    if (exists) {
      toast({ title: l("目录已存在", "Directory already exists"), variant: "destructive" });
      return;
    }
    setSkillScanDirectories((prev) => [
      ...prev,
      { path, selected: true, source: "custom" },
    ]);
    setSkillScanDirInput("");
  }

  function handleRemoveSkillScanDirectory(path: string) {
    const normalized = normalizeDirectoryInput(path);
    setSkillScanDirectories((prev) =>
      prev.filter((item) => normalizeDirectoryInput(item.path) !== normalized),
    );
  }

  async function handleOpenAgentConfigInFinder(agentType: string) {
    const configPath = (connectionDrafts[agentType] ?? "").trim();
    if (!isAbsolutePathInput(configPath)) {
      toast({ title: l("Global Config file 不是有效绝对路径", "Global Config file is not a valid absolute path"), variant: "destructive" });
      return;
    }
    try {
      await openPath(configPath);
    } catch (error) {
      toast({
        title: l("打开失败", "Open failed"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    }
  }

  async function handleRefreshAgentModule() {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    try {
      await loadAgentModuleData(activeWorkspaceId);
      setDeleteConfirmAssetId(null);
      const latestState = useAgentRulesStore.getState();
      const boundAssetIds = latestState.assets
        .filter((asset) => {
          const tags = latestState.tagsByAsset[asset.id] ?? asset.tags ?? [];
          return tags.length > 0;
        })
        .map((asset) => asset.id)
        .filter(Boolean);
      if (boundAssetIds.length === 0) {
        toast({
          title: l("规则检查完成", "Rule check complete"),
          description: l("暂无已应用的规则，已刷新列表。", "No applied rules yet. List refreshed."),
        });
        return;
      }

      const driftResults = await Promise.allSettled(
        boundAssetIds.map((assetId) => refreshAgentAsset(activeWorkspaceId, assetId)),
      );
      await loadAgentModuleData(activeWorkspaceId);

      const failedCount = driftResults.filter((result) => result.status === "rejected").length;
      const byAgent = new Map<string, { clean: number; drifted: number; error: number; other: number }>();
      for (const result of driftResults) {
        if (result.status !== "fulfilled") {
          continue;
        }
        const records = Array.isArray(result.value?.records) ? result.value.records : [];
        for (const raw of records) {
          const row = (raw ?? {}) as Record<string, unknown>;
          const agent = String(row.agentType ?? row.agent_type ?? row.targetId ?? "unknown");
          const status = String(row.status ?? "");
          const stat = byAgent.get(agent) ?? { clean: 0, drifted: 0, error: 0, other: 0 };
          if (status === "clean") {
            stat.clean += 1;
          } else if (status === "drifted") {
            stat.drifted += 1;
          } else if (status === "error") {
            stat.error += 1;
          } else {
            stat.other += 1;
          }
          byAgent.set(agent, stat);
        }
      }
      const summary = Array.from(byAgent.entries())
        .map(([agent, stat]) => {
          if (stat.error > 0) {
            return l(`${agent} 检查异常`, `${agent} check error`);
          }
          if (stat.drifted > 0) {
            return l(`${agent} 检测到规则变更`, `${agent} drift detected`);
          }
          if (stat.clean > 0) {
            return l(`${agent} 正常`, `${agent} clean`);
          }
          return l(`${agent} 已检查`, `${agent} checked`);
        })
        .join(l("，", ", "));
      const failedPart =
        failedCount > 0
          ? l(`。有 ${failedCount} 个规则检查失败，可重试。`, `. ${failedCount} rule checks failed and can be retried.`)
          : "";
      const description = `${summary
        ? l(`规则检查完成：${summary}`, `Rule check complete: ${summary}`)
        : l("规则检查完成。", "Rule check complete.")}${failedPart}`;
      toast({
        title: l("规则检查完成", "Rule check complete"),
        description,
        variant: failedCount > 0 ? "destructive" : "default",
      });
    } catch (error) {
      toast({
        title: l("刷新失败", "Refresh failed"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  function handleChangeSettingsCategory(next: SettingsCategory) {
    if (dirty[settingsCategory]) {
      const confirmed = window.confirm(l("当前分类有未保存改动，是否继续切换？", "Unsaved changes exist in this category. Continue switching?"));
      if (!confirmed) {
        return;
      }
    }
    setSettingsCategory(next);
  }

  function openPromptDetailById(promptId: string) {
    selectPrompt(promptId);
    setPromptDetailView("detail");
    if (activeWorkspaceId) {
      void fetchPrompts(activeWorkspaceId);
    }
  }

  function leavePromptDetail() {
    setPromptDetailView("list");
    selectPrompt(null);
    if (activeWorkspaceId) {
      void fetchPrompts(activeWorkspaceId);
    }
  }

  function handleChangePromptBrowseScope(nextScope: PromptBrowseScope) {
    setPromptBrowseScope(nextScope);
    setPromptPage(1);
  }

  function handleResetPromptBrowseContext() {
    setPromptBrowseScope("all");
    setPromptBrowseCategory(PROMPT_CATEGORY_ALL_KEY);
    setPromptAllCategoryFilter(PROMPT_CATEGORY_ALL_KEY);
    setPromptPage(1);
  }

  function handleRunPromptBatchJumpSuggestion() {
    if (!promptBatchJumpSuggestion) {
      return;
    }
    if (promptBatchJumpSuggestion.type === "favorites") {
      setPromptBrowseScope("favorites");
      setPromptPage(1);
      setPromptBatchJumpSuggestion(null);
      return;
    }
    setPromptBrowseScope("categories");
    setPromptBrowseCategory(promptBatchJumpSuggestion.categoryKey);
    setPromptPage(1);
    setPromptBatchJumpSuggestion(null);
  }

  const promptResultsContent = (
    <>
      {promptsLoading ? <Card><CardContent className="py-8 text-sm text-slate-500">{l("加载中...", "Loading...")}</CardContent></Card> : null}

      {!promptsLoading && filteredPrompts.length === 0 ? (
        <EmptyState
          title={
            promptBrowseScope === "favorites"
              ? l("收藏夹为空", "Favorites is empty")
              : promptBrowseScope === "categories"
                ? l("该分类暂无 Prompt", "No prompts in this category")
                : l("暂无 Prompt", "No prompts")
          }
          description={
            promptQuery.trim()
              ? l("当前筛选无结果，可清空搜索或切换视角。", "No results for current filters. Clear search or switch scope.")
              : promptBrowseScope === "all"
                ? l("先创建一个 Prompt 开始使用。", "Create a prompt to get started.")
                : l("可返回 All 视角或创建新的 Prompt。", "Go back to All or create a new prompt.")
          }
          action={
            promptQuery.trim() ? (
              <Button onClick={() => setPromptQuery("")}>{l("清空搜索", "Clear search")}</Button>
            ) : promptBrowseScope === "all" ? (
              <Button onClick={() => setCreatePromptOpen(true)}>{l("立即创建", "Create now")}</Button>
            ) : (
              <Button variant="outline" onClick={handleResetPromptBrowseContext}>{l("回到 All", "Back to All")}</Button>
            )
          }
        />
      ) : null}

      {!promptsLoading && filteredPrompts.length > 0 && promptViewMode === "list" ? (
        <div className="space-y-2">
          {pagedPrompts.map((item) => (
            <Card key={item.id} className="group">
              <CardContent
                className="flex cursor-pointer items-start gap-3 pt-6"
                onClick={() => {
                  openPromptDetailById(item.id);
                }}
              >
                <div className="flex-1 text-left">
                  <div className="text-base font-semibold text-slate-900">{item.name}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {formatPromptCategoryLabel(item.category)} · v{item.activeVersion} · {toLocalTime(item.updatedAt)}
                  </div>
                  <div className="mt-2 line-clamp-2 text-sm text-slate-600">{item.content}</div>
                </div>
                <div className="pointer-events-none flex items-center gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                  <Button
                    size="sm"
                    variant="ghost"
                    title={l("复制 Prompt", "Copy prompt")}
                    aria-label={l("复制 Prompt", "Copy prompt")}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleCopyPromptFromRow(item);
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    title={item.favorite ? l("取消收藏", "Unfavorite") : l("收藏", "Favorite")}
                    aria-label={item.favorite ? l("取消收藏", "Unfavorite") : l("收藏", "Favorite")}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleTogglePromptFavorite(item);
                    }}
                  >
                    <Star className={`h-4 w-4 ${item.favorite ? "fill-amber-400 text-amber-500" : "text-slate-500"}`} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    title={l("编辑", "Edit")}
                    aria-label={l("编辑", "Edit")}
                    onClick={(event) => {
                      event.stopPropagation();
                      openPromptDetailById(item.id);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    title={l("删除", "Delete")}
                    aria-label={l("删除", "Delete")}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDeletePrompt(item.id, item.name);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {!promptsLoading && filteredPrompts.length > 0 && promptViewMode === "gallery" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {pagedPrompts.map((item) => (
            <Card
              key={item.id}
              className="group cursor-pointer"
              onClick={() => {
                openPromptDetailById(item.id);
              }}
            >
              <CardHeader>
                <CardTitle className="text-base">{item.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-2 text-xs text-slate-500">{formatPromptCategoryLabel(item.category)} · v{item.activeVersion}</div>
                <div className="line-clamp-4 text-sm text-slate-600">{item.content}</div>
                <div className="mt-3 flex items-center justify-end">
                  <div className="pointer-events-none flex items-center gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                    <Button
                      size="sm"
                      variant="ghost"
                      title={l("复制 Prompt", "Copy prompt")}
                      aria-label={l("复制 Prompt", "Copy prompt")}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleCopyPromptFromRow(item);
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title={item.favorite ? l("取消收藏", "Unfavorite") : l("收藏", "Favorite")}
                      aria-label={item.favorite ? l("取消收藏", "Unfavorite") : l("收藏", "Favorite")}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleTogglePromptFavorite(item);
                      }}
                    >
                      <Star className={`h-4 w-4 ${item.favorite ? "fill-amber-400 text-amber-500" : "text-slate-500"}`} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title={l("编辑", "Edit")}
                      aria-label={l("编辑", "Edit")}
                      onClick={(event) => {
                        event.stopPropagation();
                        openPromptDetailById(item.id);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title={l("删除", "Delete")}
                      aria-label={l("删除", "Delete")}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeletePrompt(item.id, item.name);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {!promptsLoading && filteredPrompts.length > 0 && promptViewMode === "table" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
            <span className="text-xs text-slate-500">
              {l(`已选 ${promptSelectedIds.length} 条`, `${promptSelectedIds.length} selected`)}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={promptSelectedIds.length === 0}
              onClick={() => void runPromptBatchAction("favorite_on")}
            >
              {l("批量收藏", "Batch Favorite")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={promptSelectedIds.length === 0}
              onClick={() => void runPromptBatchAction("favorite_off")}
            >
              {l("取消收藏", "Unfavorite")}
            </Button>
            <div className="flex items-center gap-2">
              <Input
                value={promptBatchCategory}
                onChange={(event) => setPromptBatchCategory(event.currentTarget.value)}
                placeholder={l("目标分类", "Target category")}
                className="h-9 w-40"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={promptSelectedIds.length === 0}
                onClick={() => void runPromptBatchAction("move")}
              >
                {l("批量移动", "Batch Move")}
              </Button>
            </div>
            <Button
              size="sm"
              variant="destructive"
              disabled={promptSelectedIds.length === 0}
              onClick={() => void runPromptBatchAction("delete")}
            >
              {l("批量删除", "Batch Delete")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={promptSelectedIds.length === 0}
              onClick={() => clearPromptSelection()}
            >
              {l("清空选择", "Clear")}
            </Button>
            {promptBatchJumpSuggestion ? (
              <Button
                size="sm"
                variant="secondary"
                className="ml-auto"
                onClick={handleRunPromptBatchJumpSuggestion}
              >
                {promptBatchJumpSuggestion.type === "favorites"
                  ? l("前往 Favorites 查看", "Go to Favorites")
                  : l("前往目标分类查看", "Go to Category")}
              </Button>
            ) : null}
            {!promptBatchJumpSuggestion && promptBatchResult ? (
              <span className="ml-auto text-xs text-slate-500">
                {l(
                  `最近批量结果：成功 ${promptBatchResult.success}，失败 ${promptBatchResult.failed}`,
                  `Latest batch: ${promptBatchResult.success} succeeded, ${promptBatchResult.failed} failed`,
                )}
              </span>
            ) : null}
          </div>
          <DataTable
            rows={pagedPrompts}
            rowKey={(row) => row.id}
            onRowClick={(row) => {
              openPromptDetailById(row.id);
            }}
            rowSelection={{
              selectedRowKeys: promptSelectedIds,
              onChange: (keys) => setPromptSelection(keys),
            }}
            columnSettingsKey={promptTableColumnSettingsKey}
            renderRowActions={(row) => (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  title={l("复制 Prompt", "Copy prompt")}
                  aria-label={l("复制 Prompt", "Copy prompt")}
                  onClick={() => void handleCopyPromptFromRow(row)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  title={row.favorite ? l("取消收藏", "Unfavorite") : l("收藏", "Favorite")}
                  aria-label={row.favorite ? l("取消收藏", "Unfavorite") : l("收藏", "Favorite")}
                  onClick={() => void handleTogglePromptFavorite(row)}
                >
                  <Star className={`h-4 w-4 ${row.favorite ? "fill-amber-400 text-amber-500" : "text-slate-500"}`} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  title={l("编辑", "Edit")}
                  aria-label={l("编辑", "Edit")}
                  onClick={() => {
                    openPromptDetailById(row.id);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  title={l("删除", "Delete")}
                  aria-label={l("删除", "Delete")}
                  onClick={() => void handleDeletePrompt(row.id, row.name)}
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            )}
            columns={[
              {
                key: "name",
                title: l("标题", "Title"),
                className: "min-w-[180px]",
                render: (row) => <span className="font-medium text-slate-900">{row.name}</span>,
              },
              {
                key: "content",
                title: l("User Prompt", "User Prompt"),
                className: "min-w-[260px] max-w-[360px]",
                render: (row) => <span className="line-clamp-2 text-slate-600">{row.content}</span>,
              },
              { key: "category", title: l("分类", "Category"), render: (row) => formatPromptCategoryLabel(row.category) },
              {
                key: "variables",
                title: l("变量", "Variables"),
                render: (row) => String(extractTemplateVariables(row.content).length),
              },
              {
                key: "favorite",
                title: l("收藏", "Favorite"),
                render: (row) =>
                  row.favorite ? (
                    <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
                  ) : (
                    <Star className="h-4 w-4 text-slate-300" />
                  ),
              },
              { key: "version", title: l("版本", "Version"), render: (row) => `v${row.activeVersion}` },
              { key: "updatedAt", title: l("更新时间", "Updated At"), render: (row) => toLocalTime(row.updatedAt) },
            ]}
          />
        </div>
      ) : null}

      {!promptsLoading && filteredPrompts.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
          <span>
            {l(`共 ${filteredPrompts.length} 项 · 每页 ${PROMPTS_PAGE_SIZE} 条`, `${filteredPrompts.length} items · ${PROMPTS_PAGE_SIZE} / page`)}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={promptPage <= 1}
              onClick={() => setPromptPage((prev) => Math.max(1, prev - 1))}
            >
              {l("上一页", "Prev")}
            </Button>
            <span>
              {promptPage} / {totalPromptPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={promptPage >= totalPromptPages}
              onClick={() => setPromptPage((prev) => Math.min(totalPromptPages, prev + 1))}
            >
              {l("下一页", "Next")}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );

  const promptCenter = (
    <div className="space-y-4">
      <SectionTitle
        title="Prompts"
        subtitle={l(`共 ${filteredPrompts.length} 项`, `${filteredPrompts.length} items`)}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Input
              value={promptQuery}
              onChange={(event) => setPromptQuery(event.currentTarget.value)}
              placeholder={l("搜索 Prompt...", "Search prompts...")}
              className="w-56"
            />
            {promptBrowseScope === "all" ? (
              <div className="relative">
                <select
                  aria-label={l("All 视角分类筛选", "All scope category filter")}
                  className={`${SELECT_BASE_CLASS} h-10 w-44`}
                  value={promptAllCategoryFilter}
                  onChange={(event) => setPromptAllCategoryFilter(event.currentTarget.value)}
                >
                  {promptCategoryOptions.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            ) : null}
            <Button variant="outline" onClick={() => setCreatePromptOpen(true)}>
              {l("新建 Prompt", "New Prompt")}
            </Button>
            <Button variant="outline" onClick={() => activeWorkspaceId && fetchPrompts(activeWorkspaceId)}>
              <RefreshCw className="mr-1 h-4 w-4" />
              {l("刷新", "Refresh")}
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={promptBrowseScope} onValueChange={(value) => handleChangePromptBrowseScope(value as PromptBrowseScope)}>
          <TabsList>
            <TabsTrigger value="all" aria-label={l("Prompts 视角 All", "Prompts scope all")}>
              {l("All", "All")}
            </TabsTrigger>
            <TabsTrigger value="categories" aria-label={l("Prompts 视角 Categories", "Prompts scope categories")}>
              {l("分类", "Categories")}
            </TabsTrigger>
            <TabsTrigger value="favorites" aria-label={l("Prompts 视角 Favorites", "Prompts scope favorites")}>
              {l("收藏夹", "Favorites")}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Tabs value={promptViewMode} onValueChange={(value) => setPromptViewMode(value as "list" | "gallery" | "table")}>
          <TabsList>
            <TabsTrigger value="list">{l("列表", "List")}</TabsTrigger>
            <TabsTrigger value="gallery">{l("卡片", "Cards")}</TabsTrigger>
            <TabsTrigger value="table">{l("表格", "Table")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {showPromptContextBar ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 text-xs text-slate-600">
          <span>{l("当前浏览：", "Context:")} {promptBrowseContextLabel}</span>
          <div className="ml-auto flex items-center gap-2">
            {promptQuery.trim() ? (
              <Button size="sm" variant="ghost" onClick={() => setPromptQuery("")}>
                {l("清空搜索", "Clear search")}
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={handleResetPromptBrowseContext}>
              {l("回到 All", "Back to All")}
            </Button>
          </div>
        </div>
      ) : null}

      {promptBrowseScope === "categories" ? (
        <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
          <Card className="h-fit">
            <CardContent className="space-y-1 pt-4">
              {promptCategoryOptions.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-label={`prompt-category-${item.key}`}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                    promptBrowseCategory === item.key
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                  onClick={() => {
                    setPromptBrowseCategory(item.key);
                    setPromptPage(1);
                  }}
                >
                  <span className="truncate">{item.label}</span>
                  <span className="ml-2 text-xs opacity-75">{item.count}</span>
                </button>
              ))}
            </CardContent>
          </Card>
          <div className="space-y-3">
            {promptResultsContent}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {promptResultsContent}
        </div>
      )}
    </div>
  );

  const promptDetail = (
    <div className="space-y-4 pb-3">
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Button
            size="sm"
            variant="outline"
            onClick={leavePromptDetail}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <button
            type="button"
            className="font-medium text-blue-600 hover:underline"
            onClick={leavePromptDetail}
          >
            Prompts
          </button>
          <ChevronRight className="h-4 w-4 text-slate-400" />
          <span className="max-w-[420px] truncate text-slate-700">
            {selectedPrompt?.name ?? l("未选择 Prompt", "No prompt selected")}
          </span>
        </div>

        <SectionTitle
          title={l("Prompt 详情", "Prompt Details")}
          subtitle={selectedPrompt ? l(`最后更新 ${toLocalTime(selectedPrompt.updatedAt)}`, `Updated ${toLocalTime(selectedPrompt.updatedAt)}`) : l("请选择一个 Prompt", "Please select a prompt")}
        />
      </div>

      {!selectedPrompt ? (
        <EmptyState title={l("未选择 Prompt", "No prompt selected")} description={l("请返回列表后选择一个 Prompt。", "Go back and pick a prompt.")} />
      ) : (
        <div className="space-y-3">
          <div className="space-y-3">
            <label className="block text-xs text-slate-500">
              {l("标题", "Title")}
              <Input value={detailName} onChange={(event) => setDetailName(event.currentTarget.value)} />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-xs text-slate-500">
                {l("分类", "Category")}
                <Input value={detailCategory} onChange={(event) => setDetailCategory(event.currentTarget.value)} />
              </label>

              <label className="block text-xs text-slate-500">
                {l("标签（逗号分隔）", "Tags (comma separated)")}
                <Input value={detailTagsInput} onChange={(event) => setDetailTagsInput(event.currentTarget.value)} />
              </label>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>
                  {promptTranslationLoading
                    ? l("译文加载中...", "Loading translations...")
                    : selectedPromptTranslation
                      ? l(
                        `最近译文更新时间：${toLocalTime(selectedPromptTranslation.updatedAt)}`,
                        `Latest translation updated at ${toLocalTime(selectedPromptTranslation.updatedAt)}`,
                      )
                      : l("暂无译文，点击“翻译”生成。", "No translation yet. Click Translate to generate one.")}
                </span>
                {selectedPromptTranslation ? (
                  <span>
                    {selectedPromptTranslation.targetLanguage}
                    {" · "}
                    {selectedPromptTranslation.variantLabel}
                  </span>
                ) : null}
              </div>
              {promptTranslationRunning ? (
                <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                  {l(
                    `正在翻译 · 已运行 ${promptTranslationElapsedLabel}`,
                    `Translating · running ${promptTranslationElapsedLabel}`,
                  )}
                </div>
              ) : promptTranslationResult ? (
                <div
                  className={`rounded-md border px-3 py-2 text-xs ${
                    promptTranslationResult.ok
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  {promptTranslationResult.text}
                </div>
              ) : promptTranslationStage === "reviewing" ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  {l(
                    "译文已就绪，可在原文/译文之间切换阅读。",
                    "Translation is ready. Switch between source and translated views for reading.",
                  )}
                </div>
              ) : null}
              <TranslatableTextViewer
                isZh={isZh}
                sourceText={detailContent}
                translatedText={selectedPromptTranslation?.translatedText ?? ""}
                targetLanguage={translationTargetLanguage}
                targetLanguageOptions={translationTargetLanguageOptions}
                translating={promptTranslationRunning}
                onSourceTextChange={setDetailContent}
                sourceEditPlaceholder={l("使用 Markdown 编写 Prompt 内容...", "Write prompt content with Markdown...")}
                defaultSourceViewMode="edit"
                sourceViewModeResetKey={selectedPrompt?.id ?? ""}
                onTargetLanguageChange={(value) => {
                  setTranslationTargetLanguage(value);
                  setPromptTranslationResult(null);
                  if (!promptTranslationRunning) {
                    setPromptTranslationStage("idle");
                  }
                }}
                onTranslate={() => void runPromptTranslation()}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void handleSavePromptDetail()}>
                <Save className="mr-1 h-4 w-4" />
                {l("保存", "Save")}
              </Button>
              <Button variant="outline" onClick={() => void handleCopyPromptFromDetail()}>
                <Copy className="mr-1 h-4 w-4" />
                {l("复制 Prompt", "Copy Prompt")}
              </Button>
              <Button variant="outline" onClick={() => void handleOpenPromptVersion()}>
                <History className="mr-1 h-4 w-4" />
                {l("历史版本", "History")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const skillsCenter = (
    <div className="space-y-4">
      {skillDetailView === "list" ? (
        <>
          <SectionTitle
            title="Skills"
            subtitle={l(`共 ${filteredSkills.length} 项`, `${filteredSkills.length} items`)}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={skillQuery}
                  onChange={(event) => setSkillQuery(event.currentTarget.value)}
                  placeholder={l("搜索 Skill...", "Search skills...")}
                  className="w-56"
                />
                {!showSkillOpenModeInStatusBar ? (
                  <div className="relative">
                    <select
                      className={`${SELECT_BASE_CLASS} w-44`}
                      value={skillOpenMode}
                      onChange={(event) => setSkillOpenMode(event.currentTarget.value as SkillOpenMode)}
                    >
                      {skillOpenModeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                ) : null}
                <div className="relative">
                  <select
                    className={`${SELECT_BASE_CLASS} w-44`}
                    value={skillSourceFilter}
                    onChange={(event) => setSkillSourceFilter(event.currentTarget.value)}
                  >
                    <option value="all">{l("全部来源", "All sources")}</option>
                    {skillSources.map((source) => (
                      <option key={source} value={source}>
                        {source}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!activeWorkspaceId) {
                      toast({ title: projectBootingMessage, variant: "destructive" });
                      return;
                    }
                    if (selectedSkillScanDirectories.length === 0) {
                      toast({
                        title: l("请至少选择一个 Skills 扫描目录", "Please select at least one Skills scan directory"),
                        variant: "destructive",
                      });
                      return;
                    }
                    void scanSkills(activeWorkspaceId, selectedSkillScanDirectories);
                  }}
                >
                  {l("扫描 Skills", "Scan Skills")}
                </Button>
                <Button variant="outline" onClick={() => void fetchSkills()}>
                  <RefreshCw className="mr-1 h-4 w-4" />
                  {l("刷新", "Refresh")}
                </Button>
              </div>
            }
          />

          {!skillsLoading && filteredSkills.length === 0 ? (
            <EmptyState
              title={l("暂无 Skills", "No skills")}
              description={l("点击“扫描 Skills”从本地目录聚合技能。", "Click \"Scan Skills\" to discover local skills.")}
            />
          ) : null}

          {skillsLoading ? (
            <Card>
              <CardContent className="py-8 text-sm text-slate-500">{l("扫描中...", "Scanning...")}</CardContent>
            </Card>
          ) : null}

          {filteredSkills.length > 0 ? (
            <DataTable
              rows={pagedSkills}
              rowKey={(row) => row.id}
              onRowClick={(row) => {
                void handleOpenSkillDetail(row);
              }}
              columns={[
                {
                  key: "name",
                  title: l("技能", "Skill"),
                  render: (row) => (
                    <div className="space-y-0.5">
                      <div className="font-medium text-slate-900">{row.name}</div>
                      <div className="text-xs text-slate-500">{row.identity}</div>
                    </div>
                  ),
                },
                {
                  key: "path",
                  title: l("文件路径", "Path"),
                  className: "w-[360px]",
                  render: (row) => (
                    <span
                      className="block max-w-[340px] truncate text-xs text-slate-500"
                      title={row.localPath}
                    >
                      {row.localPath}
                    </span>
                  ),
                },
                {
                  key: "type",
                  title: l("是否软链", "Symlink"),
                  render: (row) =>
                    row.isSymlink ? (
                      <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">{l("是", "Yes")}</span>
                    ) : (
                      <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">{l("否", "No")}</span>
                    ),
                },
                {
                  key: "open",
                  title: l("操作", "Actions"),
                  render: (row) => (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleSkillOpen(row.id);
                      }}
                    >
                      {l("打开", "Open")}
                    </Button>
                  ),
                },
              ]}
            />
          ) : null}
          {!skillsLoading && filteredSkills.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
              <span>
                {l(`共 ${filteredSkills.length} 项 · 每页 ${SKILLS_PAGE_SIZE} 条`, `${filteredSkills.length} items · ${SKILLS_PAGE_SIZE} / page`)}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={skillsPage <= 1}
                  onClick={() => setSkillsPage((prev) => Math.max(1, prev - 1))}
                >
                  {l("上一页", "Prev")}
                </Button>
                <span>
                  {skillsPage} / {totalSkillsPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={skillsPage >= totalSkillsPages}
                  onClick={() => setSkillsPage((prev) => Math.min(totalSkillsPages, prev + 1))}
                >
                  {l("下一页", "Next")}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="mb-4 flex w-full flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSkillDetailView("list");
                  setSkillOpenMenuOpen(false);
                }}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <button
                type="button"
                className="font-medium text-blue-600 hover:underline"
                onClick={() => {
                  setSkillDetailView("list");
                  setSkillOpenMenuOpen(false);
                }}
              >
                Skills
              </button>
              <ChevronRight className="h-4 w-4 text-slate-400" />
              <span className="max-w-[380px] truncate text-slate-700">
                {selectedSkill?.name ?? l("未选择 skill", "No skill selected")}
              </span>
            </div>
            {selectedSkill ? (
              <Button
                variant="outline"
                onClick={() => void handleSkillOpen(selectedSkill.id)}
              >
                {l("打开目录", "Open Folder")}
              </Button>
            ) : null}
          </div>

          {!selectedSkill ? (
            <EmptyState title={l("未选择 Skill", "No skill selected")} description={l("请返回列表重新选择。", "Go back and choose a skill.")} />
          ) : (
            <>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <div className="font-medium text-slate-500">{l("完整路径", "Full Path")}</div>
                <div className="mt-1 break-all font-mono text-slate-800">{selectedSkill.localPath || "-"}</div>
              </div>
              <Tabs value={skillDetailTab} onValueChange={(value) => setSkillDetailTab(value as "overview" | "files")}>
              <TabsList>
                <TabsTrigger value="overview">{l("概述", "Overview")}</TabsTrigger>
                <TabsTrigger value="files">{l("文件", "Files")}</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-3">
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleReadSkillFile(selectedSkill.id, "SKILL.md")}
                  >
                    {l("刷新 SKILL.md", "Refresh SKILL.md")}
                  </Button>
                </div>
                {skillFileReadLoading && !selectedSkillOverviewRead ? (
                  <div className="rounded-md border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">{l("加载中...", "Loading...")}</div>
                ) : null}
                {!selectedSkillOverviewRead ? (
                  <div className="rounded-md border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
                    {l("未找到 SKILL.md", "SKILL.md not found")}
                  </div>
                ) : selectedSkillOverviewRead.supported ? (
                  <MarkdownPreview
                    content={selectedSkillOverviewRead.content}
                    minHeight={420}
                    maxHeight={720}
                    language={uiLanguage}
                  />
                ) : (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-700">
                    {selectedSkillOverviewRead.message || l("SKILL.md 暂不支持预览", "SKILL.md preview is not supported")}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="files">
                <div className="grid min-h-[560px] grid-cols-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
                  <div className="flex min-h-[560px] flex-col rounded-xl border border-slate-200 bg-white p-2">
                    <div className="mb-2 flex items-center justify-between px-1">
                      <span className="text-xs font-medium text-slate-500">{l("文件树", "File Tree")}</span>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => void handleLoadSkillTree(selectedSkill.id, true)}>
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void handleSkillOpen(selectedSkill.id)}>
                          {l("打开", "Open")}
                        </Button>
                      </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto">
                      {skillTreeLoading ? (
                        <div className="px-2 py-2 text-xs text-slate-500">{l("读取文件树中...", "Reading file tree...")}</div>
                      ) : null}
                      {!skillTreeLoading && !selectedSkillTree?.entries?.length ? (
                        <div className="px-2 py-2 text-xs text-slate-500">{l("暂无可浏览文件", "No browsable files")}</div>
                      ) : null}
                      {selectedSkillTree?.entries?.length
                        ? renderSkillTreeNodes(selectedSkillTree.entries, selectedSkill.id)
                        : null}
                    </div>
                  </div>

                  <div className="flex min-h-[560px] min-w-0 flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs text-slate-500">
                        {l("当前文件：", "Current File:")}<span className="font-medium text-slate-700">{selectedSkillFilePath}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleReadSkillFile(selectedSkill.id, selectedSkillFilePath)}
                        >
                          {l("刷新", "Refresh")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleSkillOpen(selectedSkill.id, selectedSkillFilePath)}
                        >
                          {l("打开", "Open")}
                        </Button>
                      </div>
                    </div>
                    {skillFileReadLoading && !selectedSkillFileRead ? (
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                        {l("加载中...", "Loading...")}
                      </div>
                    ) : null}
                    {!selectedSkillFileRead ? (
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                        {l("请选择要预览的文件", "Please select a file to preview")}
                      </div>
                    ) : selectedSkillFileRead.supported ? (
                      <TranslatableTextViewer
                        isZh={isZh}
                        sourceText={selectedSkillFileRead.content}
                        translatedText={selectedSkillTranslatedText}
                        targetLanguage={translationTargetLanguage}
                        targetLanguageOptions={translationTargetLanguageOptions}
                        translating={modelTestRunning}
                        onTargetLanguageChange={setTranslationTargetLanguage}
                        onTranslate={() => {
                          if (!selectedSkillTranslationKey) {
                            return;
                          }
                          void (async () => {
                            const result = await handleRunModelTranslationTest({
                              sourceText: selectedSkillFileRead.content,
                              targetLanguage: translationTargetLanguage,
                              syncModelTestForm: false,
                            });
                            if (!result) {
                              return;
                            }
                            setSkillFileTranslatedByKey((prev) => ({
                              ...prev,
                              [selectedSkillTranslationKey]: result.translatedText,
                            }));
                          })();
                        }}
                        defaultSourceViewMode={
                          shouldUseMarkdownPreview(selectedSkillFileRead.language) ? "preview" : "view"
                        }
                        sourceViewModeResetKey={selectedSkillTranslationKey}
                      />
                    ) : (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-700">
                        {selectedSkillFileRead.message || l("该文件类型暂不支持预览", "This file type is not supported for preview")}
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
              </Tabs>
            </>
          )}
        </>
      )}
    </div>
  );
  const agentsCenter = (
    <div className="space-y-4">
      <SectionTitle
        title={l("全局 Agent 规则管理", "Global Agent Rules")}
        subtitle={l(`规则文件 ${agentAssets.length} 个 · 已接入 Agent ${agentConnections.length} 个`, `${agentAssets.length} rule files · ${agentConnections.length} connected agents`)}
        action={
          <div className="flex flex-wrap gap-2">
            <Input
              value={agentQuery}
              onChange={(event) => setAgentQuery(event.currentTarget.value)}
              placeholder={l("搜索规则文件...", "Search rule files...")}
              className="w-56"
            />
            <Button variant="outline" onClick={() => void handleRefreshAgentModule()}>
              <RefreshCw className="mr-1 h-4 w-4" />
              {l("刷新", "Refresh")}
            </Button>
            <Button onClick={() => handleCreateNewAgentAsset()} disabled={!activeWorkspaceId}>
              {l("新建规则文件", "New Rule File")}
            </Button>
          </div>
        }
      />

      {agentRulesError ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center justify-between gap-3 py-3 text-sm text-red-700">
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {agentRulesError}
            </span>
            <Button size="sm" variant="outline" onClick={() => clearAgentRulesError()}>
              {l("清除", "Clear")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{l("规则列表", "Rule Files")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {filteredAgentAssets.length === 0 ? (
            <div className="text-slate-500">{l("暂无规则文件，点击“新建规则文件”开始。", "No rule files yet. Click \"New Rule File\" to start.")}</div>
          ) : (
            pagedAgentAssets.map((asset) => {
              const tags = agentTagsByAsset[asset.id] ?? asset.tags ?? [];
              return (
                <div
                  key={asset.id}
                  className="group cursor-pointer rounded-md border border-slate-200 px-3 py-2"
                  onClick={() => {
                    void openAgentRuleEditor(asset.id);
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{asset.name}</span>
                      <span className="text-xs text-slate-500">
                        {l("版本", "Version")} v{asset.latestVersion ?? "-"} · {toLocalTime(asset.updatedAt)}
                      </span>
                    </div>
                    <div className="flex gap-2 opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleOpenAgentVersionDiff(asset.id);
                        }}
                      >
                        {l("版本对比", "Compare")}
                      </Button>
                      <Button
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedAssetId(asset.id);
                          setCreatingAgentAsset(false);
                          setAgentDistributionModalOpen(true);
                        }}
                        disabled={agentConnections.length === 0}
                      >
                        {l("应用", "Apply")}
                      </Button>
                      <div className="relative">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700"
                          title={l("删除规则文件", "Delete rule file")}
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteConfirmAssetId((prev) =>
                              prev === asset.id ? null : asset.id,
                            );
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        {deleteConfirmAssetId === asset.id ? (
                          <div
                            className="absolute right-0 top-10 z-20 w-56 rounded-md border border-red-200 bg-white p-2 text-xs shadow-lg"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <div className="text-slate-700">
                              {l(`确认彻底删除「${asset.name}」？`, `Delete "${asset.name}" permanently?`)}
                            </div>
                            <div className="mt-2 flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setDeleteConfirmAssetId(null);
                                }}
                              >
                                {l("取消", "Cancel")}
                              </Button>
                              <Button
                                size="sm"
                                className="bg-red-600 hover:bg-red-700"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleDeleteAgentRuleAsset(asset.id, asset.name);
                                }}
                              >
                                {l("确认删除", "Delete")}
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {tags.length === 0 ? (
                      <span className="text-xs text-slate-400">{l("暂无 Agent 标签", "No agent tags")}</span>
                    ) : (
                      tags.map((tag) => {
                        const status = String(
                          (tag as Record<string, unknown>).status ??
                            (tag as Record<string, unknown>).driftStatus ??
                            "clean",
                        );
                        const label =
                          status === "drifted"
                            ? isDarkTheme
                              ? "border-rose-400/40 bg-rose-500/15 text-rose-200"
                              : "border-[#ffccc7] bg-[#fff2f0] text-[#ff4d4f]"
                            : status === "clean" || status === "synced" || status === "success"
                              ? isDarkTheme
                                ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                                : "border-[#b7eb8f] bg-[#f6ffed] text-[#52c41a]"
                              : status === "error"
                                ? isDarkTheme
                                  ? "border-amber-400/40 bg-amber-500/15 text-amber-200"
                                  : "border-amber-200 bg-amber-50 text-amber-700"
                                : isDarkTheme
                                  ? "border-slate-500/40 bg-slate-500/15 text-slate-200"
                                  : "border-slate-200 bg-slate-50 text-slate-700";
                        const agentType = String(
                          (tag as Record<string, unknown>).agentType ??
                            (tag as Record<string, unknown>).agent_type ??
                            "unknown",
                        );
                        return (
                          <span key={`${asset.id}-${agentType}`} className={`rounded-full border px-2 py-1 text-xs ${label}`}>
                            {agentType}
                            {status === "drifted" ? " · drifted" : ""}
                          </span>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })
          )}
          {filteredAgentAssets.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
              <span>
                {l(
                  `共 ${filteredAgentAssets.length} 个 · 每页 ${AGENT_RULES_PAGE_SIZE} 条`,
                  `${filteredAgentAssets.length} items · ${AGENT_RULES_PAGE_SIZE} / page`,
                )}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={agentRulesPage <= 1}
                  onClick={() => setAgentRulesPage((prev) => Math.max(1, prev - 1))}
                >
                  {l("上一页", "Prev")}
                </Button>
                <span>
                  {agentRulesPage} / {totalAgentPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={agentRulesPage >= totalAgentPages}
                  onClick={() => setAgentRulesPage((prev) => Math.min(totalAgentPages, prev + 1))}
                >
                  {l("下一页", "Next")}
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{l("平台文件映射", "Platform File Mapping")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {agentConnections.length === 0 ? (
            <div className="text-slate-500">{l("暂无接入 Agent，请先在设置中配置根目录。", "No connected agents. Configure root directories in Settings first.")}</div>
          ) : (
            agentConnections.map((connection) => {
              const platform = normalizeAgentTypeInput(connection.agentType);
              const mappedPath = connection.ruleFile || defaultAgentRuleFile(platform);
              const resolvedPath =
                connection.resolvedPath ||
                (connection.rootDir
                  ? joinRuleFilePath(connection.rootDir, mappedPath)
                  : mappedPath);
              return (
                <div
                  key={`mapping-${connection.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2"
                >
                  <div>
                    <div className="font-medium">{platform}</div>
                    <div className="text-xs text-slate-500">{connection.rootDir || l("(未配置根目录)", "(root directory not configured)")}</div>
                    <div className="text-xs text-slate-500">
                      <code>{resolvedPath}</code>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void handleOpenAgentMappingPreview(platform)}>
                    {l("预览", "Preview")}
                  </Button>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );

  const settingsCenter = (
    <div className="space-y-4">
      <SectionTitle title={l("设置", "Settings")} subtitle={l("数据目录与 Agent 管理", "Data directory and agent management")} />
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="h-fit lg:sticky lg:top-4">
          <div className="space-y-2">
            {settingCategories.map((category) => (
              <Button
                key={category.key}
                variant={settingsCategory === category.key ? "default" : "outline"}
                className="min-h-11 w-full justify-start"
                onClick={() => handleChangeSettingsCategory(category.key)}
              >
                {category.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {settingsLoading ? <Card><CardContent className="py-8 text-sm text-slate-500">{l("加载设置中...", "Loading settings...")}</CardContent></Card> : null}

          {settingsCategory === "general" ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>{l("通用设置", "General")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <label className="block text-xs text-slate-500">
                    {l("主题", "Theme")}
                    <div className="relative mt-1">
                      <select
                        className={SELECT_BASE_CLASS}
                        value={theme}
                        onChange={(event) => setTheme(event.currentTarget.value as AppTheme)}
                      >
                        <option value="light">{l("日间模式", "Day Mode")}</option>
                        <option value="dark">{l("夜间模式", "Night Mode")}</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    </div>
                  </label>
                  <label className="block text-xs text-slate-500">
                    {l("语言", "Language")}
                    <div className="relative mt-1">
                      <select
                        className={SELECT_BASE_CLASS}
                        value={language}
                        onChange={(event) => setLanguage(event.currentTarget.value as AppLanguage)}
                      >
                        <option value="zh-CN">{l("中文", "Chinese")}</option>
                        <option value="en-US">English</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    </div>
                  </label>
                  <div className="text-xs text-slate-500">
                    {l("切换后立即生效。", "Changes apply immediately.")}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {settingsCategory === "data" ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>{l("存储位置", "Storage")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="text-xs text-slate-500">
                    {l("应用首次启动会自动初始化默认目录；你也可以手动改为其它绝对路径。", "The app initializes a default directory on first launch. You can also set another absolute path.")}
                  </div>
                  <label className="block text-xs text-slate-500">
                    {l("目录路径（绝对路径）", "Directory Path (Absolute)")}
                    <Input
                      value={storageDirDraft}
                      onChange={(event) => {
                        setStorageDirDraft(event.currentTarget.value);
                        setDirty("data", true);
                      }}
                      placeholder="/Users/you/Library/Application Support/agentnexus"
                    />
                  </label>
                  <div className="text-xs text-slate-500">
                    {l("当前项目目录：", "Current Project Directory: ")}{activeWorkspace?.rootPath ?? "-"}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void handleSaveStorageDirectory()}>{l("保存目录", "Save")}</Button>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          const defaultDir = await appDataDir();
                          setStorageDirDraft(defaultDir);
                        } catch {
                          // 忽略读取默认路径失败
                        }
                      }}
                    >
                      {l("使用默认目录", "Use Default")}
                    </Button>
                    <Button variant="outline" onClick={() => void handleOpenStorageDirectoryInFinder()}>
                      {l("在 Finder 中打开", "Open in Finder")}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{l("Skills 扫描目录", "Skill Scan Directories")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="text-xs text-slate-500">
                    {l("默认目录：", "Default Directories: ")}
                    {DEFAULT_SKILL_SCAN_SUFFIXES.map((name) => `~/${name}`).join(" / ")}
                  </div>
                  <div className="space-y-2">
                    {skillScanDirectories.length === 0 ? (
                      <div className="text-xs text-slate-500">{l("暂无可用扫描目录", "No scan directory available")}</div>
                    ) : (
                      skillScanDirectories.map((item) => (
                        <div
                          key={`skill-scan-dir-${item.path}`}
                          className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 px-3 py-2"
                        >
                          <label className="flex min-w-0 flex-1 items-center gap-2">
                            <input
                              type="checkbox"
                              checked={item.selected}
                              onChange={(event) =>
                                handleToggleSkillScanDirectory(item.path, event.currentTarget.checked)
                              }
                            />
                            <span className="truncate text-xs text-slate-700">{item.path}</span>
                          </label>
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                            {item.source === "default" ? l("默认", "Default") : l("自定义", "Custom")}
                          </span>
                          {item.source === "custom" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => handleRemoveSkillScanDirectory(item.path)}
                            >
                              {l("删除", "Delete")}
                            </Button>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Input
                      value={skillScanDirInput}
                      onChange={(event) => setSkillScanDirInput(event.currentTarget.value)}
                      placeholder="/Users/you/.custom-skill-dir"
                      className="min-w-[260px] flex-1"
                    />
                    <Button variant="outline" onClick={handleAddSkillScanDirectory}>
                      {l("添加目录", "Add Directory")}
                    </Button>
                  </div>

                  <div className="text-xs text-slate-500">
                    {l("Skills Tab 扫描时会按已勾选目录递归查找 `SKILL.md`。", "Skills tab scans selected directories recursively for `SKILL.md`.")}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {settingsCategory === "agents" ? (
            <div className="grid gap-4 xl:grid-cols-[220px_1fr]">
              <div className="h-fit space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {l("Agent 列表", "Agent List")}
                </div>
                <div className="space-y-2">
                  {settingsAgentTypes.length === 0 ? (
                    <div className="text-xs text-slate-500">{l("暂无 Agent，点击下方按钮添加。", "No agents yet. Add one below.")}</div>
                  ) : (
                    settingsAgentTypes.map((agentType) => {
                      const isActive = selectedSettingsAgentType === agentType;
                      const itemClass = isActive
                        ? isDarkTheme
                          ? "border-blue-400/45 bg-blue-500/18"
                          : "border-blue-300 bg-blue-50"
                        : isDarkTheme
                          ? "border-slate-600 bg-slate-900/35"
                          : "border-slate-200 bg-white";
                      const buttonClass = isActive
                        ? isDarkTheme
                          ? "text-blue-100 hover:bg-blue-500/20 hover:text-blue-50"
                          : "text-blue-700 hover:bg-blue-100/70"
                        : isDarkTheme
                          ? "text-slate-200 hover:bg-slate-800/70 hover:text-slate-100"
                          : "text-slate-700 hover:bg-slate-100/70";

                      return (
                        <div
                          key={`settings-agent-${agentType}`}
                          className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${itemClass}`}
                        >
                          <Button
                            variant="ghost"
                            className={`min-h-9 flex-1 justify-start px-2 ${buttonClass}`}
                            onClick={() => setSettingsAgentType(agentType)}
                          >
                            {agentType}
                          </Button>
                          {agentType !== "codex" && agentType !== "claude" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => void handleRemoveSettingsAgent(agentType)}
                            >
                              {l("移除", "Remove")}
                            </Button>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Input
                    value={newSettingsAgentInput}
                    onChange={(event) => setNewSettingsAgentInput(event.currentTarget.value)}
                    placeholder={l("输入 Agent 名称（如 cursor）", "Agent name (e.g. cursor)")}
                  />
                  <Button variant="outline" className="w-full" onClick={handleAddSettingsAgent}>
                    {l("新增 Agent", "Add Agent")}
                  </Button>
                </div>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>
                    {selectedSettingsAgentType
                      ? l(`${selectedSettingsAgentType} 配置`, `${selectedSettingsAgentType} Settings`)
                      : l("Agent 配置", "Agent Settings")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  {selectedSettingsAgentType ? (
                    <>
                      <label className="block text-xs text-slate-500">
                        {l("Global Config file（绝对路径）", "Global Config file (Absolute Path)")}
                        <Input
                          value={selectedSettingsRootDir}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            setConnectionDrafts((prev) => ({
                              ...prev,
                              [selectedSettingsAgentType]: value,
                            }));
                            setDirty("agents", true);
                          }}
                          placeholder={
                            defaultAgentConfigDir(homePath, selectedSettingsAgentType) ||
                            "/Users/you/.agent-config"
                          }
                        />
                      </label>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            const fallback = defaultAgentConfigDir(homePath, selectedSettingsAgentType);
                            if (!fallback) {
                              toast({
                                title: l("该 Agent 暂无默认路径", "This agent has no default path"),
                                description: l("请手动填写绝对路径", "Please enter an absolute path manually"),
                                variant: "destructive",
                              });
                              return;
                            }
                            setConnectionDrafts((prev) => ({
                              ...prev,
                              [selectedSettingsAgentType]: fallback,
                            }));
                            setDirty("agents", true);
                          }}
                        >
                          {l("使用默认", "Use Default")}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void handleOpenAgentConfigInFinder(selectedSettingsAgentType)}
                        >
                          {l("在 Finder 中打开", "Open in Finder")}
                        </Button>
                      </div>

                      <label className="block text-xs text-slate-500">
                        {l("规则文件（相对路径）", "Rule File (Relative Path)")}
                        <Input
                          value={selectedSettingsRuleFile}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            setConnectionRuleFileDrafts((prev) => ({
                              ...prev,
                              [selectedSettingsAgentType]: value,
                            }));
                            setDirty("agents", true);
                          }}
                          placeholder={defaultAgentRuleFile(selectedSettingsAgentType)}
                        />
                      </label>

                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                        {l("解析路径：", "Resolved Path: ")}<code>{selectedSettingsResolvedPath || "-"}</code>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => void handleSaveAgentConnections()}>{l("保存 Agent 配置", "Save Agent Settings")}</Button>
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-slate-500">{l("请先选择一个 Agent。", "Select an agent first.")}</div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}

          {settingsCategory === "model" ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>{l("场景默认模型", "Scenario Defaults")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-slate-600">
                  <div>
                    {l(
                      "当前仅启用“翻译 / 双语处理”场景。选择默认 Profile 后，Prompt 翻译会按该设置执行。",
                      "Only the \"Translation / Bilingual\" scenario is enabled in V1. Prompt translation uses the selected default profile.",
                    )}
                  </div>
                </CardContent>
              </Card>

              <ModelWorkbenchPanel
                isZh={isZh}
                loading={modelLoading || modelSaving}
                profiles={localAgentProfiles.map((item) => ({
                  profileKey: item.profileKey,
                  name: item.name,
                  executable: item.executable,
                  argsTemplate: item.argsTemplate,
                  isBuiltin: item.isBuiltin,
                  enabled: item.enabled,
                }))}
                selectedProfileKey={selectedModelProfileKey}
                onSelectProfile={setSelectedModelProfileKey}
                onDeleteProfile={(key) => void handleDeleteModelProfile(key)}
                profileName={modelProfileName}
                onProfileNameChange={(value) => {
                  setModelProfileName(value);
                  setDirty("model", true);
                }}
                executable={modelExecutable}
                onExecutableChange={(value) => {
                  setModelExecutable(value);
                  setDirty("model", true);
                }}
                argsTemplateText={modelArgsTemplateText}
                onArgsTemplateTextChange={(value) => {
                  setModelArgsTemplateText(value);
                  setDirty("model", true);
                }}
                onSaveProfile={() => void handleSaveModelProfile()}
                newProfileKey={newModelProfileKey}
                onNewProfileKeyChange={setNewModelProfileKey}
                onAddProfile={handleAddModelProfile}
                translationScenarioDefaultProfileKey={translationDefaultProfileKey}
                onOpenTranslationScenarioSettings={() => setModelScenarioSettingsOpen(true)}
                onOpenTranslationScenarioTest={() => setModelScenarioTestOpen(true)}
                testRunning={modelTestRunning}
              />

              <Dialog open={modelScenarioSettingsOpen} onOpenChange={setModelScenarioSettingsOpen}>
                <DialogContent className="max-w-3xl">
                  <DialogHeader>
                    <DialogTitle>{l("翻译场景设置", "Translation Scenario Settings")}</DialogTitle>
                    <DialogDescription>
                      {l(
                        "配置翻译场景的默认 Profile 和 Prompt 模板。",
                        "Configure default profile and prompt template for translation scenario.",
                      )}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <label className="block text-xs text-slate-500">
                      {l("默认 Profile", "Default Profile")}
                      <Input
                        value={translationDefaultProfileKey}
                        onChange={(event) => {
                          setTranslationDefaultProfileKey(event.currentTarget.value);
                          setDirty("model", true);
                        }}
                      />
                    </label>
                    <label className="block text-xs text-slate-500">
                      {l("模板配置", "Prompt Template")}
                      <Textarea
                        value={translationPromptTemplate}
                        onChange={(event) => {
                          setTranslationPromptTemplate(event.currentTarget.value);
                          setDirty("model", true);
                        }}
                        rows={12}
                      />
                    </label>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={handleRestoreDefaultTranslationConfig}>
                      {l("恢复默认配置", "Restore Defaults")}
                    </Button>
                    <Button
                      onClick={() => void handleSaveTranslationConfigFromDialog()}
                      disabled={modelLoading}
                    >
                      {l("保存模板配置", "Save Template Config")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={modelScenarioTestOpen} onOpenChange={setModelScenarioTestOpen}>
                <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden">
                  <DialogHeader>
                    <DialogTitle>{l("翻译场景测试", "Translation Scenario Test")}</DialogTitle>
                    <DialogDescription>
                      {l(
                        "填写测试文本后点击运行，输出会在右侧面板实时展示。",
                        "Run a test and inspect streaming output in the right-side panel.",
                      )}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
                    <label className="block text-xs text-slate-500">
                      {l("测试原文", "Source Text")}
                      <Textarea
                        value={modelTestSourceText}
                        onChange={(event) => setModelTestSourceText(event.currentTarget.value)}
                        rows={6}
                        placeholder={l("输入测试原文", "Input source text")}
                      />
                    </label>
                    <TranslatableTextViewer
                      isZh={isZh}
                      sourceText={modelTestSourceText}
                      translatedText={modelTestResult?.ok ? modelTestResult.text : ""}
                      targetLanguage={translationTargetLanguage}
                      targetLanguageOptions={translationTargetLanguageOptions}
                      translating={modelTestRunning}
                      onTargetLanguageChange={setTranslationTargetLanguage}
                      onTranslate={() => void handleRunModelTranslationTest()}
                    />
                    {modelTestResult ? (
                      <div
                        className={`rounded-md border px-3 py-2 text-xs ${
                          modelTestResult.ok
                            ? "border-green-200 bg-green-50 text-green-700"
                            : "border-red-200 bg-red-50 text-red-700"
                        }`}
                      >
                        {modelTestResult.text}
                      </div>
                    ) : null}
                  </div>
                  <DialogFooter className="shrink-0">
                    <Button variant="outline" onClick={() => setModelTestOutputSheetOpen(true)}>
                      {l("查看运行输出", "View Runtime Output")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

            </div>
          ) : null}

          {settingsCategory === "about" ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>{l("关于", "About")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="text-slate-500">{l("应用版本", "App Version")}</span>
                    <code className="text-slate-800">{appVersion}</code>
                  </div>
                  <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="text-xs text-slate-500">{l("应用更新", "App Updates")}</div>
                    <div
                      className={`text-sm ${
                        appUpdateStage === "error" ? "text-red-600" : "text-slate-700"
                      }`}
                    >
                      {appUpdateStatusText}
                    </div>
                    {appUpdateStage === "error" && appUpdateError ? (
                      <div className="text-xs text-red-600">{appUpdateError}</div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        disabled={
                          appUpdateStage === "checking" ||
                          appUpdateStage === "downloading" ||
                          appUpdateStage === "installing" ||
                          appUpdateStage === "restarting"
                        }
                        onClick={() => void checkAppUpdates(true)}
                      >
                        {appUpdateStage === "checking"
                          ? l("检查中...", "Checking...")
                          : l("检查更新", "Check for Updates")}
                      </Button>
                      {appUpdateStage === "available" ? (
                        <Button onClick={() => void installAppUpdate()}>
                          {l("下载并安装", "Download and Install")}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  const modelTestOutputSheet = (
    <Sheet open={modelTestOutputSheetOpen} onOpenChange={setModelTestOutputSheetOpen}>
      <SheetContent side="right" className="w-[min(94vw,560px)] overflow-hidden sm:max-w-[560px]">
        <div className="flex h-full flex-col overflow-hidden">
          <SheetHeader className="pr-8">
            <SheetTitle>{l("运行输出", "Runtime Output")}</SheetTitle>
            <SheetDescription>
              {modelTestRunning
                ? l("正在运行，输出会实时刷新。", "Running, output updates in real time.")
                : l("查看最近一次运行输出。", "Inspect latest runtime output.")}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
            {modelTestLifecycleText ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                {modelTestLifecycleText}
              </div>
            ) : null}
            {modelTestResult ? (
              <div
                className={`rounded-md border px-3 py-2 text-xs ${
                  modelTestResult.ok
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {modelTestResult.text}
              </div>
            ) : null}
            <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
              <div className="text-[11px] font-medium text-slate-500">stdout</div>
              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-700">
                {modelTestRuntimeOutput.stdout || "-"}
              </pre>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
              <div className="text-[11px] font-medium text-slate-500">stderr</div>
              <pre
                ref={modelTestStderrRef}
                className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-700"
              >
                {modelTestRuntimeOutput.stderr || "-"}
              </pre>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );

  const center =
    activeModule === "prompts"
      ? (promptDetailView === "detail" ? promptDetail : promptCenter)
      : activeModule === "skills"
        ? skillsCenter
        : activeModule === "agents"
          ? agentsCenter
          : settingsCenter;
  const skillOpenModeStatusBar = showSkillOpenModeInStatusBar ? (
    <div ref={skillOpenMenuRef} className="relative">
      <button
        type="button"
        className="inline-flex h-8 items-center gap-2 rounded-2xl border border-border/70 bg-background/95 px-1.5 pl-2 shadow-sm backdrop-blur-md transition-colors hover:border-ring/60"
        onClick={() => setSkillOpenMenuOpen((prev) => !prev)}
      >
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {renderSkillOpenModeIcon(selectedSkillOpenModeOption?.value ?? "vscode")}
        </span>
        <span className="text-xs font-medium text-foreground">{skillOpenModeLabel}</span>
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-xl border border-border/70 text-slate-500">
          <ChevronDown className="h-3.5 w-3.5" />
        </span>
      </button>
      {skillOpenMenuOpen ? (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-56 rounded-2xl border border-border/70 bg-card/95 p-2 shadow-xl backdrop-blur-xl">
          {skillOpenModeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm transition-colors ${
                option.value === skillOpenMode
                  ? "bg-primary/12 text-primary"
                  : "text-foreground hover:bg-muted"
              }`}
              onClick={() => {
                setSkillOpenMode(option.value);
                setSkillOpenMenuOpen(false);
              }}
            >
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                {renderSkillOpenModeIcon(option.value)}
              </span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  ) : null;
  const detail = <div className="h-full" />;

  return (
    <>
      <AppShell
        activeModule={activeModule}
        language={language}
        onChangeModule={(module) => {
          setActiveModule(module);
          setPromptDetailView("list");
          selectPrompt(null);
          setSkillDetailView("list");
          setMobileDetailOpen(false);
        }}
        promptCount={prompts.length}
        skillCount={skills.length}
        agentRulesCount={agentAssets.length}
        onOpenSettings={() => {
          setActiveModule("settings");
          setSettingsCategory("general");
        }}
        sidebarOpen={sidebarOpen}
        onSidebarOpen={setSidebarOpen}
        mobileDetailOpen={mobileDetailOpen}
        onMobileDetailOpen={setMobileDetailOpen}
        showDetailPanel={false}
        statusBarContent={skillOpenModeStatusBar}
        center={center}
        detail={detail}
      />

      {modelTestOutputSheet}

      <Dialog open={createPromptOpen} onOpenChange={setCreatePromptOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{l("新建 Prompt", "New Prompt")}</DialogTitle>
            <DialogDescription>{l("创建并立即加入列表。", "Create and add it to the list immediately.")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-xs text-slate-500">
              {l("名称", "Name")}
              <Input value={newPromptName} onChange={(event) => setNewPromptName(event.currentTarget.value)} />
            </label>
            <div className="space-y-1">
              <div className="text-xs text-slate-500">{l("内容（Markdown）", "Content (Markdown)")}</div>
              <MarkdownEditor
                value={newPromptContent}
                onChange={setNewPromptContent}
                minHeight={260}
                placeholder={l("使用 Markdown 编写 Prompt 内容...", "Write prompt content with Markdown...")}
                language={uiLanguage}
                modeLabels={markdownModeLabels}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatePromptOpen(false)}>{l("取消", "Cancel")}</Button>
            <Button onClick={() => void handleCreatePrompt()}>{l("创建", "Create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={promptRunOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleClosePromptRun();
            return;
          }
          setPromptRunOpen(true);
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{l("复制 Prompt", "Copy Prompt")}</DialogTitle>
            <DialogDescription>
              {promptRunFromDetail
                ? l(
                    `当前基于详情草稿复制：${promptRunPromptName || "-"}`,
                    `Copying from detail draft: ${promptRunPromptName || "-"}`,
                  )
                : l(
                    `当前基于列表项复制：${promptRunPromptName || "-"}`,
                    `Copying from list item: ${promptRunPromptName || "-"}`,
                  )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 text-xs font-medium text-slate-500">{l("变量输入", "Variables")}</div>
              {promptRunVariableOrder.length === 0 ? (
                <div className="text-xs text-slate-500">{l("当前 Prompt 不包含模板变量。", "This prompt has no template variables.")}</div>
              ) : (
                <div className="space-y-3">
                  {promptRunVariableOrder.map((variableName) => {
                    const history = promptRunVariableHistories[variableName] ?? [];
                    return (
                      <div key={variableName} className="space-y-1">
                        <div className="text-xs font-medium text-slate-600">
                          {l("变量", "Variable")}: {variableName}
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            value={promptRunVariables[variableName] ?? ""}
                            onChange={(event) => handlePromptRunVariableChange(variableName, event.currentTarget.value)}
                            placeholder={l(`请输入 ${variableName}`, `Enter ${variableName}`)}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={history.length === 0}
                            onClick={() => handlePromptRunApplyHistory(variableName)}
                          >
                            {l("历史记录", "History")}
                          </Button>
                        </div>
                        {history.length > 0 ? (
                          <div className="line-clamp-1 text-[11px] text-slate-500">
                            {l("最近值：", "Recent: ")}
                            {history[0]}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 text-xs font-medium text-slate-500">{l("实时预览", "Live Preview")}</div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-700">
                {promptRunPreview || "-"}
              </pre>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleClosePromptRun}>
              {l("取消", "Cancel")}
            </Button>
            <Button variant="outline" onClick={() => void handleCopyPromptRunPreview()}>
              <Copy className="mr-1 h-4 w-4" />
              {l("复制预览内容", "Copy Preview")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={versionModalOpen}
        onOpenChange={(open) => {
          setVersionModalOpen(open);
          if (!open) {
            setPromptVersionCompareMode(false);
            setCompareLeftVersion(null);
            setCompareRightVersion(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[90vh] max-w-6xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{l("历史版本", "History Versions")}</DialogTitle>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden pt-1 md:grid-cols-[280px_minmax(0,1fr)]">
            <div className="min-h-0 space-y-2 overflow-auto border-r border-slate-200 pr-3">
              <div className="px-1 text-sm text-slate-500">
                {promptVersionCompareMode
                  ? l("选择对比版本", "Select versions for comparison")
                  : l("选择版本", "Select version")}
              </div>
              {selectedPromptVersions.map((item) => {
                const version = item.version;
                const selectedAsSingle = !promptVersionCompareMode && promptVersionPreview === version;
                const selectedAsLeft = promptVersionCompareMode && compareLeftVersion === version;
                const selectedAsRight = promptVersionCompareMode && compareRightVersion === version;
                const selected = selectedAsSingle || selectedAsLeft || selectedAsRight;
                const colorClass = selectedAsLeft
                  ? "border-red-200 bg-red-500 text-white"
                  : selectedAsRight
                    ? "border-emerald-200 bg-emerald-500 text-white"
                    : selected
                      ? "border-blue-200 bg-blue-500 text-white"
                      : "border-slate-200 bg-white text-slate-800 hover:border-blue-200 hover:bg-blue-50";
                return (
                  <button
                    key={`prompt-version-${version}`}
                    type="button"
                    className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${colorClass}`}
                    onClick={() => {
                      if (promptVersionCompareMode) {
                        togglePromptCompareCandidate(version);
                        return;
                      }
                      setPromptVersionPreview(version);
                    }}
                  >
                    <div className="text-[22px] leading-none">v{version}</div>
                    <div className="mt-1 text-sm opacity-90">{toLocalTime(item.createdAt)}</div>
                  </button>
                );
              })}
            </div>
            <div className="min-h-0 space-y-3 overflow-auto pr-1">
              {!promptVersionCompareMode ? (
                <>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">
                      {selectedPromptPreviewVersion
                        ? `v${selectedPromptPreviewVersion.version} · ${toLocalTime(selectedPromptPreviewVersion.createdAt)}`
                        : l("请选择一个版本查看详情。", "Select a version to view details.")}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-slate-600">{l("内容", "Content")}</div>
                    <div className="max-h-[56vh] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <pre className="whitespace-pre-wrap break-words text-sm text-slate-800">
                        {selectedPromptPreviewVersion?.content || l("暂无版本内容", "No version content")}
                      </pre>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="rounded-md bg-red-100 px-2 py-1 font-medium text-red-700">
                          {promptCompareLeft ? `v${promptCompareLeft.version}` : l("未选择", "N/A")}
                        </span>
                        <span className="text-slate-500">→</span>
                        <span className="rounded-md bg-emerald-100 px-2 py-1 font-medium text-emerald-700">
                          {promptCompareRight ? `v${promptCompareRight.version}` : l("未选择", "N/A")}
                        </span>
                      </div>
                      <div className="text-sm text-slate-500">
                        {promptCompareLeft && promptCompareRight
                          ? `${toLocalTime(promptCompareLeft.createdAt)} → ${toLocalTime(promptCompareRight.createdAt)}`
                          : l("请选择两个版本进行对比。", "Select two versions to compare.")}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm font-medium text-slate-600">
                      <span>{l("内容对比", "Content Diff")}</span>
                      <span className="text-xs">
                        <span className="text-emerald-600">+ {promptDiffStats.added}</span>
                        <span className="mx-2 text-red-600">- {promptDiffStats.removed}</span>
                      </span>
                    </div>
                    <VersionDiffViewer
                      isZh={isZh}
                      before={promptCompareLeft?.content ?? ""}
                      after={promptCompareRight?.content ?? ""}
                      leftTitle={promptCompareLeft ? `v${promptCompareLeft.version}` : undefined}
                      rightTitle={promptCompareRight ? `v${promptCompareRight.version}` : undefined}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
          <DialogFooter className="mt-2 border-t border-slate-200 pt-3">
            <div className="flex w-full items-center justify-between gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (promptVersionCompareMode) {
                    setPromptVersionCompareMode(false);
                    setCompareLeftVersion(null);
                    setCompareRightVersion(null);
                    return;
                  }
                  setPromptVersionCompareMode(true);
                  setCompareLeftVersion(selectedPromptVersions[0]?.version ?? null);
                  setCompareRightVersion(
                    selectedPromptVersions[1]?.version ?? selectedPromptVersions[0]?.version ?? null,
                  );
                }}
              >
                {promptVersionCompareMode ? l("退出对比", "Exit Compare") : l("版本对比", "Compare Versions")}
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setVersionModalOpen(false)}>
                  {l("取消", "Cancel")}
                </Button>
                {!promptVersionCompareMode ? (
                  <Button
                    disabled={!selectedPromptPreviewVersion}
                    onClick={() => {
                      if (!selectedPromptPreviewVersion) {
                        return;
                      }
                      void handleRestorePromptVersion(selectedPromptPreviewVersion.version);
                    }}
                  >
                    {l("恢复此版本", "Restore This Version")}
                  </Button>
                ) : null}
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={agentVersionModalOpen}
        onOpenChange={(open) => {
          setAgentVersionModalOpen(open);
          if (!open) {
            setAgentVersionCompareMode(false);
            setAgentCompareLeftVersion("");
            setAgentCompareRightVersion("");
          }
        }}
      >
        <DialogContent className="flex max-h-[90vh] max-w-6xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{l("历史版本", "History Versions")}</DialogTitle>
            <DialogDescription>{selectedAgentAsset?.name ?? l("请选择规则文件", "Please select a rule file")}</DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden pt-1 md:grid-cols-[280px_minmax(0,1fr)]">
            <div className="min-h-0 space-y-2 overflow-auto border-r border-slate-200 pr-3">
              <div className="px-1 text-sm text-slate-500">
                {agentVersionCompareMode
                  ? l("选择对比版本", "Select versions for comparison")
                  : l("选择版本", "Select version")}
              </div>
              {selectedAgentVersions.map((item) => {
                const version = String(item.version);
                const selectedAsSingle = !agentVersionCompareMode && agentVersionPreview === version;
                const selectedAsLeft = agentVersionCompareMode && agentCompareLeftVersion === version;
                const selectedAsRight = agentVersionCompareMode && agentCompareRightVersion === version;
                const selected = selectedAsSingle || selectedAsLeft || selectedAsRight;
                const colorClass = selectedAsLeft
                  ? "border-red-200 bg-red-500 text-white"
                  : selectedAsRight
                    ? "border-emerald-200 bg-emerald-500 text-white"
                    : selected
                      ? "border-blue-200 bg-blue-500 text-white"
                      : "border-slate-200 bg-white text-slate-800 hover:border-blue-200 hover:bg-blue-50";
                return (
                  <button
                    key={`agent-version-${version}`}
                    type="button"
                    className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${colorClass}`}
                    onClick={() => {
                      if (agentVersionCompareMode) {
                        toggleAgentCompareCandidate(version);
                        return;
                      }
                      setAgentVersionPreview(version);
                    }}
                  >
                    <div className="text-[22px] leading-none">v{version}</div>
                    <div className="mt-1 text-sm opacity-90">{toLocalTime(item.createdAt)}</div>
                  </button>
                );
              })}
            </div>
            <div className="min-h-0 space-y-3 overflow-auto pr-1">
              {!agentVersionCompareMode ? (
                <>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">
                      {selectedAgentPreviewVersion
                        ? `v${selectedAgentPreviewVersion.version} · ${toLocalTime(selectedAgentPreviewVersion.createdAt)}`
                        : l("请选择一个版本查看详情。", "Select a version to view details.")}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-slate-600">{l("规则内容", "Rule Content")}</div>
                    <div className="max-h-[56vh] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <pre className="whitespace-pre-wrap break-words text-sm text-slate-800">
                        {selectedAgentPreviewVersion?.content || l("暂无版本内容", "No version content")}
                      </pre>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="rounded-md bg-red-100 px-2 py-1 font-medium text-red-700">
                          {agentCompareLeft ? `v${agentCompareLeft.version}` : l("未选择", "N/A")}
                        </span>
                        <span className="text-slate-500">→</span>
                        <span className="rounded-md bg-emerald-100 px-2 py-1 font-medium text-emerald-700">
                          {agentCompareRight ? `v${agentCompareRight.version}` : l("未选择", "N/A")}
                        </span>
                      </div>
                      <div className="text-sm text-slate-500">
                        {agentCompareLeft && agentCompareRight
                          ? `${toLocalTime(agentCompareLeft.createdAt)} → ${toLocalTime(agentCompareRight.createdAt)}`
                          : l("请选择两个版本进行对比。", "Select two versions to compare.")}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm font-medium text-slate-600">
                      <span>{l("规则内容对比", "Rule Content Diff")}</span>
                      <span className="text-xs">
                        <span className="text-emerald-600">+ {agentDiffStats.added}</span>
                        <span className="mx-2 text-red-600">- {agentDiffStats.removed}</span>
                      </span>
                    </div>
                    <VersionDiffViewer
                      isZh={isZh}
                      before={agentCompareLeft?.content ?? ""}
                      after={agentCompareRight?.content ?? ""}
                      leftTitle={agentCompareLeft ? `v${agentCompareLeft.version}` : undefined}
                      rightTitle={agentCompareRight ? `v${agentCompareRight.version}` : undefined}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
          <DialogFooter className="mt-2 border-t border-slate-200 pt-3">
            <div className="flex w-full items-center justify-between gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (agentVersionCompareMode) {
                    setAgentVersionCompareMode(false);
                    setAgentCompareLeftVersion("");
                    setAgentCompareRightVersion("");
                    return;
                  }
                  setAgentVersionCompareMode(true);
                  setAgentCompareLeftVersion(String(selectedAgentVersions[0]?.version ?? ""));
                  setAgentCompareRightVersion(
                    String(selectedAgentVersions[1]?.version ?? selectedAgentVersions[0]?.version ?? ""),
                  );
                }}
              >
                {agentVersionCompareMode ? l("退出对比", "Exit Compare") : l("版本对比", "Compare Versions")}
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setAgentVersionModalOpen(false)}>
                  {l("取消", "Cancel")}
                </Button>
                {!agentVersionCompareMode ? (
                  <Button
                    disabled={!selectedAgentPreviewVersion}
                    onClick={() => {
                      if (!selectedAgentPreviewVersion) {
                        return;
                      }
                      void handleRestoreAgentRuleVersion(String(selectedAgentPreviewVersion.version));
                    }}
                  >
                    {l("恢复此版本", "Restore This Version")}
                  </Button>
                ) : null}
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={agentRuleEditorModalOpen} onOpenChange={setAgentRuleEditorModalOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden" overlayClassName="agent-rule-editor-overlay">
          <DialogHeader>
            <DialogTitle>{creatingAgentAsset ? l("创建规则文件", "Create Rule File") : l("规则编辑/预览", "Rule Edit/Preview")}</DialogTitle>
            <DialogDescription>
              {creatingAgentAsset
                ? l("新建规则文件", "Create a new rule file")
                : selectedAgentAsset
                  ? `${selectedAgentAsset.name} · v${selectedAgentAsset.latestVersion ?? "-"}`
                  : l("请选择规则文件", "Please select a rule file")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 space-y-3 overflow-auto pr-1 text-sm">
            <label className="block text-xs text-slate-500">
              {l("规则文件名称", "Rule File Name")}
              <Input
                value={agentAssetNameInput}
                onChange={(event) => setAgentAssetNameInput(event.currentTarget.value)}
                placeholder={l("例如：团队规范A", "e.g. Team Policy A")}
              />
            </label>
            {!creatingAgentAsset ? (
              <div className="text-xs text-slate-500">
                {l("最后更新时间", "Last Updated")}: {toLocalTime(selectedAgentAsset?.updatedAt)}
              </div>
            ) : null}

            <TranslatableTextViewer
              isZh={isZh}
              sourceText={agentEditorContent}
              translatedText={agentRuleTranslatedText}
              targetLanguage={translationTargetLanguage}
              targetLanguageOptions={translationTargetLanguageOptions}
              translating={modelTestRunning}
              onTargetLanguageChange={setTranslationTargetLanguage}
              onTranslate={() => {
                void (async () => {
                  const result = await handleRunModelTranslationTest({
                    sourceText: agentEditorContent,
                    targetLanguage: translationTargetLanguage,
                    syncModelTestForm: false,
                  });
                  if (!result) {
                    return;
                  }
                  setAgentRuleTranslatedText(result.translatedText);
                })();
              }}
              onSourceTextChange={(value) => {
                setAgentEditorContent(value);
                if (agentRuleTranslatedText) {
                  setAgentRuleTranslatedText("");
                }
              }}
              sourceEditPlaceholder={l("使用 Markdown 编写全局规则...", "Write global rules in Markdown...")}
              defaultSourceViewMode="edit"
              sourceViewModeResetKey={selectedAssetId ?? (creatingAgentAsset ? "new" : "")}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAgentRuleEditorModalOpen(false)}>
              {l("关闭", "Close")}
            </Button>
            <Button
              variant="outline"
              onClick={() => setAgentDistributionModalOpen(true)}
              disabled={creatingAgentAsset}
            >
              {l("应用", "Apply")}
            </Button>
            <Button onClick={() => void handleSaveAgentRuleVersion()}>
              <Save className="mr-1 h-4 w-4" />
              {creatingAgentAsset ? l("创建规则文件", "Create Rule File") : l("保存并生成新版本", "Save and Create New Version")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={agentDistributionModalOpen} onOpenChange={setAgentDistributionModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{l("应用规则", "Apply Rule")}</DialogTitle>
            <DialogDescription>{l("确认规则资产与目标 Agent 后立即应用。", "Apply immediately after confirming rule asset and target agents.")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <label className="block text-xs text-slate-500">
              {l("规则资产", "Rule Asset")}
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={selectedAssetId ?? ""}
                onChange={(event) => setSelectedAssetId(event.currentTarget.value || null)}
              >
                <option value="">{l("请选择规则资产", "Select a rule asset")}</option>
                {agentAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name} · v{asset.latestVersion ?? "-"}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-2">
              {agentConnections.length === 0 ? (
                <div className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-500">{l("暂无 Agent 连接，请先在设置中配置。", "No agent connections. Configure in Settings first.")}</div>
              ) : (
                agentConnections.map((target) => {
                  const checked = agentTargetIds.includes(target.agentType);
                  const mappedPath =
                    (String(target.ruleFile ?? "").trim() || defaultAgentRuleFile(target.agentType));
                  const resolvedPath =
                    target.resolvedPath ||
                    (target.rootDir ? joinRuleFilePath(target.rootDir, mappedPath) : mappedPath);
                  return (
                    <label key={target.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-xs">
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            if (event.currentTarget.checked) {
                              setAgentTargetIds((prev) => [...prev, target.agentType]);
                            } else {
                              setAgentTargetIds((prev) =>
                                prev.filter((item) => item !== target.agentType),
                              );
                            }
                          }}
                        />
                        {target.agentType}
                        {" · "}
                        {target.rootDir || l("(未配置 root_dir)", "(root_dir not configured)")}
                      </span>
                      <code>{resolvedPath}</code>
                    </label>
                  );
                })
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAgentDistributionModalOpen(false)}>
              {l("取消", "Cancel")}
            </Button>
            <Button onClick={() => void handleRunAgentDistribution()}>{l("应用", "Apply")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mappingPreviewOpen} onOpenChange={setMappingPreviewOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{l("平台文件预览", "Platform File Preview")}</DialogTitle>
            <DialogDescription>
              {mappingPreviewPlatform}
              {" · "}
              {mappingPreviewPath || "-"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className={mappingPreviewExists ? "text-green-700" : "text-amber-700"}>
              {mappingPreviewMessage}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <MarkdownPreview
              content={mappingPreviewContent || ""}
              minHeight={260}
              maxHeight={560}
              className="h-full"
              language={uiLanguage}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMappingPreviewOpen(false)}>
              {l("关闭", "Close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
