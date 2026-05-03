import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import { Sidebar } from "./Sidebar";

describe("Sidebar", () => {
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

  it("点击全局 Agent 规则会切换到 agents 模块", () => {
    const onChangeModule = vi.fn();

    act(() => {
      root.render(
        <Sidebar
          activeModule="prompts"
          language="zh-CN"
          onChangeModule={onChangeModule}
          promptCount={1}
          skillCount={2}
          agentRulesCount={3}
          onOpenSettings={vi.fn()}
        />,
      );
    });

    const targetButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("全局 Agent 规则"),
    );
    expect(targetButton).toBeTruthy();

    act(() => {
      targetButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onChangeModule).toHaveBeenCalledWith("agents");
  });

  it("点击渠道 API 测试台会切换到 channelTest 模块", () => {
    const onChangeModule = vi.fn();

    act(() => {
      root.render(
        <Sidebar
          activeModule="prompts"
          language="zh-CN"
          onChangeModule={onChangeModule}
          promptCount={1}
          skillCount={2}
          agentRulesCount={3}
          onOpenSettings={vi.fn()}
        />,
      );
    });

    const targetButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("渠道 API 测试台"),
    );
    expect(targetButton).toBeTruthy();

    act(() => {
      targetButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onChangeModule).toHaveBeenCalledWith("channelTest");
  });

  it("标记当前模块并给设置按钮提供可访问名称", () => {
    act(() => {
      root.render(
        <Sidebar
          activeModule="settings"
          language="zh-CN"
          onChangeModule={vi.fn()}
          promptCount={1}
          skillCount={2}
          agentRulesCount={3}
          onOpenSettings={vi.fn()}
        />,
      );
    });

    const settingsButton = container.querySelector('button[aria-label="打开设置"]');
    expect(settingsButton).toBeTruthy();
    expect(settingsButton?.getAttribute("aria-current")).toBe("page");
  });
});
