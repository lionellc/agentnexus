import { useMemo, useState } from "react";

import {
  SkillsConfigPanel,
  type SkillsConfigGroup,
} from "../../../features/skills/components/SkillsConfigPanel";
import { SkillsCenter, type SkillsCenterProps } from "../../../features/skills/components/SkillsCenter";
import { SkillsOperationsPanel } from "../../../features/skills/components/SkillsOperationsPanel";
import { SkillsModule } from "../../../features/skills/module/SkillsModule";
import type { SkillsHubSortMode } from "../../../shared/stores/shellStore";
import type {
  SkillsManagerMatrixFilter,
  SkillsManagerMatrixSummary,
  SkillsManagerMode,
  SkillsManagerOperationsRow,
  SkillsManagerState,
  SkillsUsageCallItem,
  SkillsUsageSyncJobSnapshot,
} from "../../../shared/types";
import type { ToastOptions } from "../../../shared/ui";

import { useSkillsOperationsActions } from "./useSkillsOperationsActions";
import { useSkillsUsageTimelineController } from "./useSkillsUsageTimelineController";

type SkillsCenterExternalProps = Omit<
  SkillsCenterProps,
  | "managerMode"
  | "setManagerMode"
  | "operationsPanel"
  | "configPanel"
  | "onScanSkills"
  | "onRefreshSkills"
  | "onOpenUsageTimeline"
  | "l"
>;

type UseWorkbenchSkillsControllerInput = {
  l: (zh: string, en: string) => string;
  toast: (options: ToastOptions) => string;
  activeWorkspaceId: string | null;
  projectBootingMessage: string;
  skills: Array<{ id: string; name: string }>;
  managerState: SkillsManagerState | null;
  managerMode: SkillsManagerMode;
  setManagerMode: (value: SkillsManagerMode) => void;
  managerLoading: boolean;
  managerCalibrating: boolean;
  managerExpandedSkillId: string | null;
  setManagerExpandedSkillId: (skillId: string | null) => void;
  managerMatrixFilter: SkillsManagerMatrixFilter;
  setManagerMatrixFilter: (next: Partial<SkillsManagerMatrixFilter>) => void;
  clearManagerRowHint: (skillId: string) => void;
  operationsRows: SkillsManagerOperationsRow[];
  operationsMatrixSummaries: SkillsManagerMatrixSummary[];
  operationsScanDirectories: string[];
  selectedSkillScanDirectories: string[];
  scanGroups: SkillsConfigGroup[];
  usageAgentFilter: string;
  usageSourceFilter: string;
  usageEvidenceSourceFilter: string;
  usageStatsLoading: boolean;
  usageStatsError: string;
  usageListSyncJob: SkillsUsageSyncJobSnapshot | null;
  usageDetailSyncJob: SkillsUsageSyncJobSnapshot | null;
  usageDetailCalls: SkillsUsageCallItem[];
  usageDetailCallsTotal: number;
  usageDetailCallsLoading: boolean;
  usageDetailCallsError: string;
  fetchSkills: () => Promise<void>;
  scanSkills: (workspaceId: string, roots?: string[]) => Promise<void>;
  loadManagerState: (workspaceId: string) => Promise<void>;
  managerBatchLink: (workspaceId: string, skillIds: string[], tool: string, force?: boolean) => Promise<void>;
  managerBatchUnlink: (workspaceId: string, skillIds: string[], tool: string) => Promise<void>;
  setUsageFilters: (next: { agent?: string; source?: string; evidenceSource?: string }) => void;
  refreshUsageStats: (workspaceId: string) => Promise<void>;
  startListUsageSync: (workspaceId: string) => Promise<void>;
  dismissListUsageSyncJob: () => void;
  startDetailUsageSync: (workspaceId: string, skillId: string) => Promise<void>;
  loadUsageCalls: (workspaceId: string, skillId: string) => Promise<void>;
  clearUsageDetail: () => void;
  onOpenSkillDetail: (skillId: string) => void;
  resetSkillDetailView: () => void;
  skillsHubSortMode: SkillsHubSortMode;
  setSkillsHubSortMode: (mode: SkillsHubSortMode) => void;
  skillsCenterProps: SkillsCenterExternalProps;
};

export function useWorkbenchSkillsController({
  l,
  toast,
  activeWorkspaceId,
  projectBootingMessage,
  skills,
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
  onOpenSkillDetail,
  resetSkillDetailView,
  skillsHubSortMode,
  setSkillsHubSortMode,
  skillsCenterProps,
}: UseWorkbenchSkillsControllerInput) {
  const [scanPhase, setScanPhase] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [scanMessage, setScanMessage] = useState("");

  const operationsController = useSkillsOperationsActions({
    l,
    toast,
    activeWorkspaceId,
    projectBootingMessage,
    managerState,
    fetchSkills,
    loadManagerState,
    managerBatchLink,
    managerBatchUnlink,
  });

  const usageController = useSkillsUsageTimelineController({
    l,
    toast,
    activeWorkspaceId,
    projectBootingMessage,
    skills,
    usageAgentFilter,
    usageSourceFilter,
    usageEvidenceSourceFilter,
    usageDetailSyncJob,
    usageDetailCalls,
    usageDetailCallsTotal,
    usageDetailCallsLoading,
    usageDetailCallsError,
    setUsageFilters,
    refreshUsageStats,
    startListUsageSync,
    startDetailUsageSync,
    loadUsageCalls,
    clearUsageDetail,
  });

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
      await refreshUsageStats(activeWorkspaceId);
    } catch (error) {
      toast({
        title: l("刷新失败", "Refresh failed"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
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

  const skillsOperationsPanel = (
    <SkillsOperationsPanel
      rows={operationsRows}
      matrixSummaries={operationsMatrixSummaries}
      matrixFilter={managerMatrixFilter}
      skillQuery={skillsCenterProps.skillQuery}
      onSkillQueryChange={skillsCenterProps.setSkillQuery}
      onRefreshSkills={() => void handleRefreshSkills()}
      skillsLoading={skillsCenterProps.skillsLoading}
      usageAgentFilter={usageAgentFilter}
      usageSourceFilter={usageSourceFilter}
      usageEvidenceSourceFilter={usageEvidenceSourceFilter}
      usageStatsLoading={usageStatsLoading}
      usageStatsError={usageStatsError}
      usageSyncJob={usageListSyncJob}
      onDismissUsageSyncJob={dismissListUsageSyncJob}
      sortMode={skillsHubSortMode}
      onSortModeChange={setSkillsHubSortMode}
      expandedSkillId={managerExpandedSkillId}
      runningDistribution={managerLoading || managerCalibrating}
      onUsageFilterChange={usageController.handleUsageFilterChange}
      onUsageRefresh={() => usageController.handleRefreshUsageAnalysis()}
      onMatrixFilterChange={(next) => setManagerMatrixFilter(next)}
      onToggleExpanded={(skillId) => setManagerExpandedSkillId(skillId)}
      onOpenSkillDetail={(skillId) => void onOpenSkillDetail(skillId)}
      onRunDistribution={(skillId, tools) => operationsController.handleOperationsDistribute(skillId, tools)}
      onRunBulkLink={(plans) => operationsController.handleOperationsBulkLink(plans)}
      onRunLink={(skillId, tool) => operationsController.handleManagerLinkSkill(skillId, tool)}
      onRunUnlink={(skillId, tool) => operationsController.handleManagerUnlinkSkill(skillId, tool)}
      onPurgeSkill={(skillId, skillName) => operationsController.handleManagerPurgeSkill(skillId, skillName)}
      purgingSkillId={operationsController.managerPurgingSkillId}
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
      onScanSkills={() => void handleScanSkills()}
      l={l}
    />
  );

  const skillsCenter = (
    <SkillsCenter
      managerMode={managerMode}
      setManagerMode={(value) => setManagerMode(value)}
      operationsPanel={skillsOperationsPanel}
      configPanel={skillsConfigPanel}
      onScanSkills={() => void handleScanSkills()}
      onRefreshSkills={() => void handleRefreshSkills()}
      onOpenUsageTimeline={(skillId) => void usageController.handleOpenUsageTimeline(skillId)}
      l={l}
      {...skillsCenterProps}
    />
  );

  const module = useMemo(
    () => (
      <SkillsModule
        skillsCenter={skillsCenter}
        managerMode={managerMode}
        setManagerMode={setManagerMode}
      />
    ),
    [managerMode, setManagerMode, skillsCenter],
  );

  function resetTransientState() {
    resetSkillDetailView();
    usageController.resetUsageTimeline();
  }

  return {
    module,
    linkConfirmDialog: operationsController.linkConfirmDialog,
    usageTimelineDialog: usageController.usageTimelineDialog,
    resetTransientState,
  };
}
