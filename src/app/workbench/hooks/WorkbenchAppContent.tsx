import { useEffect, useMemo } from "react";
import { LocaleProvider, Toast as SemiToast } from "@douyinfe/semi-ui-19";
import enUS from "@douyinfe/semi-ui-19/lib/es/locale/source/en_US";
import zhCN from "@douyinfe/semi-ui-19/lib/es/locale/source/zh_CN";

import { AppShell } from "../../../features/shell/AppShell";
import type { SettingsCategory } from "../../../features/shell/types";
import { PROMPT_CATEGORY_ALL_KEY } from "../../../features/prompts/utils/promptCategory";
import { usePromptBrowse } from "../../../features/prompts/hooks/usePromptBrowse";
import { usePromptVersionCompare } from "../../../features/prompts/hooks/usePromptVersionCompare";
import { usePromptRun } from "../../../features/prompts/hooks/usePromptRun";
import { usePromptTranslation } from "../../../features/prompts/hooks/usePromptTranslation";
import {
  type PromptBrowseScope,
  readPromptBrowseContext,
  writePromptBrowseContext,
} from "../../../features/prompts/utils/promptBrowseContext";
import {
  DEFAULT_TRANSLATION_PROFILE_KEY,
  DEFAULT_TRANSLATION_PROMPT_TEMPLATE,
  LOCAL_AGENT_TRANSLATION_STREAM_EVENT,
  PROMPTS_PAGE_SIZE,
  PROMPT_TABLE_COLUMN_SETTINGS_KEY,
  SELECT_BASE_CLASS,
} from "../constants";
import { useWorkbenchAgentsController } from "./useWorkbenchAgentsController";
import { useWorkbenchAppContentState } from "./useWorkbenchAppContentState";
import { useWorkbenchPromptsController } from "./useWorkbenchPromptsController";
import { useWorkbenchSettingsController } from "./useWorkbenchSettingsController";
import { useWorkbenchSkillsController } from "./useWorkbenchSkillsController";
import { useWorkbenchChannelTestController } from "./useWorkbenchChannelTestController";
import { useWorkbenchUsageController } from "./useWorkbenchUsageController";
import { useWorkbenchSkillFileHandlers } from "./useWorkbenchSkillFileHandlers";
import { createWorkbenchPromptActions } from "./useWorkbenchPromptActions";
import { createWorkbenchModelActions } from "./useWorkbenchModelActions";
import { useWorkbenchRuntimeActions } from "./useWorkbenchRuntimeActions";
import { useWorkbenchLifecycleEffects } from "./useWorkbenchLifecycleEffects";
import { useWorkbenchDistributionTargets } from "./useWorkbenchDistributionTargets";
import { useWorkbenchAgentConnections } from "./useWorkbenchAgentConnections";
import { useWorkbenchSkillsDerivedData } from "./useWorkbenchSkillsDerivedData";
import { buildWorkbenchPromptAndSettingsViews } from "./useWorkbenchPromptAndSettingsViews";
import { SkillOpenModeStatusBar } from "./SkillOpenModeStatusBar";
import {
  createRequestId,
  extractStdoutPreviewFromErrorMessage,
  formatBytes,
  normalizeDirectoryInput,
  parseArgsTemplateInput,
  parseTags,
  shouldUseMarkdownPreview,
  toLocalTime,
  unknownToCode,
  unknownToMessage,
  waitForUiPaint,
} from "../utils";
import type { WorkbenchToastOptions } from "../types";
import { extractTemplateVariables } from "../../../shared/utils/template";

const DEFAULT_TOAST_DURATION_SECONDS = 3;

function renderToastContent(options: WorkbenchToastOptions) {
  if (!options.title) {
    return options.description ?? "";
  }
  if (!options.description) {
    return options.title;
  }
  return (
    <div className="space-y-1">
      <div className="font-medium">{options.title}</div>
      <div>{options.description}</div>
    </div>
  );
}

export function WorkbenchAppContent() {
  const toast = useMemo(
    () => (options: WorkbenchToastOptions) => {
      const id = options.id ?? crypto.randomUUID();
      const toastOptions = {
        id,
        content: renderToastContent(options),
        duration: options.duration ?? DEFAULT_TOAST_DURATION_SECONDS,
      };
      if (options.variant === "destructive") {
        SemiToast.error(toastOptions);
      } else {
        SemiToast.info(toastOptions);
      }
      return id;
    },
    [],
  );
  const {
    APP_LANGUAGE_STORAGE_KEY,
    APP_THEME_STORAGE_KEY,
    AUTO_CHECK_APP_UPDATES,
    SKILL_OPEN_MODE_STORAGE_KEY,
    TRANSLATION_TARGET_LANGUAGE_STORAGE_KEY,
    activeModule,
    setActiveModule,
    promptViewMode,
    setPromptViewMode,
    skillDetailTab,
    setSkillDetailTab,
    skillsHubSortMode,
    setSkillsHubSortMode,
    setAgentPlatformOrder,
    activeWorkspaceAgentOrder,
    settingsCategory,
    setSettingsCategory,
    sidebarOpen,
    setSidebarOpen,
    mobileDetailOpen,
    setMobileDetailOpen,
    prompts: promptList,
    promptsLoading,
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
    skills: skillList,
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
    usageEvidenceSourceFilter,
    usageStatsBySkillId,
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
    dismissListUsageSyncJob,
    startDetailUsageSync,
    loadUsageCalls,
    clearUsageDetail,
    agentAssets,
    agentTagsByAsset,
    agentVersionsByAsset,
    agentConnections,
    agentRulesError,
    selectedAssetId,
    setSelectedAssetId,
    clearAgentRulesError,
    loadAgentModuleData,
    loadAgentConnectionsStore: loadAgentConnections,
    loadAgentVersions,
    createAgentAsset,
    renameAgentAsset,
    deleteAgentAsset,
    publishAgentVersion,
    rollbackAgentRuleVersion,
    refreshAgentAsset,
    runAgentDistribution,
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
    toggleConnection,
    redetectConnection,
    restoreConnectionDefaults,
    setDirty,
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
  } = useWorkbenchAppContentState();
  const {
    appUpdateStatusText,
    loadModelWorkbenchData,
    checkAppUpdates,
    installAppUpdate,
  } = useWorkbenchRuntimeActions({
    l,
    isZh,
    appUpdateStage,
    appUpdateVersion,
    appUpdateProgress,
    appUpdateError,
    setAppUpdateStage,
    setAppUpdateError,
    setAppUpdateVersion,
    setAppUpdateProgress,
    appUpdateRef,
    formatBytes,
    toast,
    unknownToMessage,
    setModelLoading,
    setLocalAgentProfiles,
    selectedModelProfileKey,
    setSelectedModelProfileKey,
    setTranslationDefaultProfileKey,
    setTranslationPromptTemplate,
  });
  const {
    storageDirDraft,
    setStorageDirDraft,
    distributionTargetDrafts,
    distributionTargetEditingIds,
    newDistributionTargetDraft,
    distributionTargetSavingId,
    handleSaveStorageDirectory,
    handleOpenStorageDirectoryInFinder,
    handlePickStorageDirectory,
    handleUseDefaultStorageDirectory,
    handlePickNewDistributionTargetDirectory,
    handlePickDistributionTargetDirectory,
    handleDistributionTargetFieldChange,
    handleStartDistributionTargetEdit,
    handleCancelDistributionTargetEdit,
    handleDeleteDistributionTarget,
    handleSaveDistributionTarget,
    handleNewDistributionTargetFieldChange,
    handleCreateDistributionTarget,
  } = useWorkbenchDistributionTargets({
    l,
    toast,
    unknownToMessage,
    activeWorkspaceId,
    activeWorkspaceRootPath: activeWorkspace?.rootPath ?? "",
    homePath,
    projectBootingMessage,
    settingsTargets,
    loadAllSettings,
    upsertTarget,
    deleteTarget,
    setDirty,
  });
  const {
    enabledAgentRows,
    availableAgentPresetRows,
    agentConnectionEditingPlatforms,
    agentConnectionSavingId,
    handleAgentConnectionFieldChange,
    handleStartAgentConnectionEdit,
    handleCancelAgentConnectionEdit,
    handleSaveAgentConnection,
    handleEnableAgentPreset,
    handleDisableAgentConnection,
    handleReorderEnabledAgentRows,
    handleRedetectAgentConnection,
    handleRestoreAgentConnectionDefaults,
    handlePickAgentConnectionRootDir,
  } = useWorkbenchAgentConnections({
    l,
    toast,
    unknownToMessage,
    activeWorkspaceId,
    activeWorkspaceRootPath: activeWorkspace?.rootPath ?? "",
    homePath,
    projectBootingMessage,
    settingsConnections,
    savedAgentPlatformOrder: activeWorkspaceAgentOrder,
    saveAgentPlatformOrder: (orderedPlatforms: string[]) => {
      if (!activeWorkspaceId) {
        return;
      }
      setAgentPlatformOrder(activeWorkspaceId, orderedPlatforms);
    },
    loadSettingsConnections: async (workspaceId: string) => {
      await loadSettingsConnections(workspaceId);
    },
    loadAgentConnections: async (workspaceId: string) => {
      await loadAgentConnections(workspaceId);
    },
    loadManagerState: async (workspaceId: string) => {
      await loadManagerState(workspaceId);
    },
    loadAgentModuleData: async (workspaceId: string) => {
      await loadAgentModuleData(workspaceId);
    },
    upsertConnection,
    toggleConnection,
    redetectConnection,
    restoreConnectionDefaults,
    setDirty,
  });
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
    prompts: promptList,
    promptQuery,
    promptBrowseScope,
    promptBrowseCategory,
    promptAllCategoryFilter,
    promptPage,
    pageSize: PROMPTS_PAGE_SIZE,
  });

  const {
    filteredSkills,
    operationsRows,
    operationsMatrixSummaries,
    scanGroups,
  } = useWorkbenchSkillsDerivedData({
    skills: skillList,
    skillQuery,
    activeWorkspaceRootPath: activeWorkspace?.rootPath ?? "",
    selectedSkillScanDirectories,
    agentPlatformOrder: enabledAgentRows.map((row) => row.platform),
    usageStatsBySkillId,
    normalizeDirectoryInput,
    getManagerOperationsRows,
    managerMatrixFilter,
    managerState,
    managerRowHints,
  });
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

  const selectedSkillOpenModeOption =
    skillOpenModeOptions.find((item) => item.value === skillOpenMode) ??
    skillOpenModeOptions[0];
  const skillOpenModeLabel = selectedSkillOpenModeOption?.label ?? "VS Code";
  const promptTableColumnSettingsKey = useMemo(
    () =>
      `${PROMPT_TABLE_COLUMN_SETTINGS_KEY}:${activeWorkspaceId ?? "default"}`,
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

  useWorkbenchLifecycleEffects({
    loadAllSettings,
    setAppVersion,
    AUTO_CHECK_APP_UPDATES,
    appUpdateAutoCheckedRef,
    checkAppUpdates,
    appUpdateRef,
    APP_LANGUAGE_STORAGE_KEY,
    language,
    APP_THEME_STORAGE_KEY,
    theme,
    TRANSLATION_TARGET_LANGUAGE_STORAGE_KEY,
    translationTargetLanguage,
    activeWorkspaceId,
    clearUsageDetail,
    fetchPrompts,
    fetchSkills,
    loadManagerState,
    refreshUsageStats,
    loadAgentModuleData,
    loadModelWorkbenchData,
    selectedModelProfile,
    setModelProfileName,
    setModelExecutable,
    setModelArgsTemplateText,
    SKILL_OPEN_MODE_STORAGE_KEY,
    skillOpenMode,
    skillOpenMenuOpen,
    skillOpenMenuRef,
    setSkillOpenMenuOpen,
    activeModule,
    setPromptDetailView,
    selectPrompt,
    totalPromptPages,
    setPromptPage,
    promptAllCategoryFilter,
    promptBrowseCategory,
    promptBrowseScope,
    promptQuery,
    readPromptBrowseContext,
    PROMPT_CATEGORY_ALL_KEY,
    setPromptAllCategoryFilter,
    setPromptBrowseScope,
    setPromptBrowseCategory,
    writePromptBrowseContext,
    promptCategoryKeySet,
    settingCategories,
    settingsCategory,
    setSettingsCategory,
    selectedPrompt,
    setDetailName,
    setDetailCategory,
    setDetailTagsInput,
    setDetailContent,
    setDetailFavorite,
    versionModalOpen,
    promptVersionCompareMode,
    selectedPromptVersions,
    promptVersionPreview,
    setPromptVersionPreview,
  });

  const {
    handleCreatePrompt,
    handleSavePromptDetail,
    handleOpenPromptVersion,
    togglePromptCompareCandidate,
    handleRestorePromptVersion,
    handleDeletePrompt,
    handleTogglePromptFavorite,
    runPromptBatchAction,
  } = createWorkbenchPromptActions({
    activeWorkspaceId,
    projectBootingMessage,
    newPromptName,
    newPromptContent,
    createPrompt,
    setCreatePromptOpen,
    setNewPromptName,
    setNewPromptContent,
    l,
    toast,
    selectedPrompt,
    detailName,
    detailContent,
    detailCategory,
    detailTagsInput,
    detailFavorite,
    updatePrompt,
    parseTags,
    fetchPrompts,
    fetchPromptVersions,
    promptVersions,
    setPromptVersionCompareMode,
    setPromptVersionPreview,
    setCompareLeftVersion,
    setCompareRightVersion,
    setVersionModalOpen,
    restorePromptVersion,
    deletePrompt,
    setPromptDetailView,
    promptSelectedIds,
    promptBatchCategory,
    batchFavorite,
    batchMove,
    batchDelete,
    clearPromptSelection,
    setPromptBatchJumpSuggestion,
    unknownToMessage,
    compareLeftVersion,
    compareRightVersion,
  });

  const {
    handleAddModelProfile,
    handleSaveModelProfile,
    handleDeleteModelProfile,
    handleRestoreDefaultTranslationConfig,
    handleSaveTranslationConfigFromDialog,
    handleRunModelTranslationTest,
  } = createWorkbenchModelActions({
    activeWorkspaceId,
    projectBootingMessage,
    newModelProfileName,
    localAgentProfiles,
    setModelSaving,
    setSelectedModelProfileKey,
    setNewModelProfileName,
    setDirty,
    l,
    toast,
    unknownToMessage,
    selectedModelProfileKey,
    modelProfileName,
    modelExecutable,
    modelArgsTemplateText,
    parseArgsTemplateInput,
    setModelScenarioSettingsOpen,
    translationDefaultProfileKey,
    translationPromptTemplate,
    setTranslationDefaultProfileKey,
    setTranslationPromptTemplate,
    DEFAULT_TRANSLATION_PROFILE_KEY,
    DEFAULT_TRANSLATION_PROMPT_TEMPLATE,
    modelTestSourceText,
    translationTargetLanguage,
    setModelTestSourceText,
    setTranslationTargetLanguage,
    createRequestId,
    modelTestOutputSheet,
    waitForUiPaint,
    LOCAL_AGENT_TRANSLATION_STREAM_EVENT,
    extractStdoutPreviewFromErrorMessage,
    loadModelWorkbenchData,
    setLocalAgentProfiles,
  });

  const {
    skillTreeLoading,
    skillFileReadLoading,
    selectedSkillTree,
    selectedSkillFilePath,
    selectedSkillOverviewRead,
    selectedSkillFileRead,
    selectedSkillTranslationKey,
    selectedSkillOverviewTranslationKey,
    selectedSkillTranslatedText,
    selectedSkillOverviewTranslatedText,
    handleSkillOpen,
    handleLoadSkillTree,
    handleReadSkillFile,
    handleOpenSkillDetail,
    renderSkillTreeNodes,
    handleLeaveSkillDetail,
    handleTranslateSelectedSkillFile,
    handleTranslateSelectedSkillOverview,
  } = useWorkbenchSkillFileHandlers({
    l,
    toast,
    selectedSkillId,
    skillOpenMode,
    setSkillDetailView,
    setSkillOpenMenuOpen,
    setSkillDetailTab,
    selectSkill,
    translationTargetLanguage,
    handleRunModelTranslationTest,
  });

  function handleChangeSettingsCategory(next: SettingsCategory) {
    if (dirty[settingsCategory]) {
      const confirmed = window.confirm(
        l(
          "当前分类有未保存改动，是否继续切换？",
          "Unsaved changes exist in this category. Continue switching?",
        ),
      );
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

  const {
    promptCenter,
    promptDetail,
    generalSettingsPanel,
    dataSettingsPanel,
    modelSettingsPanel,
    aboutPanel,
    modelTestOutputSheetView,
    createPromptDialog,
    promptRunDialog,
    promptVersionDialog,
  } = buildWorkbenchPromptAndSettingsViews({
    l,
    isZh,
    SELECT_BASE_CLASS,
    PROMPTS_PAGE_SIZE,
    activeWorkspaceId,
    fetchPrompts,
    promptsLoading,
    filteredPrompts,
    promptBrowseScope,
    promptQuery,
    setPromptQuery,
    setCreatePromptOpen,
    handleResetPromptBrowseContext,
    promptViewMode,
    pagedPrompts,
    openPromptDetailById,
    formatPromptCategoryLabel,
    toLocalTime,
    promptRun,
    handleTogglePromptFavorite,
    handleDeletePrompt,
    promptSelectedIds,
    runPromptBatchAction,
    promptBatchCategory,
    setPromptBatchCategory,
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
    promptAllCategoryFilter,
    setPromptAllCategoryFilter,
    promptCategoryOptions,
    handleChangePromptBrowseScope,
    setPromptViewMode,
    showPromptContextBar,
    promptBrowseContextLabel,
    setPromptBrowseCategory,
    promptBrowseCategory,
    selectedPrompt,
    promptTranslation,
    detailName,
    setDetailName,
    detailCategory,
    setDetailCategory,
    detailTagsInput,
    setDetailTagsInput,
    detailContent,
    setDetailContent,
    translationTargetLanguage,
    translationTargetLanguageOptions,
    setTranslationTargetLanguage,
    leavePromptDetail,
    handleSavePromptDetail,
    handleOpenPromptVersion,
    createPromptOpen,
    newPromptName,
    newPromptContent,
    setNewPromptName,
    setNewPromptContent,
    handleCreatePrompt,
    uiLanguage: language,
    markdownModeLabels,
    versionModalOpen,
    setVersionModalOpen,
    promptVersionCompareMode,
    setPromptVersionCompareMode,
    setCompareLeftVersion,
    setCompareRightVersion,
    selectedPromptVersions,
    promptVersionPreview,
    compareLeftVersion,
    compareRightVersion,
    selectedPromptPreviewVersion,
    promptCompareLeft,
    promptCompareRight,
    promptDiffStats,
    setPromptVersionPreview,
    togglePromptCompareCandidate,
    handleRestorePromptVersion,
    theme,
    language,
    setTheme,
    setLanguage,
    storageDirDraft,
    settingsTargets,
    distributionTargetDrafts,
    distributionTargetEditingIds,
    newDistributionTargetDraft,
    distributionTargetSavingId,
    setStorageDirDraft,
    setDirty,
    handleSaveStorageDirectory,
    handleUseDefaultStorageDirectory,
    handleOpenStorageDirectoryInFinder,
    handlePickStorageDirectory,
    handlePickNewDistributionTargetDirectory,
    handlePickDistributionTargetDirectory,
    handleDistributionTargetFieldChange,
    handleStartDistributionTargetEdit,
    handleCancelDistributionTargetEdit,
    handleSaveDistributionTarget,
    handleDeleteDistributionTarget,
    handleNewDistributionTargetFieldChange,
    handleCreateDistributionTarget,
    enabledAgentRows,
    availableAgentPresetRows,
    agentConnectionEditingPlatforms,
    agentConnectionSavingId,
    handlePickAgentConnectionRootDir,
    handleAgentConnectionFieldChange,
    handleStartAgentConnectionEdit,
    handleCancelAgentConnectionEdit,
    handleSaveAgentConnection,
    handleEnableAgentPreset,
    handleDisableAgentConnection,
    handleReorderEnabledAgentRows,
    handleRedetectAgentConnection,
    handleRestoreAgentConnectionDefaults,
    modelLoading,
    modelSaving,
    localAgentProfiles,
    selectedModelProfileKey,
    setSelectedModelProfileKey,
    handleDeleteModelProfile,
    modelProfileName,
    setModelProfileName,
    modelExecutable,
    setModelExecutable,
    modelArgsTemplateText,
    setModelArgsTemplateText,
    handleSaveModelProfile,
    newModelProfileName,
    setNewModelProfileName,
    handleAddModelProfile,
    translationDefaultProfileKey,
    modelTestRunning,
    modelScenarioSettingsOpen,
    setModelScenarioSettingsOpen,
    modelScenarioTestOpen,
    setModelScenarioTestOpen,
    handleRestoreDefaultTranslationConfig,
    handleSaveTranslationConfigFromDialog,
    setTranslationDefaultProfileKey,
    translationPromptTemplate,
    setTranslationPromptTemplate,
    modelTestSourceText,
    setModelTestSourceText,
    modelTestResult,
    handleRunModelTranslationTest,
    modelTestOutputSheet,
    appVersion,
    appUpdateStage,
    appUpdateStatusText,
    appUpdateError,
    checkAppUpdates,
    installAppUpdate,
  });
  const promptsModuleController = useWorkbenchPromptsController({
    promptDetailView,
    promptCenter,
    promptDetail,
    createPromptDialog,
    promptRunDialog,
    promptVersionDialog,
  });

  const skillsModuleController = useWorkbenchSkillsController({
    l,
    toast,
    activeWorkspaceId,
    projectBootingMessage,
    skills: skillList,
    managerState,
    managerMode,
    setManagerMode,
    managerLoading,
    managerCalibrating,
    managerExpandedSkillId,
    setManagerExpandedSkillId,
    managerMatrixFilter,
    setManagerMatrixFilter,
    clearManagerRowHint,
    operationsRows,
    operationsMatrixSummaries,
    operationsScanDirectories,
    selectedSkillScanDirectories,
    scanGroups,
    usageAgentFilter,
    usageSourceFilter,
    usageEvidenceSourceFilter,
    usageStatsLoading,
    usageStatsError,
    usageListSyncJob,
    usageDetailSyncJob,
    usageDetailCalls,
    usageDetailCallsTotal,
    usageDetailCallsLoading,
    usageDetailCallsError,
    fetchSkills,
    scanSkills,
    loadManagerState,
    managerBatchLink,
    managerBatchUnlink,
    setUsageFilters,
    refreshUsageStats,
    startListUsageSync,
    dismissListUsageSyncJob,
    startDetailUsageSync,
    loadUsageCalls,
    clearUsageDetail,
    skillsHubSortMode,
    setSkillsHubSortMode,
    onOpenSkillDetail: (skillId) => void handleOpenSkillDetail(skillId),
    resetSkillDetailView: () => setSkillDetailView("list"),
    skillsCenterProps: {
      skillDetailView,
      filteredSkillCount: filteredSkills.length,
      skillsLoading,
      skillQuery,
      setSkillQuery,
      showSkillOpenModeInStatusBar,
      selectBaseClass: SELECT_BASE_CLASS,
      skillOpenMode,
      setSkillOpenMode,
      skillOpenModeOptions,
      onSkillOpen: (skillId, relativePath) =>
        void handleSkillOpen(skillId, relativePath),
      onBackToSkillList: handleLeaveSkillDetail,
      selectedSkill,
      skillDetailTab,
      setSkillDetailTab,
      onReadSkillFile: (skillId, relativePath) =>
        void handleReadSkillFile(skillId, relativePath),
      skillFileReadLoading,
      selectedSkillOverviewRead,
      selectedSkillTree,
      skillTreeLoading,
      onLoadSkillTree: (skillId, force) =>
        void handleLoadSkillTree(skillId, force),
      renderSkillTreeNodes,
      selectedSkillFilePath,
      selectedSkillFileRead,
      selectedSkillOverviewTranslationKey,
      selectedSkillOverviewTranslatedText,
      selectedSkillTranslationKey,
      selectedSkillTranslatedText,
      isZh,
      translationTargetLanguage,
      translationTargetLanguageOptions,
      modelTestRunning,
      setTranslationTargetLanguage,
      onTranslateSkillOverview: handleTranslateSelectedSkillOverview,
      onTranslateSkillFile: handleTranslateSelectedSkillFile,
      shouldUseMarkdownPreview,
    },
  });

  const agentsModuleController = useWorkbenchAgentsController({
    l,
    isZh,
    toast,
    activeWorkspaceId,
    projectBootingMessage,
    agentAssets,
    agentTagsByAsset,
    agentVersionsByAsset,
    agentConnections,
    agentRulesError,
    selectedAssetId,
    setSelectedAssetId,
    clearAgentRulesError,
    loadAgentModuleData,
    loadAgentVersions,
    createAgentAsset,
    renameAgentAsset,
    deleteAgentAsset,
    publishAgentVersion,
    rollbackAgentRuleVersion,
    refreshAgentAsset,
    runAgentDistribution,
    translationTargetLanguage,
    translationTargetLanguageOptions,
    modelTestRunning,
    setTranslationTargetLanguage,
    handleRunModelTranslationTest,
    toLocalTime,
  });

  const settingsModuleController = useWorkbenchSettingsController({
    l,
    settingCategories,
    settingsCategory,
    settingsLoading,
    onChangeSettingsCategory: handleChangeSettingsCategory,
    generalPanel: generalSettingsPanel,
    dataPanel: dataSettingsPanel,
    modelPanel: modelSettingsPanel,
    aboutPanel,
  });
  const usageModuleController = useWorkbenchUsageController({
    l,
  });
  const channelTestModuleController = useWorkbenchChannelTestController({
    l,
    activeWorkspaceId,
  });

  const center =
    activeModule === "prompts"
      ? promptsModuleController.module
      : activeModule === "skills"
        ? skillsModuleController.module
        : activeModule === "usage"
          ? usageModuleController.module
          : activeModule === "channelTest"
            ? channelTestModuleController.module
            : activeModule === "agents"
              ? agentsModuleController.module
              : settingsModuleController.module;
  const skillOpenModeStatusBar = showSkillOpenModeInStatusBar ? (
    <SkillOpenModeStatusBar
      skillOpenMenuRef={skillOpenMenuRef}
      skillOpenMenuOpen={skillOpenMenuOpen}
      setSkillOpenMenuOpen={setSkillOpenMenuOpen}
      skillOpenMode={skillOpenMode}
      setSkillOpenMode={setSkillOpenMode}
      skillOpenModeLabel={skillOpenModeLabel}
      selectedSkillOpenModeOption={selectedSkillOpenModeOption}
      skillOpenModeOptions={skillOpenModeOptions}
    />
  ) : null;
  const detail = <div className="h-full" />;
  const semiLocale = language === "zh-CN" ? zhCN : enUS;

  useEffect(() => {
    document.body.setAttribute("theme-mode", theme);
    return () => {
      document.body.removeAttribute("theme-mode");
    };
  }, [theme]);

  return (
    <LocaleProvider locale={semiLocale}>
      <AppShell
        activeModule={activeModule}
        language={language}
        onChangeModule={(module) => {
          setActiveModule(module);
          setPromptDetailView("list");
          selectPrompt(null);
          skillsModuleController.resetTransientState();
          setMobileDetailOpen(false);
        }}
        promptCount={promptList.length}
        skillCount={skillList.length}
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

      {skillsModuleController.linkConfirmDialog}
      {skillsModuleController.usageTimelineDialog}
      {modelTestOutputSheetView}
    </LocaleProvider>
  );
}
