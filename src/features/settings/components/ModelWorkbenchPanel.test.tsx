import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ModelWorkbenchPanel, type LocalAgentProfileItem } from "./ModelWorkbenchPanel";

type PanelProps = Parameters<typeof ModelWorkbenchPanel>[0];

function findButton(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes(text)) as
    | HTMLButtonElement
    | undefined;
}

function createProps(overrides: Partial<PanelProps> = {}): PanelProps {
  return {
    isZh: true,
    loading: false,
    profiles: [],
    selectedProfileKey: "",
    onSelectProfile: vi.fn(),
    onDeleteProfile: vi.fn(),
    profileName: "默认 profile",
    onProfileNameChange: vi.fn(),
    executable: "codex",
    onExecutableChange: vi.fn(),
    argsTemplateText: "[]",
    onArgsTemplateTextChange: vi.fn(),
    onSaveProfile: vi.fn(),
    newProfileName: "",
    onNewProfileNameChange: vi.fn(),
    onAddProfile: vi.fn(async () => true),
    translationScenarioDefaultProfileKey: "codex",
    onOpenTranslationScenarioSettings: vi.fn(),
    onOpenTranslationScenarioTest: vi.fn(),
    testRunning: false,
    ...overrides,
  };
}

describe("ModelWorkbenchPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("空列表渲染并触发新增回调", async () => {
    const props = createProps({ profiles: [] });

    act(() => {
      root.render(<ModelWorkbenchPanel {...props} />);
    });

    expect(container.textContent).toContain("AI 模型配置");
    const addButton = findButton(container, "新增模型");
    expect(addButton).toBeTruthy();
    act(() => {
      addButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const newProfileInput = document.querySelector('input[placeholder="新模型名称"]') as HTMLInputElement;
    expect(newProfileInput).toBeTruthy();

    const saveButton = findButton(document.body, "保存");
    expect(saveButton).toBeTruthy();
    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(props.onAddProfile).toHaveBeenCalledTimes(1);
    expect(props.onAddProfile).toHaveBeenCalledWith("localAgent");
  });

  it("有数据渲染并触发选择 profile、删除、场景设置和测试运行", () => {
    const profiles: LocalAgentProfileItem[] = [
      {
        profileKey: "builtin",
        name: "Builtin",
        executable: "codex",
        argsTemplate: [],
        isBuiltin: true,
        enabled: true,
        sourceType: "localAgent",
      },
      {
        profileKey: "custom",
        name: "Custom",
        executable: "custom-cli",
        argsTemplate: ["--json"],
        isBuiltin: false,
        enabled: true,
        sourceType: "localAgent",
      },
      {
        profileKey: "remote",
        name: "Remote",
        executable: "remote-api",
        argsTemplate: [],
        isBuiltin: false,
        enabled: true,
        sourceType: "api",
      },
    ];
    const props = createProps({
      profiles,
      selectedProfileKey: "builtin",
      translationScenarioDefaultProfileKey: "builtin",
    });

    act(() => {
      root.render(<ModelWorkbenchPanel {...props} />);
    });

    expect(container.textContent).toContain("Builtin");
    expect(container.textContent).toContain("Custom");
    expect(container.textContent).toContain("本地");
    expect(container.textContent).toContain("API");
    expect(container.textContent).toContain("默认模型：");
    expect(container.textContent).toContain("Builtin (本地)");

    const customRow = container.querySelector('[data-testid="model-profile-row-custom"]');
    expect(customRow).toBeTruthy();

    const profileSelectButton = container.querySelector(
      '[data-testid="model-profile-edit-custom"]',
    ) as HTMLButtonElement | null;
    expect(profileSelectButton).toBeTruthy();
    act(() => {
      profileSelectButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(props.onSelectProfile).toHaveBeenCalledWith("custom");

    const saveButton = findButton(document.body, "保存");
    expect(saveButton).toBeTruthy();
    act(() => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(props.onSaveProfile).toHaveBeenCalledTimes(1);

    const deleteButton = container.querySelector(
      '[data-testid="model-profile-delete-custom"]',
    ) as HTMLButtonElement | null;
    expect(deleteButton).toBeTruthy();
    act(() => {
      deleteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(props.onDeleteProfile).toHaveBeenCalledWith("custom");

    const settingsButton = findButton(container, "设置");
    expect(settingsButton).toBeTruthy();
    act(() => {
      settingsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(props.onOpenTranslationScenarioSettings).toHaveBeenCalledTimes(1);

    const runTestButton = findButton(container, "测试运行");
    expect(runTestButton).toBeTruthy();
    act(() => {
      runTestButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(props.onOpenTranslationScenarioTest).toHaveBeenCalledTimes(1);
  });
});
