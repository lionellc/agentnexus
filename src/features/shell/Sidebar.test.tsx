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
});
