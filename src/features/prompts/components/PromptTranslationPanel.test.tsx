import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PromptTranslationPanel, type PromptTranslationItem } from "./PromptTranslationPanel";

type PanelProps = Parameters<typeof PromptTranslationPanel>[0];

function findButton(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes(text)) as
    | HTMLButtonElement
    | undefined;
}

function createProps(overrides: Partial<PanelProps> = {}): PanelProps {
  return {
    isZh: true,
    loading: false,
    targetLanguage: "英文",
    onTargetLanguageChange: vi.fn(),
    runLoading: false,
    applyMode: "immersive",
    onApplyModeChange: vi.fn(),
    onRunTranslation: vi.fn(),
    onRefresh: vi.fn(),
    translations: [],
    selectedTranslationId: null,
    onSelectTranslation: vi.fn(),
    onRetranslate: vi.fn(),
    onApplyOverwrite: vi.fn(),
    onApplyImmersive: vi.fn(),
    immersivePreview: null,
    ...overrides,
  };
}

describe("PromptTranslationPanel", () => {
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

  it("空列表渲染并触发切换模式与运行翻译", () => {
    const props = createProps({ translations: [] });

    act(() => {
      root.render(<PromptTranslationPanel {...props} />);
    });

    expect(container.textContent).toContain("翻译侧栏");
    expect(container.textContent).toContain("暂无译文");

    const languageInput = container.querySelector('input[placeholder="例如：英文 / 日文"]') as HTMLInputElement;
    expect(languageInput).toBeTruthy();

    const immersiveButton = findButton(container, "沉浸式");
    const overwriteModeButton = findButton(container, "覆盖原文");
    expect(immersiveButton).toBeTruthy();
    expect(overwriteModeButton).toBeTruthy();

    act(() => {
      immersiveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      overwriteModeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(props.onApplyModeChange).toHaveBeenNthCalledWith(1, "immersive");
    expect(props.onApplyModeChange).toHaveBeenNthCalledWith(2, "overwrite");

    const runButton = findButton(container, "开始翻译");
    expect(runButton).toBeTruthy();
    act(() => {
      runButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(props.onRunTranslation).toHaveBeenCalledTimes(1);
  });

  it("有数据渲染并触发选择译文、重翻译、应用覆盖和沉浸式", () => {
    const translations: PromptTranslationItem[] = [
      {
        id: "t1",
        targetLanguage: "英文",
        variantNo: 1,
        variantLabel: "版本 1",
        translatedText: "Hello",
        updatedAt: "2026-04-11 10:00:00",
        applyMode: "immersive",
      },
      {
        id: "t2",
        targetLanguage: "英文",
        variantNo: 2,
        variantLabel: "版本 2",
        translatedText: "Hi",
        updatedAt: "2026-04-11 10:01:00",
        applyMode: "overwrite",
      },
    ];
    const props = createProps({
      translations,
      selectedTranslationId: "t1",
      immersivePreview: "原文 / 译文",
    });

    act(() => {
      root.render(<PromptTranslationPanel {...props} />);
    });

    expect(container.textContent).toContain("版本 1");
    expect(container.textContent).toContain("版本 2");
    expect(container.textContent).toContain("沉浸式双语");

    const secondTranslationButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("版本 2"),
    ) as HTMLButtonElement | undefined;
    expect(secondTranslationButton).toBeTruthy();
    act(() => {
      secondTranslationButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(props.onSelectTranslation).toHaveBeenCalledWith("t2");

    const retranslateButton = findButton(container, "重翻译");
    const applyOverwriteButton = findButton(container, "应用为原文");
    const immersiveApplyButton = findButton(container, "沉浸式预览");
    expect(retranslateButton).toBeTruthy();
    expect(applyOverwriteButton).toBeTruthy();
    expect(immersiveApplyButton).toBeTruthy();

    act(() => {
      retranslateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      applyOverwriteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      immersiveApplyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(props.onRetranslate).toHaveBeenCalledTimes(1);
    expect(props.onApplyOverwrite).toHaveBeenCalledTimes(1);
    expect(props.onApplyImmersive).toHaveBeenCalledTimes(1);
  });
});
