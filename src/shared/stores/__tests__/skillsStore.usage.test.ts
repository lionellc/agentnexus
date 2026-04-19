import { beforeEach, describe, expect, it, vi } from "vitest";

const { skillsApi, skillsManagerApi, skillsUsageApi } = vi.hoisted(() => ({
  skillsApi: {
    list: vi.fn(),
    scan: vi.fn(),
    detail: vi.fn(),
    distribute: vi.fn(),
    uninstall: vi.fn(),
  },
  skillsManagerApi: {
    state: vi.fn(),
    sync: vi.fn(),
    clean: vi.fn(),
    batchLink: vi.fn(),
    batchUnlink: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
    updateRules: vi.fn(),
  },
  skillsUsageApi: {
    syncStart: vi.fn(),
    syncProgress: vi.fn(),
    queryStats: vi.fn(),
    queryCalls: vi.fn(),
  },
}));

vi.mock("../../services/api", () => ({
  skillsApi,
  skillsManagerApi,
  skillsUsageApi,
}));

import { useSkillsStore } from "../skillsStore";

function resetStore() {
  useSkillsStore.setState({
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
  });
}

describe("useSkillsStore usage actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("refreshUsageStats 会按过滤条件写入统计映射", async () => {
    useSkillsStore.getState().setUsageFilters({ agent: "codex", source: "codex_jsonl" });
    skillsUsageApi.queryStats.mockResolvedValueOnce({
      rows: [
        {
          skillId: "s1",
          totalCalls: 12,
          last7dCalls: 5,
          lastCalledAt: "2026-04-18T12:00:00Z",
        },
      ],
    });

    await useSkillsStore.getState().refreshUsageStats("w1");

    expect(skillsUsageApi.queryStats).toHaveBeenCalledWith({
      workspaceId: "w1",
      agent: "codex",
      source: "codex_jsonl",
    });
    expect(useSkillsStore.getState().usageStatsBySkillId.s1?.totalCalls).toBe(12);
    expect(useSkillsStore.getState().usageStatsLoading).toBe(false);
  });

  it("loadUsageCalls 会更新详情调用时间轴数据", async () => {
    skillsUsageApi.queryCalls.mockResolvedValueOnce({
      items: [
        {
          calledAt: "2026-04-18T12:00:00Z",
          agent: "codex",
          source: "codex_jsonl",
          resultStatus: "success",
          confidence: 0.95,
          sessionId: "sess-1",
          eventRef: "1:0",
          rawRef: "{}",
        },
      ],
      total: 1,
    });

    await useSkillsStore.getState().loadUsageCalls("w1", "s1");

    expect(skillsUsageApi.queryCalls).toHaveBeenCalledWith({
      workspaceId: "w1",
      skillId: "s1",
      agent: undefined,
      source: undefined,
      limit: 120,
      offset: 0,
    });
    expect(useSkillsStore.getState().usageDetailSkillId).toBe("s1");
    expect(useSkillsStore.getState().usageDetailCalls).toHaveLength(1);
    expect(useSkillsStore.getState().usageDetailCallsTotal).toBe(1);
  });

  it("startListUsageSync 在已有 running 任务时不重复启动", async () => {
    useSkillsStore.setState({
      usageListSyncJob: {
        jobId: "job-running",
        workspaceId: "w1",
        status: "running",
        totalFiles: 10,
        processedFiles: 3,
        parsedEvents: 10,
        insertedEvents: 8,
        duplicateEvents: 2,
        parseFailures: 0,
        currentSource: "",
        errorMessage: "",
        startedAt: "2026-04-18T12:00:00Z",
        updatedAt: "2026-04-18T12:00:00Z",
      },
    });

    await useSkillsStore.getState().startListUsageSync("w1");

    expect(skillsUsageApi.syncStart).not.toHaveBeenCalled();
  });
});

