import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SkillStatusPopover, type SkillStatusPopoverProps } from "../SkillStatusPopover";

const l = (zh: string) => zh;

function renderPopover(root: Root, props?: Partial<SkillStatusPopoverProps>) {
  const primaryAction = vi.fn();
  const secondaryAction = vi.fn();

  const merged: SkillStatusPopoverProps = {
    open: true,
    onOpenChange: vi.fn(),
    skillName: "demo-skill",
    targetLabel: "/Users/demo/.codex/skills",
    status: "missing",
    summaryLines: ["line 1", "line 2", "line 3"],
    primaryAction: {
      label: "执行主操作",
      onClick: primaryAction,
    },
    secondaryActions: [
      {
        key: "secondary-1",
        label: "二级动作",
        onClick: secondaryAction,
      },
    ],
    l,
    ...props,
  };

  act(() => {
    root.render(<SkillStatusPopover {...merged} />);
  });

  return { primaryAction, secondaryAction };
}

describe("SkillStatusPopover", () => {
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

  it("open=false 不渲染内容", () => {
    renderPopover(root, { open: false });

    expect(container.textContent).toBe("");
    expect(document.body.textContent).not.toContain("demo-skill");
  });

  it("点击主按钮触发回调", () => {
    const { primaryAction } = renderPopover(root);

    const button = Array.from(container.querySelectorAll("button")).find(
      (node) => node.textContent?.trim() === "执行主操作",
    );

    expect(button).toBeTruthy();

    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(primaryAction).toHaveBeenCalledTimes(1);
  });

  it("点击更多操作后可点击二级动作回调", () => {
    const { secondaryAction } = renderPopover(root);

    const moreButton = Array.from(container.querySelectorAll("button")).find(
      (node) => node.textContent?.trim() === "更多操作",
    );

    expect(moreButton).toBeTruthy();

    act(() => {
      moreButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const secondaryButton = Array.from(container.querySelectorAll("button")).find(
      (node) => node.textContent?.trim() === "二级动作",
    );

    expect(secondaryButton).toBeTruthy();

    act(() => {
      secondaryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(secondaryAction).toHaveBeenCalledTimes(1);
  });
});
