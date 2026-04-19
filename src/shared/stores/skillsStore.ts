import { create } from "zustand";

import { skillsApi, skillsManagerApi, skillsUsageApi } from "../services/api";
import type {
  SkillAsset,
  SkillManagerStatus,
  SkillsUsageCallItem,
  SkillsUsageStatsRow,
  SkillsUsageSyncJobSnapshot,
  SkillsAssetDetail,
  SkillsBatchResult,
  SkillsManagerBatchResult,
  SkillsManagerMatrixFilter,
  SkillsManagerMatrixSummary,
  SkillsManagerMode,
  SkillsManagerOperationsRow,
  SkillsManagerRuleValue,
  SkillsManagerState,
  SkillsManagerToolRuleValue,
} from "../types";

const EMPTY_BATCH_SUMMARY = { total: 0, success: 0, failed: 0, unknown: 0 } as const;
const EMPTY_MANAGER_BATCH_SUMMARY = { total: 0, success: 0, failed: 0 } as const;
const MANAGER_STATUS_LIST: SkillManagerStatus[] = [
  "linked",
  "missing",
  "blocked",
  "wrong",
  "directory",
  "manual",
];
const USAGE_SYNC_TERMINAL_STATUS = new Set(["completed", "completed_with_errors", "failed"]);
const USAGE_SYNC_POLL_INTERVAL_MS = 650;

type OptimisticMap = Record<string, Record<string, SkillManagerStatus>>;

function normalizeUsageFilter(value: string | undefined | null): string | undefined {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : undefined;
}

function isUsageSyncRunning(job: SkillsUsageSyncJobSnapshot | null): boolean {
  return job?.status === "running";
}

function nextManagerStateWithPatch(
  managerState: SkillsManagerState | null,
  skillIds: string[],
  tool: string,
  status: SkillManagerStatus,
): SkillsManagerState | null {
  if (!managerState) {
    return managerState;
  }
  if (skillIds.length === 0 || !tool) {
    return managerState;
  }
  const selected = new Set(skillIds);
  return {
    ...managerState,
    skills: managerState.skills.map((skill) =>
      selected.has(skill.id)
        ? {
            ...skill,
            statusByTool: {
              ...skill.statusByTool,
              [tool]: status,
            },
          }
        : skill,
    ),
  };
}

function mergeOptimisticMap(
  previous: OptimisticMap,
  skillIds: string[],
  tool: string,
  status: SkillManagerStatus,
): OptimisticMap {
  if (skillIds.length === 0 || !tool) {
    return previous;
  }
  const next: OptimisticMap = { ...previous };
  for (const skillId of skillIds) {
    next[skillId] = {
      ...(next[skillId] ?? {}),
      [tool]: status,
    };
  }
  return next;
}

function buildCalibrationHints(
  managerState: SkillsManagerState | null,
  optimisticMap: OptimisticMap,
): Record<string, string> {
  if (!managerState) {
    return {};
  }
  const byId = new Map(managerState.skills.map((skill) => [skill.id, skill]));
  const hints: Record<string, string> = {};

  for (const [skillId, expectedByTool] of Object.entries(optimisticMap)) {
    const skill = byId.get(skillId);
    if (!skill) {
      continue;
    }
    const mismatchedTools = Object.entries(expectedByTool)
      .filter(([tool, expected]) => (skill.statusByTool[tool] ?? "missing") !== expected)
      .map(([tool]) => tool);
    if (mismatchedTools.length > 0) {
      hints[skillId] = `校准后状态不一致：${mismatchedTools.join(", ")}`;
    }
  }

  return hints;
}

function toOperationsRows(
  managerState: SkillsManagerState | null,
  rowHints: Record<string, string>,
  usageStatsBySkillId: Record<string, SkillsUsageStatsRow>,
): SkillsManagerOperationsRow[] {
  if (!managerState) {
    return [];
  }

  return [...managerState.skills]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((skill) => {
      const statusCells = managerState.tools.map((tool) => ({
        tool: tool.tool,
        status: (skill.statusByTool[tool.tool] ?? "missing") as SkillManagerStatus,
      }));
      const linkedCount = statusCells.filter((item) => item.status === "linked").length;
      const totalCount = statusCells.length;
      const sourceMissing = Boolean(skill.sourceMissing);
      const issueCount = totalCount - linkedCount + (sourceMissing ? 1 : 0);
      const usageStats = usageStatsBySkillId[skill.id];

      return {
        id: skill.id,
        name: skill.name,
        group: skill.group,
        source: skill.source,
        localPath: skill.localPath,
        sourceMissing,
        conflict: skill.conflict,
        linkedCount,
        totalCount,
        issueCount,
        statusCells,
        statusPreview: statusCells.slice(0, 3),
        hiddenStatusCount: Math.max(0, statusCells.length - 3),
        totalCalls: usageStats?.totalCalls ?? 0,
        last7dCalls: usageStats?.last7dCalls ?? 0,
        lastCalledAt: usageStats?.lastCalledAt ?? null,
        rowHint: rowHints[skill.id],
      };
    });
}

function toMatrixSummaries(managerState: SkillsManagerState | null): SkillsManagerMatrixSummary[] {
  if (!managerState) {
    return [];
  }

  return managerState.tools.map((tool) => {
    const counts: Record<SkillManagerStatus, number> = {
      linked: 0,
      missing: 0,
      blocked: 0,
      wrong: 0,
      directory: 0,
      manual: 0,
    };

    for (const skill of managerState.skills) {
      const status = (skill.statusByTool[tool.tool] ?? "missing") as SkillManagerStatus;
      counts[status] += 1;
    }

    const total = managerState.skills.length;
    const issueCount = total - counts.linked;

    return {
      tool: tool.tool,
      linked: counts.linked,
      missing: counts.missing,
      blocked: counts.blocked,
      wrong: counts.wrong,
      directory: counts.directory,
      manual: counts.manual,
      total,
      issueCount,
    };
  });
}

function applyOperationsFilters(
  rows: SkillsManagerOperationsRow[],
  managerStatusFilter: "all" | SkillManagerStatus,
  matrixFilter: SkillsManagerMatrixFilter,
): SkillsManagerOperationsRow[] {
  const statusMatches = (current: SkillManagerStatus, expected: SkillManagerStatus | "all") =>
    expected === "all"
      ? true
      : expected === "wrong"
        ? current === "wrong" || current === "directory"
        : current === expected;

  return rows.filter((row) => {
    if (
      managerStatusFilter !== "all" &&
      !row.statusCells.some((item) => statusMatches(item.status, managerStatusFilter))
    ) {
      return false;
    }

    if (matrixFilter.status === "all") {
      if (!matrixFilter.tool) {
        return true;
      }
      return row.statusCells.some((item) => item.tool === matrixFilter.tool);
    }

    if (!matrixFilter.tool) {
      return row.statusCells.some((item) => statusMatches(item.status, matrixFilter.status));
    }

    return row.statusCells.some(
      (item) => item.tool === matrixFilter.tool && statusMatches(item.status, matrixFilter.status),
    );
  });
}

type SkillsState = {
  skills: SkillAsset[];
  viewTab: "installed" | "discover" | "distribute";
  selectedSkillId: string | null;
  selectedIds: string[];
  loading: boolean;
  detailById: Record<string, SkillsAssetDetail>;
  lastBatchResult: SkillsBatchResult | null;
  managerMode: SkillsManagerMode;
  managerExpandedSkillId: string | null;
  managerMatrixFilter: SkillsManagerMatrixFilter;
  managerState: SkillsManagerState | null;
  managerLoading: boolean;
  managerCalibrating: boolean;
  managerOptimisticMap: OptimisticMap;
  managerRowHints: Record<string, string>;
  managerStatusFilter: "all" | SkillManagerStatus;
  managerSelectedTool: string;
  managerLastActionOutput: string;
  managerLastBatchResult: SkillsManagerBatchResult | null;
  usageAgentFilter: string;
  usageSourceFilter: string;
  usageStatsBySkillId: Record<string, SkillsUsageStatsRow>;
  usageStatsLoading: boolean;
  usageStatsError: string;
  usageListSyncJob: SkillsUsageSyncJobSnapshot | null;
  usageDetailSyncJob: SkillsUsageSyncJobSnapshot | null;
  usageDetailSkillId: string | null;
  usageDetailCalls: SkillsUsageCallItem[];
  usageDetailCallsTotal: number;
  usageDetailCallsLoading: boolean;
  usageDetailCallsError: string;
  fetchSkills: () => Promise<void>;
  scanSkills: (workspaceId: string, directories?: string[]) => Promise<void>;
  setViewTab: (tab: "installed" | "discover" | "distribute") => void;
  selectSkill: (id: string | null) => void;
  toggleSelect: (id: string) => void;
  setSelection: (ids: string[]) => void;
  clearSelection: () => void;
  fetchDetail: (skillId: string) => Promise<void>;
  distribute: (workspaceId: string, targetIds: string[]) => Promise<void>;
  uninstall: (workspaceId: string, targetIds: string[]) => Promise<void>;
  loadManagerState: (workspaceId: string) => Promise<void>;
  syncManager: (workspaceId: string) => Promise<void>;
  cleanManager: (workspaceId: string) => Promise<void>;
  managerBatchLink: (
    workspaceId: string,
    skillIds: string[],
    tool: string,
    force?: boolean,
  ) => Promise<void>;
  managerBatchUnlink: (workspaceId: string, skillIds: string[], tool: string) => Promise<void>;
  managerSoftDelete: (workspaceId: string, skillId: string) => Promise<void>;
  managerRestore: (workspaceId: string, skillName: string) => Promise<void>;
  updateManagerRules: (
    workspaceId: string,
    patch: {
      rules?: Record<string, SkillsManagerRuleValue>;
      groupRules?: Record<string, SkillsManagerRuleValue>;
      toolRules?: Record<string, SkillsManagerToolRuleValue>;
    },
  ) => Promise<void>;
  setManagerMode: (value: SkillsManagerMode) => void;
  setManagerExpandedSkillId: (value: string | null) => void;
  setManagerMatrixFilter: (value: Partial<SkillsManagerMatrixFilter>) => void;
  clearManagerRowHint: (skillId: string) => void;
  setManagerStatusFilter: (value: "all" | SkillManagerStatus) => void;
  setManagerSelectedTool: (value: string) => void;
  setUsageFilters: (value: { agent?: string; source?: string }) => void;
  refreshUsageStats: (workspaceId: string) => Promise<void>;
  startListUsageSync: (workspaceId: string) => Promise<void>;
  startDetailUsageSync: (workspaceId: string, skillId: string) => Promise<void>;
  loadUsageCalls: (workspaceId: string, skillId: string) => Promise<void>;
  clearUsageDetail: () => void;
  getManagerOperationsRows: () => SkillsManagerOperationsRow[];
  getManagerFilteredOperationsRows: () => SkillsManagerOperationsRow[];
  getManagerMatrixSummaries: () => SkillsManagerMatrixSummary[];
};

export const useSkillsStore = create<SkillsState>((set, get) => {
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
  skills: [],
  viewTab: "installed",
  selectedSkillId: null,
  selectedIds: [],
  loading: false,
  detailById: {},
  lastBatchResult: null,
  managerMode: "operations",
  managerExpandedSkillId: null,
  managerMatrixFilter: {
    tool: null,
    status: "all",
  },
  managerState: null,
  managerLoading: false,
  managerCalibrating: false,
  managerOptimisticMap: {},
  managerRowHints: {},
  managerStatusFilter: "all",
  managerSelectedTool: "",
  managerLastActionOutput: "",
  managerLastBatchResult: null,
  usageAgentFilter: "",
  usageSourceFilter: "",
  usageStatsBySkillId: {},
  usageStatsLoading: false,
  usageStatsError: "",
  usageListSyncJob: null,
  usageDetailSyncJob: null,
  usageDetailSkillId: null,
  usageDetailCalls: [],
  usageDetailCallsTotal: 0,
  usageDetailCallsLoading: false,
  usageDetailCallsError: "",
  fetchSkills: async () => {
    set({ loading: true });
    try {
      const skills = await skillsApi.list();
      const selectedSkillId = get().selectedSkillId;
      const stillExists = selectedSkillId && skills.some((item) => item.id === selectedSkillId);
      set({
        skills,
        selectedSkillId: stillExists ? selectedSkillId : skills[0]?.id ?? null,
      });
    } finally {
      set({ loading: false });
    }
  },
  scanSkills: async (workspaceId, directories) => {
    set({ loading: true });
    try {
      const skills = await skillsApi.scan({ workspaceId, directories });
      set({ skills });
    } finally {
      set({ loading: false });
    }
  },
  setViewTab: (viewTab) => set({ viewTab }),
  selectSkill: (selectedSkillId) => set({ selectedSkillId }),
  toggleSelect: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((item) => item !== id)
        : [...state.selectedIds, id],
    })),
  setSelection: (selectedIds) => set({ selectedIds }),
  clearSelection: () => set({ selectedIds: [] }),
  fetchDetail: async (skillId) => {
    const detail = await skillsApi.detail(skillId);
    set((state) => ({
      detailById: {
        ...state.detailById,
        [skillId]: detail,
      },
    }));
  },
  distribute: async (workspaceId, targetIds) => {
    const selectedIds = get().selectedIds;
    if (selectedIds.length === 0) {
      set({
        lastBatchResult: {
          results: [],
          summary: EMPTY_BATCH_SUMMARY,
        },
      });
      return;
    }

    const result = await skillsApi.distribute({
      workspaceId,
      skillIds: selectedIds,
      targetIds,
    });
    set({ lastBatchResult: result });
  },
  uninstall: async (workspaceId, targetIds) => {
    const selectedIds = get().selectedIds;
    if (selectedIds.length === 0) {
      set({
        lastBatchResult: {
          results: [],
          summary: EMPTY_BATCH_SUMMARY,
        },
      });
      return;
    }

    const result = await skillsApi.uninstall({
      workspaceId,
      skillIds: selectedIds,
      targetIds,
    });
    set({ lastBatchResult: result });
  },
  loadManagerState: async (workspaceId) => {
    set({ managerLoading: true });
    try {
      const managerState = await skillsManagerApi.state(workspaceId);
      const managerSelectedTool =
        get().managerSelectedTool || managerState.tools[0]?.tool || "";
      set((state) => ({
        managerState,
        managerSelectedTool,
        managerOptimisticMap: {},
        managerRowHints: {
          ...state.managerRowHints,
          ...buildCalibrationHints(managerState, state.managerOptimisticMap),
        },
      }));
    } finally {
      set({ managerLoading: false });
    }
  },
  syncManager: async (workspaceId) => {
    set({ managerLoading: true });
    try {
      const result = await skillsManagerApi.sync({ workspaceId });
      const managerState = await skillsManagerApi.state(workspaceId);
      set({
        managerState,
        managerLastActionOutput: result.output,
        managerOptimisticMap: {},
      });
    } finally {
      set({ managerLoading: false });
    }
  },
  cleanManager: async (workspaceId) => {
    set({ managerLoading: true });
    try {
      const result = await skillsManagerApi.clean({ workspaceId });
      const managerState = await skillsManagerApi.state(workspaceId);
      set({
        managerState,
        managerLastActionOutput: result.output,
        managerOptimisticMap: {},
      });
    } finally {
      set({ managerLoading: false });
    }
  },
  managerBatchLink: async (workspaceId, skillIds, tool, force = false) => {
    if (skillIds.length === 0 || !tool) {
      set({
        managerLastBatchResult: {
          ok: true,
          results: [],
          summary: EMPTY_MANAGER_BATCH_SUMMARY,
        },
      });
      return;
    }

    set((state) => ({
      managerCalibrating: true,
      managerState: nextManagerStateWithPatch(state.managerState, skillIds, tool, "linked"),
      managerOptimisticMap: mergeOptimisticMap(state.managerOptimisticMap, skillIds, tool, "linked"),
      managerRowHints: Object.fromEntries(
        Object.entries(state.managerRowHints).filter(([skillId]) => !skillIds.includes(skillId)),
      ),
    }));

    try {
      const result = await skillsManagerApi.batchLink({
        workspaceId,
        items: skillIds.map((skillId) => ({
          skillId,
          tool,
          ...(force ? { force: true } : {}),
        })),
      });
      const managerState = await skillsManagerApi.state(workspaceId);
      const optimisticMap = get().managerOptimisticMap;
      const calibrationHints = buildCalibrationHints(managerState, optimisticMap);
      set({
        managerState,
        managerLastBatchResult: result,
        managerCalibrating: false,
        managerOptimisticMap: {},
        managerRowHints: calibrationHints,
      });
    } catch (error) {
      const current = await skillsManagerApi.state(workspaceId).catch(() => null);
      set((state) => ({
        managerState: current ?? state.managerState,
        managerCalibrating: false,
        managerOptimisticMap: {},
      }));
      throw error;
    }
  },
  managerBatchUnlink: async (workspaceId, skillIds, tool) => {
    if (skillIds.length === 0 || !tool) {
      set({
        managerLastBatchResult: {
          ok: true,
          results: [],
          summary: EMPTY_MANAGER_BATCH_SUMMARY,
        },
      });
      return;
    }

    set((state) => ({
      managerCalibrating: true,
      managerState: nextManagerStateWithPatch(state.managerState, skillIds, tool, "missing"),
      managerOptimisticMap: mergeOptimisticMap(state.managerOptimisticMap, skillIds, tool, "missing"),
      managerRowHints: Object.fromEntries(
        Object.entries(state.managerRowHints).filter(([skillId]) => !skillIds.includes(skillId)),
      ),
    }));

    try {
      const result = await skillsManagerApi.batchUnlink({
        workspaceId,
        items: skillIds.map((skillId) => ({ skillId, tool })),
      });
      const managerState = await skillsManagerApi.state(workspaceId);
      const optimisticMap = get().managerOptimisticMap;
      const calibrationHints = buildCalibrationHints(managerState, optimisticMap);
      set({
        managerState,
        managerLastBatchResult: result,
        managerCalibrating: false,
        managerOptimisticMap: {},
        managerRowHints: calibrationHints,
      });
    } catch (error) {
      const current = await skillsManagerApi.state(workspaceId).catch(() => null);
      set((state) => ({
        managerState: current ?? state.managerState,
        managerCalibrating: false,
        managerOptimisticMap: {},
      }));
      throw error;
    }
  },
  managerSoftDelete: async (workspaceId, skillId) => {
    await skillsManagerApi.softDelete({ workspaceId, skillId });
    const managerState = await skillsManagerApi.state(workspaceId);
    set((state) => ({
      managerState,
      selectedIds: state.selectedIds.filter((item) => item !== skillId),
      managerRowHints: Object.fromEntries(
        Object.entries(state.managerRowHints).filter(([key]) => key !== skillId),
      ),
    }));
  },
  managerRestore: async (workspaceId, skillName) => {
    await skillsManagerApi.restore({ workspaceId, skillName });
    const managerState = await skillsManagerApi.state(workspaceId);
    set({ managerState });
  },
  updateManagerRules: async (workspaceId, patch) => {
    await skillsManagerApi.updateRules({
      workspaceId,
      rules: patch.rules,
      groupRules: patch.groupRules,
      toolRules: patch.toolRules,
    });
    const managerState = await skillsManagerApi.state(workspaceId);
    set({ managerState });
  },
  setManagerMode: (managerMode) => set({ managerMode }),
  setManagerExpandedSkillId: (value) =>
    set((state) => ({
      managerExpandedSkillId: state.managerExpandedSkillId === value ? null : value,
    })),
  setManagerMatrixFilter: (value) =>
    set((state) => ({
      managerMatrixFilter: {
        tool: value.tool === undefined ? state.managerMatrixFilter.tool : value.tool,
        status: value.status ?? state.managerMatrixFilter.status,
      },
    })),
  clearManagerRowHint: (skillId) =>
    set((state) => ({
      managerRowHints: Object.fromEntries(
        Object.entries(state.managerRowHints).filter(([key]) => key !== skillId),
      ),
    })),
  setManagerStatusFilter: (managerStatusFilter) => set({ managerStatusFilter }),
  setManagerSelectedTool: (managerSelectedTool) => set({ managerSelectedTool }),
  setUsageFilters: ({ agent, source }) =>
    set((state) => ({
      usageAgentFilter: agent === undefined ? state.usageAgentFilter : agent,
      usageSourceFilter: source === undefined ? state.usageSourceFilter : source,
    })),
  refreshUsageStats: async (workspaceId) => {
    set({ usageStatsLoading: true, usageStatsError: "" });
    try {
      const { usageAgentFilter, usageSourceFilter } = get();
      const result = await skillsUsageApi.queryStats({
        workspaceId,
        agent: normalizeUsageFilter(usageAgentFilter),
        source: normalizeUsageFilter(usageSourceFilter),
      });
      const usageStatsBySkillId: Record<string, SkillsUsageStatsRow> = {};
      for (const row of result.rows) {
        usageStatsBySkillId[row.skillId] = row;
      }
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
      const { usageAgentFilter, usageSourceFilter } = get();
      const result = await skillsUsageApi.queryCalls({
        workspaceId,
        skillId,
        agent: normalizeUsageFilter(usageAgentFilter),
        source: normalizeUsageFilter(usageSourceFilter),
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
  getManagerOperationsRows: () =>
    toOperationsRows(get().managerState, get().managerRowHints, get().usageStatsBySkillId),
  getManagerFilteredOperationsRows: () => {
    const rows = toOperationsRows(
      get().managerState,
      get().managerRowHints,
      get().usageStatsBySkillId,
    );
    return applyOperationsFilters(rows, get().managerStatusFilter, get().managerMatrixFilter);
  },
  getManagerMatrixSummaries: () => toMatrixSummaries(get().managerState),
  };
});

export function skillManagerStatusLabel(status: SkillManagerStatus): string {
  return status;
}

export function skillManagerStatusSortWeight(status: SkillManagerStatus): number {
  const index = MANAGER_STATUS_LIST.indexOf(status);
  return index < 0 ? MANAGER_STATUS_LIST.length : index;
}
