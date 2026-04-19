import { useMemo } from "react";

import { AgentsCenter } from "../../../features/agents/components/AgentsCenter";
import { AgentDistributionDialog } from "../../../features/agents/dialogs/AgentDistributionDialog";
import { AgentRuleEditorDialog } from "../../../features/agents/dialogs/AgentRuleEditorDialog";
import { AgentVersionDialog } from "../../../features/agents/dialogs/AgentVersionDialog";
import { AgentsModule } from "../../../features/agents/module/AgentsModule";
import type {
  AgentRuleAsset,
  AgentRuleConnection,
  AgentRuleTag,
  AgentRuleVersion,
} from "../../../shared/stores/agentRulesStore/types";
import type { LocalAgentTranslationTestResult } from "../../../shared/types";

type TranslationTargetLanguageOption = {
  value: string;
  label: string;
};

type UseWorkbenchAgentsModuleViewInput = {
  l: (zh: string, en: string) => string;
  isZh: boolean;
  activeWorkspaceId: string | null;
  agentAssets: AgentRuleAsset[];
  agentTagsByAsset: Record<string, AgentRuleTag[]>;
  agentConnections: AgentRuleConnection[];
  agentRulesError: string | null;
  selectedAssetId: string | null;
  selectedAgentAsset: AgentRuleAsset | null;
  clearAgentRulesError: () => void;
  setSelectedAssetId: (assetId: string | null) => void;
  setCreatingAgentAsset: (value: boolean) => void;
  agentQuery: string;
  setAgentQuery: (value: string) => void;
  filteredAgentAssets: AgentRuleAsset[];
  pagedAgentAssets: AgentRuleAsset[];
  deleteConfirmAssetId: string | null;
  setDeleteConfirmAssetId: (updater: string | null | ((prev: string | null) => string | null)) => void;
  handleDeleteAgentRuleAsset: (assetId: string, assetName: string) => Promise<void>;
  handleRefreshAgentModule: () => Promise<void>;
  handleCreateNewAgentAsset: () => void;
  openAgentRuleEditor: (assetId: string) => Promise<void>;
  handleOpenAgentVersionDiff: (assetId: string) => Promise<void>;
  toLocalTime: (value: string | null | undefined) => string;
  agentRulesPage: number;
  setAgentRulesPage: (updater: number | ((prev: number) => number) ) => void;
  totalAgentPages: number;
  agentRulesPageSize: number;
  agentVersionModalOpen: boolean;
  setAgentVersionModalOpen: (open: boolean) => void;
  agentVersionCompareMode: boolean;
  setAgentVersionCompareMode: (enabled: boolean) => void;
  agentCompareLeftVersion: string;
  setAgentCompareLeftVersion: (value: string) => void;
  agentCompareRightVersion: string;
  setAgentCompareRightVersion: (value: string) => void;
  selectedAgentVersions: AgentRuleVersion[];
  agentVersionPreview: string;
  setAgentVersionPreview: (value: string) => void;
  toggleAgentCompareCandidate: (version: string) => void;
  selectedAgentPreviewVersion: AgentRuleVersion | null;
  agentCompareLeft: AgentRuleVersion | null;
  agentCompareRight: AgentRuleVersion | null;
  agentDiffStats: { added: number; removed: number };
  handleRestoreAgentRuleVersion: (version: string) => Promise<void>;
  agentRuleEditorModalOpen: boolean;
  setAgentRuleEditorModalOpen: (open: boolean) => void;
  creatingAgentAsset: boolean;
  agentAssetNameInput: string;
  setAgentAssetNameInput: (value: string) => void;
  agentEditorContent: string;
  setAgentEditorContent: (value: string) => void;
  agentRuleTranslatedText: string;
  setAgentRuleTranslatedText: (value: string) => void;
  translationTargetLanguage: string;
  translationTargetLanguageOptions: TranslationTargetLanguageOption[];
  modelTestRunning: boolean;
  setTranslationTargetLanguage: (value: string) => void;
  handleRunModelTranslationTest: (input: {
    sourceText: string;
    targetLanguage: string;
    syncModelTestForm: boolean;
  }) => Promise<LocalAgentTranslationTestResult | null>;
  handleSaveAgentRuleVersion: () => Promise<void>;
  agentDistributionModalOpen: boolean;
  setAgentDistributionModalOpen: (open: boolean) => void;
  agentTargetIds: string[];
  setAgentTargetIds: (updater: string[] | ((prev: string[]) => string[])) => void;
  defaultAgentRuleFile: (platform: string) => string;
  joinRuleFilePath: (rootDir: string, ruleFile: string) => string;
  handleRunAgentDistribution: () => Promise<void>;
};

export function useWorkbenchAgentsModuleView({
  l,
  isZh,
  activeWorkspaceId,
  agentAssets,
  agentTagsByAsset,
  agentConnections,
  agentRulesError,
  selectedAssetId,
  selectedAgentAsset,
  clearAgentRulesError,
  setSelectedAssetId,
  setCreatingAgentAsset,
  agentQuery,
  setAgentQuery,
  filteredAgentAssets,
  pagedAgentAssets,
  deleteConfirmAssetId,
  setDeleteConfirmAssetId,
  handleDeleteAgentRuleAsset,
  handleRefreshAgentModule,
  handleCreateNewAgentAsset,
  openAgentRuleEditor,
  handleOpenAgentVersionDiff,
  toLocalTime,
  agentRulesPage,
  setAgentRulesPage,
  totalAgentPages,
  agentRulesPageSize,
  agentVersionModalOpen,
  setAgentVersionModalOpen,
  agentVersionCompareMode,
  setAgentVersionCompareMode,
  agentCompareLeftVersion,
  setAgentCompareLeftVersion,
  agentCompareRightVersion,
  setAgentCompareRightVersion,
  selectedAgentVersions,
  agentVersionPreview,
  setAgentVersionPreview,
  toggleAgentCompareCandidate,
  selectedAgentPreviewVersion,
  agentCompareLeft,
  agentCompareRight,
  agentDiffStats,
  handleRestoreAgentRuleVersion,
  agentRuleEditorModalOpen,
  setAgentRuleEditorModalOpen,
  creatingAgentAsset,
  agentAssetNameInput,
  setAgentAssetNameInput,
  agentEditorContent,
  setAgentEditorContent,
  agentRuleTranslatedText,
  setAgentRuleTranslatedText,
  translationTargetLanguage,
  translationTargetLanguageOptions,
  modelTestRunning,
  setTranslationTargetLanguage,
  handleRunModelTranslationTest,
  handleSaveAgentRuleVersion,
  agentDistributionModalOpen,
  setAgentDistributionModalOpen,
  agentTargetIds,
  setAgentTargetIds,
  defaultAgentRuleFile,
  joinRuleFilePath,
  handleRunAgentDistribution,
}: UseWorkbenchAgentsModuleViewInput) {
  const agentsCenter = (
    <AgentsCenter
      l={l}
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
      agentRulesPageSize={agentRulesPageSize}
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

  const module = useMemo(
    () => (
      <AgentsModule
        agentsCenter={agentsCenter}
        agentVersionDialog={agentVersionDialog}
        agentRuleEditorDialog={agentRuleEditorDialog}
        agentDistributionDialog={agentDistributionDialog}
      />
    ),
    [agentDistributionDialog, agentRuleEditorDialog, agentVersionDialog, agentsCenter],
  );

  return { module };
}
