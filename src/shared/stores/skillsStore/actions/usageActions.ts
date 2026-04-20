import { skillsUsageApi } from "../../../services/api";

import {
  USAGE_SYNC_POLL_INTERVAL_MS,
  USAGE_SYNC_TERMINAL_STATUS,
} from "../constants";
import { isUsageSyncRunning, normalizeUsageFilter } from "../selectors";
import type { SkillsState, SkillsStoreGet, SkillsStoreSet } from "../types";
import type { SkillsUsageSyncJobSnapshot } from "../../../types";

type SkillsUsageActions = Pick<
  SkillsState,
  | "setUsageFilters"
  | "refreshUsageStats"
  | "startListUsageSync"
  | "dismissListUsageSyncJob"
  | "startDetailUsageSync"
  | "loadUsageCalls"
  | "clearUsageDetail"
>;

export function createUsageActions(set: SkillsStoreSet, get: SkillsStoreGet): SkillsUsageActions {
  const pollUsageSyncJob = async (
    scope: "list" | "detail",
    workspaceId: string,
    jobId: string,
    skillId?: string,
  ) => {
    let keepPolling = true;
    while (keepPolling) {
      await new Promise((resolve) => window.setTimeout(resolve, USAGE_SYNC_POLL_INTERVAL_MS));
      try {
        const snapshot = await skillsUsageApi.syncProgress({ workspaceId, jobId });
        if (scope === "list") {
          set({ usageListSyncJob: snapshot });
        } else {
          set({ usageDetailSyncJob: snapshot });
        }

        if (USAGE_SYNC_TERMINAL_STATUS.has(snapshot.status)) {
          await get().refreshUsageStats(workspaceId).catch(() => undefined);
          if (scope === "detail" && skillId) {
            await get().loadUsageCalls(workspaceId, skillId).catch(() => undefined);
          }
          keepPolling = false;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "读取分析进度失败";
        const failedSnapshot = {
          jobId,
          workspaceId,
          status: "failed",
          totalFiles: 0,
          processedFiles: 0,
          parsedEvents: 0,
          insertedEvents: 0,
          duplicateEvents: 0,
          parseFailures: 0,
          currentSource: "",
          errorMessage: message,
          startedAt: "",
          updatedAt: "",
        } satisfies SkillsUsageSyncJobSnapshot;

        if (scope === "list") {
          set({ usageListSyncJob: failedSnapshot, usageStatsError: message });
        } else {
          set({ usageDetailSyncJob: failedSnapshot, usageDetailCallsError: message });
        }
        keepPolling = false;
      }
    }
  };

  return {
    setUsageFilters: ({ agent, source, evidenceSource }) =>
      set((state) => ({
        usageAgentFilter: agent === undefined ? state.usageAgentFilter : agent,
        usageSourceFilter: source === undefined ? state.usageSourceFilter : source,
        usageEvidenceSourceFilter:
          evidenceSource === undefined ? state.usageEvidenceSourceFilter : evidenceSource,
      })),
    refreshUsageStats: async (workspaceId) => {
      set({ usageStatsLoading: true, usageStatsError: "" });
      try {
        const { usageAgentFilter, usageSourceFilter, usageEvidenceSourceFilter } = get();
        const result = await skillsUsageApi.queryStats({
          workspaceId,
          agent: normalizeUsageFilter(usageAgentFilter),
          source: normalizeUsageFilter(usageSourceFilter),
          evidenceSource: normalizeUsageFilter(usageEvidenceSourceFilter),
        });
        const usageStatsBySkillId = result.rows.reduce<Record<string, (typeof result.rows)[number]>>(
          (acc, row) => {
            acc[row.skillId] = row;
            return acc;
          },
          {},
        );
        set({ usageStatsBySkillId });
      } catch (error) {
        set({
          usageStatsError: error instanceof Error ? error.message : "读取调用统计失败",
        });
        throw error;
      } finally {
        set({ usageStatsLoading: false });
      }
    },
    startListUsageSync: async (workspaceId) => {
      const currentJob = get().usageListSyncJob;
      if (isUsageSyncRunning(currentJob)) {
        return;
      }
      const snapshot = await skillsUsageApi.syncStart({ workspaceId });
      set({ usageListSyncJob: snapshot, usageStatsError: "" });
      void pollUsageSyncJob("list", workspaceId, snapshot.jobId);
    },
    dismissListUsageSyncJob: () =>
      set({
        usageListSyncJob: null,
      }),
    startDetailUsageSync: async (workspaceId, skillId) => {
      const currentJob = get().usageDetailSyncJob;
      if (isUsageSyncRunning(currentJob)) {
        return;
      }
      const snapshot = await skillsUsageApi.syncStart({ workspaceId });
      set({
        usageDetailSyncJob: snapshot,
        usageDetailSkillId: skillId,
        usageDetailCallsError: "",
      });
      void pollUsageSyncJob("detail", workspaceId, snapshot.jobId, skillId);
    },
    loadUsageCalls: async (workspaceId, skillId) => {
      set({
        usageDetailSkillId: skillId,
        usageDetailCallsLoading: true,
        usageDetailCallsError: "",
      });
      try {
        const { usageAgentFilter, usageSourceFilter, usageEvidenceSourceFilter } = get();
        const result = await skillsUsageApi.queryCalls({
          workspaceId,
          skillId,
          agent: normalizeUsageFilter(usageAgentFilter),
          source: normalizeUsageFilter(usageSourceFilter),
          evidenceSource: normalizeUsageFilter(usageEvidenceSourceFilter),
          limit: 120,
          offset: 0,
        });
        set({
          usageDetailCalls: result.items,
          usageDetailCallsTotal: result.total,
        });
      } catch (error) {
        set({
          usageDetailCallsError: error instanceof Error ? error.message : "读取调用记录失败",
        });
        throw error;
      } finally {
        set({ usageDetailCallsLoading: false });
      }
    },
    clearUsageDetail: () =>
      set({
        usageDetailSkillId: null,
        usageDetailCalls: [],
        usageDetailCallsTotal: 0,
        usageDetailCallsLoading: false,
        usageDetailCallsError: "",
        usageDetailSyncJob: null,
      }),
  };
}
