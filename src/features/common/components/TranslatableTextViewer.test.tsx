import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TranslatableTextViewer } from "./TranslatableTextViewer";

type ViewerProps = Parameters<typeof TranslatableTextViewer>[0];

function findButton(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes(text)) as
    | HTMLButtonElement
    | undefined;
}

function findButtonByAriaLabel(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find((button) =>
    button.getAttribute("aria-label")?.includes(text),
  ) as HTMLButtonElement | undefined;
}

async function openTranslationPanel(container: HTMLElement) {
  const alreadyOpen = Boolean(
    findButton(container, "显示译文") ||
    findButton(container, "隐藏译文"),
  );
  if (alreadyOpen) {
    return;
  }
  const panelButton = findButtonByAriaLabel(container, "翻译工具");
  expect(panelButton).toBeTruthy();
  await act(async () => {
    panelButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function createProps(overrides: Partial<ViewerProps> = {}): ViewerProps {
  return {
    isZh: true,
    sourceText: "source text",
    translatedText: "",
    targetLanguage: "zh-CN",
    targetLanguageOptions: [
      { value: "zh-CN", label: "中文" },
      { value: "en", label: "English" },
    ],
    translating: false,
    onTargetLanguageChange: vi.fn(),
    onTranslate: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("TranslatableTextViewer", () => {
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
    vi.restoreAllMocks();
  });

  it("当前目标语言已有译文时，点击翻译会先二次确认", async () => {
    const onTranslate = vi.fn(async () => undefined);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const props = createProps({
      translatedText: "已存在译文",
      onTranslate,
    });

    act(() => {
      root.render(<TranslatableTextViewer {...props} />);
    });

    await openTranslationPanel(container);

    const translateButton = findButton(container, "翻译");
    expect(translateButton).toBeTruthy();

    await act(async () => {
      translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(onTranslate).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    await act(async () => {
      translateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onTranslate).toHaveBeenCalledTimes(1);
  });

  it("显示译文按钮按目标语言可用性启用/禁用", async () => {
    const props = createProps({
      targetLanguage: "zh-CN",
      translatedText: "中文译文",
    });

    act(() => {
      root.render(<TranslatableTextViewer {...props} />);
    });

    await openTranslationPanel(container);
    const showButtonAtZh = findButton(container, "显示译文");
    expect(showButtonAtZh).toBeTruthy();
    expect(showButtonAtZh?.disabled).toBe(false);

    act(() => {
      root.render(
        <TranslatableTextViewer
          {...props}
          targetLanguage="en"
          translatedText="中文译文"
        />,
      );
    });

    await openTranslationPanel(container);
    const showButtonAtEnBeforeData = findButton(container, "显示译文");
    expect(showButtonAtEnBeforeData).toBeTruthy();
    expect(showButtonAtEnBeforeData?.disabled).toBe(true);

    act(() => {
      root.render(
        <TranslatableTextViewer
          {...props}
          targetLanguage="en"
          translatedText="English translation"
        />,
      );
    });

    await openTranslationPanel(container);
    const showButtonAtEnAfterData = findButton(container, "显示译文");
    expect(showButtonAtEnAfterData).toBeTruthy();
    expect(showButtonAtEnAfterData?.disabled).toBe(false);
  });

  it("翻译 loading 仅作用于当前触发目标，不共享到其他目标", async () => {
    let resolveTranslate: (() => void) | null = null;
    const onTranslate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveTranslate = resolve;
        }),
    );
    const props = createProps({
      targetLanguage: "zh-CN",
      translatedText: "",
      translating: true,
      onTranslate,
    });

    act(() => {
      root.render(<TranslatableTextViewer {...props} />);
    });

    await openTranslationPanel(container);

    const idleTranslateButton = findButton(container, "翻译");
    expect(idleTranslateButton).toBeTruthy();
    expect(idleTranslateButton?.textContent).toContain("翻译");
    expect(idleTranslateButton?.textContent).not.toContain("翻译中");
    expect(idleTranslateButton?.disabled).toBe(false);

    await act(async () => {
      idleTranslateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const runningButtonAtZh = findButton(container, "翻译中...");
    expect(runningButtonAtZh).toBeTruthy();

    act(() => {
      root.render(
        <TranslatableTextViewer
          {...props}
          targetLanguage="en"
          translatedText=""
          translating={false}
        />,
      );
    });

    await openTranslationPanel(container);

    const idleButtonAtEn = findButton(container, "翻译");
    expect(idleButtonAtEn).toBeTruthy();
    expect(idleButtonAtEn?.textContent).toContain("翻译");
    expect(idleButtonAtEn?.textContent).not.toContain("翻译中");

    await act(async () => {
      resolveTranslate?.();
    });
  });
});
