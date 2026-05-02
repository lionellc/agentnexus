import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

const { toastMock, pickDialogOpenMock, shellState, promptsState, skillsState, agentState, settingsState } = vi.hoisted(() => {
  const toastMock = vi.fn();
  const pickDialogOpenMock = vi.fn(async () => "/picked/new-directory");

  const shellState = {
    activeModule: "settings" as const,
    query: "",
    selectedIds: [] as string[],
    mobilePaneState: "split" as const,
    featureFlags: {} as Record<string, boolean>,
    mobileSidebarOpen: false,
    mobileDetailOpen: false,
    promptViewMode: "table" as "list" | "gallery" | "table",
    skillDetailTab: "preview" as const,
    skillsHubSortMode: "default" as const,
    agentPlatformOrderByWorkspace: {} as Record<string, string[]>,
    settingsCategory: "general" as "general" | "data" | "model" | "about",
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
    setSkillsHubSortMode: vi.fn(),
    setAgentPlatformOrder: vi.fn(),
    setSettingsCategory: vi.fn((category: "general" | "data" | "model" | "about") => {
      shellState.settingsCategory = category;
    }),
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
    skills: [],
    viewTab: "installed" as const,
    loading: false,
    selectedSkillId: null,
    selectedIds: [] as string[],
    detailById: {} as Record<string, { versions: Array<{ version: string; installedAt: string }> }>,
    lastBatchResult: null,
    managerMode: "operations" as const,
    managerExpandedSkillId: null as string | null,
    managerMatrixFilter: { tool: null as string | null, status: "all" as const },
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
        ruleFile: "AGENTS.md",
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
        ruleFile: "CLAUDE.md",
        enabled: true,
        resolvedPath: "/tmp/.claude/CLAUDE.md",
        createdAt: "2026-04-04T00:00:00Z",
        updatedAt: "2026-04-04T00:00:00Z",
      },
      {
        id: "conn-3",
        workspaceId: "w1",
        platform: "gemini",
        rootDir: "/tmp",
        ruleFile: "AGENTS.md",
        enabled: true,
        resolvedPath: "/tmp/.gemini/AGENTS.md",
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
    deleteConnection: vi.fn(async () => ({ ok: true, message: "ok" })),
    toggleConnection: vi.fn(async () => ({ ok: true, message: "ok" })),
    upsertTarget: vi.fn(async () => ({ ok: true, message: "ok" })),
    deleteTarget: vi.fn(async () => ({ ok: true, message: "ok" })),
    updateRuntimeFlags: vi.fn(async () => ({ ok: true, message: "ok" })),
    setWebDav: vi.fn(),
    testWebDav: vi.fn(async () => ({ ok: true, message: "ok" })),
    uploadWebDav: vi.fn(async () => ({ ok: true, message: "ok" })),
    downloadWebDav: vi.fn(async () => ({ ok: true, message: "ok" })),
    setDirty: vi.fn(),
  };

  return { toastMock, pickDialogOpenMock, shellState, promptsState, skillsState, agentState, settingsState };
});

vi.mock("../shared/stores", () => {
  const useShellStore = (selector: (state: typeof shellState) => unknown) => selector(shellState);

  const usePromptsStore = ((selector: (state: typeof promptsState) => unknown) => selector(promptsState)) as
    ((selector: (state: typeof promptsState) => unknown) => unknown) & {
      getState: () => typeof promptsState;
    };
  usePromptsStore.getState = () => promptsState;

  const useSkillsStore = (selector: (state: typeof skillsState) => unknown) => selector(skillsState);

  const useAgentRulesStore = ((selector: (state: typeof agentState) => unknown) => selector(agentState)) as
    ((selector: (state: typeof agentState) => unknown) => unknown) & {
      getState: () => typeof agentState;
    };
  useAgentRulesStore.getState = () => agentState;

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

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: pickDialogOpenMock,
}));

import { WorkbenchApp } from "./WorkbenchApp";

function findButton(text: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === text) as
    | HTMLButtonElement
    | undefined;
}

function findButtonByOptions(labels: string[]): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll("button")).find((button) =>
    labels.includes(button.textContent?.trim() ?? ""),
  ) as HTMLButtonElement | undefined;
}

function findButtonByTitle(options: string[]): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll("button")).find((button) => {
    const title = button.getAttribute("title") ?? "";
    return options.includes(title.trim());
  }) as HTMLButtonElement | undefined;
}

describe("WorkbenchApp settings interactions", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.lang = "";
    document.documentElement.classList.remove("dark");
    document.documentElement.removeAttribute("data-theme");
    document.body.removeAttribute("theme-mode");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    pickDialogOpenMock.mockResolvedValue("/picked/new-directory");
    shellState.activeModule = "settings";
    shellState.settingsCategory = "general";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.removeAttribute("theme-mode");
  });

  it("渲染 settings 默认面板（通用设置）", async () => {
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    expect(container.textContent).toContain("通用设置");
  });

  it("按存储语言和主题初始化全局 Semi 适配", async () => {
    window.localStorage.setItem("agentnexus.app.language", "en-US");
    window.localStorage.setItem("agentnexus.app.theme", "dark");

    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    expect(container.textContent).toContain("General");
    expect(document.documentElement.lang).toBe("en-US");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.body.getAttribute("theme-mode")).toBe("dark");
  });

  it("切到基础设置后可见存储位置和 skills 目录配置", async () => {
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    await act(async () => {
      findButton("基础设置")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    expect(container.textContent).toContain("存储位置");
    expect(container.textContent).toContain("Skills 目录配置");
  });

  it("基础设置页可保存已有分发目录", async () => {
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    await act(async () => {
      findButton("基础设置")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    const editTargetButton = findButtonByOptions(["编辑", "Edit"]);
    expect(editTargetButton).toBeTruthy();

    await act(async () => {
      editTargetButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    const saveTargetButton = findButtonByOptions(["保存", "Save"]);
    expect(saveTargetButton).toBeTruthy();

    await act(async () => {
      saveTargetButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(settingsState.upsertTarget).toHaveBeenCalledWith({
      workspaceId: "w1",
      platform: "codex",
      id: "t1",
      targetPath: "/targets/codex",
      skillsPath: "/targets/codex/skills",
      installMode: "copy",
    });
  });

  it("基础设置页可新增分发目录并支持选择已有目录", async () => {
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    await act(async () => {
      findButton("基础设置")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    const addDirectoryButton = findButtonByOptions(["新增目录", "Add Directory"]);
    expect(addDirectoryButton).toBeTruthy();

    await act(async () => {
      addDirectoryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    const finderPickButton = findButtonByOptions(["从 Finder 选择文件夹", "Choose Folder in Finder"]);
    expect(finderPickButton).toBeTruthy();

    await act(async () => {
      finderPickButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(pickDialogOpenMock).toHaveBeenCalled();

    const saveButton = findButtonByOptions(["保存", "Save"]);
    expect(saveButton).toBeTruthy();

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(settingsState.upsertTarget).toHaveBeenCalledWith({
      workspaceId: "w1",
      platform: ".codex",
      targetPath: "/picked/new-directory",
      skillsPath: "/picked/new-directory/skills",
      installMode: "symlink",
    });
  });

  it("基础设置页可删除分发目录", async () => {
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    await act(async () => {
      findButton("基础设置")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    const deleteTargetButton = findButtonByTitle(["删除目录", "Delete directory"]);
    expect(deleteTargetButton).toBeTruthy();

    await act(async () => {
      deleteTargetButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(window.confirm).toHaveBeenCalled();
    expect(settingsState.deleteTarget).toHaveBeenCalledWith({
      workspaceId: "w1",
      id: "t1",
    });
  });

  it("基础设置页可见 Agents 配置模块", async () => {
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    await act(async () => {
      findButton("基础设置")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    expect(container.textContent).toContain("Agents 配置");
    expect(container.textContent).toContain("已启用平台");
    expect(container.textContent).toContain("可添加平台");
  });

  it("基础设置页 Agents 配置支持选择目录并保存", async () => {
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    await act(async () => {
      findButton("基础设置")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    const editButtons = Array.from(document.querySelectorAll("button")).filter((button) =>
      ["编辑", "Edit"].includes(button.textContent?.trim() ?? ""),
    ) as HTMLButtonElement[];
    expect(editButtons.length).toBeGreaterThan(1);
    const editAgentButton = editButtons[1];
    expect(editAgentButton).toBeTruthy();

    await act(async () => {
      editAgentButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const chooseFolderButton = findButtonByOptions(["选择", "Choose"]);
    expect(chooseFolderButton).toBeTruthy();

    await act(async () => {
      chooseFolderButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(pickDialogOpenMock).toHaveBeenCalled();

    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    const saveAgentSettingsButton = findButtonByOptions(["保存", "Save"]);
    expect(saveAgentSettingsButton).toBeTruthy();

    await act(async () => {
      saveAgentSettingsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(settingsState.upsertConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "w1",
        platform: "codex",
        rootDir: "/picked/new-directory",
      }),
    );
  });

  it("切到关于后可见应用版本", async () => {
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    await act(async () => {
      findButton("关于")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    expect(container.textContent).toContain("应用版本");
  });
});
