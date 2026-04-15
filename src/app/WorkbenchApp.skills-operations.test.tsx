import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

const { toastMock, shellState, promptsState, skillsState, agentState, settingsState } = vi.hoisted(() => {
  const toastMock = vi.fn();

  const shellState = {
    activeModule: "skills" as const,
    query: "",
    selectedIds: [] as string[],
    mobilePaneState: "split" as const,
    featureFlags: {} as Record<string, boolean>,
    mobileSidebarOpen: false,
    mobileDetailOpen: false,
    promptViewMode: "table" as "list" | "gallery" | "table",
    skillDetailTab: "overview" as const,
    settingsCategory: "general" as "general" | "data" | "agents" | "model" | "about",
    searchHits: [] as Array<{ module: "agents"; id: string; title: string; subtitle?: string }>,
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
    setSelection: vi.fn(),
    createPrompt: vi.fn(async () => undefined),
    updatePrompt: vi.fn(async () => undefined),
    deletePrompt: vi.fn(async () => undefined),
    renderPrompt: vi.fn(async () => ""),
    fetchVersions: vi.fn(async () => undefined),
    restoreVersion: vi.fn(async () => undefined),
    batchFavorite: vi.fn(async () => undefined),
    batchMove: vi.fn(async () => undefined),
    batchDelete: vi.fn(async () => undefined),
  };

  const skillsState = {
    skills: [
      {
        id: "s1",
        identity: "skill-one",
        name: "skill-one",
        version: "1.0.0",
        latestVersion: "1.0.0",
        source: "/Users/demo/.codex/skills",
        sourceParent: ".codex",
        isSymlink: false,
        localPath: "/Users/demo/.codex/skills/skill-one",
        updateCandidate: false,
        lastUsedAt: null,
        createdAt: "2026-04-04T00:00:00Z",
        updatedAt: "2026-04-04T00:00:00Z",
      },
      {
        id: "s2",
        identity: "skill-two",
        name: "skill-two",
        version: "1.0.0",
        latestVersion: "1.0.0",
        source: "/Users/demo/.claude/skills",
        sourceParent: ".claude",
        isSymlink: false,
        localPath: "/Users/demo/.claude/skills/skill-two",
        updateCandidate: false,
        lastUsedAt: null,
        createdAt: "2026-04-04T00:00:00Z",
        updatedAt: "2026-04-04T00:00:00Z",
      },
    ],
    loading: false,
    selectedSkillId: "s1",
    selectedIds: ["s1"],
    detailById: {} as Record<string, { versions: Array<{ version: string; installedAt: string }> }>,
    lastBatchResult: null,
    managerMode: "operations" as "operations" | "config",
    managerExpandedSkillId: null as string | null,
    managerMatrixFilter: { tool: null as string | null, status: "all" as const },
    managerState: {
      skills: [
        {
          id: "s1",
          name: "skill-one",
          group: "core",
          source: "/Users/demo/.codex/skills",
          localPath: "/Users/demo/.codex/skills/skill-one",
          statusByTool: {
            codex: "missing",
          },
          conflict: false,
        },
        {
          id: "s2",
          name: "skill-two",
          group: "core",
          source: "/Users/demo/.claude/skills",
          localPath: "/Users/demo/.claude/skills/skill-two",
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
    },
    managerLoading: false,
    managerCalibrating: false,
    managerOptimisticMap: {},
    managerRowHints: {},
    managerStatusFilter: "all" as const,
    managerSelectedTool: "codex",
    managerLastActionOutput: "",
    managerLastBatchResult: null,
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
    setManagerMode: vi.fn((value: "operations" | "config") => {
      skillsState.managerMode = value;
    }),
    setManagerExpandedSkillId: vi.fn(),
    setManagerMatrixFilter: vi.fn(),
    clearManagerRowHint: vi.fn(),
    setManagerStatusFilter: vi.fn(),
    setManagerSelectedTool: vi.fn(),
    getManagerOperationsRows: vi.fn(() => [
      {
        id: "s1",
        name: "skill-one",
        group: "core",
        source: "/Users/demo/.codex/skills",
        localPath: "/Users/demo/.codex/skills/skill-one",
        conflict: false,
        linkedCount: 0,
        totalCount: 1,
        issueCount: 1,
        statusCells: [{ tool: "codex", status: "missing" as const }],
        statusPreview: [{ tool: "codex", status: "missing" as const }],
        hiddenStatusCount: 0,
      },
      {
        id: "s2",
        name: "skill-two",
        group: "core",
        source: "/Users/demo/.claude/skills",
        localPath: "/Users/demo/.claude/skills/skill-two",
        conflict: false,
        linkedCount: 0,
        totalCount: 1,
        issueCount: 1,
        statusCells: [{ tool: "codex", status: "missing" as const }],
        statusPreview: [{ tool: "codex", status: "missing" as const }],
        hiddenStatusCount: 0,
      },
    ]),
    getManagerFilteredOperationsRows: vi.fn(() => []),
    getManagerMatrixSummaries: vi.fn(() => [
      {
        tool: "codex",
        linked: 0,
        missing: 2,
        blocked: 0,
        wrong: 0,
        directory: 0,
        manual: 0,
        total: 2,
        issueCount: 2,
      },
    ]),
  };

  const agentState = {
    assets: [],
    tagsByAsset: {} as Record<string, Array<{ agentType: string; status: string; resolvedPath?: string }>>,
    versionsByAsset: {} as Record<string, unknown[]>,
    connections: [],
    draft: { content: "", contentHash: "", updatedAt: "" },
    releases: [],
    distributionJobs: [],
    audits: [],
    lastActionError: null as string | null,
    loadingDraft: false,
    loadingReleases: false,
    loadingDistribution: false,
    loadingAudits: false,
    savingDraft: false,
    selectedAssetId: null as string | null,
    selectedReleaseVersion: null as string | null,
    clearError: vi.fn(),
    loadModuleData: vi.fn(async () => undefined),
    loadAssets: vi.fn(async () => undefined),
    createAsset: vi.fn(async () => undefined),
    renameAsset: vi.fn(async () => undefined),
    deleteAsset: vi.fn(async () => undefined),
    publishVersion: vi.fn(async () => undefined),
    loadVersions: vi.fn(async () => undefined),
    rollbackVersion: vi.fn(async () => undefined),
    runApply: vi.fn(async () => undefined),
    retryFailed: vi.fn(async () => undefined),
    loadConnections: vi.fn(async () => undefined),
    runDistribution: vi.fn(async () => undefined),
    retryFailedTargets: vi.fn(async () => undefined),
    detectDrift: vi.fn(async () => undefined),
    refreshAsset: vi.fn(async () => undefined),
    loadAudits: vi.fn(async () => undefined),
    setSelectedAssetId: vi.fn(),
    setSelectedReleaseVersion: vi.fn(),
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
    targets: [],
    connections: [],
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
    loadConnections: vi.fn(async () => []),
    upsertConnection: vi.fn(async () => ({ ok: true, message: "ok" })),
    deleteConnection: vi.fn(async () => ({ ok: true, message: "ok" })),
    toggleConnection: vi.fn(async () => ({ ok: true, message: "ok" })),
    upsertTarget: vi.fn(async () => ({ ok: true, message: "ok" })),
    updateRuntimeFlags: vi.fn(async () => ({ ok: true, message: "ok" })),
    setWebDav: vi.fn(),
    testWebDav: vi.fn(async () => ({ ok: true, message: "ok" })),
    uploadWebDav: vi.fn(async () => ({ ok: true, message: "ok" })),
    downloadWebDav: vi.fn(async () => ({ ok: true, message: "ok" })),
    setDirty: vi.fn(),
  };

  return { toastMock, shellState, promptsState, skillsState, agentState, settingsState };
});

vi.mock("../shared/stores", () => {
  const useShellStore = (selector: (state: typeof shellState) => unknown) => selector(shellState);
  const usePromptsStore = (selector: (state: typeof promptsState) => unknown) => selector(promptsState);
  const useSkillsStore = (selector: (state: typeof skillsState) => unknown) => selector(skillsState);
  const useAgentRulesStore = (selector: (state: typeof agentState) => unknown) => selector(agentState);
  const useSettingsStore = (selector: (state: typeof settingsState) => unknown) => selector(settingsState);
  return {
    useShellStore,
    usePromptsStore,
    useSkillsStore,
    useAgentRulesStore,
    useSettingsStore,
  };
});

vi.mock("../shared/ui", async () => {
  const actual = await vi.importActual<typeof import("../shared/ui")>("../shared/ui");
  return {
    ...actual,
    useToast: () => ({
      toast: toastMock,
      dismiss: vi.fn(),
    }),
  };
});

import { WorkbenchApp } from "./WorkbenchApp";

describe("WorkbenchApp skills operations", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    shellState.activeModule = "skills";
    skillsState.managerMode = "operations";
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("默认渲染链接中控内容", async () => {
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    expect(container.textContent).not.toContain("Skills 运营");
    expect(container.textContent).toContain("链接中控");
    expect(container.textContent).toContain("扫描");
  });

  it("不再渲染来源筛选", async () => {
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    expect(container.textContent).toContain("当前筛选 2 项");
    expect(container.textContent).not.toContain("全部来源");
    const sourceSelect = Array.from(container.querySelectorAll("select")).find((item) =>
      Array.from(item.options).some((option) => option.value === ".claude"),
    );
    expect(sourceSelect).toBeUndefined();
  });

  it("从扫描进入链接中控时会自动刷新一次", async () => {
    skillsState.managerMode = "config";

    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    const baselineCalls = skillsState.loadManagerState.mock.calls.length;

    await act(async () => {
      const operationsTab = Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("链接中控"),
      );
      operationsTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    expect(skillsState.loadManagerState.mock.calls.length).toBeGreaterThan(baselineCalls);
    expect(skillsState.scanSkills).toHaveBeenCalledWith("w1", ["/tmp/w1/skills"]);
  });

  it("点击刷新会先扫描再刷新列表", async () => {
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    await act(async () => {
      const refreshButton = Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("刷新"),
      );
      refreshButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(skillsState.scanSkills).toHaveBeenCalledWith("w1", ["/tmp/w1/skills"]);
    expect(skillsState.fetchSkills).toHaveBeenCalled();
    expect(skillsState.loadManagerState).toHaveBeenCalled();
  });
});
