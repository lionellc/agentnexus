import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  AppWindow,
  ChevronDown,
  ChevronRight,
  Code2,
  Command,
  FileCode2,
  Folder,
  FolderOpen,
  Hammer,
  Sparkles,
  Square,
  Terminal,
} from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { appDataDir } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { flushSync } from "react-dom";

import { AppShell } from "../features/shell/AppShell";
import type { AppLanguage, SettingsCategory } from "../features/shell/types";
import { PromptsModule } from "../features/prompts/module/PromptsModule";
import { SkillsModule } from "../features/skills/module/SkillsModule";
import { AgentsModule } from "../features/agents/module/AgentsModule";
import { SettingsModule } from "../features/settings/module/SettingsModule";
import { CreatePromptDialog } from "../features/prompts/dialogs/CreatePromptDialog";
import { PromptRunDialog } from "../features/prompts/dialogs/PromptRunDialog";
import { PromptVersionDialog } from "../features/prompts/dialogs/PromptVersionDialog";
import { AgentsCenter } from "../features/agents/components/AgentsCenter";
import { AgentVersionDialog } from "../features/agents/dialogs/AgentVersionDialog";
import { AgentRuleEditorDialog } from "../features/agents/dialogs/AgentRuleEditorDialog";
import { AgentDistributionDialog } from "../features/agents/dialogs/AgentDistributionDialog";
import { AgentMappingPreviewDialog } from "../features/agents/dialogs/AgentMappingPreviewDialog";
import { GeneralSettingsPanel } from "../features/settings/components/GeneralSettingsPanel";
import { DataSettingsPanel } from "../features/settings/components/DataSettingsPanel";
import { AgentConnectionsPanel } from "../features/settings/components/AgentConnectionsPanel";
import { AboutPanel } from "../features/settings/components/AboutPanel";
import {
  PROMPT_CATEGORY_ALL_KEY,
  PROMPT_CATEGORY_UNCATEGORIZED_KEY,
  normalizePromptCategoryKey,
} from "../features/prompts/utils/promptCategory";
import { usePromptBrowse } from "../features/prompts/hooks/usePromptBrowse";
import { usePromptVersionCompare } from "../features/prompts/hooks/usePromptVersionCompare";
import { usePromptRun } from "../features/prompts/hooks/usePromptRun";
import { usePromptTranslation } from "../features/prompts/hooks/usePromptTranslation";
import {
  type PromptBrowseScope,
  readPromptBrowseContext,
  writePromptBrowseContext,
} from "../features/prompts/utils/promptBrowseContext";
import { PromptCenter } from "../features/prompts/components/PromptCenter";
import { PromptDetail } from "../features/prompts/components/PromptDetail";
import { SkillsCenter } from "../features/skills/components/SkillsCenter";
import {
  SkillsConfigPanel,
  type SkillsConfigConflictPair,
  type SkillsConfigDiffView,
  type SkillsConfigGroup,
} from "../features/skills/components/SkillsConfigPanel";
import { SkillsOperationsPanel } from "../features/skills/components/SkillsOperationsPanel";
import { useRuntimeOutputSheet } from "../features/common/hooks/useRuntimeOutputSheet";
import { ModelSettingsPanel } from "../features/settings/components/ModelSettingsPanel";
import {
  AGENT_RULES_PAGE_SIZE,
  APP_LANGUAGE_STORAGE_KEY,
  APP_THEME_STORAGE_KEY,
  AUTO_CHECK_APP_UPDATES,
  DEFAULT_TRANSLATION_PROFILE_KEY,
  DEFAULT_TRANSLATION_PROMPT_TEMPLATE,
  LOCAL_AGENT_TRANSLATION_STREAM_EVENT,
  MODEL_TEST_TARGET_LANGUAGE_PRESETS,
  PROJECT_BOOTING_EN,
  PROJECT_BOOTING_ZH,
  PROMPTS_PAGE_SIZE,
  PROMPT_TABLE_COLUMN_SETTINGS_KEY,
  SELECT_BASE_CLASS,
  SETTING_CATEGORY_KEYS,
  SKILL_OPEN_MODE_OPTIONS,
  SKILL_OPEN_MODE_STORAGE_KEY,
  TRANSLATION_TARGET_LANGUAGE_STORAGE_KEY,
} from "./workbench/constants";
import { useSkillScanDirectories } from "./workbench/hooks/useSkillScanDirectories";
import type {
  AppTheme,
  AppUpdateProgress,
  AppUpdateStage,
  LocalAgentTranslationStreamEvent,
  PromptBatchJumpSuggestion,
} from "./workbench/types";
import {
  createRequestId,
  defaultAgentConfigDir,
  defaultAgentRuleFile,
  extractStdoutPreviewFromErrorMessage,
  formatBytes,
  isAbsolutePathInput,
  isValidRuleFileInput,
  joinRuleFilePath,
  normalizeDirectoryInput,
  normalizeAgentTypeInput,
  parseArgsTemplateInput,
  parseTags,
  resolveInitialLanguage,
  resolveInitialSkillOpenMode,
  resolveInitialTheme,
  resolveInitialTranslationTargetLanguage,
  shouldUseMarkdownPreview,
  toAgentSortWeight,
  toLocalTime,
  unknownToCode,
  unknownToMessage,
  waitForUiPaint,
} from "./workbench/utils";
import { agentConnectionApi, skillsApi, skillsManagerApi, translationApi, workspaceApi } from "../shared/services/api";
import {
  usePromptsStore,
  useAgentRulesStore,
  useSettingsStore,
  useShellStore,
  useSkillsStore,
} from "../shared/stores";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  useToast,
} from "../shared/ui";
import { buildLineDiff } from "../shared/utils/diff";
import { extractTemplateVariables } from "../shared/utils/template";
import type {
  LocalAgentProfileDto,
  LocalAgentTranslationTestResult,
  SkillManagerStatus,
  SkillOpenMode,
  SkillsFileReadResult,
  SkillsFileTreeNode,
  SkillsFileTreeResult,
  SkillsManagerDiffProgress,
  SkillsManagerLinkPreviewResult,
  SkillsManagerMatrixSummary,
} from "../shared/types";

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

const DIFF_RUNNING_STATUSES = new Set(["running", "cancelling"]);
const DIFF_TERMINAL_STATUSES = new Set(["completed", "cancelled", "failed"]);

function isPendingSkillStatus(status: SkillManagerStatus): boolean {
  return status === "missing" || status === "manual" || status === "directory" || status === "blocked";
}

function createInitialDiffView(): SkillsConfigDiffView {
  return {
    open: false,
    status: "completed",
    running: false,
    jobId: "",
    leftSkillName: "",
    rightSkillName: "",
    processedFiles: 0,
    totalFiles: 0,
    currentFile: "",
    diffFiles: 0,
    sameSkill: null,
    errorMessage: "",
    entries: [],
  };
}

type DistributionTargetDraftField = "platform" | "targetPath" | "installMode";
type DistributionTargetDraft = {
  platform: string;
  targetPath: string;
  installMode: "copy" | "symlink";
};

const DEFAULT_NEW_DISTRIBUTION_TARGET_DRAFT: DistributionTargetDraft = {
  platform: ".codex",
  targetPath: "",
  installMode: "symlink",
};

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
  const managerState = useSkillsStore((state) => state.managerState);
  const managerLoading = useSkillsStore((state) => state.managerLoading);
  const managerCalibrating = useSkillsStore((state) => state.managerCalibrating);
  const managerMode = useSkillsStore((state) => state.managerMode);
  const managerExpandedSkillId = useSkillsStore((state) => state.managerExpandedSkillId);
  const managerMatrixFilter = useSkillsStore((state) => state.managerMatrixFilter);
  const managerRowHints = useSkillsStore((state) => state.managerRowHints);
  const getManagerOperationsRows = useSkillsStore((state) => state.getManagerOperationsRows);
  const loadManagerState = useSkillsStore((state) => state.loadManagerState);
  const managerBatchLink = useSkillsStore((state) => state.managerBatchLink);
  const managerBatchUnlink = useSkillsStore((state) => state.managerBatchUnlink);
  const setManagerMode = useSkillsStore((state) => state.setManagerMode);
  const setManagerExpandedSkillId = useSkillsStore((state) => state.setManagerExpandedSkillId);
  const setManagerMatrixFilter = useSkillsStore((state) => state.setManagerMatrixFilter);
  const clearManagerRowHint = useSkillsStore((state) => state.clearManagerRowHint);

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
  const settingsTargets = useSettingsStore((state) => state.targets);
  const settingsConnections = useSettingsStore((state) => state.connections);
  const dirty = useSettingsStore((state) => state.dirty);
  const settingsLoading = useSettingsStore((state) => state.loading);
  const loadAllSettings = useSettingsStore((state) => state.loadAll);
  const loadSettingsConnections = useSettingsStore((state) => state.loadConnections);
  const upsertTarget = useSettingsStore((state) => state.upsertTarget);
  const deleteTarget = useSettingsStore((state) => state.deleteTarget);
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
  const diffPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const diffPollContextRef = useRef<{ workspaceId: string; jobId: string } | null>(null);
  const operationsModeEnteredRef = useRef(
    activeModule === "skills" && managerMode === "operations",
  );
  const showSkillOpenModeInStatusBar =
    typeof window !== "undefined" && window.innerWidth >= 1024 && /mac/i.test(navigator.platform);
  const isZh = language === "zh-CN";
  const isDarkTheme = theme === "dark";
  const l = useCallback((zh: string, en: string): string => (isZh ? zh : en), [isZh]);
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
  const [deleteConfirmAssetId, setDeleteConfirmAssetId] = useState<string | null>(null);

  const [newPromptName, setNewPromptName] = useState("");
  const [newPromptContent, setNewPromptContent] = useState("");
  const [promptQuery, setPromptQuery] = useState("");
  const [promptBrowseScope, setPromptBrowseScope] = useState<PromptBrowseScope>("all");
  const [promptBrowseCategory, setPromptBrowseCategory] = useState<string>(PROMPT_CATEGORY_ALL_KEY);
  const [promptAllCategoryFilter, setPromptAllCategoryFilter] = useState<string>(PROMPT_CATEGORY_ALL_KEY);
  const [promptBatchJumpSuggestion, setPromptBatchJumpSuggestion] = useState<PromptBatchJumpSuggestion | null>(null);
  const [skillQuery, setSkillQuery] = useState("");
  const [promptDetailView, setPromptDetailView] = useState<"list" | "detail">("list");
  const [skillDetailView, setSkillDetailView] = useState<"list" | "detail">("list");
  const [skillOpenMode, setSkillOpenMode] = useState<SkillOpenMode>(() => resolveInitialSkillOpenMode());
  const [skillOpenMenuOpen, setSkillOpenMenuOpen] = useState(false);
  const [promptBatchCategory, setPromptBatchCategory] = useState("");
  const [skillTreeLoading, setSkillTreeLoading] = useState(false);
  const [skillTreeById, setSkillTreeById] = useState<Record<string, SkillsFileTreeResult>>({});
  const [skillExpandedDirsById, setSkillExpandedDirsById] = useState<Record<string, Record<string, boolean>>>({});
  const [skillSelectedFilePathById, setSkillSelectedFilePathById] = useState<Record<string, string>>({});
  const [skillFileReadLoading, setSkillFileReadLoading] = useState(false);
  const [skillFileReadByKey, setSkillFileReadByKey] = useState<Record<string, SkillsFileReadResult>>({});
  const [scanPhase, setScanPhase] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [scanMessage, setScanMessage] = useState("");
  const [diffView, setDiffView] = useState<SkillsConfigDiffView>(() => createInitialDiffView());
  const [agentQuery, setAgentQuery] = useState("");
  const [storageDirDraft, setStorageDirDraft] = useState("");
  const [settingsAgentType, setSettingsAgentType] = useState("codex");
  const [newSettingsAgentInput, setNewSettingsAgentInput] = useState("");
  const {
    homePath,
    selectedSkillScanDirectories,
  } = useSkillScanDirectories({ distributionTargets: settingsTargets });

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
  const [modelScenarioSettingsOpen, setModelScenarioSettingsOpen] = useState(false);
  const [modelScenarioTestOpen, setModelScenarioTestOpen] = useState(false);
  const modelTestOutputSheet = useRuntimeOutputSheet({ l });
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
  const [distributionTargetDrafts, setDistributionTargetDrafts] = useState<Record<string, DistributionTargetDraft>>(
    {},
  );
  const [distributionTargetEditingIds, setDistributionTargetEditingIds] = useState<string[]>([]);
  const [newDistributionTargetDraft, setNewDistributionTargetDraft] = useState<DistributionTargetDraft>(
    () => DEFAULT_NEW_DISTRIBUTION_TARGET_DRAFT,
  );
  const [distributionTargetSavingId, setDistributionTargetSavingId] = useState<string | null>(null);
  const [managerPurgingSkillId, setManagerPurgingSkillId] = useState<string | null>(null);
  const [linkConfirmPreview, setLinkConfirmPreview] = useState<SkillsManagerLinkPreviewResult | null>(null);
  const linkConfirmResolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const selectedPrompt = useMemo(() => prompts.find((item) => item.id === selectedPromptId) ?? null, [prompts, selectedPromptId]);
  const selectedModelProfile = useMemo(
    () => localAgentProfiles.find((item) => item.profileKey === selectedModelProfileKey) ?? null,
    [localAgentProfiles, selectedModelProfileKey],
  );
  const modelTestRunning = modelTestOutputSheet.running;
  const modelTestResult = modelTestOutputSheet.result;
  const selectedSkill = useMemo(() => skills.find((item) => item.id === selectedSkillId) ?? null, [skills, selectedSkillId]);
  const activeWorkspace = useMemo(
    () => workspaces.find((item) => item.id === activeWorkspaceId) ?? workspaces[0] ?? null,
    [workspaces, activeWorkspaceId],
  );
  const operationsScanDirectories = useMemo(() => {
    const root = normalizeDirectoryInput(activeWorkspace?.rootPath ?? "");
    if (!root) {
      return [] as string[];
    }
    const projectSkillsDir = normalizeDirectoryInput(`${root}/skills`);
    return projectSkillsDir ? [projectSkillsDir] : [];
  }, [activeWorkspace?.rootPath]);
  const settingCategories = useMemo<Array<{ key: SettingsCategory; label: string }>>(
    () =>
      SETTING_CATEGORY_KEYS.map((key) => {
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

  const {
    formatPromptCategoryLabel,
    promptCategoryOptions,
    promptCategoryKeySet,
    promptBrowseContextLabel,
    showPromptContextBar,
    filteredPrompts,
    totalPromptPages,
    pagedPrompts,
  } = usePromptBrowse({
    isZh,
    prompts,
    promptQuery,
    promptBrowseScope,
    promptBrowseCategory,
    promptAllCategoryFilter,
    promptPage,
    pageSize: PROMPTS_PAGE_SIZE,
  });

  const filteredSkills = useMemo(() => {
    const lower = skillQuery.trim().toLowerCase();
    return skills.filter((item) => {
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
  }, [skills, skillQuery]);
  const filteredSkillIdSet = useMemo(
    () => new Set(filteredSkills.map((item) => item.id)),
    [filteredSkills],
  );
  const scanSourceDirectories = useMemo(
    () =>
      selectedSkillScanDirectories
        .map((item) => normalizeDirectoryInput(item))
        .filter(Boolean),
    [selectedSkillScanDirectories],
  );
  const scanScopedSkills = useMemo(() => {
    if (scanSourceDirectories.length === 0) {
      return [] as typeof filteredSkills;
    }
    return filteredSkills.filter((skill) => {
      const source = normalizeDirectoryInput(skill.source);
      if (!source) {
        return false;
      }
      return scanSourceDirectories.some(
        (directory) =>
          source === directory ||
          source.startsWith(`${directory}/`) ||
          source.startsWith(`${directory}\\`),
      );
    });
  }, [filteredSkills, scanSourceDirectories]);
  const scanScopedSkillIdSet = useMemo(
    () => new Set(scanScopedSkills.map((item) => item.id)),
    [scanScopedSkills],
  );
  const operationsSourceRows = useMemo(
    () =>
      getManagerOperationsRows().filter((row) =>
        filteredSkillIdSet.has(row.id),
      ),
    [
      getManagerOperationsRows,
      managerState,
      managerRowHints,
      filteredSkillIdSet,
    ],
  );
  const operationsRows = useMemo(() => {
    const tool = managerMatrixFilter.tool;
    const status = managerMatrixFilter.status;
    return operationsSourceRows.filter((row) => {
      if (status === "all") {
        if (!tool) {
          return true;
        }
        return row.statusCells.some((cell) => cell.tool === tool);
      }
      if (status === "missing") {
        if (!tool) {
          return row.statusCells.some((cell) => isPendingSkillStatus(cell.status));
        }
        return row.statusCells.some((cell) => cell.tool === tool && isPendingSkillStatus(cell.status));
      }
      if (!tool) {
        return row.statusCells.some((cell) => cell.status === status);
      }
      return row.statusCells.some((cell) => cell.tool === tool && cell.status === status);
    });
  }, [operationsSourceRows, managerMatrixFilter]);
  const operationsMatrixSummaries = useMemo<SkillsManagerMatrixSummary[]>(() => {
    const byTool = new Map<string, SkillsManagerMatrixSummary>();
    for (const row of operationsSourceRows) {
      for (const cell of row.statusCells) {
        const summary = byTool.get(cell.tool) ?? {
          tool: cell.tool,
          linked: 0,
          missing: 0,
          blocked: 0,
          wrong: 0,
          directory: 0,
          manual: 0,
          total: 0,
          issueCount: 0,
        };
        if (cell.status === "linked") {
          summary.linked += 1;
        } else if (cell.status === "wrong") {
          summary.wrong += 1;
        } else if (isPendingSkillStatus(cell.status)) {
          summary.missing += 1;
        }
        byTool.set(cell.tool, summary);
      }
    }
    const list = Array.from(byTool.values()).map((item) => {
      const total = item.linked + item.missing + item.wrong;
      return {
        ...item,
        blocked: 0,
        directory: 0,
        manual: 0,
        total,
        issueCount: total - item.linked,
      };
    });
    return list.sort((left, right) => left.tool.localeCompare(right.tool));
  }, [operationsSourceRows]);
  const managerSkillById = useMemo(
    () => new Map((managerState?.skills ?? []).map((item) => [item.id, item])),
    [managerState?.skills],
  );
  const scanGroups = useMemo<SkillsConfigGroup[]>(() => {
    const grouped = new Map<string, SkillsConfigGroup>();
    for (const skill of scanScopedSkills) {
      const rawKey = skill.sourceParent.trim();
      const sourceParts = skill.source
        .split(/[\\/]/)
        .map((part) => part.trim())
        .filter(Boolean);
      const fallbackKey = sourceParts[sourceParts.length - 2] ?? sourceParts[sourceParts.length - 1] ?? "default";
      const key = rawKey || fallbackKey;
      const group = grouped.get(key) ?? {
        key,
        label: key,
        total: 0,
        pendingCount: 0,
        items: [],
      };
      const managerSkill = managerSkillById.get(skill.id);
      const statusList = managerSkill ? Object.values(managerSkill.statusByTool) : [];
      const pending = managerSkill
        ? managerSkill.conflict || statusList.some((status) => status !== "linked")
        : true;

      group.total += 1;
      if (pending) {
        group.pendingCount += 1;
      }
      group.items.push({
        id: skill.id,
        name: skill.name,
        localPath: skill.sourceLocalPath ?? skill.localPath,
        conflict: Boolean(managerSkill?.conflict),
        isSymlink: skill.sourceIsSymlink ?? skill.isSymlink,
      });
      grouped.set(key, group);
    }

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        items: [...group.items].sort((left, right) => left.name.localeCompare(right.name)),
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [managerSkillById, scanScopedSkills]);
  const conflictPairs = useMemo<SkillsConfigConflictPair[]>(() => {
    const rows = (managerState?.skills ?? []).filter((skill) => scanScopedSkillIdSet.has(skill.id));
    const conflictGroups = new Map<string, typeof rows>();
    for (const row of rows) {
      if (!row.conflict) {
        continue;
      }
      const current = conflictGroups.get(row.name) ?? [];
      current.push(row);
      conflictGroups.set(row.name, current);
    }

    const pairs: SkillsConfigConflictPair[] = [];
    for (const [name, list] of conflictGroups.entries()) {
      if (list.length < 2) {
        continue;
      }
      const sorted = [...list].sort((left, right) => left.localPath.localeCompare(right.localPath));
      const pivot = sorted[0];
      for (let index = 1; index < sorted.length; index += 1) {
        const right = sorted[index];
        pairs.push({
          key: `${name}:${pivot.id}:${right.id}`,
          name,
          left: {
            id: pivot.id,
            localPath: pivot.localPath,
          },
          right: {
            id: right.id,
            localPath: right.localPath,
          },
        });
      }
    }
    return pairs.sort((left, right) => left.name.localeCompare(right.name));
  }, [managerState?.skills, scanScopedSkillIdSet]);

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

  const {
    selectedPromptVersions,
    selectedPromptPreviewVersion,
    promptCompareLeft,
    promptCompareRight,
    promptDiffStats,
  } = usePromptVersionCompare({
    selectedPrompt,
    promptVersionsByPromptId: promptVersions,
    promptVersionPreview,
    compareLeftVersion,
    compareRightVersion,
  });
  const selectedAgentVersions = selectedAssetId ? agentVersionsByAsset[selectedAssetId] ?? [] : [];
  const selectedAgentPreviewVersion = useMemo(
    () =>
      agentVersionPreview
        ? selectedAgentVersions.find((item) => String(item.version) === agentVersionPreview) ?? null
        : null,
    [selectedAgentVersions, agentVersionPreview],
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
  const promptRun = usePromptRun({
    activeWorkspaceId,
    selectedPrompt,
    detailName,
    detailContent,
    l,
    toast,
    unknownToMessage,
  });
  const promptTranslation = usePromptTranslation({
    activeWorkspaceId,
    selectedPrompt,
    detailContent,
    translationTargetLanguage,
    selectedModelProfileKey,
    localAgentTranslationStreamEvent: LOCAL_AGENT_TRANSLATION_STREAM_EVENT,
    l,
    projectBootingMessage,
    toast,
    unknownToMessage,
    unknownToCode,
    extractStdoutPreviewFromErrorMessage,
    waitForUiPaint,
    runtimeOutput: {
      setOpen: (open) => modelTestOutputSheet.setOpen(open),
      setRunning: (running) => modelTestOutputSheet.setRunning(running),
      setResult: (result) => modelTestOutputSheet.setResult(result),
      setLifecycleText: modelTestOutputSheet.setLifecycleFromRaw,
      clearFlushTimer: modelTestOutputSheet.clearFlushTimer,
      getBuffer: () => modelTestOutputSheet.bufferRef.current,
      setBuffer: (buffer) => {
        modelTestOutputSheet.bufferRef.current = buffer;
      },
      setOutput: (output) => modelTestOutputSheet.setOutput(output),
      appendChunk: modelTestOutputSheet.appendChunk,
      flushBuffer: modelTestOutputSheet.flushBuffer,
    },
  });

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
    if (!activeWorkspaceId) {
      return;
    }
    void fetchPrompts(activeWorkspaceId);
    void fetchSkills();
    void loadManagerState(activeWorkspaceId);
    void loadAgentModuleData(activeWorkspaceId);
    void loadModelWorkbenchData(activeWorkspaceId);
  }, [activeWorkspaceId, fetchPrompts, fetchSkills, loadAgentModuleData, loadManagerState]);

  useEffect(() => {
    const inOperations = activeModule === "skills" && managerMode === "operations";
    if (inOperations && !operationsModeEnteredRef.current && activeWorkspaceId) {
      void (async () => {
        // 切换进入运营模式时先渲染当前状态，扫描与刷新放到后台异步执行。
        void loadManagerState(activeWorkspaceId);

        if (operationsScanDirectories.length > 0) {
          await scanSkills(activeWorkspaceId, operationsScanDirectories);
        }
        await fetchSkills();
        await loadManagerState(activeWorkspaceId);
      })();
    }
    operationsModeEnteredRef.current = inOperations;
  }, [
    activeModule,
    managerMode,
    activeWorkspaceId,
    fetchSkills,
    loadManagerState,
    operationsScanDirectories,
    scanSkills,
  ]);

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
    setPromptPage(1);
  }, [promptAllCategoryFilter, promptBrowseCategory, promptBrowseScope, promptQuery]);

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
    setDistributionTargetDrafts((prev) => {
      if (settingsTargets.length === 0) {
        return {};
      }
      const next: Record<string, DistributionTargetDraft> = {};
      settingsTargets.forEach((target) => {
        next[target.id] = prev[target.id] ?? {
          platform: target.platform,
          targetPath: target.targetPath,
          installMode: target.installMode === "symlink" ? "symlink" : "copy",
        };
      });
      return next;
    });
  }, [settingsTargets]);

  useEffect(() => {
    setDistributionTargetEditingIds((prev) =>
      prev.filter((targetId) => settingsTargets.some((target) => target.id === targetId)),
    );
  }, [settingsTargets]);

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
      return;
    }

    setDetailName(selectedPrompt.name);
    setDetailCategory(selectedPrompt.category);
    setDetailTagsInput(selectedPrompt.tags.join(", "));
    setDetailContent(selectedPrompt.content);
    setDetailFavorite(selectedPrompt.favorite);
  }, [selectedPrompt]);

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
      modelTestOutputSheet.setOpen(true);
      modelTestOutputSheet.setRunning(true);
      modelTestOutputSheet.setResult(null);
      modelTestOutputSheet.setLifecycleText(l("准备运行...", "Preparing..."));
      modelTestOutputSheet.clearFlushTimer();
      modelTestOutputSheet.bufferRef.current = { stdout: "", stderr: "" };
      modelTestOutputSheet.setOutput({ stdout: "", stderr: "" });
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
              modelTestOutputSheet.appendChunk("stdout", payload.chunk ?? "");
              return;
            }
            if (payload.stream === "stderr") {
              modelTestOutputSheet.appendChunk("stderr", payload.chunk ?? "");
              return;
            }
            if (payload.stream === "lifecycle") {
              const lifecycleText = (payload.chunk ?? "").trim();
              modelTestOutputSheet.setLifecycleFromRaw(lifecycleText);
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
      modelTestOutputSheet.setResult({
        ok: true,
        text: result.translatedText,
      });
      modelTestOutputSheet.setLifecycleText(l("已完成", "Completed"));
      if (!modelTestOutputSheet.bufferRef.current.stdout && result.stdoutPreview) {
        modelTestOutputSheet.bufferRef.current.stdout = result.stdoutPreview;
      }
      if (!modelTestOutputSheet.bufferRef.current.stderr && result.stderrPreview) {
        modelTestOutputSheet.bufferRef.current.stderr = result.stderrPreview;
      }
      modelTestOutputSheet.flushBuffer();
      return result;
    } catch (error) {
      const message = unknownToMessage(error, l("未知错误", "Unknown error"));
      modelTestOutputSheet.setResult({
        ok: false,
        text: message,
      });
      modelTestOutputSheet.setLifecycleText(l("执行失败", "Execution failed"));
      const stdout = extractStdoutPreviewFromErrorMessage(message);
      if (!modelTestOutputSheet.bufferRef.current.stdout && stdout) {
        modelTestOutputSheet.bufferRef.current.stdout = stdout;
      }
      if (!modelTestOutputSheet.bufferRef.current.stderr) {
        modelTestOutputSheet.bufferRef.current.stderr = message;
      }
      modelTestOutputSheet.flushBuffer();
      return null;
    } finally {
      if (unlistenStream) {
        unlistenStream();
      }
      modelTestOutputSheet.flushBuffer();
      modelTestOutputSheet.setRunning(false);
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

  async function handleOpenSkillDetail(skillId: string) {
    selectSkill(skillId);
    setSkillOpenMenuOpen(false);
    setSkillDetailView("detail");
    setSkillDetailTab("overview");
    await handleLoadSkillTree(skillId);
    await handleReadSkillFile(skillId, "SKILL.md");
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

  async function handleUseDefaultStorageDirectory() {
    try {
      const defaultDir = await appDataDir();
      setStorageDirDraft(defaultDir);
    } catch {
      // 忽略读取默认路径失败
    }
  }

  function normalizeDistributionTargetDraft(draft: DistributionTargetDraft): DistributionTargetDraft {
    return {
      platform: normalizeAgentTypeInput(draft.platform),
      targetPath: normalizeDirectoryInput(draft.targetPath),
      installMode: draft.installMode === "symlink" ? "symlink" : "copy",
    };
  }

  function deriveDistributionSkillsPath(targetPath: string): string {
    const normalizedTargetPath = normalizeDirectoryInput(targetPath);
    if (!normalizedTargetPath) {
      return "";
    }
    return `${normalizedTargetPath}/skills`;
  }

  function validateDistributionTargetDraft(draft: DistributionTargetDraft): string | null {
    if (!draft.platform) {
      return l("平台不能为空", "Platform cannot be empty");
    }
    if (!isAbsolutePathInput(draft.targetPath)) {
      return l("目标目录必须是绝对路径", "Target directory must be an absolute path");
    }
    if (draft.installMode !== "copy" && draft.installMode !== "symlink") {
      return l("安装模式仅支持 copy / symlink", "Install mode only supports copy / symlink");
    }
    return null;
  }

  function handleDistributionTargetFieldChange(
    targetId: string,
    field: DistributionTargetDraftField,
    value: string,
  ) {
    setDistributionTargetDrafts((prev) => {
      const current = prev[targetId] ?? {
        platform: "",
        targetPath: "",
        installMode: "copy",
      };
      if (field === "installMode") {
        return {
          ...prev,
          [targetId]: {
            ...current,
            installMode: value === "symlink" ? "symlink" : "copy",
          },
        };
      }
      return {
        ...prev,
        [targetId]: {
          ...current,
          [field]: value,
        },
      };
    });
    setDirty("data", true);
  }

  function handleStartDistributionTargetEdit(targetId: string) {
    setDistributionTargetEditingIds((prev) => (prev.includes(targetId) ? prev : [...prev, targetId]));
  }

  function handleCancelDistributionTargetEdit(targetId: string) {
    const existing = settingsTargets.find((item) => item.id === targetId);
    if (existing) {
      setDistributionTargetDrafts((prev) => ({
        ...prev,
        [targetId]: {
          platform: existing.platform,
          targetPath: existing.targetPath,
          installMode: existing.installMode === "symlink" ? "symlink" : "copy",
        },
      }));
    }
    setDistributionTargetEditingIds((prev) => prev.filter((item) => item !== targetId));
  }

  async function handleDeleteDistributionTarget(targetId: string) {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    const existing = settingsTargets.find((item) => item.id === targetId);
    if (!existing) {
      toast({ title: l("目标不存在", "Target not found"), variant: "destructive" });
      return;
    }

    setDistributionTargetSavingId(`delete:${targetId}`);
    try {
      const result = await deleteTarget({
        workspaceId: activeWorkspaceId,
        id: targetId,
      });
      if (!result.ok) {
        toast({ title: result.message, variant: "destructive" });
        return;
      }
      setDistributionTargetDrafts((prev) => {
        const next = { ...prev };
        delete next[targetId];
        return next;
      });
      setDistributionTargetEditingIds((prev) => prev.filter((item) => item !== targetId));
      setDirty("data", false);
      toast({ title: l("目标目录已删除", "Target directory deleted") });
    } catch (error) {
      toast({
        title: l("删除目标目录失败", "Failed to delete target directory"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    } finally {
      setDistributionTargetSavingId(null);
    }
  }

  async function handleSaveDistributionTarget(targetId: string) {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    const existing = settingsTargets.find((item) => item.id === targetId);
    if (!existing) {
      toast({ title: l("目标不存在", "Target not found"), variant: "destructive" });
      return;
    }
    const draft =
      distributionTargetDrafts[targetId] ??
      ({
        platform: existing.platform,
        targetPath: existing.targetPath,
        installMode: existing.installMode === "symlink" ? "symlink" : "copy",
      } satisfies DistributionTargetDraft);
    const normalized = normalizeDistributionTargetDraft(draft);
    const validationError = validateDistributionTargetDraft(normalized);
    if (validationError) {
      toast({ title: validationError, variant: "destructive" });
      return;
    }

    setDistributionTargetSavingId(targetId);
    try {
      const result = await upsertTarget({
        workspaceId: activeWorkspaceId,
        id: targetId,
        platform: normalized.platform,
        targetPath: normalized.targetPath,
        skillsPath: deriveDistributionSkillsPath(normalized.targetPath),
        installMode: normalized.installMode,
      });
      if (!result.ok) {
        toast({ title: result.message, variant: "destructive" });
        return;
      }
      setDistributionTargetDrafts((prev) => ({ ...prev, [targetId]: normalized }));
      setDistributionTargetEditingIds((prev) => prev.filter((item) => item !== targetId));
      setDirty("data", false);
      toast({ title: l("目标目录已保存", "Target directory saved") });
    } catch (error) {
      toast({
        title: l("保存目标目录失败", "Failed to save target directory"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    } finally {
      setDistributionTargetSavingId(null);
    }
  }

  function handleNewDistributionTargetFieldChange(field: DistributionTargetDraftField, value: string) {
    setNewDistributionTargetDraft((prev) => {
      if (field === "installMode") {
        return { ...prev, installMode: value === "symlink" ? "symlink" : "copy" };
      }
      return { ...prev, [field]: value };
    });
    setDirty("data", true);
  }

  async function handleCreateDistributionTarget() {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    const normalized = normalizeDistributionTargetDraft(newDistributionTargetDraft);
    const validationError = validateDistributionTargetDraft(normalized);
    if (validationError) {
      toast({ title: validationError, variant: "destructive" });
      return;
    }

    setDistributionTargetSavingId("__new__");
    try {
      const result = await upsertTarget({
        workspaceId: activeWorkspaceId,
        platform: normalized.platform,
        targetPath: normalized.targetPath,
        skillsPath: deriveDistributionSkillsPath(normalized.targetPath),
        installMode: normalized.installMode,
      });
      if (!result.ok) {
        toast({ title: result.message, variant: "destructive" });
        return;
      }
      setNewDistributionTargetDraft({
        ...normalized,
        targetPath: "",
      });
      setDirty("data", false);
      toast({ title: l("目标目录已新增", "Target directory created") });
    } catch (error) {
      toast({
        title: l("新增目标目录失败", "Failed to create target directory"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    } finally {
      setDistributionTargetSavingId(null);
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

  const promptResultsProps = {
    l,
    promptsLoading,
    filteredPrompts,
    promptBrowseScope,
    promptQuery,
    setPromptQuery: (value: string) => setPromptQuery(value),
    setCreatePromptOpen: (open: boolean) => setCreatePromptOpen(open),
    handleResetPromptBrowseContext,
    promptViewMode,
    pagedPrompts,
    openPromptDetailById,
    formatPromptCategoryLabel,
    toLocalTime,
    handleCopyPromptFromRow: promptRun.handleCopyPromptFromRow,
    handleTogglePromptFavorite,
    handleDeletePrompt,
    promptSelectedIds,
    runPromptBatchAction,
    promptBatchCategory,
    setPromptBatchCategory: (value: string) => setPromptBatchCategory(value),
    clearPromptSelection,
    promptBatchJumpSuggestion,
    handleRunPromptBatchJumpSuggestion,
    promptBatchResult,
    setPromptSelection,
    promptTableColumnSettingsKey,
    extractTemplateVariables,
    promptPage,
    setPromptPage,
    totalPromptPages,
    promptsPageSize: PROMPTS_PAGE_SIZE,
  };

  const promptCenter = (
    <PromptCenter
      l={l}
      filteredPromptsCount={filteredPrompts.length}
      promptQuery={promptQuery}
      setPromptQuery={(value) => setPromptQuery(value)}
      promptBrowseScope={promptBrowseScope}
      selectBaseClass={SELECT_BASE_CLASS}
      promptAllCategoryFilter={promptAllCategoryFilter}
      setPromptAllCategoryFilter={(value) => setPromptAllCategoryFilter(value)}
      promptCategoryOptions={promptCategoryOptions}
      setCreatePromptOpen={(open) => setCreatePromptOpen(open)}
      activeWorkspaceId={activeWorkspaceId}
      fetchPrompts={fetchPrompts}
      handleChangePromptBrowseScope={handleChangePromptBrowseScope}
      promptViewMode={promptViewMode}
      setPromptViewMode={(mode) => setPromptViewMode(mode)}
      showPromptContextBar={showPromptContextBar}
      promptBrowseContextLabel={promptBrowseContextLabel}
      handleResetPromptBrowseContext={handleResetPromptBrowseContext}
      setPromptBrowseCategory={(value) => setPromptBrowseCategory(value)}
      setPromptPage={setPromptPage}
      promptBrowseCategory={promptBrowseCategory}
      promptResultsProps={promptResultsProps}
    />
  );

  const promptDetail = (
    <PromptDetail
      selectedPrompt={selectedPrompt}
      selectedPromptTranslation={promptTranslation.selectedPromptTranslation}
      detailName={detailName}
      setDetailName={setDetailName}
      detailCategory={detailCategory}
      setDetailCategory={setDetailCategory}
      detailTagsInput={detailTagsInput}
      setDetailTagsInput={setDetailTagsInput}
      detailContent={detailContent}
      setDetailContent={setDetailContent}
      promptTranslationLoading={promptTranslation.promptTranslationLoading}
      promptTranslationRunning={promptTranslation.promptTranslationRunning}
      promptTranslationElapsedLabel={promptTranslation.promptTranslationElapsedLabel}
      promptTranslationStage={promptTranslation.promptTranslationStage}
      setPromptTranslationStage={promptTranslation.setPromptTranslationStage}
      promptTranslationResult={promptTranslation.promptTranslationResult}
      setPromptTranslationResult={promptTranslation.setPromptTranslationResult}
      isZh={isZh}
      translationTargetLanguage={translationTargetLanguage}
      translationTargetLanguageOptions={translationTargetLanguageOptions}
      setTranslationTargetLanguage={setTranslationTargetLanguage}
      leavePromptDetail={leavePromptDetail}
      runPromptTranslation={promptTranslation.runPromptTranslation}
      handleSavePromptDetail={handleSavePromptDetail}
      handleCopyPromptFromDetail={promptRun.handleCopyPromptFromDetail}
      handleOpenPromptVersion={handleOpenPromptVersion}
      toLocalTime={toLocalTime}
      l={l}
    />
  );

  async function handleRefreshSkills() {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    try {
      if (operationsScanDirectories.length > 0) {
        await scanSkills(activeWorkspaceId, operationsScanDirectories);
      }
      await fetchSkills();
      await loadManagerState(activeWorkspaceId);
    } catch (error) {
      toast({
        title: l("刷新失败", "Refresh failed"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  const settleLinkConfirm = useCallback((confirmed: boolean) => {
    const resolver = linkConfirmResolverRef.current;
    linkConfirmResolverRef.current = null;
    setLinkConfirmPreview(null);
    if (resolver) {
      resolver(confirmed);
    }
  }, []);

  const requestLinkConfirm = useCallback(
    async (preview: SkillsManagerLinkPreviewResult): Promise<boolean> =>
      new Promise((resolve) => {
        if (linkConfirmResolverRef.current) {
          linkConfirmResolverRef.current(false);
        }
        linkConfirmResolverRef.current = resolve;
        setLinkConfirmPreview(preview);
      }),
    [],
  );

  useEffect(() => {
    return () => {
      if (linkConfirmResolverRef.current) {
        linkConfirmResolverRef.current(false);
        linkConfirmResolverRef.current = null;
      }
    };
  }, []);

  function buildLinkPreviewSummary(preview: SkillsManagerLinkPreviewResult): string {
    return l(
      `差异文件 ${preview.diffFiles} / 比较文件 ${preview.totalFiles}`,
      `${preview.diffFiles} diff files / ${preview.totalFiles} compared files`,
    );
  }

  async function confirmManagerLinkWithDiff(
    skillId: string,
    tool: string,
  ): Promise<{ proceed: boolean; force: boolean; cancelled?: boolean }> {
    if (!activeWorkspaceId || !tool) {
      return { proceed: false, force: false };
    }
    const preview = await skillsManagerApi.linkPreview({
      workspaceId: activeWorkspaceId,
      skillId,
      tool,
      maxEntries: 24,
    });
    if (!preview.canLink) {
      toast({
        title: l("链接前检查失败", "Link precheck failed"),
        description: preview.message || l("当前目标不可链接", "Target cannot be linked"),
        variant: "destructive",
      });
      return { proceed: false, force: false };
    }
    if (!preview.requiresConfirm) {
      return { proceed: true, force: false };
    }
    const confirmed = await requestLinkConfirm(preview);
    if (!confirmed) {
      return { proceed: false, force: false, cancelled: true };
    }
    return { proceed: true, force: true };
  }

  async function handleManagerLinkSkill(skillId: string, tool: string) {
    if (!activeWorkspaceId || !tool) {
      return;
    }
    try {
      const decision = await confirmManagerLinkWithDiff(skillId, tool);
      if (!decision.proceed) {
        if (decision.cancelled) {
          toast({
            title: l("已取消链接", "Link canceled"),
            description: l("你取消了差异覆盖链接。", "Diff overwrite link canceled."),
          });
        }
        return;
      }
      await managerBatchLink(activeWorkspaceId, [skillId], tool, decision.force);
    } catch (error) {
      toast({
        title: l("补链失败", "Link failed"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  async function handleManagerPurgeSkill(skillId: string, _skillName: string) {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    setManagerPurgingSkillId(skillId);
    try {
      const result = await skillsManagerApi.purge({
        workspaceId: activeWorkspaceId,
        skillId,
      });
      await fetchSkills();
      await loadManagerState(activeWorkspaceId);
      toast({
        title: l("清除完成", "Purge completed"),
        description: l(
          `${result.skillName} 已清除，处理 ${result.removedTools.length} 个链接目录。`,
          `${result.skillName} purged. ${result.removedTools.length} link targets cleaned.`,
        ),
      });
    } catch (error) {
      toast({
        title: l("清除失败", "Purge failed"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    } finally {
      setManagerPurgingSkillId(null);
    }
  }

  async function handleManagerUnlinkSkill(skillId: string, tool: string) {
    if (!activeWorkspaceId || !tool) {
      return;
    }
    try {
      await managerBatchUnlink(activeWorkspaceId, [skillId], tool);
    } catch (error) {
      toast({
        title: l("断链失败", "Unlink failed"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  const stopDiffPolling = useCallback(() => {
    if (diffPollTimerRef.current) {
      clearInterval(diffPollTimerRef.current);
      diffPollTimerRef.current = null;
    }
  }, []);

  const applyDiffProgress = useCallback(
    (progress: SkillsManagerDiffProgress, forceOpen = true) => {
      const running = DIFF_RUNNING_STATUSES.has(progress.status);
      const terminal = DIFF_TERMINAL_STATUSES.has(progress.status);
      setDiffView((prev) => ({
        open: forceOpen ? true : prev.open,
        status: progress.status,
        running,
        jobId: progress.jobId,
        leftSkillName: progress.leftSkillName,
        rightSkillName: progress.rightSkillName,
        processedFiles: progress.processedFiles,
        totalFiles: progress.totalFiles,
        currentFile: progress.currentFile,
        diffFiles: progress.diffFiles,
        sameSkill: progress.sameSkill,
        errorMessage: progress.errorMessage,
        entries: progress.entries,
      }));

      if (terminal) {
        stopDiffPolling();
        diffPollContextRef.current = null;
      }
    },
    [stopDiffPolling],
  );

  const pollDiffProgress = useCallback(
    async (workspaceId: string, jobId: string) => {
      try {
        const progress = await skillsManagerApi.diffProgress({ workspaceId, jobId });
        applyDiffProgress(progress, true);
      } catch (error) {
        stopDiffPolling();
        diffPollContextRef.current = null;
        setDiffView((prev) => ({
          ...prev,
          open: true,
          status: "failed",
          running: false,
          errorMessage: error instanceof Error ? error.message : l("读取 Diff 进度失败", "Failed to read diff progress"),
        }));
      }
    },
    [applyDiffProgress, l, stopDiffPolling],
  );

  const startDiffPolling = useCallback(
    (workspaceId: string, jobId: string) => {
      stopDiffPolling();
      diffPollContextRef.current = { workspaceId, jobId };
      diffPollTimerRef.current = setInterval(() => {
        void pollDiffProgress(workspaceId, jobId);
      }, 450);
    },
    [pollDiffProgress, stopDiffPolling],
  );

  useEffect(() => {
    return () => {
      stopDiffPolling();
    };
  }, [stopDiffPolling]);

  async function handleStartConflictDiff(leftSkillId: string, rightSkillId: string) {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }

    const left = managerState?.skills.find((item) => item.id === leftSkillId);
    const right = managerState?.skills.find((item) => item.id === rightSkillId);
    setDiffView({
      ...createInitialDiffView(),
      open: true,
      status: "running",
      running: true,
      leftSkillName: left?.name ?? "",
      rightSkillName: right?.name ?? "",
    });

    try {
      const progress = await skillsManagerApi.diffStart({
        workspaceId: activeWorkspaceId,
        leftSkillId,
        rightSkillId,
      });
      applyDiffProgress(progress, true);
      if (DIFF_RUNNING_STATUSES.has(progress.status)) {
        startDiffPolling(activeWorkspaceId, progress.jobId);
      }
    } catch (error) {
      stopDiffPolling();
      diffPollContextRef.current = null;
      setDiffView((prev) => ({
        ...prev,
        open: true,
        status: "failed",
        running: false,
        errorMessage: error instanceof Error ? error.message : l("启动 Diff 失败", "Failed to start diff"),
      }));
      toast({
        title: l("启动 Diff 失败", "Failed to start diff"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  async function handleCancelDiff() {
    const context = diffPollContextRef.current;
    if (!context) {
      return;
    }
    try {
      const progress = await skillsManagerApi.diffCancel({
        workspaceId: context.workspaceId,
        jobId: context.jobId,
      });
      applyDiffProgress(progress, true);
    } catch (error) {
      toast({
        title: l("中断 Diff 失败", "Failed to cancel diff"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  function handleCloseDiff() {
    const context = diffPollContextRef.current;
    if (diffView.running && context) {
      void skillsManagerApi
        .diffCancel({
          workspaceId: context.workspaceId,
          jobId: context.jobId,
        })
        .catch(() => undefined);
    }
    stopDiffPolling();
    diffPollContextRef.current = null;
    setDiffView(createInitialDiffView());
  }

  async function handleOperationsDistribute(skillId: string, tools: string[]) {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    const normalizedTools = Array.from(new Set(tools.filter(Boolean)));
    if (normalizedTools.length === 0) {
      toast({
        title: l("请至少选择一个目标目录", "Please select at least one target"),
        variant: "destructive",
      });
      return;
    }

    let linkedCount = 0;
    for (const tool of normalizedTools) {
      const decision = await confirmManagerLinkWithDiff(skillId, tool);
      if (!decision.proceed) {
        continue;
      }
      await managerBatchLink(activeWorkspaceId, [skillId], tool, decision.force);
      linkedCount += 1;
    }

    if (linkedCount === 0) {
      toast({
        title: l("已取消链接", "Link canceled"),
        description: l("没有任何目标执行链接。", "No target was linked."),
      });
    }
  }

  async function handleScanSkills() {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    if (selectedSkillScanDirectories.length === 0) {
      toast({
        title: l(
          "请先配置至少一个 Skills 分发目标目录",
          "Please configure at least one Skills distribution target first",
        ),
        variant: "destructive",
      });
      return;
    }
    setScanPhase("loading");
    setScanMessage(l("扫描进行中...", "Scanning..."));
    try {
      await scanSkills(activeWorkspaceId, selectedSkillScanDirectories);
      setScanPhase("success");
      setScanMessage(l("扫描完成，请查看下方分组结果。", "Scan completed. Review grouped results below."));
    } catch (error) {
      setScanPhase("error");
      const message = error instanceof Error ? error.message : l("未知错误", "Unknown error");
      setScanMessage(message);
      toast({
        title: l("扫描失败", "Scan failed"),
        description: message,
        variant: "destructive",
      });
    }
  }

  function handleLeaveSkillDetail() {
    setSkillDetailView("list");
    setSkillOpenMenuOpen(false);
  }

  function handleTranslateSelectedSkillFile() {
    if (!selectedSkillFileRead || !selectedSkillTranslationKey) {
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
  }

  const skillsOperationsPanel = (
    <SkillsOperationsPanel
      rows={operationsRows}
      matrixSummaries={operationsMatrixSummaries}
      matrixFilter={managerMatrixFilter}
      expandedSkillId={managerExpandedSkillId}
      runningDistribution={managerLoading || managerCalibrating}
      onMatrixFilterChange={(next) => setManagerMatrixFilter(next)}
      onToggleExpanded={(skillId) => setManagerExpandedSkillId(skillId)}
      onOpenSkillDetail={(skillId) => void handleOpenSkillDetail(skillId)}
      onRunDistribution={(skillId, tools) => handleOperationsDistribute(skillId, tools)}
      onRunLink={(skillId, tool) => handleManagerLinkSkill(skillId, tool)}
      onRunUnlink={(skillId, tool) => handleManagerUnlinkSkill(skillId, tool)}
      onPurgeSkill={(skillId, skillName) => handleManagerPurgeSkill(skillId, skillName)}
      purgingSkillId={managerPurgingSkillId}
      onDismissRowHint={(skillId) => clearManagerRowHint(skillId)}
      onJumpToConfig={() => setManagerMode("config")}
      l={l}
    />
  );
  const skillsConfigPanel = (
    <SkillsConfigPanel
      scanPhase={scanPhase}
      scanMessage={scanMessage}
      scanGroups={scanGroups}
      conflictPairs={conflictPairs}
      diffView={diffView}
      onScanSkills={() => void handleScanSkills()}
      onStartConflictDiff={(leftSkillId, rightSkillId) => void handleStartConflictDiff(leftSkillId, rightSkillId)}
      onCancelDiff={() => void handleCancelDiff()}
      onCloseDiff={handleCloseDiff}
      l={l}
    />
  );

  const skillsCenter = (
    <SkillsCenter
      managerMode={managerMode}
      setManagerMode={(value) => setManagerMode(value)}
      operationsPanel={skillsOperationsPanel}
      configPanel={skillsConfigPanel}
      skillDetailView={skillDetailView}
      filteredSkillCount={filteredSkills.length}
      skillsLoading={skillsLoading}
      skillQuery={skillQuery}
      setSkillQuery={(value) => setSkillQuery(value)}
      showSkillOpenModeInStatusBar={showSkillOpenModeInStatusBar}
      selectBaseClass={SELECT_BASE_CLASS}
      skillOpenMode={skillOpenMode}
      setSkillOpenMode={(value) => setSkillOpenMode(value)}
      skillOpenModeOptions={skillOpenModeOptions}
      onScanSkills={() => void handleScanSkills()}
      onRefreshSkills={() => void handleRefreshSkills()}
      onSkillOpen={(skillId, relativePath) => void handleSkillOpen(skillId, relativePath)}
      onBackToSkillList={handleLeaveSkillDetail}
      selectedSkill={selectedSkill}
      skillDetailTab={skillDetailTab}
      setSkillDetailTab={(value) => setSkillDetailTab(value)}
      onReadSkillFile={(skillId, relativePath) => void handleReadSkillFile(skillId, relativePath)}
      skillFileReadLoading={skillFileReadLoading}
      selectedSkillOverviewRead={selectedSkillOverviewRead}
      uiLanguage={uiLanguage}
      selectedSkillTree={selectedSkillTree}
      skillTreeLoading={skillTreeLoading}
      onLoadSkillTree={(skillId, force) => void handleLoadSkillTree(skillId, force)}
      renderSkillTreeNodes={renderSkillTreeNodes}
      selectedSkillFilePath={selectedSkillFilePath}
      selectedSkillFileRead={selectedSkillFileRead}
      selectedSkillTranslationKey={selectedSkillTranslationKey}
      selectedSkillTranslatedText={selectedSkillTranslatedText}
      isZh={isZh}
      translationTargetLanguage={translationTargetLanguage}
      translationTargetLanguageOptions={translationTargetLanguageOptions}
      modelTestRunning={modelTestRunning}
      setTranslationTargetLanguage={(value) => setTranslationTargetLanguage(value)}
      onTranslateSkillFile={handleTranslateSelectedSkillFile}
      shouldUseMarkdownPreview={shouldUseMarkdownPreview}
      l={l}
    />
  );
  const agentsCenter = (
    <AgentsCenter
      l={l}
      isDarkTheme={isDarkTheme}
      activeWorkspaceId={activeWorkspaceId}
      agentAssets={agentAssets}
      agentConnections={agentConnections}
      agentQuery={agentQuery}
      setAgentQuery={setAgentQuery}
      handleRefreshAgentModule={handleRefreshAgentModule}
      handleCreateNewAgentAsset={handleCreateNewAgentAsset}
      agentRulesError={agentRulesError}
      clearAgentRulesError={clearAgentRulesError}
      filteredAgentAssets={filteredAgentAssets}
      pagedAgentAssets={pagedAgentAssets}
      agentTagsByAsset={agentTagsByAsset}
      openAgentRuleEditor={openAgentRuleEditor}
      handleOpenAgentVersionDiff={handleOpenAgentVersionDiff}
      setSelectedAssetId={setSelectedAssetId}
      setCreatingAgentAsset={setCreatingAgentAsset}
      setAgentDistributionModalOpen={setAgentDistributionModalOpen}
      deleteConfirmAssetId={deleteConfirmAssetId}
      setDeleteConfirmAssetId={setDeleteConfirmAssetId}
      handleDeleteAgentRuleAsset={handleDeleteAgentRuleAsset}
      toLocalTime={toLocalTime}
      agentRulesPage={agentRulesPage}
      setAgentRulesPage={setAgentRulesPage}
      totalAgentPages={totalAgentPages}
      agentRulesPageSize={AGENT_RULES_PAGE_SIZE}
      normalizeAgentTypeInput={normalizeAgentTypeInput}
      defaultAgentRuleFile={defaultAgentRuleFile}
      joinRuleFilePath={joinRuleFilePath}
      handleOpenAgentMappingPreview={handleOpenAgentMappingPreview}
    />
  );

  const generalSettingsPanel = (
    <GeneralSettingsPanel
      l={l}
      selectBaseClass={SELECT_BASE_CLASS}
      theme={theme}
      language={language}
      onThemeChange={(value) => setTheme(value)}
      onLanguageChange={(value) => setLanguage(value)}
    />
  );
  const dataSettingsPanel = (
    <DataSettingsPanel
      l={l}
      storageDirDraft={storageDirDraft}
      activeWorkspaceRootPath={activeWorkspace?.rootPath ?? null}
      distributionTargets={settingsTargets}
      distributionTargetDrafts={distributionTargetDrafts}
      distributionTargetEditingIds={distributionTargetEditingIds}
      newDistributionTargetDraft={newDistributionTargetDraft}
      distributionTargetSavingId={distributionTargetSavingId}
      onStorageDirDraftChange={(value) => {
        setStorageDirDraft(value);
        setDirty("data", true);
      }}
      onSaveStorageDirectory={() => void handleSaveStorageDirectory()}
      onUseDefaultStorageDirectory={() => void handleUseDefaultStorageDirectory()}
      onOpenStorageDirectoryInFinder={() => void handleOpenStorageDirectoryInFinder()}
      onDistributionTargetFieldChange={handleDistributionTargetFieldChange}
      onStartDistributionTargetEdit={handleStartDistributionTargetEdit}
      onCancelDistributionTargetEdit={handleCancelDistributionTargetEdit}
      onSaveDistributionTarget={(targetId) => void handleSaveDistributionTarget(targetId)}
      onDeleteDistributionTarget={(targetId) => void handleDeleteDistributionTarget(targetId)}
      onNewDistributionTargetFieldChange={handleNewDistributionTargetFieldChange}
      onCreateDistributionTarget={() => void handleCreateDistributionTarget()}
    />
  );
  const agentConnectionsPanel = (
    <AgentConnectionsPanel
      l={l}
      isDarkTheme={isDarkTheme}
      settingsAgentTypes={settingsAgentTypes}
      selectedSettingsAgentType={selectedSettingsAgentType}
      newSettingsAgentInput={newSettingsAgentInput}
      selectedSettingsRootDir={selectedSettingsRootDir}
      selectedSettingsRuleFile={selectedSettingsRuleFile}
      selectedSettingsResolvedPath={selectedSettingsResolvedPath}
      onSelectSettingsAgentType={setSettingsAgentType}
      onNewSettingsAgentInputChange={setNewSettingsAgentInput}
      onAddSettingsAgent={handleAddSettingsAgent}
      onRemoveSettingsAgent={(agentType) => void handleRemoveSettingsAgent(agentType)}
      onSelectedSettingsRootDirChange={(value) => {
        setConnectionDrafts((prev) => ({
          ...prev,
          [selectedSettingsAgentType]: value,
        }));
        setDirty("agents", true);
      }}
      onUseDefaultSelectedSettingsRootDir={() => {
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
      onOpenSelectedSettingsAgentConfigInFinder={() => void handleOpenAgentConfigInFinder(selectedSettingsAgentType)}
      onSelectedSettingsRuleFileChange={(value) => {
        setConnectionRuleFileDrafts((prev) => ({
          ...prev,
          [selectedSettingsAgentType]: value,
        }));
        setDirty("agents", true);
      }}
      selectedSettingsRootDirPlaceholder={
        defaultAgentConfigDir(homePath, selectedSettingsAgentType) ||
        "/Users/you/.agent-config"
      }
      selectedSettingsRuleFilePlaceholder={defaultAgentRuleFile(selectedSettingsAgentType)}
      onSaveAgentConnections={() => void handleSaveAgentConnections()}
    />
  );
  const modelSettingsPanel = (
    <ModelSettingsPanel
      l={l}
      isZh={isZh}
      modelLoading={modelLoading}
      modelSaving={modelSaving}
      localAgentProfiles={localAgentProfiles}
      selectedModelProfileKey={selectedModelProfileKey}
      onSelectModelProfileKey={setSelectedModelProfileKey}
      onDeleteModelProfile={(key) => void handleDeleteModelProfile(key)}
      modelProfileName={modelProfileName}
      onModelProfileNameChange={(value) => {
        setModelProfileName(value);
        setDirty("model", true);
      }}
      modelExecutable={modelExecutable}
      onModelExecutableChange={(value) => {
        setModelExecutable(value);
        setDirty("model", true);
      }}
      modelArgsTemplateText={modelArgsTemplateText}
      onModelArgsTemplateTextChange={(value) => {
        setModelArgsTemplateText(value);
        setDirty("model", true);
      }}
      onSaveModelProfile={() => void handleSaveModelProfile()}
      newModelProfileKey={newModelProfileKey}
      onNewModelProfileKeyChange={setNewModelProfileKey}
      onAddModelProfile={handleAddModelProfile}
      translationDefaultProfileKey={translationDefaultProfileKey}
      modelTestRunning={modelTestRunning}
      modelScenarioSettingsOpen={modelScenarioSettingsOpen}
      onModelScenarioSettingsOpenChange={setModelScenarioSettingsOpen}
      modelScenarioTestOpen={modelScenarioTestOpen}
      onModelScenarioTestOpenChange={setModelScenarioTestOpen}
      onOpenModelScenarioSettings={() => setModelScenarioSettingsOpen(true)}
      onOpenModelScenarioTest={() => setModelScenarioTestOpen(true)}
      onRestoreDefaultTranslationConfig={handleRestoreDefaultTranslationConfig}
      onSaveTranslationConfigFromDialog={() => void handleSaveTranslationConfigFromDialog()}
      onTranslationDefaultProfileKeyChange={(value) => {
        setTranslationDefaultProfileKey(value);
        setDirty("model", true);
      }}
      translationPromptTemplate={translationPromptTemplate}
      onTranslationPromptTemplateChange={(value) => {
        setTranslationPromptTemplate(value);
        setDirty("model", true);
      }}
      modelTestSourceText={modelTestSourceText}
      onModelTestSourceTextChange={setModelTestSourceText}
      modelTestResult={modelTestResult}
      translationTargetLanguage={translationTargetLanguage}
      translationTargetLanguageOptions={translationTargetLanguageOptions}
      onTranslationTargetLanguageChange={setTranslationTargetLanguage}
      onRunModelTranslationTest={() => void handleRunModelTranslationTest()}
      onOpenModelTestOutputSheet={() => modelTestOutputSheet.setOpen(true)}
    />
  );
  const aboutPanel = (
    <AboutPanel
      l={l}
      appVersion={appVersion}
      appUpdateStage={appUpdateStage}
      appUpdateStatusText={appUpdateStatusText}
      appUpdateError={appUpdateError}
      onCheckAppUpdates={() => void checkAppUpdates(true)}
      onInstallAppUpdate={() => void installAppUpdate()}
    />
  );
  const settingsCenter = (
    <SettingsModule
      l={l}
      settingCategories={settingCategories}
      settingsCategory={settingsCategory}
      settingsLoading={settingsLoading}
      onChangeSettingsCategory={handleChangeSettingsCategory}
      generalPanel={generalSettingsPanel}
      dataPanel={dataSettingsPanel}
      agentConnectionsPanel={agentConnectionsPanel}
      modelPanel={modelSettingsPanel}
      aboutPanel={aboutPanel}
    />
  );

  const modelTestOutputSheetView = (
    <Sheet open={modelTestOutputSheet.open} onOpenChange={modelTestOutputSheet.setOpen}>
      <SheetContent side="right" className="w-[min(94vw,560px)] overflow-hidden sm:max-w-[560px]">
        <div className="flex h-full flex-col overflow-hidden">
          <SheetHeader className="pr-8">
            <SheetTitle>{l("运行输出", "Runtime Output")}</SheetTitle>
            <SheetDescription>
              {modelTestOutputSheet.running
                ? l("正在运行，输出会实时刷新。", "Running, output updates in real time.")
                : l("查看最近一次运行输出。", "Inspect latest runtime output.")}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
            {modelTestOutputSheet.lifecycleText ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                {modelTestOutputSheet.lifecycleText}
              </div>
            ) : null}
            {modelTestOutputSheet.result ? (
              <div
                className={`rounded-md border px-3 py-2 text-xs ${
                  modelTestOutputSheet.result.ok
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {modelTestOutputSheet.result.text}
              </div>
            ) : null}
            <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
              <div className="text-[11px] font-medium text-slate-500">stdout</div>
              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-700">
                {modelTestOutputSheet.output.stdout || "-"}
              </pre>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
              <div className="text-[11px] font-medium text-slate-500">stderr</div>
              <pre
                ref={modelTestOutputSheet.stderrRef}
                className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-700"
              >
                {modelTestOutputSheet.output.stderr || "-"}
              </pre>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );

  const createPromptDialog = (
    <CreatePromptDialog
      open={createPromptOpen}
      onOpenChange={setCreatePromptOpen}
      isZh={isZh}
      name={newPromptName}
      content={newPromptContent}
      onNameChange={setNewPromptName}
      onContentChange={setNewPromptContent}
      onCreate={() => void handleCreatePrompt()}
      onCancel={() => setCreatePromptOpen(false)}
      language={uiLanguage}
      markdownModeLabels={markdownModeLabels}
    />
  );
  const promptRunDialog = (
    <PromptRunDialog
      open={promptRun.promptRunOpen}
      onOpenChange={promptRun.handlePromptRunDialogOpenChange}
      isZh={isZh}
      fromDetail={promptRun.promptRunFromDetail}
      promptName={promptRun.promptRunPromptName}
      variableOrder={promptRun.promptRunVariableOrder}
      variables={promptRun.promptRunVariables}
      variableHistories={promptRun.promptRunVariableHistories}
      preview={promptRun.promptRunPreview}
      onVariableChange={promptRun.handlePromptRunVariableChange}
      onApplyHistory={promptRun.handlePromptRunApplyHistory}
      onCopyPreview={() => void promptRun.handleCopyPromptRunPreview()}
      onCancel={promptRun.handleClosePromptRun}
    />
  );
  const promptVersionDialog = (
    <PromptVersionDialog
      open={versionModalOpen}
      onOpenChange={(open) => {
        setVersionModalOpen(open);
        if (!open) {
          setPromptVersionCompareMode(false);
          setCompareLeftVersion(null);
          setCompareRightVersion(null);
        }
      }}
      isZh={isZh}
      versions={selectedPromptVersions}
      compareMode={promptVersionCompareMode}
      selectedPreviewVersion={promptVersionPreview}
      selectedCompareLeftVersion={compareLeftVersion}
      selectedCompareRightVersion={compareRightVersion}
      previewData={selectedPromptPreviewVersion}
      compareData={{
        before: promptCompareLeft?.content ?? "",
        after: promptCompareRight?.content ?? "",
        leftVersion: promptCompareLeft?.version ?? null,
        rightVersion: promptCompareRight?.version ?? null,
        leftCreatedAt: promptCompareLeft?.createdAt ?? null,
        rightCreatedAt: promptCompareRight?.createdAt ?? null,
        diffStats: promptDiffStats,
      }}
      onSelectPreviewVersion={setPromptVersionPreview}
      onSelectCompareCandidate={togglePromptCompareCandidate}
      onToggleCompareMode={() => {
        if (promptVersionCompareMode) {
          setPromptVersionCompareMode(false);
          setCompareLeftVersion(null);
          setCompareRightVersion(null);
          return;
        }
        setPromptVersionCompareMode(true);
        setCompareLeftVersion(selectedPromptVersions[0]?.version ?? null);
        setCompareRightVersion(selectedPromptVersions[1]?.version ?? selectedPromptVersions[0]?.version ?? null);
      }}
      onRestoreVersion={(version) => {
        void handleRestorePromptVersion(version);
      }}
      onCancel={() => setVersionModalOpen(false)}
    />
  );
  const agentVersionDialog = (
    <AgentVersionDialog
      l={l}
      isZh={isZh}
      open={agentVersionModalOpen}
      onOpenChange={setAgentVersionModalOpen}
      selectedAgentAssetName={selectedAgentAsset?.name}
      agentVersionCompareMode={agentVersionCompareMode}
      setAgentVersionCompareMode={setAgentVersionCompareMode}
      agentCompareLeftVersion={agentCompareLeftVersion}
      setAgentCompareLeftVersion={setAgentCompareLeftVersion}
      agentCompareRightVersion={agentCompareRightVersion}
      setAgentCompareRightVersion={setAgentCompareRightVersion}
      selectedAgentVersions={selectedAgentVersions}
      agentVersionPreview={agentVersionPreview}
      setAgentVersionPreview={setAgentVersionPreview}
      toggleAgentCompareCandidate={toggleAgentCompareCandidate}
      selectedAgentPreviewVersion={selectedAgentPreviewVersion}
      agentCompareLeft={agentCompareLeft}
      agentCompareRight={agentCompareRight}
      agentDiffStats={agentDiffStats}
      toLocalTime={toLocalTime}
      handleRestoreAgentRuleVersion={handleRestoreAgentRuleVersion}
    />
  );
  const agentRuleEditorDialog = (
    <AgentRuleEditorDialog
      l={l}
      open={agentRuleEditorModalOpen}
      onOpenChange={setAgentRuleEditorModalOpen}
      creatingAgentAsset={creatingAgentAsset}
      selectedAgentAsset={selectedAgentAsset}
      agentAssetNameInput={agentAssetNameInput}
      setAgentAssetNameInput={setAgentAssetNameInput}
      toLocalTime={toLocalTime}
      isZh={isZh}
      agentEditorContent={agentEditorContent}
      setAgentEditorContent={setAgentEditorContent}
      agentRuleTranslatedText={agentRuleTranslatedText}
      setAgentRuleTranslatedText={setAgentRuleTranslatedText}
      translationTargetLanguage={translationTargetLanguage}
      translationTargetLanguageOptions={translationTargetLanguageOptions}
      modelTestRunning={modelTestRunning}
      setTranslationTargetLanguage={setTranslationTargetLanguage}
      handleRunModelTranslationTest={handleRunModelTranslationTest}
      selectedAssetId={selectedAssetId}
      setAgentDistributionModalOpen={setAgentDistributionModalOpen}
      handleSaveAgentRuleVersion={handleSaveAgentRuleVersion}
    />
  );
  const agentDistributionDialog = (
    <AgentDistributionDialog
      l={l}
      open={agentDistributionModalOpen}
      onOpenChange={setAgentDistributionModalOpen}
      selectedAssetId={selectedAssetId}
      setSelectedAssetId={setSelectedAssetId}
      agentAssets={agentAssets}
      agentConnections={agentConnections}
      agentTargetIds={agentTargetIds}
      setAgentTargetIds={setAgentTargetIds}
      defaultAgentRuleFile={defaultAgentRuleFile}
      joinRuleFilePath={joinRuleFilePath}
      handleRunAgentDistribution={handleRunAgentDistribution}
    />
  );
  const agentMappingPreviewDialog = (
    <AgentMappingPreviewDialog
      l={l}
      uiLanguage={language}
      open={mappingPreviewOpen}
      onOpenChange={setMappingPreviewOpen}
      mappingPreviewPlatform={mappingPreviewPlatform}
      mappingPreviewPath={mappingPreviewPath}
      mappingPreviewExists={mappingPreviewExists}
      mappingPreviewMessage={mappingPreviewMessage}
      mappingPreviewContent={mappingPreviewContent}
    />
  );
  const linkConfirmDialog = (
    <Dialog
      open={linkConfirmPreview !== null}
      onOpenChange={(open) => {
        if (!open) {
          settleLinkConfirm(false);
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{l("确认覆盖链接", "Confirm Link Replacement")}</DialogTitle>
          <DialogDescription>
            {linkConfirmPreview
              ? `${linkConfirmPreview.tool} / ${linkConfirmPreview.skillName}`
              : ""}
          </DialogDescription>
        </DialogHeader>
        {linkConfirmPreview ? (
          <div className="space-y-3">
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {linkConfirmPreview.message}
            </div>
            <div className="text-xs text-slate-500">{buildLinkPreviewSummary(linkConfirmPreview)}</div>
            <div className="max-h-56 space-y-1 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-2">
              {linkConfirmPreview.entries.length > 0 ? (
                linkConfirmPreview.entries.slice(0, 12).map((entry) => (
                  <div key={`${entry.relativePath}:${entry.status}`} className="font-mono text-[11px] text-slate-700">
                    {entry.relativePath} ({entry.status})
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-500">{l("无可展示差异明细。", "No diff entries to display.")}</div>
              )}
              {linkConfirmPreview.entriesTruncated ? (
                <div className="text-xs text-slate-500">{l("仅展示部分差异文件。", "Showing partial diff entries.")}</div>
              ) : null}
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => settleLinkConfirm(false)}>
            {l("取消", "Cancel")}
          </Button>
          <Button onClick={() => settleLinkConfirm(true)}>{l("确认链接", "Confirm Link")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const center =
    activeModule === "prompts"
      ? (
        <PromptsModule
          promptDetailView={promptDetailView}
          promptCenter={promptCenter}
          promptDetail={promptDetail}
          createPromptDialog={createPromptDialog}
          promptRunDialog={promptRunDialog}
          promptVersionDialog={promptVersionDialog}
        />
      )
      : activeModule === "skills"
        ? <SkillsModule skillsCenter={skillsCenter} managerMode={managerMode} setManagerMode={setManagerMode} />
      : activeModule === "agents"
          ? (
            <AgentsModule
              agentsCenter={agentsCenter}
              agentVersionDialog={agentVersionDialog}
              agentRuleEditorDialog={agentRuleEditorDialog}
              agentDistributionDialog={agentDistributionDialog}
              agentMappingPreviewDialog={agentMappingPreviewDialog}
            />
          )
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

      {linkConfirmDialog}
      {modelTestOutputSheetView}
    </>
  );
}
