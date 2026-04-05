import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FileCode2,
  Folder,
  FolderOpen,
  History,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { appDataDir, homeDir } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";

import { AppShell } from "../features/shell/AppShell";
import type { AppLanguage, SettingsCategory } from "../features/shell/types";
import { DataTable } from "../features/common/components/DataTable";
import { EmptyState } from "../features/common/components/EmptyState";
import { MarkdownEditor, MarkdownPreview } from "../features/common/components/MarkdownEditor";
import { SectionTitle } from "../features/common/components/SectionTitle";
import { agentConnectionApi, skillsApi, workspaceApi } from "../shared/services/api";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from "../shared/ui";
import { buildLineDiff } from "../shared/utils/diff";
import type {
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

const settingCategoryKeys: SettingsCategory[] = ["general", "data", "agents", "about"];

const SKILL_OPEN_MODE_STORAGE_KEY = "agentnexus.skills.open-mode";
const SKILL_SCAN_DIR_STORAGE_KEY = "agentnexus.skills.scan.directories";
const APP_LANGUAGE_STORAGE_KEY = "agentnexus.app.language";
const APP_THEME_STORAGE_KEY = "agentnexus.app.theme";
const DEFAULT_SKILL_SCAN_SUFFIXES = [".codex", ".claude", ".agents"] as const;
const PROJECT_BOOTING_ZH = "项目初始化中，请稍后重试";
const PROJECT_BOOTING_EN = "Project is initializing. Please try again shortly.";
const AUTO_CHECK_APP_UPDATES = true;

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

const SKILL_OPEN_MODE_OPTIONS: Array<{ value: SkillOpenMode; zh: string; en: string }> = [
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
  const [skillQuery, setSkillQuery] = useState("");
  const [skillSourceFilter, setSkillSourceFilter] = useState("all");
  const [promptDetailView, setPromptDetailView] = useState<"list" | "detail">("list");
  const [skillDetailView, setSkillDetailView] = useState<"list" | "detail">("list");
  const [skillOpenMode, setSkillOpenMode] = useState<SkillOpenMode>(() => resolveInitialSkillOpenMode());
  const [skillOpenMenuOpen, setSkillOpenMenuOpen] = useState(false);
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

  const [compareLeftVersion, setCompareLeftVersion] = useState<number | null>(null);
  const [compareRightVersion, setCompareRightVersion] = useState<number | null>(null);
  const [agentCompareLeftVersion, setAgentCompareLeftVersion] = useState<string>("");
  const [agentCompareRightVersion, setAgentCompareRightVersion] = useState<string>("");

  const [creatingAgentAsset, setCreatingAgentAsset] = useState(false);
  const [agentAssetNameInput, setAgentAssetNameInput] = useState("");
  const [agentEditorContent, setAgentEditorContent] = useState("");
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

  const selectedPrompt = useMemo(() => prompts.find((item) => item.id === selectedPromptId) ?? null, [prompts, selectedPromptId]);
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
        if (key === "about") {
          return { key, label: l("关于", "About") };
        }
        return { key, label: key };
      }),
    [isZh],
  );

  const filteredPrompts = useMemo(() => {
    if (!promptQuery.trim()) {
      return prompts;
    }
    const lower = promptQuery.toLowerCase();
    return prompts.filter((item) => {
      return (
        item.name.toLowerCase().includes(lower) ||
        item.content.toLowerCase().includes(lower) ||
        item.tags.some((tag) => tag.toLowerCase().includes(lower))
      );
    });
  }, [prompts, promptQuery]);
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

  const selectedSkillTree = selectedSkillId ? skillTreeById[selectedSkillId] : undefined;
  const selectedSkillExpandedDirs = selectedSkillId ? skillExpandedDirsById[selectedSkillId] ?? {} : {};
  const selectedSkillFilePath = selectedSkillId ? skillSelectedFilePathById[selectedSkillId] ?? "SKILL.md" : "SKILL.md";
  const selectedSkillOverviewRead = selectedSkillId ? skillFileReadByKey[`${selectedSkillId}:SKILL.md`] ?? null : null;
  const selectedSkillFileRead = selectedSkillId
    ? skillFileReadByKey[`${selectedSkillId}:${selectedSkillFilePath}`] ?? null
    : null;
  const skillOpenModeLabel = skillOpenModeOptions.find((item) => item.value === skillOpenMode)?.label ?? "VS Code";

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
  }, [activeWorkspaceId, fetchPrompts, fetchSkills, loadAgentModuleData]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(SKILL_OPEN_MODE_STORAGE_KEY, skillOpenMode);
  }, [skillOpenMode]);

  useEffect(() => {
    if (activeModule !== "skills") {
      setSkillOpenMenuOpen(false);
    }
  }, [activeModule]);
  useEffect(() => {
    if (activeModule !== "prompts") {
      setPromptDetailView("list");
    }
  }, [activeModule]);

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
  }, [promptQuery]);
  useEffect(() => {
    setSkillsPage(1);
  }, [skillQuery, skillSourceFilter]);

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
      return;
    }

    setDetailName(selectedPrompt.name);
    setDetailCategory(selectedPrompt.category);
    setDetailTagsInput(selectedPrompt.tags.join(", "));
    setDetailContent(selectedPrompt.content);
    setDetailFavorite(selectedPrompt.favorite);
  }, [selectedPrompt]);


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
    setAgentCompareLeftVersion(String(cachedVersions[0]?.version ?? ""));
    setAgentCompareRightVersion(
      String(cachedVersions[1]?.version ?? cachedVersions[0]?.version ?? ""),
    );
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
      if (versions.length >= 2) {
        setCompareLeftVersion(versions[0]?.version ?? null);
        setCompareRightVersion(versions[1]?.version ?? null);
      }
      setVersionModalOpen(true);
    } catch (error) {
      toast({
        title: l("读取版本失败", "Failed to load versions"),
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

      <div className="flex items-center justify-start">
        <Tabs value={promptViewMode} onValueChange={(value) => setPromptViewMode(value as "list" | "gallery" | "table")}>
          <TabsList>
            <TabsTrigger value="list">{l("列表", "List")}</TabsTrigger>
            <TabsTrigger value="gallery">{l("卡片", "Cards")}</TabsTrigger>
            <TabsTrigger value="table">{l("表格", "Table")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {promptsLoading ? <Card><CardContent className="py-8 text-sm text-slate-500">{l("加载中...", "Loading...")}</CardContent></Card> : null}

      {!promptsLoading && filteredPrompts.length === 0 ? (
        <EmptyState
          title={l("暂无 Prompt", "No prompts")}
          description={l("先创建一个 Prompt 开始使用。", "Create a prompt to get started.")}
          action={<Button onClick={() => setCreatePromptOpen(true)}>{l("立即创建", "Create now")}</Button>}
        />
      ) : null}

      {!promptsLoading && filteredPrompts.length > 0 && promptViewMode === "list" ? (
        <div className="space-y-2">
          {pagedPrompts.map((item) => (
            <Card key={item.id} className="group">
              <CardContent
                className="flex cursor-pointer items-start gap-3 pt-6"
                onClick={() => {
                  selectPrompt(item.id);
                  setPromptDetailView("detail");
                }}
              >
                <div className="flex-1 text-left">
                  <div className="text-base font-semibold text-slate-900">{item.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{item.category} · v{item.activeVersion} · {toLocalTime(item.updatedAt)}</div>
                  <div className="mt-2 line-clamp-2 text-sm text-slate-600">{item.content}</div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="pointer-events-none opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleDeletePrompt(item.id, item.name);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
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
                selectPrompt(item.id);
                setPromptDetailView("detail");
              }}
            >
              <CardHeader>
                <CardTitle className="text-base">{item.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-2 text-xs text-slate-500">{item.category} · v{item.activeVersion}</div>
                <div className="line-clamp-4 text-sm text-slate-600">{item.content}</div>
                <div className="mt-3 flex items-center justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    className="pointer-events-none opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100"
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

      {!promptsLoading && filteredPrompts.length > 0 && promptViewMode === "table" ? (
        <DataTable
          rows={pagedPrompts}
          rowKey={(row) => row.id}
          onRowClick={(row) => {
            selectPrompt(row.id);
            setPromptDetailView("detail");
          }}
          columns={[
            {
              key: "name",
              title: l("标题", "Title"),
              render: (row) => <span className="text-slate-900">{row.name}</span>,
            },
            { key: "category", title: l("分类", "Category"), render: (row) => row.category },
            { key: "version", title: l("版本", "Version"), render: (row) => `v${row.activeVersion}` },
            { key: "updatedAt", title: l("更新时间", "Updated At"), render: (row) => toLocalTime(row.updatedAt) },
            {
              key: "actions",
              title: l("操作", "Actions"),
              className: "w-20",
              render: (row) => (
                <Button
                  size="sm"
                  variant="outline"
                  className="pointer-events-none opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleDeletePrompt(row.id, row.name);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              ),
            },
          ]}
        />
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

    </div>
  );

  const promptDetail = (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPromptDetailView("list")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <button
          type="button"
          className="font-medium text-blue-600 hover:underline"
          onClick={() => setPromptDetailView("list")}
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

      {!selectedPrompt ? (
        <EmptyState title={l("未选择 Prompt", "No prompt selected")} description={l("请返回列表后选择一个 Prompt。", "Go back and pick a prompt.")} />
      ) : (
        <div className="space-y-3">
          <label className="block text-xs text-slate-500">
            {l("标题", "Title")}
            <Input value={detailName} onChange={(event) => setDetailName(event.currentTarget.value)} />
          </label>

          <label className="block text-xs text-slate-500">
            {l("分类", "Category")}
            <Input value={detailCategory} onChange={(event) => setDetailCategory(event.currentTarget.value)} />
          </label>

          <label className="block text-xs text-slate-500">
            {l("标签（逗号分隔）", "Tags (comma separated)")}
            <Input value={detailTagsInput} onChange={(event) => setDetailTagsInput(event.currentTarget.value)} />
          </label>

          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input type="checkbox" checked={detailFavorite} onChange={(event) => setDetailFavorite(event.currentTarget.checked)} />
            {l("收藏", "Favorite")}
          </label>

          <div className="space-y-1">
            <div className="text-xs text-slate-500">{l("内容（Markdown）", "Content (Markdown)")}</div>
            <MarkdownEditor
              value={detailContent}
              onChange={setDetailContent}
              minHeight={320}
              placeholder={l("使用 Markdown 编写 Prompt 内容...", "Write prompt content with Markdown...")}
              language={uiLanguage}
              modeLabels={markdownModeLabels}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void handleSavePromptDetail()}>
              <Save className="mr-1 h-4 w-4" />
              {l("保存", "Save")}
            </Button>
            <Button variant="outline" onClick={() => void handleOpenPromptVersion()}>
              <History className="mr-1 h-4 w-4" />
              {l("历史版本", "History")}
            </Button>
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
                <div className="relative">
                  <Button
                    variant="outline"
                    type="button"
                    className="min-w-[140px] justify-between"
                    onClick={() => setSkillOpenMenuOpen((prev) => !prev)}
                  >
                    <span>{skillOpenModeLabel}</span>
                    <ChevronDown className="ml-2 h-4 w-4 text-slate-500" />
                  </Button>
                  {skillOpenMenuOpen ? (
                    <div className="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                      {skillOpenModeOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm ${
                            option.value === skillOpenMode
                              ? "bg-blue-50 text-blue-700"
                              : "text-slate-700 hover:bg-slate-100"
                          }`}
                          onClick={() => {
                            setSkillOpenMode(option.value);
                            setSkillOpenMenuOpen(false);
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
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
                      shouldUseMarkdownPreview(selectedSkillFileRead.language) ? (
                        <MarkdownPreview
                          content={selectedSkillFileRead.content}
                          minHeight={0}
                          maxHeight={560}
                          className="min-h-0 flex-1"
                          language={uiLanguage}
                        />
                      ) : (
                        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-md border border-slate-200 bg-slate-950 p-3 text-xs text-slate-100">
                          <code>{selectedSkillFileRead.content}</code>
                        </pre>
                      )
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

  const center =
    activeModule === "prompts"
      ? (promptDetailView === "detail" ? promptDetail : promptCenter)
      : activeModule === "skills"
        ? skillsCenter
        : activeModule === "agents"
          ? agentsCenter
          : settingsCenter;
  const detail = <div className="h-full" />;

  return (
    <>
      <AppShell
        activeModule={activeModule}
        language={language}
        onChangeModule={(module) => {
          setActiveModule(module);
          setPromptDetailView("list");
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
        center={center}
        detail={detail}
      />

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

      <Dialog open={versionModalOpen} onOpenChange={setVersionModalOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{l("Prompt 历史版本", "Prompt History Versions")}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-xs text-slate-500">
              {l("左侧版本", "Left Version")}
              <div className="relative mt-1">
                <select
                  className={SELECT_BASE_CLASS}
                  value={compareLeftVersion ?? ""}
                  onChange={(event) => setCompareLeftVersion(Number(event.currentTarget.value))}
                >
                  <option value="">{l("请选择", "Select")}</option>
                  {selectedPromptVersions.map((item) => (
                    <option key={`left-${item.version}`} value={item.version}>v{item.version} · {toLocalTime(item.createdAt)}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </label>
            <label className="block text-xs text-slate-500">
              {l("右侧版本", "Right Version")}
              <div className="relative mt-1">
                <select
                  className={SELECT_BASE_CLASS}
                  value={compareRightVersion ?? ""}
                  onChange={(event) => setCompareRightVersion(Number(event.currentTarget.value))}
                >
                  <option value="">{l("请选择", "Select")}</option>
                  {selectedPromptVersions.map((item) => (
                    <option key={`right-${item.version}`} value={item.version}>v{item.version} · {toLocalTime(item.createdAt)}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </label>
          </div>

          <div className="max-h-[340px] overflow-auto rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
            {promptDiffLines.length === 0 ? (
              <div className="text-slate-500">{l("请选择两个版本进行对比。", "Please select two versions to compare.")}</div>
            ) : (
              promptDiffLines.map((line, index) => (
                <div
                  key={`${line.type}-${index}`}
                  className={
                    line.type === "added"
                      ? "bg-green-50 text-green-700"
                      : line.type === "removed"
                        ? "bg-red-50 text-red-700"
                        : "text-slate-700"
                  }
                >
                  <span className="inline-block w-4">{line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}</span>
                  <span>{line.text}</span>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              disabled={compareRightVersion === null || !selectedPrompt}
              onClick={() => {
                if (!selectedPrompt || compareRightVersion === null) {
                  return;
                }
                void (async () => {
                  try {
                    await restorePromptVersion(selectedPrompt.id, compareRightVersion);
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
                })();
              }}
            >
              {l("恢复右侧版本", "Restore Right Version")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={agentVersionModalOpen} onOpenChange={setAgentVersionModalOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{l("规则版本对比", "Rule Version Compare")}</DialogTitle>
            <DialogDescription>{selectedAgentAsset?.name ?? l("请选择规则文件", "Please select a rule file")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-xs text-slate-500">
              {l("左侧版本", "Left Version")}
              <div className="relative mt-1">
                <select
                  className={SELECT_BASE_CLASS}
                  value={agentCompareLeftVersion}
                  onChange={(event) => setAgentCompareLeftVersion(event.currentTarget.value)}
                >
                  <option value="">{l("请选择", "Select")}</option>
                  {selectedAgentVersions.map((item) => (
                    <option key={`agent-left-${item.version}`} value={String(item.version)}>
                      v{item.version} · {toLocalTime(item.createdAt)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </label>
            <label className="block text-xs text-slate-500">
              {l("右侧版本", "Right Version")}
              <div className="relative mt-1">
                <select
                  className={SELECT_BASE_CLASS}
                  value={agentCompareRightVersion}
                  onChange={(event) => setAgentCompareRightVersion(event.currentTarget.value)}
                >
                  <option value="">{l("请选择", "Select")}</option>
                  {selectedAgentVersions.map((item) => (
                    <option key={`agent-right-${item.version}`} value={String(item.version)}>
                      v{item.version} · {toLocalTime(item.createdAt)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </label>
          </div>

          <div className="max-h-[340px] overflow-auto rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
            {agentVersionDiffLines.length === 0 ? (
              <div className="text-slate-500">{l("请选择两个版本进行对比。", "Please select two versions to compare.")}</div>
            ) : (
              agentVersionDiffLines.map((line, index) => (
                <div
                  key={`${line.type}-${index}`}
                  className={
                    line.type === "added"
                      ? "bg-green-50 text-green-700"
                      : line.type === "removed"
                        ? "bg-red-50 text-red-700"
                        : "text-slate-700"
                  }
                >
                  <span className="inline-block w-4">{line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}</span>
                  <span>{line.text}</span>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAgentVersionModalOpen(false)}>
              {l("关闭", "Close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={agentRuleEditorModalOpen} onOpenChange={setAgentRuleEditorModalOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden">
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

            <MarkdownEditor
              value={agentEditorContent}
              onChange={setAgentEditorContent}
              minHeight={320}
              maxHeight={520}
              placeholder={l("使用 Markdown 编写全局规则...", "Write global rules in Markdown...")}
              language={uiLanguage}
              modeLabels={markdownModeLabels}
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
