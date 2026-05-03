import { beforeEach, describe, expect, it, vi } from "vitest";

const { agentRulesApi } = vi.hoisted(() => ({
  agentRulesApi: {
    listAssets: vi.fn(),
    createAsset: vi.fn(),
    publishVersion: vi.fn(),
    listVersions: vi.fn(),
    rollbackVersion: vi.fn(),
    runApply: vi.fn(),
    checkAccess: vi.fn(),
    retryFailed: vi.fn(),
    refreshAsset: vi.fn(),
    listConnections: vi.fn(),
    listApplyJobs: vi.fn(),
    queryAudit: vi.fn(),
  },
}));

vi.mock("../services/api", () => ({
  agentRulesApi,
}));

import { useAgentRulesStore } from "./agentRulesStore";

const EMPTY_DRAFT = {
  content: "",
  contentHash: "",
  updatedAt: "",
};

function resetStore() {
  useAgentRulesStore.setState({
    assets: [],
    tagsByAsset: {},
    versionsByAsset: {},
    applyJobs: [],
    accessCheck: null,
    connections: [],
    draft: EMPTY_DRAFT,
    releases: [],
    distributionJobs: [],
    audits: [],
    lastActionError: null,
    loadingAssets: false,
    loadingVersions: false,
    loadingJobs: false,
    checkingAccess: false,
    loadingConnections: false,
    loadingDraft: false,
    loadingReleases: false,
    loadingDistribution: false,
    loadingAudits: false,
    savingDraft: false,
    selectedAssetId: null,
    selectedReleaseVersion: null,
  });
}

describe("useAgentRulesStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("loadAssets 成功后更新资产/标签/兼容字段", async () => {
    agentRulesApi.listAssets.mockResolvedValueOnce([
      {
        id: "asset-a",
        workspaceId: "w1",
        name: "团队规范A",
        latestVersion: "v3",
        latestContent: "RULE-A",
        latestContentHash: "hash-a",
        updatedAt: "2026-04-04T00:00:00Z",
        tags: [
          {
            agentType: "codex",
            status: "synced",
            filePath: "/tmp/.codex/AGENTS.md",
          },
        ],
      },
    ]);

    await useAgentRulesStore.getState().loadAssets("w1");

    const state = useAgentRulesStore.getState();
    expect(state.assets).toHaveLength(1);
    expect(state.tagsByAsset["asset-a"][0]?.status).toBe("synced");
    expect(state.selectedAssetId).toBe("asset-a");
    expect(state.draft).toEqual({
      content: "RULE-A",
      contentHash: "hash-a",
      updatedAt: "2026-04-04T00:00:00Z",
    });
    expect(state.releases[0]?.title).toBe("团队规范A");
    expect(state.releases[0]?.version).toBe("v3");
    expect(state.loadingAssets).toBe(false);
    expect(state.lastActionError).toBeNull();
  });

  it("loadAssets 失败时写入错误并抛出", async () => {
    agentRulesApi.listAssets.mockRejectedValueOnce(new Error("assets failed"));

    await expect(
      useAgentRulesStore.getState().loadAssets("w1"),
    ).rejects.toThrow("assets failed");

    expect(useAgentRulesStore.getState().lastActionError).toBe("assets failed");
    expect(useAgentRulesStore.getState().loadingAssets).toBe(false);
  });

  it("runApply/retryFailed/refreshAsset 会更新 applyJobs 与 distributionJobs", async () => {
    useAgentRulesStore.setState({
      assets: [
        {
          id: "asset-a",
          workspaceId: "w1",
          name: "团队规范A",
          tags: [],
        },
      ],
      selectedAssetId: "asset-a",
    });

    agentRulesApi.runApply.mockResolvedValueOnce({
      id: "job1",
      workspaceId: "w1",
      assetId: "asset-a",
      mode: "apply",
      status: "success",
      createdAt: "2026-04-04T00:00:00Z",
      records: [],
    });

    agentRulesApi.retryFailed.mockResolvedValueOnce({
      id: "job2",
      workspaceId: "w1",
      assetId: "asset-a",
      mode: "retry_failed",
      status: "partial",
      retryOfJobId: "job1",
      createdAt: "2026-04-04T00:01:00Z",
      records: [],
    });

    agentRulesApi.refreshAsset.mockResolvedValueOnce({
      id: "job3",
      workspaceId: "w1",
      assetId: "asset-a",
      mode: "refresh",
      status: "drifted",
      createdAt: "2026-04-04T00:02:00Z",
      records: [],
      tags: [
        {
          agentType: "codex",
          status: "drifted",
          expectedHash: "hash-a",
          actualHash: "hash-user-edit",
        },
      ],
    });

    await useAgentRulesStore.getState().runApply("w1", "asset-a", ["codex"]);
    await useAgentRulesStore.getState().retryFailed("job1");
    await useAgentRulesStore.getState().refreshAsset("w1", "asset-a");

    const state = useAgentRulesStore.getState();
    expect(state.applyJobs.map((item) => item.id)).toEqual([
      "job3",
      "job2",
      "job1",
    ]);
    expect(state.distributionJobs.map((item) => item.id)).toEqual([
      "job3",
      "job2",
      "job1",
    ]);
  });

  it("checkAccess 会更新权限预检状态", async () => {
    agentRulesApi.checkAccess.mockResolvedValueOnce({
      ok: false,
      checkedAt: "2026-05-03T00:00:00Z",
      summary: "1 个 Agent 规则目录需要处理",
      targets: [
        {
          agentType: "codex",
          rootDir: "/tmp/.codex",
          ruleFile: "AGENTS.md",
          resolvedPath: "/tmp/.codex/AGENTS.md",
          parentDir: "/tmp/.codex",
          rootDirExists: false,
          parentDirExists: false,
          hiddenPath: true,
          preparedDir: false,
          canCreateFile: false,
          fileWritable: false,
          status: "needs_user_action",
          message: "规则目录不可写",
          advice: "可复制命令：mkdir -p '/tmp/.codex'",
        },
      ],
    });

    const result = await useAgentRulesStore
      .getState()
      .checkAccess("w1", ["codex"]);

    expect(agentRulesApi.checkAccess).toHaveBeenCalledWith({
      workspaceId: "w1",
      agentTypes: ["codex"],
    });
    expect(result.ok).toBe(false);
    expect(
      useAgentRulesStore.getState().accessCheck?.targets[0]?.agentType,
    ).toBe("codex");
    expect(useAgentRulesStore.getState().checkingAccess).toBe(false);
  });

  it("refreshAsset 会刷新标签状态", async () => {
    useAgentRulesStore.setState({
      assets: [
        {
          id: "asset-a",
          workspaceId: "w1",
          name: "团队规范A",
          tags: [
            {
              agentType: "claude",
              status: "synced",
            },
          ],
        },
      ],
      tagsByAsset: {
        "asset-a": [
          {
            agentType: "claude",
            status: "synced",
          },
        ],
      },
    });

    agentRulesApi.refreshAsset.mockResolvedValueOnce({
      tags: [
        {
          agentType: "claude",
          status: "drifted",
          filePath: "/tmp/.claude/CLAUDE.md",
        },
      ],
    });

    await useAgentRulesStore.getState().refreshAsset("w1", "asset-a");

    const state = useAgentRulesStore.getState();
    expect(state.tagsByAsset["asset-a"][0]?.status).toBe("drifted");
    expect(state.assets[0]?.tags?.[0]?.status).toBe("drifted");
    expect(state.lastActionError).toBeNull();
  });

  it("refreshAsset 返回数组时也会刷新标签状态", async () => {
    useAgentRulesStore.setState({
      assets: [
        {
          id: "asset-a",
          workspaceId: "w1",
          name: "团队规范A",
          tags: [
            {
              agentType: "codex",
              status: "synced",
            },
          ],
        },
      ],
      tagsByAsset: {
        "asset-a": [
          {
            agentType: "codex",
            status: "synced",
          },
        ],
      },
    });

    agentRulesApi.refreshAsset.mockResolvedValueOnce([
      {
        agentType: "codex",
        status: "drifted",
        filePath: "/tmp/.codex/AGENTS.md",
      },
    ]);

    await useAgentRulesStore.getState().refreshAsset("w1", "asset-a");

    const state = useAgentRulesStore.getState();
    expect(state.tagsByAsset["asset-a"][0]?.status).toBe("drifted");
    expect(state.assets[0]?.tags?.[0]?.status).toBe("drifted");
    expect(state.tagsByAsset["asset-a"][0]?.filePath).toBe(
      "/tmp/.codex/AGENTS.md",
    );
  });

  it("refreshAsset 会将 driftStatus/resolvedPath 规范化为 status/filePath", async () => {
    agentRulesApi.refreshAsset.mockResolvedValueOnce({
      tags: [
        {
          agentType: "claude",
          driftStatus: "drifted",
          resolvedPath: "/tmp/.claude/CLAUDE.md",
        },
      ],
    });

    await useAgentRulesStore.getState().refreshAsset("w1", "asset-a");

    const normalized = useAgentRulesStore.getState().tagsByAsset["asset-a"][0];
    expect(normalized?.status).toBe("drifted");
    expect(normalized?.filePath).toBe("/tmp/.claude/CLAUDE.md");
  });

  it("loadConnections 会将 platform 映射到 agentType", async () => {
    agentRulesApi.listConnections.mockResolvedValueOnce([
      {
        id: "conn-1",
        workspaceId: "w1",
        platform: "claude",
        rootDir: "/tmp/workspace",
      },
    ]);

    await useAgentRulesStore.getState().loadConnections("w1");

    const connection = useAgentRulesStore.getState().connections[0];
    expect(connection?.agentType).toBe("claude");
    expect(connection?.workspaceId).toBe("w1");
    expect(connection?.rootDir).toBe("/tmp/workspace");
  });
});
