import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { SkillDistributionDialog } from "../SkillDistributionDialog";

const l = (zh: string) => zh;

const targets = [
  { id: "t1", label: "目录 A" },
  { id: "t2", label: "目录 B" },
];

const previewItems = [
  { id: "p1", label: "目录 A", kind: "safe" as const, retryable: true },
  { id: "p2", label: "目录 B", kind: "conflict" as const, message: "已存在" },
];

function findButton(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === text) as
    | HTMLButtonElement
    | undefined;
}

describe("SkillDistributionDialog", () => {
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

  it("无目录勾选时下一步禁用", async () => {
    await act(async () => {
      root.render(
        <SkillDistributionDialog
          open
          onOpenChange={vi.fn()}
          l={l}
          skillName="demo-skill"
          targets={targets}
          selectedTargetIds={[]}
          onSelectedTargetIdsChange={vi.fn()}
          previewItems={previewItems}
          onRequestPreview={vi.fn()}
          previewLoading={false}
          submitLoading={false}
          onSubmit={vi.fn()}
        />,
      );
    });

    const nextButton = findButton(document.body, "下一步");
    expect(nextButton).toBeDefined();
    expect(nextButton?.disabled).toBe(true);
  });

  it("勾选后可进入 Step2 并触发 onRequestPreview", async () => {
    const onRequestPreview = vi.fn();
    let selectedIds: string[] = [];

    const renderDialog = async () => {
      await act(async () => {
        root.render(
          <SkillDistributionDialog
            open
            onOpenChange={vi.fn()}
            l={l}
            skillName="demo-skill"
            targets={targets}
            selectedTargetIds={selectedIds}
            onSelectedTargetIdsChange={(ids) => {
              selectedIds = ids;
            }}
            previewItems={previewItems}
            onRequestPreview={onRequestPreview}
            previewLoading={false}
            submitLoading={false}
            onSubmit={vi.fn()}
          />,
        );
      });
    };

    await renderDialog();

    const firstCheckbox = document.body.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    expect(firstCheckbox).not.toBeNull();

    await act(async () => {
      firstCheckbox?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await renderDialog();

    await act(async () => {
      findButton(document.body, "下一步")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onRequestPreview).toHaveBeenCalledTimes(1);
    expect(findButton(document.body, "确认链接")).toBeDefined();
  });

  it("Step2 点击确认触发 onSubmit", async () => {
    const onSubmit = vi.fn();

    await act(async () => {
      root.render(
        <SkillDistributionDialog
          open
          onOpenChange={vi.fn()}
          l={l}
          skillName="demo-skill"
          targets={targets}
          selectedTargetIds={["t1"]}
          onSelectedTargetIdsChange={vi.fn()}
          previewItems={previewItems}
          onRequestPreview={async () => {}}
          previewLoading={false}
          submitLoading={false}
          onSubmit={onSubmit}
        />,
      );
    });

    await act(async () => {
      findButton(document.body, "下一步")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await act(async () => {
      findButton(document.body, "确认链接")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("Step2 存在取消按钮，点击后触发 onOpenChange(false)", async () => {
    const onOpenChange = vi.fn();

    await act(async () => {
      root.render(
        <SkillDistributionDialog
          open
          onOpenChange={onOpenChange}
          l={l}
          skillName="demo-skill"
          targets={targets}
          selectedTargetIds={["t1"]}
          onSelectedTargetIdsChange={vi.fn()}
          previewItems={previewItems}
          onRequestPreview={async () => {}}
          previewLoading={false}
          submitLoading={false}
          onSubmit={vi.fn()}
        />,
      );
    });

    await act(async () => {
      findButton(document.body, "下一步")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const cancelButton = findButton(document.body, "取消");
    expect(cancelButton).toBeDefined();
    expect(cancelButton?.disabled).toBe(false);

    await act(async () => {
      cancelButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
