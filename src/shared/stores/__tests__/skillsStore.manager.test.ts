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

const managerStateFixture = {
  skills: [
    {
      id: "s1",
      name: "skill-one",
      group: "codex",
      source: "/Users/demo/.codex/skills",
      localPath: "/Users/demo/.codex/skills/skill-one",
      statusByTool: {
        codex: "missing",
      },
      conflict: false,
    },
  ],
  tools: [
    {
      id: "t1",
      tool: "codex",
      skillsPath: "/Users/demo/.codex/skills",
    },
  ],
  rules: {},
  groupRules: {},
  toolRules: {},
  manualUnlinks: {},
  deletedSkills: [],
  nameConflicts: {},
};

describe("useSkillsStore manager actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("loadManagerState 默认选择第一个 tool", async () => {
    skillsManagerApi.state.mockResolvedValueOnce(managerStateFixture);

    await useSkillsStore.getState().loadManagerState("w1");

    const state = useSkillsStore.getState();
    expect(state.managerState?.skills).toHaveLength(1);
    expect(state.managerSelectedTool).toBe("codex");
    expect(state.managerLoading).toBe(false);
  });

  it("syncManager 会刷新状态并写入 output", async () => {
    skillsManagerApi.sync.mockResolvedValueOnce({
      ok: true,
      summary: {
        created: 1,
        skipped: 0,
        blocked: 0,
        manual: 0,
        warned: 0,
      },
      output: "完成: 新建 1，已有 0，屏蔽跳过 0",
    });
    skillsManagerApi.state.mockResolvedValueOnce(managerStateFixture);

    await useSkillsStore.getState().syncManager("w1");

    expect(skillsManagerApi.sync).toHaveBeenCalledWith({ workspaceId: "w1" });
    expect(useSkillsStore.getState().managerLastActionOutput).toContain("完成:");
  });

  it("managerBatchLink 空输入时直接返回空结果", async () => {
    await useSkillsStore.getState().managerBatchLink("w1", [], "codex");

    expect(skillsManagerApi.batchLink).not.toHaveBeenCalled();
    expect(useSkillsStore.getState().managerLastBatchResult?.summary.total).toBe(0);
  });

  it("updateManagerRules 会调用后端并刷新 managerState", async () => {
    skillsManagerApi.updateRules.mockResolvedValueOnce({
      ok: true,
      rules: {},
      groupRules: {},
      toolRules: {
        codex: {
          blockAll: true,
          allow: ["skill-one"],
        },
      },
    });
    skillsManagerApi.state.mockResolvedValueOnce({
      ...managerStateFixture,
      toolRules: {
        codex: {
          blockAll: true,
          allow: ["skill-one"],
        },
      },
    });

    await useSkillsStore.getState().updateManagerRules("w1", {
      toolRules: {
        codex: {
          blockAll: true,
          allow: ["skill-one"],
        },
      },
    });

    expect(skillsManagerApi.updateRules).toHaveBeenCalledTimes(1);
    expect(useSkillsStore.getState().managerState?.toolRules.codex?.blockAll).toBe(true);
  });
});
