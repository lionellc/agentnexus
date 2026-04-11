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
    newProfileKey: "",
    onNewProfileKeyChange: vi.fn(),
    onAddProfile: vi.fn(),
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

  it("空列表渲染并触发新增与保存回调", () => {
    const props = createProps({ profiles: [] });

    act(() => {
      root.render(<ModelWorkbenchPanel {...props} />);
    });

    expect(container.textContent).toContain("AI 模型工作台（本地 Agent）");
    expect(container.textContent).toContain("Agent 列表");

    const newProfileInput = container.querySelector('input[placeholder="新 profile key"]') as HTMLInputElement;
    expect(newProfileInput).toBeTruthy();

    const addButton = findButton(container, "新增自定义 Agent");
    expect(addButton).toBeTruthy();
    act(() => {
      addButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(props.onAddProfile).toHaveBeenCalledTimes(1);

    const saveButton = findButton(container, "保存 Profile");
    expect(saveButton).toBeTruthy();
    act(() => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(props.onSaveProfile).toHaveBeenCalledTimes(1);
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
      },
      {
        profileKey: "custom",
        name: "Custom",
        executable: "custom-cli",
        argsTemplate: ["--json"],
        isBuiltin: false,
        enabled: true,
      },
    ];
    const props = createProps({ profiles, selectedProfileKey: "builtin" });

    act(() => {
      root.render(<ModelWorkbenchPanel {...props} />);
    });

    expect(container.textContent).toContain("builtin");
    expect(container.textContent).toContain("custom");

    const profileSelectButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("custom"),
    ) as HTMLButtonElement | undefined;
    expect(profileSelectButton).toBeTruthy();
    act(() => {
      profileSelectButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(props.onSelectProfile).toHaveBeenCalledWith("custom");

    const deleteButton = findButton(container, "删除");
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
