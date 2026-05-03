import { CreatePromptDialog } from "../../../features/prompts/dialogs/CreatePromptDialog";
import { PromptRunDialog } from "../../../features/prompts/dialogs/PromptRunDialog";
import { PromptVersionDialog } from "../../../features/prompts/dialogs/PromptVersionDialog";
import { PromptCenter } from "../../../features/prompts/components/PromptCenter";
import { PromptDetail } from "../../../features/prompts/components/PromptDetail";
import { GeneralSettingsPanel } from "../../../features/settings/components/GeneralSettingsPanel";
import { DataSettingsPanel } from "../../../features/settings/components/DataSettingsPanel";
import { AboutPanel } from "../../../features/settings/components/AboutPanel";
import { ModelSettingsPanel } from "../../../features/settings/components/ModelSettingsPanel";
import { buildModelTestOutputSheetView } from "./workbenchPromptAndSettingsViews.modelTestOutputSheet";

export function buildWorkbenchPromptAndSettingsViews(args: any) {
  const {
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
    uiLanguage,
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
  } = args;

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
      onPickStorageDirectory={() => void handlePickStorageDirectory()}
      onPickNewDistributionTargetDirectory={() => void handlePickNewDistributionTargetDirectory()}
      onPickDistributionTargetDirectory={(targetId) => void handlePickDistributionTargetDirectory(targetId)}
      onDistributionTargetFieldChange={handleDistributionTargetFieldChange}
      onStartDistributionTargetEdit={handleStartDistributionTargetEdit}
      onCancelDistributionTargetEdit={handleCancelDistributionTargetEdit}
      onSaveDistributionTarget={(targetId) => void handleSaveDistributionTarget(targetId)}
      onDeleteDistributionTarget={(targetId) => void handleDeleteDistributionTarget(targetId)}
      onNewDistributionTargetFieldChange={handleNewDistributionTargetFieldChange}
      onCreateDistributionTarget={() => void handleCreateDistributionTarget()}
      enabledAgentRows={enabledAgentRows}
      availableAgentPresetRows={availableAgentPresetRows}
      agentConnectionEditingPlatforms={agentConnectionEditingPlatforms}
      agentConnectionSavingId={agentConnectionSavingId}
      onEnableAgentPreset={(platform) => void handleEnableAgentPreset(platform)}
      onReorderEnabledAgentRows={(orderedPlatforms) =>
        handleReorderEnabledAgentRows(orderedPlatforms)
      }
      onPickAgentConnectionRootDir={(platform) => void handlePickAgentConnectionRootDir(platform)}
      onAgentConnectionFieldChange={handleAgentConnectionFieldChange}
      onStartAgentConnectionEdit={handleStartAgentConnectionEdit}
      onCancelAgentConnectionEdit={handleCancelAgentConnectionEdit}
      onSaveAgentConnection={(platform) => void handleSaveAgentConnection(platform)}
      onDisableAgentConnection={(platform) => void handleDisableAgentConnection(platform)}
      onRedetectAgentConnection={(platform) => void handleRedetectAgentConnection(platform)}
      onRestoreAgentConnectionDefaults={(platform) =>
        void handleRestoreAgentConnectionDefaults(platform)
      }
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
      newModelProfileName={newModelProfileName}
      onNewModelProfileNameChange={setNewModelProfileName}
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
      onRunModelTranslationTest={async () => {
        await handleRunModelTranslationTest();
      }}
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

  const modelTestOutputSheetView = buildModelTestOutputSheetView({
    l,
    modelTestOutputSheet,
  });

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

  return {
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
  };
}
