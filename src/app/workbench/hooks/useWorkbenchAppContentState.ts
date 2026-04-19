import { useCallback, useMemo, useRef, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import type { AppLanguage, SettingsCategory } from "../../../features/shell/types";
import { useRuntimeOutputSheet } from "../../../features/common/hooks/useRuntimeOutputSheet";
import {
  useAgentRulesStore,
  usePromptsStore,
  useSettingsStore,
  useShellStore,
  useSkillsStore,
} from "../../../shared/stores";
import type { LocalAgentProfileDto, SkillOpenMode } from "../../../shared/types";
import {
  APP_LANGUAGE_STORAGE_KEY,
  APP_THEME_STORAGE_KEY,
  AUTO_CHECK_APP_UPDATES,
  MODEL_TEST_TARGET_LANGUAGE_PRESETS,
  PROJECT_BOOTING_EN,
  PROJECT_BOOTING_ZH,
  SETTING_CATEGORY_KEYS,
  SKILL_OPEN_MODE_OPTIONS,
  SKILL_OPEN_MODE_STORAGE_KEY,
  TRANSLATION_TARGET_LANGUAGE_STORAGE_KEY,
} from "../constants";
import type {
  AppTheme,
  AppUpdateProgress,
  AppUpdateStage,
  PromptBatchJumpSuggestion,
} from "../types";
import {
  normalizeDirectoryInput,
  resolveInitialLanguage,
  resolveInitialSkillOpenMode,
  resolveInitialTheme,
  resolveInitialTranslationTargetLanguage,
} from "../utils";
import { useSkillScanDirectories } from "./useSkillScanDirectories";
export function useWorkbenchAppContentState() {
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
  const usageAgentFilter = useSkillsStore((state) => state.usageAgentFilter);
  const usageSourceFilter = useSkillsStore((state) => state.usageSourceFilter);
  const usageStatsLoading = useSkillsStore((state) => state.usageStatsLoading);
  const usageStatsError = useSkillsStore((state) => state.usageStatsError);
  const usageListSyncJob = useSkillsStore((state) => state.usageListSyncJob);
  const usageDetailSyncJob = useSkillsStore((state) => state.usageDetailSyncJob);
  const usageDetailCalls = useSkillsStore((state) => state.usageDetailCalls);
  const usageDetailCallsTotal = useSkillsStore((state) => state.usageDetailCallsTotal);
  const usageDetailCallsLoading = useSkillsStore((state) => state.usageDetailCallsLoading);
  const usageDetailCallsError = useSkillsStore((state) => state.usageDetailCallsError);
  const getManagerOperationsRows = useSkillsStore((state) => state.getManagerOperationsRows);
  const loadManagerState = useSkillsStore((state) => state.loadManagerState);
  const managerBatchLink = useSkillsStore((state) => state.managerBatchLink);
  const managerBatchUnlink = useSkillsStore((state) => state.managerBatchUnlink);
  const setManagerMode = useSkillsStore((state) => state.setManagerMode);
  const setManagerExpandedSkillId = useSkillsStore((state) => state.setManagerExpandedSkillId);
  const setManagerMatrixFilter = useSkillsStore((state) => state.setManagerMatrixFilter);
  const clearManagerRowHint = useSkillsStore((state) => state.clearManagerRowHint);
  const setUsageFilters = useSkillsStore((state) => state.setUsageFilters);
  const refreshUsageStats = useSkillsStore((state) => state.refreshUsageStats);
  const startListUsageSync = useSkillsStore((state) => state.startListUsageSync);
  const startDetailUsageSync = useSkillsStore((state) => state.startDetailUsageSync);
  const loadUsageCalls = useSkillsStore((state) => state.loadUsageCalls);
  const clearUsageDetail = useSkillsStore((state) => state.clearUsageDetail);
  const agentAssets = useAgentRulesStore((state) => state.assets);
  const agentTagsByAsset = useAgentRulesStore((state) => state.tagsByAsset);
  const agentVersionsByAsset = useAgentRulesStore((state) => state.versionsByAsset ?? {});
  const agentConnections = useAgentRulesStore((state) => state.connections);
  const agentRulesError = useAgentRulesStore((state) => state.lastActionError);
  const selectedAssetId = useAgentRulesStore((state) => state.selectedAssetId);
  const setSelectedAssetId = useAgentRulesStore((state) => state.setSelectedAssetId);
  const clearAgentRulesError = useAgentRulesStore((state) => state.clearError);
  const loadAgentModuleData = useAgentRulesStore((state) => state.loadModuleData);
  const loadAgentConnectionsStore = useAgentRulesStore((state) => state.loadConnections);
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
  const showSkillOpenModeInStatusBar =
    typeof window !== "undefined" && window.innerWidth >= 1024 && /mac/i.test(navigator.platform);
  const isZh = language === "zh-CN";
  const l = useCallback((zh: string, en: string): string => (isZh ? zh : en), [isZh]);
  const projectBootingMessage = l(PROJECT_BOOTING_ZH, PROJECT_BOOTING_EN);
  const markdownModeLabels = useMemo(
    () => ({
      edit: l("编辑", "Edit"),
      preview: l("预览", "Preview"),
      split: l("分栏", "Split"),
    }),
    [l],
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
  const [promptPage, setPromptPage] = useState(1);
  const [newPromptName, setNewPromptName] = useState("");
  const [newPromptContent, setNewPromptContent] = useState("");
  const [promptQuery, setPromptQuery] = useState("");
  const [promptBrowseScope, setPromptBrowseScope] = useState<"all" | "favorites" | "categories">("all");
  const [promptBrowseCategory, setPromptBrowseCategory] = useState<string>("all");
  const [promptAllCategoryFilter, setPromptAllCategoryFilter] = useState<string>("all");
  const [promptBatchJumpSuggestion, setPromptBatchJumpSuggestion] = useState<PromptBatchJumpSuggestion | null>(null);
  const [skillQuery, setSkillQuery] = useState("");
  const [promptDetailView, setPromptDetailView] = useState<"list" | "detail">("list");
  const [skillDetailView, setSkillDetailView] = useState<"list" | "detail">("list");
  const [skillOpenMode, setSkillOpenMode] = useState<SkillOpenMode>(() => resolveInitialSkillOpenMode());
  const [skillOpenMenuOpen, setSkillOpenMenuOpen] = useState(false);
  const [promptBatchCategory, setPromptBatchCategory] = useState("");
  const { homePath, selectedSkillScanDirectories } = useSkillScanDirectories({ distributionTargets: settingsTargets });
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
  const [newModelProfileName, setNewModelProfileName] = useState("");
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
      label: item.value,
    }));
    const current = translationTargetLanguage.trim();
    if (!current || presets.some((item) => item.value === current)) {
      return presets;
    }
    return [{ value: current, label: current }, ...presets];
  }, [translationTargetLanguage]);
  const [compareLeftVersion, setCompareLeftVersion] = useState<number | null>(null);
  const [compareRightVersion, setCompareRightVersion] = useState<number | null>(null);
  const [promptVersionPreview, setPromptVersionPreview] = useState<number | null>(null);
  const [promptVersionCompareMode, setPromptVersionCompareMode] = useState(false);
  const selectedPrompt = useMemo(
    () => prompts.find((item) => item.id === selectedPromptId) ?? null,
    [prompts, selectedPromptId],
  );
  const selectedModelProfile = useMemo(
    () => localAgentProfiles.find((item) => item.profileKey === selectedModelProfileKey) ?? null,
    [localAgentProfiles, selectedModelProfileKey],
  );
  const modelTestRunning = modelTestOutputSheet.running;
  const modelTestResult = modelTestOutputSheet.result;
  const selectedSkill = useMemo(
    () => skills.find((item) => item.id === selectedSkillId) ?? null,
    [skills, selectedSkillId],
  );
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
          return { key, label: l("基础设置", "Basic") };
        }
        if (key === "model") {
          return { key, label: l("AI 模型", "AI Models") };
        }
        if (key === "about") {
          return { key, label: l("关于", "About") };
        }
        return { key, label: key };
      }),
    [l],
  );
  return {
    // constants
    APP_LANGUAGE_STORAGE_KEY,
    APP_THEME_STORAGE_KEY,
    AUTO_CHECK_APP_UPDATES,
    PROJECT_BOOTING_EN,
    PROJECT_BOOTING_ZH,
    SKILL_OPEN_MODE_STORAGE_KEY,
    TRANSLATION_TARGET_LANGUAGE_STORAGE_KEY,
    // shell
    activeModule,
    setActiveModule,
    promptViewMode,
    setPromptViewMode,
    skillDetailTab,
    setSkillDetailTab,
    settingsCategory,
    setSettingsCategory,
    sidebarOpen,
    setSidebarOpen,
    mobileDetailOpen,
    setMobileDetailOpen,
    // prompts store
    prompts,
    promptsLoading,
    selectedPromptId,
    promptVersions,
    fetchPrompts,
    selectPrompt,
    deletePrompt,
    createPrompt,
    updatePrompt,
    fetchPromptVersions,
    restorePromptVersion,
    promptSelectedIds,
    setPromptSelection,
    clearPromptSelection,
    batchFavorite,
    batchMove,
    batchDelete,
    promptBatchResult,
    // skills store
    skills,
    skillsLoading,
    selectedSkillId,
    fetchSkills,
    scanSkills,
    selectSkill,
    managerState,
    managerLoading,
    managerCalibrating,
    managerMode,
    managerExpandedSkillId,
    managerMatrixFilter,
    managerRowHints,
    usageAgentFilter,
    usageSourceFilter,
    usageStatsLoading,
    usageStatsError,
    usageListSyncJob,
    usageDetailSyncJob,
    usageDetailCalls,
    usageDetailCallsTotal,
    usageDetailCallsLoading,
    usageDetailCallsError,
    getManagerOperationsRows,
    loadManagerState,
    managerBatchLink,
    managerBatchUnlink,
    setManagerMode,
    setManagerExpandedSkillId,
    setManagerMatrixFilter,
    clearManagerRowHint,
    setUsageFilters,
    refreshUsageStats,
    startListUsageSync,
    startDetailUsageSync,
    loadUsageCalls,
    clearUsageDetail,
    // agent rules store
    agentAssets,
    agentTagsByAsset,
    agentVersionsByAsset,
    agentConnections,
    agentRulesError,
    selectedAssetId,
    setSelectedAssetId,
    clearAgentRulesError,
    loadAgentModuleData,
    loadAgentConnectionsStore,
    loadAgentVersions,
    createAgentAsset,
    renameAgentAsset,
    deleteAgentAsset,
    publishAgentVersion,
    rollbackAgentRuleVersion,
    refreshAgentAsset,
    runAgentDistribution,
    // settings store
    workspaces,
    activeWorkspaceId,
    settingsTargets,
    settingsConnections,
    dirty,
    settingsLoading,
    loadAllSettings,
    loadSettingsConnections,
    upsertTarget,
    deleteTarget,
    upsertConnection,
    deleteConnection,
    setDirty,
    // local states and derived
    language,
    setLanguage,
    theme,
    setTheme,
    appVersion,
    setAppVersion,
    appUpdateStage,
    setAppUpdateStage,
    appUpdateVersion,
    setAppUpdateVersion,
    appUpdateError,
    setAppUpdateError,
    appUpdateProgress,
    setAppUpdateProgress,
    appUpdateRef,
    appUpdateAutoCheckedRef,
    skillOpenMenuRef,
    showSkillOpenModeInStatusBar,
    isZh,
    l,
    projectBootingMessage,
    markdownModeLabels,
    skillOpenModeOptions,
    createPromptOpen,
    setCreatePromptOpen,
    versionModalOpen,
    setVersionModalOpen,
    promptPage,
    setPromptPage,
    newPromptName,
    setNewPromptName,
    newPromptContent,
    setNewPromptContent,
    promptQuery,
    setPromptQuery,
    promptBrowseScope,
    setPromptBrowseScope,
    promptBrowseCategory,
    setPromptBrowseCategory,
    promptAllCategoryFilter,
    setPromptAllCategoryFilter,
    promptBatchJumpSuggestion,
    setPromptBatchJumpSuggestion,
    skillQuery,
    setSkillQuery,
    promptDetailView,
    setPromptDetailView,
    skillDetailView,
    setSkillDetailView,
    skillOpenMode,
    setSkillOpenMode,
    skillOpenMenuOpen,
    setSkillOpenMenuOpen,
    promptBatchCategory,
    setPromptBatchCategory,
    homePath,
    selectedSkillScanDirectories,
    detailName,
    setDetailName,
    detailCategory,
    setDetailCategory,
    detailTagsInput,
    setDetailTagsInput,
    detailContent,
    setDetailContent,
    detailFavorite,
    setDetailFavorite,
    modelLoading,
    setModelLoading,
    modelSaving,
    setModelSaving,
    localAgentProfiles,
    setLocalAgentProfiles,
    selectedModelProfileKey,
    setSelectedModelProfileKey,
    modelProfileName,
    setModelProfileName,
    modelExecutable,
    setModelExecutable,
    modelArgsTemplateText,
    setModelArgsTemplateText,
    newModelProfileName,
    setNewModelProfileName,
    translationPromptTemplate,
    setTranslationPromptTemplate,
    translationDefaultProfileKey,
    setTranslationDefaultProfileKey,
    modelTestSourceText,
    setModelTestSourceText,
    translationTargetLanguage,
    setTranslationTargetLanguage,
    modelScenarioSettingsOpen,
    setModelScenarioSettingsOpen,
    modelScenarioTestOpen,
    setModelScenarioTestOpen,
    modelTestOutputSheet,
    translationTargetLanguageOptions,
    compareLeftVersion,
    setCompareLeftVersion,
    compareRightVersion,
    setCompareRightVersion,
    promptVersionPreview,
    setPromptVersionPreview,
    promptVersionCompareMode,
    setPromptVersionCompareMode,
    selectedPrompt,
    selectedModelProfile,
    modelTestRunning,
    modelTestResult,
    selectedSkill,
    activeWorkspace,
    operationsScanDirectories,
    settingCategories,
  };
}
