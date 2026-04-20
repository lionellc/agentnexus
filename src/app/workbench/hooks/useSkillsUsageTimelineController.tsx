import { useEffect, useMemo, useState, type ReactElement } from "react";

import { SkillUsageTimelineDialog } from "../../../features/skills/components/SkillUsageTimelineDialog";
import type { SkillsUsageCallItem, SkillsUsageSyncJobSnapshot } from "../../../shared/types";
import { type ToastOptions } from "../../../shared/ui";

type UseSkillsUsageTimelineControllerInput = {
  l: (zh: string, en: string) => string;
  toast: (options: ToastOptions) => string;
  activeWorkspaceId: string | null;
  projectBootingMessage: string;
  skills: Array<{ id: string; name: string }>;
  usageAgentFilter: string;
  usageSourceFilter: string;
  usageEvidenceSourceFilter: string;
  usageDetailSyncJob: SkillsUsageSyncJobSnapshot | null;
  usageDetailCalls: SkillsUsageCallItem[];
  usageDetailCallsTotal: number;
  usageDetailCallsLoading: boolean;
  usageDetailCallsError: string;
  setUsageFilters: (next: { agent?: string; source?: string; evidenceSource?: string }) => void;
  refreshUsageStats: (workspaceId: string) => Promise<void>;
  startListUsageSync: (workspaceId: string) => Promise<void>;
  startDetailUsageSync: (workspaceId: string, skillId: string) => Promise<void>;
  loadUsageCalls: (workspaceId: string, skillId: string) => Promise<void>;
  clearUsageDetail: () => void;
};

export function useSkillsUsageTimelineController({
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
}: UseSkillsUsageTimelineControllerInput) {
  const [usageTimelineOpen, setUsageTimelineOpen] = useState(false);
  const [usageTimelineSkillId, setUsageTimelineSkillId] = useState<string | null>(null);

  const usageTimelineSkill = useMemo(
    () => skills.find((item) => item.id === usageTimelineSkillId) ?? null,
    [skills, usageTimelineSkillId],
  );

  async function handleRefreshUsageAnalysis() {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    try {
      await startListUsageSync(activeWorkspaceId);
    } catch (error) {
      toast({
        title: l("启动分析失败", "Failed to start analysis"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  function handleUsageFilterChange(next: { agent?: string; source?: string; evidenceSource?: string }) {
    setUsageFilters(next);
  }

  async function handleOpenUsageTimeline(skillId: string) {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    setUsageTimelineSkillId(skillId);
    setUsageTimelineOpen(true);
    try {
      await loadUsageCalls(activeWorkspaceId, skillId);
    } catch (error) {
      toast({
        title: l("读取调用记录失败", "Failed to load call history"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  async function handleRefreshUsageTimeline() {
    if (!activeWorkspaceId || !usageTimelineSkillId) {
      return;
    }
    try {
      await startDetailUsageSync(activeWorkspaceId, usageTimelineSkillId);
    } catch (error) {
      toast({
        title: l("启动分析失败", "Failed to start analysis"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  function resetUsageTimeline() {
    setUsageTimelineOpen(false);
    setUsageTimelineSkillId(null);
    clearUsageDetail();
  }

  useEffect(() => {
    if (!activeWorkspaceId) {
      return;
    }
    void refreshUsageStats(activeWorkspaceId).catch(() => undefined);
    if (usageTimelineOpen && usageTimelineSkillId) {
      void loadUsageCalls(activeWorkspaceId, usageTimelineSkillId).catch(() => undefined);
    }
  }, [
    activeWorkspaceId,
    loadUsageCalls,
    refreshUsageStats,
    usageAgentFilter,
    usageSourceFilter,
    usageEvidenceSourceFilter,
    usageTimelineOpen,
    usageTimelineSkillId,
  ]);

  const usageTimelineDialog: ReactElement = (
    <SkillUsageTimelineDialog
      open={usageTimelineOpen && usageTimelineSkill !== null}
      onOpenChange={(open) => {
        setUsageTimelineOpen(open);
        if (!open) {
          setUsageTimelineSkillId(null);
          clearUsageDetail();
        }
      }}
      skillName={usageTimelineSkill?.name ?? "-"}
      total={usageDetailCallsTotal}
      items={usageDetailCalls}
      loading={usageDetailCallsLoading}
      errorMessage={usageDetailCallsError}
      syncJob={usageDetailSyncJob}
      onRefresh={() => void handleRefreshUsageTimeline()}
      l={l}
    />
  );

  return {
    usageTimelineDialog,
    handleRefreshUsageAnalysis,
    handleUsageFilterChange,
    handleOpenUsageTimeline,
    resetUsageTimeline,
  };
}
