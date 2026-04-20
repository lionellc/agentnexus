import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SkillUsageTimelineDialog } from "../SkillUsageTimelineDialog";

const l = (zh: string) => zh;

function findButton(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === text,
  ) as HTMLButtonElement | undefined;
}

describe("SkillUsageTimelineDialog", () => {
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

  it("无记录时展示空态", () => {
    act(() => {
      root.render(
        <SkillUsageTimelineDialog
          open
          onOpenChange={vi.fn()}
          skillName="skill-one"
          total={0}
          items={[]}
          loading={false}
          errorMessage=""
          syncJob={null}
          onRefresh={vi.fn()}
          l={l}
        />,
      );
    });

    expect(document.body.textContent).toContain("暂无调用记录");
  });

  it("有记录时按时间轴渲染条目", () => {
    act(() => {
      root.render(
        <SkillUsageTimelineDialog
          open
          onOpenChange={vi.fn()}
          skillName="skill-one"
          total={1}
          items={[
            {
              calledAt: "2026-04-18T12:00:00Z",
              agent: "codex",
              source: "codex_jsonl",
              resultStatus: "success",
              evidenceSource: "observed",
              evidenceKind: "explicit_use_skill",
              confidence: 0.95,
              sessionId: "sess-1",
              eventRef: "1:0",
              rawRef: "{}",
            },
          ]}
          loading={false}
          errorMessage=""
          syncJob={null}
          onRefresh={vi.fn()}
          l={l}
        />,
      );
    });

    expect(document.body.textContent).toContain("codex");
    expect(document.body.textContent).toContain("sess-1");
    expect(document.body.textContent).toContain("success");
  });

  it("点击刷新分析触发回调", () => {
    const onRefresh = vi.fn();

    act(() => {
      root.render(
        <SkillUsageTimelineDialog
          open
          onOpenChange={vi.fn()}
          skillName="skill-one"
          total={0}
          items={[]}
          loading={false}
          errorMessage=""
          syncJob={null}
          onRefresh={onRefresh}
          l={l}
        />,
      );
    });

    act(() => {
      findButton(document.body, "刷新分析")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
