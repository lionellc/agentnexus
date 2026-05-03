import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

const {
  toastMock,
  shellState,
  promptsState,
  skillsState,
  agentState,
  settingsState,
  previewMock,
} = vi.hoisted(() => {
  const toastMock = vi.fn();
  const shellState = {
    activeModule: "agents" as const,
    query: "",
    selectedIds: [] as string[],
    mobilePaneState: "split" as const,
    featureFlags: {} as Record<string, boolean>,
    mobileSidebarOpen: false,
    mobileDetailOpen: false,
    promptViewMode: "list" as const,
    skillDetailTab: "preview" as const,
    skillsHubSortMode: "default" as const,
    agentPlatformOrderByWorkspace: {} as Record<string, string[]>,
    settingsCategory: "general" as const,
    searchHits: [] as Array<{
      module: "agents";
      id: string;
      title: string;
      subtitle?: string;
    }>,
    setActiveModule: vi.fn(),
    setQuery: vi.fn(),
    setSelectedIds: vi.fn(),
    toggleSelectedId: vi.fn(),
    setMobilePaneState: vi.fn(),
    setFeatureFlag: vi.fn(),
    setMobileSidebarOpen: vi.fn(),
    setMobileDetailOpen: vi.fn(),
    setPromptViewMode: vi.fn(),
    setSkillDetailTab: vi.fn(),
    setSkillsHubSortMode: vi.fn(),
    setAgentPlatformOrder: vi.fn(),
    setSettingsCategory: vi.fn(),
    setSearchHits: vi.fn(),
  };
  const promptsState = {
    prompts: [],
    loading: false,
    selectedPromptId: null,
    selectedIds: [] as string[],
    versionsByPromptId: {} as Record<string, unknown[]>,
    lastBatchResult: null,
    fetchPrompts: vi.fn(async () => undefined),
    searchPrompts: vi.fn(async () => undefined),
    selectPrompt: vi.fn(),
    toggleSelect: vi.fn(),
    clearSelection: vi.fn(),
    createPrompt: vi.fn(async () => undefined),
    updatePrompt: vi.fn(async () => undefined),
    renderPrompt: vi.fn(async () => ""),
    fetchVersions: vi.fn(async () => undefined),
    restoreVersion: vi.fn(async () => undefined),
    batchFavorite: vi.fn(async () => undefined),
    batchMove: vi.fn(async () => undefined),
    batchDelete: vi.fn(async () => undefined),
  };
  const skillsState = {
    skills: [],
    viewTab: "installed" as const,
    loading: false,
    selectedSkillId: null,
    selectedIds: [] as string[],
    detailById: {} as Record<
      string,
      { versions: Array<{ version: string; installedAt: string }> }
    >,
    lastBatchResult: null,
    managerMode: "operations" as const,
    managerExpandedSkillId: null as string | null,
    managerMatrixFilter: {
      tool: null as string | null,
      status: "all" as const,
    },
    managerState: null,
    managerLoading: false,
    managerCalibrating: false,
    managerOptimisticMap: {},
    managerRowHints: {},
    managerStatusFilter: "all" as const,
    managerSelectedTool: "",
    managerLastActionOutput: "",
    managerLastBatchResult: null,
    usageAgentFilter: "",
    usageSourceFilter: "",
    usageEvidenceSourceFilter: "",
    usageStatsLoading: false,
    usageStatsError: "",
    usageListSyncJob: null,
    usageDetailSyncJob: null,
    usageDetailSkillId: null,
    usageDetailCalls: [] as Array<{
      calledAt: string;
      agent: string;
      source: string;
      resultStatus: "success" | "failed" | "unknown";
      confidence: number;
      sessionId: string;
      eventRef: string;
      rawRef: string;
    }>,
    usageDetailCallsTotal: 0,
    usageDetailCallsLoading: false,
    usageDetailCallsError: "",
    setViewTab: vi.fn(),
    fetchSkills: vi.fn(async () => undefined),
    scanSkills: vi.fn(async () => undefined),
    selectSkill: vi.fn(),
    toggleSelect: vi.fn(),
    setSelection: vi.fn(),
    clearSelection: vi.fn(),
    fetchDetail: vi.fn(async () => undefined),
    distribute: vi.fn(async () => undefined),
    uninstall: vi.fn(async () => undefined),
    loadManagerState: vi.fn(async () => undefined),
    syncManager: vi.fn(async () => undefined),
    cleanManager: vi.fn(async () => undefined),
    managerBatchLink: vi.fn(async () => undefined),
    managerBatchUnlink: vi.fn(async () => undefined),
    managerSoftDelete: vi.fn(async () => undefined),
    managerRestore: vi.fn(async () => undefined),
    updateManagerRules: vi.fn(async () => undefined),
    setManagerMode: vi.fn(),
    setManagerExpandedSkillId: vi.fn(),
    setManagerMatrixFilter: vi.fn(),
    clearManagerRowHint: vi.fn(),
    setManagerStatusFilter: vi.fn(),
    setManagerSelectedTool: vi.fn(),
    setUsageFilters: vi.fn(),
    refreshUsageStats: vi.fn(async () => undefined),
    startListUsageSync: vi.fn(async () => undefined),
    dismissListUsageSyncJob: vi.fn(),
    startDetailUsageSync: vi.fn(async () => undefined),
    loadUsageCalls: vi.fn(async () => undefined),
    clearUsageDetail: vi.fn(),
    getManagerOperationsRows: vi.fn(() => []),
    getManagerFilteredOperationsRows: vi.fn(() => []),
    getManagerMatrixSummaries: vi.fn(() => []),
  };
  const agentState = {
    assets: [
      {
        id: "asset-a",
        workspaceId: "w1",
        name: "团队规范A",
        latestVersion: 1,
        latestContentHash: "hash-v1",
        latestContent: "rule content",
        createdAt: "2026-04-04T00:00:00Z",
        updatedAt: "2026-04-04T00:00:00Z",
        tags: [
          {
            agentType: "codex",
            status: "drifted",
            resolvedPath: "/tmp/.codex/AGENTS.md",
          },
        ],
      },
    ],
    tagsByAsset: {
      "asset-a": [
        {
          agentType: "codex",
          status: "drifted",
          resolvedPath: "/tmp/.codex/AGENTS.md",
        },
      ],
    } as Record<
      string,
      Array<{
        agentType: string;
        status: string;
        resolvedPath?: string;
      }>
    >,
    versionsByAsset: {
      "asset-a": [
        {
          id: "ver-2",
          assetId: "asset-a",
          version: "2",
          content: "# version2\n- rule-b",
          contentHash: "hash-v2",
          createdAt: "2026-04-04T01:00:00Z",
        },
        {
          id: "ver-1",
          assetId: "asset-a",
          version: "1",
          content: "# version1\n- rule-a",
          contentHash: "hash-v1",
          createdAt: "2026-04-04T00:00:00Z",
        },
      ],
    } as Record<
      string,
      Array<{
        id: string;
        assetId: string;
        version: string;
        content: string;
        contentHash: string;
        createdAt: string;
      }>
    >,
    connections: [
      {
        id: "ac1",
        workspaceId: "w1",
        agentType: "codex",
        rootDir: "/tmp",
        enabled: true,
        resolvedPath: "/tmp/.codex/AGENTS.md",
      },
      {
        id: "ac2",
        workspaceId: "w1",
        agentType: "claude",
        rootDir: "/tmp",
        enabled: false,
        resolvedPath: "/tmp/.claude/CLAUDE.md",
      },
    ],
    draft: {
      content: "rule content",
      contentHash: "hash-v1",
      updatedAt: "2026-04-04T00:00:00Z",
    },
    releases: [
      {
        id: "r1",
        workspaceId: "w1",
        version: "v1",
        title: "版本1",
        notes: "",
        contentHash: "hash-v1",
        active: true,
        createdAt: "2026-04-04T00:00:00Z",
      },
    ],
    distributionJobs: [
      {
        id: "job1",
        workspaceId: "w1",
        releaseVersion: "v1",
        mode: "copy",
        status: "failed",
        retryOfJobId: null,
        createdAt: "2026-04-04T00:00:00Z",
        records: [
          {
            id: "record1",
            targetId: "t1",
            status: "failed",
            message: "copy failed",
            expectedHash: "expected",
            actualHash: "actual",
            usedMode: "copy",
          },
        ],
      },
    ],
    audits: [
      {
        id: "a1",
        workspaceId: "w1",
        eventType: "release_created",
        payload: {},
        createdAt: "2026-04-04T00:00:00Z",
      },
    ],
    lastActionError: null as string | null,
    loadingDraft: false,
    loadingReleases: false,
    loadingDistribution: false,
    loadingAudits: false,
    accessCheck: {
      ok: true,
      checkedAt: "2026-05-03T00:00:00Z",
      summary: "",
      targets: [
        {
          agentType: "codex",
          rootDir: "/tmp",
          ruleFile: ".codex/AGENTS.md",
          resolvedPath: "/tmp/.codex/AGENTS.md",
          parentDir: "/tmp/.codex",
          rootDirExists: true,
          parentDirExists: true,
          hiddenPath: true,
          preparedDir: false,
          canCreateFile: true,
          fileWritable: true,
          status: "ready",
          message: "隐藏规则目录可写",
        },
      ],
    },
    checkingAccess: false,
    savingDraft: false,
    selectedAssetId: "asset-a" as string | null,
    selectedReleaseVersion: "v1" as string | null,
    clearError: vi.fn(),
    loadModuleData: vi.fn(async () => undefined),
    loadAssets: vi.fn(async () => undefined),
    createAsset: vi.fn(async () => ({
      id: "asset-b",
      workspaceId: "w1",
      name: "团队规范B",
      latestVersion: 1,
      latestContentHash: "hash-v1",
      latestContent: "new rule content",
      createdAt: "2026-04-04T01:00:00Z",
      updatedAt: "2026-04-04T01:00:00Z",
      tags: [],
    })),
    deleteAsset: vi.fn(async () => undefined),
    publishVersion: vi.fn(async () => ({
      id: "version-2",
      assetId: "asset-a",
      version: "2",
      content: "updated rule content",
      contentHash: "hash-v2",
      createdAt: "2026-04-04T01:10:00Z",
    })),
    loadVersions: vi.fn(async (assetId: string) => {
      if (!agentState.versionsByAsset[assetId]) {
        agentState.versionsByAsset[assetId] = [];
      }
    }),
    rollbackVersion: vi.fn(async () => undefined),
    runApply: vi.fn(async () => undefined),
    checkAccess: vi.fn(async () => agentState.accessCheck),
    retryFailed: vi.fn(async () => undefined),
    loadConnections: vi.fn(async () => undefined),
    runDistribution: vi.fn(async () => ({
      id: "job2",
      workspaceId: "w1",
      releaseVersion: "v1",
      mode: "copy",
      status: "running",
      retryOfJobId: null,
      createdAt: "2026-04-04T00:30:00Z",
      records: [],
    })),
    retryFailedTargets: vi.fn(async () => undefined),
    detectDrift: vi.fn(async () => undefined),
    refreshAsset: vi.fn(async () => ({
      id: "job5",
      workspaceId: "w1",
      releaseVersion: "asset-a",
      mode: "refresh",
      status: "success",
      retryOfJobId: null,
      createdAt: "2026-04-04T00:45:00Z",
      records: [] as Array<Record<string, unknown>>,
    })),
    loadAudits: vi.fn(async () => undefined),
    setSelectedAssetId: vi.fn((assetId: string | null) => {
      agentState.selectedAssetId = assetId;
    }),
    setSelectedReleaseVersion: vi.fn((version: string | null) => {
      agentState.selectedReleaseVersion = version;
    }),
  };
  const settingsState = {
    workspaces: [
      {
        id: "w1",
        name: "workspace-1",
        rootPath: "/tmp/w1",
        installMode: "copy",
        platformOverrides: {},
        active: true,
        createdAt: "2026-04-04T00:00:00Z",
        updatedAt: "2026-04-04T00:00:00Z",
      },
    ],
    activeWorkspaceId: "w1",
    runtimeFlags: {
      localMode: true,
      externalSourcesEnabled: false,
      experimentalEnabled: false,
      updatedAt: "2026-04-04T00:00:00Z",
    },
    targets: [
      {
        id: "t1",
        workspaceId: "w1",
        platform: "codex",
        targetPath: "/targets/codex",
        skillsPath: "/targets/codex/skills",
        installMode: "copy",
        createdAt: "2026-04-04T00:00:00Z",
        updatedAt: "2026-04-04T00:00:00Z",
      },
    ],
    connections: [
      {
        id: "conn-1",
        workspaceId: "w1",
        platform: "codex",
        rootDir: "/tmp",
        enabled: true,
        resolvedPath: "/tmp/.codex/AGENTS.md",
        createdAt: "2026-04-04T00:00:00Z",
        updatedAt: "2026-04-04T00:00:00Z",
      },
      {
        id: "conn-2",
        workspaceId: "w1",
        platform: "claude",
        rootDir: "/tmp",
        enabled: true,
        resolvedPath: "/tmp/.claude/CLAUDE.md",
        createdAt: "2026-04-04T00:00:00Z",
        updatedAt: "2026-04-04T00:00:00Z",
      },
    ],
    webdav: {
      enabled: false,
      endpoint: "",
      username: "",
      password: "",
      autoMode: "off" as const,
      startupDelaySec: 10,
      intervalMin: 30,
      lastSyncAt: null as string | null,
    },
    dirty: {
      general: false,
      appearance: false,
      data: false,
      model: false,
      language: false,
      notifications: false,
      security: false,
      about: false,
    },
    loading: false,
    loadAll: vi.fn(async () => undefined),
    createWorkspace: vi.fn(async () => ({ id: "w2" })),
    activateWorkspace: vi.fn(async () => undefined),
    loadConnections: vi.fn(async () => settingsState.connections),
    upsertConnection: vi.fn(async () => ({ ok: true, message: "ok" })),
    toggleConnection: vi.fn(async () => ({ ok: true, message: "ok" })),
    upsertTarget: vi.fn(async () => ({ ok: true, message: "ok" })),
    updateRuntimeFlags: vi.fn(async () => ({ ok: true, message: "ok" })),
    setWebDav: vi.fn(),
    testWebDav: vi.fn(async () => ({ ok: true, message: "ok" })),
    uploadWebDav: vi.fn(async () => ({ ok: true, message: "ok" })),
    downloadWebDav: vi.fn(async () => ({ ok: true, message: "ok" })),
    setDirty: vi.fn(),
  };
  const previewMock = vi.fn(async () => ({
    workspaceId: "w1",
    platform: "codex",
    rootDir: "/tmp",
    resolvedPath: "/tmp/.codex/AGENTS.md",
    exists: true,
    content: "# codex rules\n- hello",
    contentHash: "",
  }));

  return {
    toastMock,
    shellState,
    promptsState,
    skillsState,
    agentState,
    settingsState,
    previewMock,
  };
});

vi.mock("../shared/stores", () => {
  const useShellStore = (selector: (state: typeof shellState) => unknown) =>
    selector(shellState);
  const usePromptsStore = (selector: (state: typeof promptsState) => unknown) =>
    selector(promptsState);
  const useSkillsStore = (selector: (state: typeof skillsState) => unknown) =>
    selector(skillsState);
  const useAgentRulesStore = ((
    selector: (state: typeof agentState) => unknown,
  ) => selector(agentState)) as ((
    selector: (state: typeof agentState) => unknown,
  ) => unknown) & {
    getState: () => typeof agentState;
  };
  useAgentRulesStore.getState = () => agentState;
  const useSettingsStore = (
    selector: (state: typeof settingsState) => unknown,
  ) => selector(settingsState);
  return {
    useShellStore,
    usePromptsStore,
    useSkillsStore,
    useAgentRulesStore,
    useSettingsStore,
  };
});

vi.mock("../shared/services/api", async () => {
  const actual = await vi.importActual<typeof import("../shared/services/api")>(
    "../shared/services/api",
  );
  return {
    ...actual,
    agentConnectionApi: {
      ...actual.agentConnectionApi,
      preview: previewMock,
    },
  };
});

vi.mock("@douyinfe/semi-ui-19", async () => {
  const actual = await vi.importActual<typeof import("@douyinfe/semi-ui-19")>("@douyinfe/semi-ui-19");
  return {
    ...actual,
    Toast: {
      ...actual.Toast,
      info: (options: { content?: unknown }) => toastMock(extractToastOptions(options)),
      error: (options: { content?: unknown }) => toastMock(extractToastOptions(options)),
      close: vi.fn(),
    },
  };
});

function extractToastOptions(options: { content?: unknown }) {
  const content = options.content;
  if (typeof content === "string") {
    return { title: content };
  }
  if (content && typeof content === "object" && "props" in content) {
    const children = (content as { props?: { children?: unknown[] } }).props?.children;
    if (Array.isArray(children)) {
      const title = (children[0] as { props?: { children?: string } } | undefined)?.props?.children;
      const description = (children[1] as { props?: { children?: string } } | undefined)?.props?.children;
      return { title, description };
    }
  }
  return {};
}

import { WorkbenchApp } from "./WorkbenchApp";

function findButton(text: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === text,
  ) as HTMLButtonElement | undefined;
}

function findButtons(text: string): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll("button")).filter(
    (button) => button.textContent?.trim() === text,
  ) as HTMLButtonElement[];
}

function findButtonByTitle(title: string): HTMLButtonElement | undefined {
  return document.querySelector(`button[title="${title}"]`) as
    | HTMLButtonElement
    | undefined;
}

function clickRuleItem(name: string): void {
  const node = Array.from(document.querySelectorAll("div,span,p")).find(
    (element) => element.textContent?.trim() === name,
  );
  const item = node?.closest("div.group");
  if (item) {
    item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }
}

describe("WorkbenchApp agents interactions", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    shellState.activeModule = "agents";
    shellState.searchHits = [];
    agentState.selectedReleaseVersion = "v1";
    agentState.selectedAssetId = "asset-a";
    agentState.versionsByAsset = {
      "asset-a": [
        {
          id: "ver-2",
          assetId: "asset-a",
          version: "2",
          content: "# version2\n- rule-b",
          contentHash: "hash-v2",
          createdAt: "2026-04-04T01:00:00Z",
        },
        {
          id: "ver-1",
          assetId: "asset-a",
          version: "1",
          content: "# version1\n- rule-a",
          contentHash: "hash-v1",
          createdAt: "2026-04-04T00:00:00Z",
        },
      ],
    };
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("渲染规则项并展示 drifted 标签", async () => {
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    expect(document.body.textContent).toContain("团队规范A");
    expect(document.body.textContent).toContain("codex · drifted");
  });

  it("应用规则弹窗只展示基础设置中启用的 Agent", async () => {
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    await act(async () => {
      findButton("应用")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(document.body.textContent).toContain("目标 Agent");
    expect(document.body.textContent).toContain("codex");
    expect(document.body.textContent).not.toContain("claude");
    expect(document.body.textContent).not.toContain("/tmp/.codex/AGENTS.md");
    expect(document.body.textContent).not.toContain(
      "所有启用 Agent 的规则目录都可写",
    );
  });

  it("保存版本会调用 publishVersion", async () => {
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    await act(async () => {
      clickRuleItem("团队规范A");
    });

    await act(async () => {
      const saveButton = findButton("保存并生成新版本");
      expect(saveButton).toBeDefined();
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(agentState.publishVersion).toHaveBeenCalled();
  });

  it("新建规则文件并保存会调用 createAsset", async () => {
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    await act(async () => {
      findButtons("新建规则文件")[0]?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    const nameInput = Array.from(document.querySelectorAll("input")).find(
      (node) => node.getAttribute("placeholder") === "例如：团队规范A",
    ) as HTMLInputElement | undefined;
    expect(nameInput).toBeDefined();
    expect(nameInput?.disabled).toBe(false);
    if (nameInput) {
      await act(async () => {
        nameInput.value = "团队规范B";
        nameInput.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }

    await act(async () => {
      const saveButton = findButton("创建规则文件");
      expect(saveButton).toBeDefined();
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(agentState.createAsset).toHaveBeenCalled();
  });

  it("点击刷新仅调用已绑定 Agent 的规则", async () => {
    agentState.assets = [
      ...agentState.assets,
      {
        id: "asset-b",
        workspaceId: "w1",
        name: "未绑定规则",
        latestVersion: 1,
        latestContentHash: "hash-b1",
        latestContent: "rule-b",
        createdAt: "2026-04-04T00:00:00Z",
        updatedAt: "2026-04-04T00:00:00Z",
        tags: [],
      },
    ];
    agentState.tagsByAsset["asset-b"] = [];
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    await act(async () => {
      findButton("刷新")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(agentState.refreshAsset).toHaveBeenCalledWith("w1", "asset-a");
    expect(agentState.refreshAsset).not.toHaveBeenCalledWith("w1", "asset-b");
  });

  it("刷新后按 agent 维度提示结果", async () => {
    agentState.refreshAsset.mockResolvedValueOnce({
      id: "job5",
      workspaceId: "w1",
      releaseVersion: "asset-a",
      mode: "refresh",
      status: "partial",
      retryOfJobId: null,
      createdAt: "2026-04-04T00:45:00Z",
      records: [
        {
          id: "r1",
          agentType: "codex",
          status: "clean",
        },
        {
          id: "r2",
          agentType: "claude",
          status: "drifted",
        },
      ],
    });

    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    await act(async () => {
      findButton("刷新")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    const latestToastArg = toastMock.mock.calls[
      toastMock.mock.calls.length - 1
    ]?.[0] as { title?: string; description?: string } | undefined;
    expect(latestToastArg?.title).toBe("规则检查完成");
    const description = latestToastArg?.description ?? "";
    expect(description).toContain("规则检查完成");
    expect(description).toMatch(/codex.*正常|正常.*codex/);
    expect(description).toMatch(
      /claude.*检测到(规则)?变更|检测到(规则)?变更.*claude/,
    );
  });

  it("规则 item 支持删除", async () => {
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    await act(async () => {
      findButtonByTitle("删除规则文件")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(document.body.textContent).toContain("确认彻底删除");

    await act(async () => {
      findButton("确认")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(agentState.deleteAsset).toHaveBeenCalledWith("w1", "asset-a");
  });

  it("规则 item 支持版本 diff 弹窗", async () => {
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    await act(async () => {
      findButton("版本对比")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(agentState.loadVersions).toHaveBeenCalledWith("asset-a");
    expect(document.body.textContent).toContain("历史版本");
    expect(document.body.textContent).toContain("选择版本");
  });

  it("全局 Agent 规则页不再展示平台文件映射入口", async () => {
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    expect(findButton("预览")).toBeUndefined();
    expect(document.body.textContent).not.toContain("平台文件映射");
  });
});
