import { beforeEach, describe, expect, it, vi } from "vitest";

const { skillsApi, skillsManagerApi } = vi.hoisted(() => ({
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
}));

vi.mock("../../services/api", () => ({
  skillsApi,
  skillsManagerApi,
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
  });
}

function managerStateFixture() {
  return {
    skills: [
      {
        id: "s1",
        name: "skill-one",
        group: "core",
        source: "/Users/demo/.codex/skills",
        localPath: "/Users/demo/.codex/skills/skill-one",
        statusByTool: {
          codex: "missing",
          claude: "linked",
        },
        conflict: false,
      },
      {
        id: "s2",
        name: "skill-two",
        group: "core",
        source: "/Users/demo/.codex/skills",
        localPath: "/Users/demo/.codex/skills/skill-two",
        statusByTool: {
          codex: "blocked",
          claude: "missing",
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
      {
        id: "t2",
        tool: "claude",
        skillsPath: "/Users/demo/.claude/skills",
      },
    ],
    rules: {},
    groupRules: {},
    toolRules: {},
    manualUnlinks: {},
    deletedSkills: [],
    nameConflicts: {},
  };
}

describe("useSkillsStore operations selectors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("managerBatchLink 会先乐观更新，再校准并写入行提示", async () => {
    skillsManagerApi.state.mockResolvedValueOnce(managerStateFixture());
    await useSkillsStore.getState().loadManagerState("w1");

    let resolveBatch!: (value: unknown) => void;
    skillsManagerApi.batchLink.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBatch = resolve;
        }),
    );

    const pending = useSkillsStore.getState().managerBatchLink("w1", ["s1"], "codex");

    expect(
      useSkillsStore
        .getState()
        .managerState?.skills.find((item) => item.id === "s1")
        ?.statusByTool.codex,
    ).toBe("linked");

    skillsManagerApi.state.mockResolvedValueOnce({
      ...managerStateFixture(),
      skills: managerStateFixture().skills.map((item) =>
        item.id === "s1"
          ? {
              ...item,
              statusByTool: {
                ...item.statusByTool,
                codex: "missing",
              },
            }
          : item,
      ),
    });

    resolveBatch({
      ok: true,
      results: [
        {
          skillId: "s1",
          tool: "codex",
          ok: true,
          message: "ok",
        },
      ],
      summary: {
        total: 1,
        success: 1,
        failed: 0,
      },
    });
    await pending;

    expect(useSkillsStore.getState().managerCalibrating).toBe(false);
    expect(useSkillsStore.getState().managerRowHints.s1).toContain("codex");
  });

  it("managerBatchUnlink 乐观态会标记为 missing", async () => {
    skillsManagerApi.state.mockResolvedValueOnce(managerStateFixture());
    await useSkillsStore.getState().loadManagerState("w1");

    let resolveBatch!: (value: unknown) => void;
    skillsManagerApi.batchUnlink.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBatch = resolve;
        }),
    );

    const pending = useSkillsStore.getState().managerBatchUnlink("w1", ["s1"], "claude");

    expect(
      useSkillsStore
        .getState()
        .managerState?.skills.find((item) => item.id === "s1")
        ?.statusByTool.claude,
    ).toBe("missing");

    skillsManagerApi.state.mockResolvedValueOnce(managerStateFixture());
    resolveBatch({
      ok: true,
      results: [
        {
          skillId: "s1",
          tool: "claude",
          ok: true,
          message: "ok",
        },
      ],
      summary: {
        total: 1,
        success: 1,
        failed: 0,
      },
    });
    await pending;
  });

  it("只保留一个 expanded skill id", () => {
    useSkillsStore.getState().setManagerExpandedSkillId("s1");
    expect(useSkillsStore.getState().managerExpandedSkillId).toBe("s1");

    useSkillsStore.getState().setManagerExpandedSkillId("s2");
    expect(useSkillsStore.getState().managerExpandedSkillId).toBe("s2");

    useSkillsStore.getState().setManagerExpandedSkillId("s2");
    expect(useSkillsStore.getState().managerExpandedSkillId).toBeNull();
  });

  it("矩阵过滤与摘要同步", async () => {
    skillsManagerApi.state.mockResolvedValueOnce(managerStateFixture());
    await useSkillsStore.getState().loadManagerState("w1");

    const summaries = useSkillsStore.getState().getManagerMatrixSummaries();
    const codex = summaries.find((item) => item.tool === "codex");
    expect(codex?.missing).toBe(1);
    expect(codex?.blocked).toBe(1);

    useSkillsStore.getState().setManagerMatrixFilter({
      tool: "codex",
      status: "missing",
    });

    const rows = useSkillsStore.getState().getManagerFilteredOperationsRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("s1");
  });

  it("校准失败时保持现有展示且退出 calibrating", async () => {
    skillsManagerApi.state.mockResolvedValueOnce(managerStateFixture());
    await useSkillsStore.getState().loadManagerState("w1");

    skillsManagerApi.batchLink.mockRejectedValueOnce(new Error("boom"));
    skillsManagerApi.state.mockRejectedValueOnce(new Error("state failed"));

    await expect(
      useSkillsStore.getState().managerBatchLink("w1", ["s1"], "codex"),
    ).rejects.toThrow("boom");

    expect(useSkillsStore.getState().managerCalibrating).toBe(false);
    expect(
      useSkillsStore
        .getState()
        .managerState?.skills.find((item) => item.id === "s1")
        ?.statusByTool.codex,
    ).toBe("linked");
  });
});
