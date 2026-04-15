import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

const { toastMock, shellState, promptsState, skillsState, agentState, settingsState } = vi.hoisted(() => {
  const toastMock = vi.fn();
  const shellState = {
    activeModule: "prompts" as const,
    query: "",
    selectedIds: [] as string[],
    mobilePaneState: "split" as const,
    featureFlags: {} as Record<string, boolean>,
    mobileSidebarOpen: false,
    mobileDetailOpen: false,
    promptViewMode: "table" as "list" | "gallery" | "table",
    skillDetailTab: "preview" as const,
    settingsCategory: "general" as const,
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
    prompts: [
      {
        id: "p1",
        workspaceId: "w1",
        name: "Prompt A",
        tags: ["core"],
        category: "ops",
        favorite: false,
        activeVersion: 1,
        createdAt: "2026-04-04T00:00:00Z",
        updatedAt: "2026-04-04T00:00:00Z",
        content: "Hello {{name}}",
      },
      {
        id: "p2",
        workspaceId: "w1",
        name: "Prompt B",
        tags: ["daily"],
        category: "daily",
        favorite: true,
        activeVersion: 1,
        createdAt: "2026-04-04T00:00:00Z",
        updatedAt: "2026-04-04T00:00:00Z",
        content: "No variable",
      },
    ],
    loading: false,
    selectedPromptId: "p1" as string | null,
    selectedIds: ["p1", "p2"] as string[],
    versionsByPromptId: {} as Record<string, unknown[]>,
    lastBatchResult: { action: "favorite", success: 2, failed: 0, failures: [] } as {
      action: "favorite" | "move" | "delete";
      success: number;
      failed: number;
      failures: Array<{ id: string; message: string }>;
    } | null,
    fetchPrompts: vi.fn(async () => undefined),
    searchPrompts: vi.fn(async () => undefined),
    selectPrompt: vi.fn(),
    toggleSelect: vi.fn(),
    clearSelection: vi.fn(() => {
      promptsState.selectedIds = [];
    }),
    setSelection: vi.fn((ids: string[]) => {
      promptsState.selectedIds = ids;
    }),
    createPrompt: vi.fn(async () => undefined),
    updatePrompt: vi.fn(async () => undefined),
    deletePrompt: vi.fn(async () => undefined),
    renderPrompt: vi.fn(async () => "rendered-result"),
    fetchVersions: vi.fn(async () => undefined),
    restoreVersion: vi.fn(async () => undefined),
    batchFavorite: vi.fn(async () => undefined),
    batchMove: vi.fn(async () => undefined),
    batchDelete: vi.fn(async () => undefined),
  };

  const skillsState = {
    skills: [],
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

import { WorkbenchApp } from "./WorkbenchApp";

function findButton(text: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === text) as
    | HTMLButtonElement
    | undefined;
}

function findButtonByTexts(texts: string[]): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll("button")).find((button) => {
    const content = button.textContent?.trim() ?? "";
    return texts.includes(content);
  }) as HTMLButtonElement | undefined;
}

function findFirstButtonByAriaLabel(labels: string[]): HTMLButtonElement | undefined {
  for (const label of labels) {
    const button = document.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | undefined;
    if (button) {
      return button;
    }
  }
  return undefined;
}

function findButtonsByAriaLabel(labels: string[]): HTMLButtonElement[] {
  const matched = new Set<HTMLButtonElement>();
  for (const label of labels) {
    const buttons = Array.from(document.querySelectorAll(`button[aria-label="${label}"]`)) as HTMLButtonElement[];
    for (const button of buttons) {
      matched.add(button);
    }
  }
  return Array.from(matched);
}

function setNativeInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
}

describe("WorkbenchApp prompts interactions", () => {
  let container: HTMLDivElement;
  let root: Root;
  const writeTextMock = vi.fn(async () => undefined);

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    vi.clearAllMocks();
    shellState.activeModule = "prompts";
    shellState.promptViewMode = "table";

    promptsState.selectedPromptId = "p1";
    promptsState.selectedIds = ["p1", "p2"];
    promptsState.lastBatchResult = { action: "favorite", success: 2, failed: 0, failures: [] };
    promptsState.renderPrompt.mockResolvedValue("rendered-result");

    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("表格模式多选并触发 move 批量操作", async () => {
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    const rowCheckbox = container.querySelector('input[aria-label="选择-p1"]') as HTMLInputElement;
    expect(rowCheckbox).toBeTruthy();
    await act(async () => {
      rowCheckbox.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(promptsState.setSelection).toHaveBeenCalled();

    const moveButton = findButton("批量移动");
    expect(moveButton).toBeTruthy();
    const categoryInput = moveButton?.parentElement?.querySelector("input") as HTMLInputElement;
    expect(categoryInput).toBeTruthy();
    await act(async () => {
      setNativeInputValue(categoryInput, "target-cat");
      categoryInput.dispatchEvent(new Event("input", { bubbles: true }));
      categoryInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      moveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(promptsState.batchMove).toHaveBeenCalledWith("target-cat");

  });

  it("切换到收藏夹后仅显示 favorite 项", async () => {
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    const favoritesTab = findFirstButtonByAriaLabel(["Prompts 视角 Favorites", "Prompts scope favorites"]);
    expect(favoritesTab).toBeTruthy();
    await act(async () => {
      favoritesTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const tbody = container.querySelector("tbody");
    expect(tbody?.textContent).toContain("Prompt B");
    expect(tbody?.textContent).not.toContain("Prompt A");
  });

  it("切换到分类并点击 daily 分类后仅显示 daily 项", async () => {
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    const categoriesTab = findFirstButtonByAriaLabel(["Prompts 视角 Categories", "Prompts scope categories"]);
    expect(categoriesTab).toBeTruthy();
    await act(async () => {
      categoriesTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const dailyCategoryButton = container.querySelector('button[aria-label="prompt-category-daily"]') as
      | HTMLButtonElement
      | null;
    expect(dailyCategoryButton).toBeTruthy();
    await act(async () => {
      dailyCategoryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const tbody = container.querySelector("tbody");
    expect(tbody?.textContent).toContain("Prompt B");
    expect(tbody?.textContent).not.toContain("Prompt A");
  });

  it("categories 域内搜索不跨域（daily 下可搜到 Prompt B，搜不到 Prompt A）", async () => {
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    const categoriesTab = findFirstButtonByAriaLabel(["Prompts 视角 Categories", "Prompts scope categories"]);
    expect(categoriesTab).toBeTruthy();
    await act(async () => {
      categoriesTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const dailyCategoryButton = container.querySelector('button[aria-label="prompt-category-daily"]') as
      | HTMLButtonElement
      | null;
    expect(dailyCategoryButton).toBeTruthy();
    await act(async () => {
      dailyCategoryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const searchInput =
      (container.querySelector('input[placeholder="搜索 Prompt..."]') as HTMLInputElement | null) ??
      (container.querySelector('input[placeholder="Search prompts..."]') as HTMLInputElement | null);
    expect(searchInput).toBeTruthy();
    await act(async () => {
      setNativeInputValue(searchInput as HTMLInputElement, "Prompt B");
      searchInput?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const tbody = container.querySelector("tbody");
    expect(tbody?.textContent).toContain("Prompt B");
    expect(tbody?.textContent).not.toContain("Prompt A");
  });

  it("批量收藏后出现前往 Favorites 查看按钮", async () => {
    promptsState.lastBatchResult = { action: "favorite", success: 2, failed: 0, failures: [] };
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    await act(async () => {
      findButton("批量收藏")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const goToFavorites = findButtonByTexts(["前往 Favorites 查看", "Go to Favorites"]);
    expect(goToFavorites).toBeTruthy();
    await act(async () => {
      goToFavorites?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  });

  it("批量移动后出现前往目标分类查看按钮", async () => {
    promptsState.lastBatchResult = { action: "move", success: 1, failed: 0, failures: [] };
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    const moveButton = findButton("批量移动");
    expect(moveButton).toBeTruthy();
    const categoryInput = moveButton?.parentElement?.querySelector("input") as HTMLInputElement;
    expect(categoryInput).toBeTruthy();
    await act(async () => {
      setNativeInputValue(categoryInput, "daily");
      categoryInput.dispatchEvent(new Event("input", { bubbles: true }));
      categoryInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      moveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const goToCategory = findButtonByTexts(["前往目标分类查看", "Go to Category"]);
    expect(goToCategory).toBeTruthy();
    await act(async () => {
      goToCategory?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  });

  it("列设置可打开并切换列显隐", async () => {
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    const headersBefore = Array.from(container.querySelectorAll("thead th")).map((node) => node.textContent?.trim() ?? "");
    expect(headersBefore).toContain("分类");

    await act(async () => {
      findButton("列设置")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const categoryToggle = container.querySelector('input[aria-label="显示列-分类"]') as HTMLInputElement;
    expect(categoryToggle).toBeTruthy();
    await act(async () => {
      categoryToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const headersAfter = Array.from(container.querySelectorAll("thead th")).map((node) => node.textContent?.trim() ?? "");
    expect(headersAfter).not.toContain("分类");
  });

  it("list 视图也提供复制/收藏/编辑/删除行内操作，且收藏可触发 favorite 翻转", async () => {
    shellState.promptViewMode = "list";
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    const copyButtons = findButtonsByAriaLabel(["复制 Prompt", "Copy prompt"]);
    const favoriteButtons = findButtonsByAriaLabel(["收藏", "Favorite", "取消收藏", "Unfavorite"]);
    const editButtons = findButtonsByAriaLabel(["编辑", "Edit"]);
    const deleteButtons = findButtonsByAriaLabel(["删除", "Delete"]);

    expect(copyButtons.length).toBeGreaterThan(0);
    expect(favoriteButtons.length).toBeGreaterThan(0);
    expect(editButtons.length).toBeGreaterThan(0);
    expect(deleteButtons.length).toBeGreaterThan(0);

    await act(async () => {
      favoriteButtons[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(promptsState.updatePrompt).toHaveBeenCalledWith({
      promptId: "p1",
      content: "Hello {{name}}",
      tags: ["core"],
      category: "ops",
      favorite: true,
    });
  });

  it("gallery 视图第二条无变量 Prompt 点击复制会直接写入剪贴板且不调用 renderPrompt", async () => {
    shellState.promptViewMode = "gallery";
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    const copyButtons = findButtonsByAriaLabel(["复制 Prompt", "Copy prompt"]);
    expect(copyButtons.length).toBeGreaterThanOrEqual(2);

    await act(async () => {
      copyButtons[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(writeTextMock).toHaveBeenCalledWith("No variable");
    expect(promptsState.renderPrompt).not.toHaveBeenCalled();
  });

  it("详情页分类与标签同排，移除收藏，并在文本展示模块支持编辑/查看切换", async () => {
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    const editButton = findFirstButtonByAriaLabel(["编辑", "Edit"]);
    expect(editButton).toBeTruthy();
    await act(async () => {
      editButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const labels = Array.from(container.querySelectorAll("label"));
    const categoryLabel = labels.find((label) =>
      label.textContent?.includes("分类") || label.textContent?.includes("Category"),
    );
    const tagsLabel = labels.find((label) =>
      label.textContent?.includes("标签（逗号分隔）") || label.textContent?.includes("Tags (comma separated)"),
    );

    expect(categoryLabel).toBeTruthy();
    expect(tagsLabel).toBeTruthy();
    expect(categoryLabel?.parentElement).toBe(tagsLabel?.parentElement);
    expect(categoryLabel?.parentElement?.className ?? "").toMatch(/grid|flex/);
    expect(container.textContent?.includes("收藏") || container.textContent?.includes("Favorite")).toBe(false);

    expect(container.querySelectorAll("textarea").length).toBe(1);

    const viewButton = findFirstButtonByAriaLabel(["查看", "View"]);
    const previewButton = findFirstButtonByAriaLabel(["预览", "Preview"]);
    const splitPreviewButton = findFirstButtonByAriaLabel(["分栏预览", "Split Preview"]);
    const sourceEditButton = findFirstButtonByAriaLabel(["编辑", "Edit"]);
    expect(viewButton).toBeTruthy();
    expect(previewButton).toBeTruthy();
    expect(splitPreviewButton).toBeTruthy();
    expect(sourceEditButton).toBeTruthy();

    await act(async () => {
      viewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelectorAll("textarea").length).toBe(0);
    expect(container.textContent).toContain("Hello {{name}}");

    await act(async () => {
      previewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelectorAll("textarea").length).toBe(0);
    expect(container.textContent).toContain("Hello {{name}}");

    await act(async () => {
      splitPreviewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelectorAll("textarea").length).toBe(1);
    expect(container.textContent).toContain("Hello {{name}}");

    await act(async () => {
      sourceEditButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelectorAll("textarea").length).toBe(1);
  });

  it("行内复制 Prompt 对有变量项会打开弹窗并展示变量输入", async () => {
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    const copyPromptButton = findFirstButtonByAriaLabel(["复制 Prompt", "运行 Prompt", "Copy Prompt", "Run prompt"]);
    expect(copyPromptButton).toBeTruthy();

    await act(async () => {
      copyPromptButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.textContent).toContain("变量输入");
    const variableInput = document.querySelector('input[placeholder="请输入 name"]') as HTMLInputElement;
    expect(variableInput).toBeTruthy();
  });

  it("无变量项点击复制 Prompt 直接写入原始内容，不调用 renderPrompt", async () => {
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    const buttons = findButtonsByAriaLabel(["复制 Prompt", "运行 Prompt", "Copy Prompt", "Run prompt"]);
    expect(buttons.length).toBeGreaterThanOrEqual(2);

    await act(async () => {
      buttons[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(writeTextMock).toHaveBeenCalledWith("No variable");
    expect(promptsState.renderPrompt).not.toHaveBeenCalled();
  });

  it("有变量时弹窗实时预览，未填值保留占位符", async () => {
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    const copyPromptButton = findFirstButtonByAriaLabel(["复制 Prompt", "运行 Prompt", "Copy Prompt", "Run prompt"]);
    expect(copyPromptButton).toBeTruthy();
    await act(async () => {
      copyPromptButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.textContent).toContain("Hello {{name}}");

    const variableInput = document.querySelector('input[placeholder="请输入 name"]') as HTMLInputElement;
    expect(variableInput).toBeTruthy();
    await act(async () => {
      setNativeInputValue(variableInput, "Alice");
      variableInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(document.body.textContent).toContain("Hello Alice");
  });

  it("有变量时点击复制预览内容，直接复制预览且不调用 renderPrompt", async () => {
    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    const copyPromptButton = findFirstButtonByAriaLabel(["复制 Prompt", "运行 Prompt", "Copy Prompt", "Run prompt"]);
    expect(copyPromptButton).toBeTruthy();
    await act(async () => {
      copyPromptButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const variableInput = document.querySelector('input[placeholder="请输入 name"]') as HTMLInputElement;
    expect(variableInput).toBeTruthy();
    await act(async () => {
      setNativeInputValue(variableInput, "Alice");
      variableInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const copyPreviewButton = findButton("复制预览内容") ?? findButton("Copy Preview");
    expect(copyPreviewButton).toBeTruthy();
    await act(async () => {
      copyPreviewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(writeTextMock).toHaveBeenCalledWith("Hello Alice");
    expect(promptsState.renderPrompt).not.toHaveBeenCalled();
  });

  it("复制预览失败后可重试", async () => {
    writeTextMock.mockRejectedValueOnce(new Error("copy failed")).mockResolvedValueOnce(undefined);

    await act(async () => {
      root.render(<WorkbenchApp />);
    });

    const copyPromptButton = findFirstButtonByAriaLabel(["复制 Prompt", "运行 Prompt", "Copy Prompt", "Run prompt"]);
    expect(copyPromptButton).toBeTruthy();
    await act(async () => {
      copyPromptButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const copyPreviewButton = findButton("复制预览内容") ?? findButton("Copy Preview");
    expect(copyPreviewButton).toBeTruthy();
    await act(async () => {
      copyPreviewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(writeTextMock).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalled();

    await act(async () => {
      copyPreviewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(writeTextMock).toHaveBeenCalledTimes(2);
  });
});
