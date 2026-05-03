import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PromptRunDialog, type PromptRunDialogProps } from "./PromptRunDialog";

function createProps(overrides: Partial<PromptRunDialogProps> = {}): PromptRunDialogProps {
  return {
    open: true,
    onOpenChange: vi.fn(),
    isZh: true,
    fromDetail: false,
    promptName: "测试 Prompt",
    variableOrder: [],
    variables: {},
    variableHistories: {},
    preview: "preview content",
    onVariableChange: vi.fn(),
    onApplyHistory: vi.fn(),
    onCopyPreview: vi.fn(),
    onCancel: vi.fn(),
    copyDisabled: false,
    ...overrides,
  };
}

function clickByText(text: string) {
  const button = Array.from(document.querySelectorAll("button")).find((item) => item.textContent?.includes(text));
  expect(button).toBeTruthy();
  act(() => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("PromptRunDialog", () => {
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

  it("无变量时显示空变量提示", () => {
    const props = createProps({ variableOrder: [] });

    act(() => {
      root.render(<PromptRunDialog {...props} />);
    });

    expect(document.body.textContent).toContain("当前 Prompt 不包含模板变量");
    expect(document.body.textContent).toContain("实时预览");
    expect(document.body.textContent).toContain("preview content");
  });

  it("有变量时渲染输入与历史应用", () => {
    const props = createProps({
      variableOrder: ["city"],
      variables: { city: "上海" },
      variableHistories: { city: ["北京"] },
    });

    act(() => {
      root.render(<PromptRunDialog {...props} />);
    });

    expect(document.body.textContent).toContain("变量: city");
    expect(document.body.textContent).toContain("最近值：北京");

    const input = document.querySelector('input[placeholder="请输入 city"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe("上海");

    clickByText("历史记录");
    expect(props.onApplyHistory).toHaveBeenCalledWith("city");
  });

  it("触发复制与取消回调", () => {
    const props = createProps();

    act(() => {
      root.render(<PromptRunDialog {...props} />);
    });

    clickByText("复制预览内容");
    clickByText("取消");
    const closeButton = document.querySelector('button[aria-label="close"]') as HTMLButtonElement;
    expect(closeButton).toBeTruthy();
    act(() => {
      closeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(props.onCopyPreview).toHaveBeenCalledTimes(1);
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });
});
