import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SkillsConfigPanel } from "../SkillsConfigPanel";

const l = (zh: string) => zh;

function createDiffView() {
  return {
    open: false,
    status: "completed" as const,
    running: false,
    jobId: "",
    leftSkillName: "",
    rightSkillName: "",
    processedFiles: 0,
    totalFiles: 0,
    currentFile: "",
    diffFiles: 0,
    sameSkill: null,
    errorMessage: "",
    entries: [],
  };
}

describe("SkillsConfigPanel", () => {
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

  it("基础渲染", () => {
    act(() => {
      root.render(
        <SkillsConfigPanel
          scanPhase="idle"
          scanMessage=""
          scanGroups={[]}
          conflictPairs={[]}
          diffView={createDiffView()}
          onScanSkills={() => {}}
          onStartConflictDiff={() => {}}
          onCancelDiff={() => {}}
          onCloseDiff={() => {}}
          l={l}
        />,
      );
    });

    expect(container.textContent).toContain("扫描后的 skills 会自动导入本项目。");
  });

  it("点击“重新扫描”触发 onScanSkills", () => {
    const onScanSkills = vi.fn();

    act(() => {
      root.render(
        <SkillsConfigPanel
          scanPhase="idle"
          scanMessage=""
          scanGroups={[]}
          conflictPairs={[]}
          diffView={createDiffView()}
          onScanSkills={onScanSkills}
          onStartConflictDiff={() => {}}
          onCancelDiff={() => {}}
          onCloseDiff={() => {}}
          l={l}
        />,
      );
    });

    const scanBtn = Array.from(container.querySelectorAll("button")).find((btn) => btn.textContent?.includes("重新扫描"));
    expect(scanBtn).toBeTruthy();

    act(() => {
      scanBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onScanSkills).toHaveBeenCalledTimes(1);
  });

  it("冲突项点击“开始全量 Diff”触发 onStartConflictDiff", () => {
    const onStartConflictDiff = vi.fn();

    act(() => {
      root.render(
        <SkillsConfigPanel
          scanPhase="idle"
          scanMessage=""
          scanGroups={[]}
          conflictPairs={[
            {
              key: "pair-1",
              name: "demo-skill",
              left: { id: "left-1", localPath: "/tmp/left/SKILL.md" },
              right: { id: "right-1", localPath: "/tmp/right/SKILL.md" },
            },
          ]}
          diffView={createDiffView()}
          onScanSkills={() => {}}
          onStartConflictDiff={onStartConflictDiff}
          onCancelDiff={() => {}}
          onCloseDiff={() => {}}
          l={l}
        />,
      );
    });

    const diffBtn = Array.from(container.querySelectorAll("button")).find((btn) => btn.textContent?.includes("开始全量 Diff"));
    expect(diffBtn).toBeTruthy();

    act(() => {
      diffBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onStartConflictDiff).toHaveBeenCalledTimes(1);
    expect(onStartConflictDiff).toHaveBeenCalledWith("left-1", "right-1");
  });

  it("扫描分组展示软链标签与计数", () => {
    act(() => {
      root.render(
        <SkillsConfigPanel
          scanPhase="success"
          scanMessage=""
          scanGroups={[
            {
              key: "group-1",
              label: ".codex",
              total: 2,
              pendingCount: 1,
              items: [
                {
                  id: "s1",
                  name: "alpha",
                  localPath: "/Users/demo/skills/alpha",
                  conflict: false,
                  isSymlink: true,
                },
                {
                  id: "s2",
                  name: "beta",
                  localPath: "/Users/demo/skills/beta",
                  conflict: true,
                  isSymlink: false,
                },
              ],
            },
          ]}
          conflictPairs={[]}
          diffView={createDiffView()}
          onScanSkills={() => {}}
          onStartConflictDiff={() => {}}
          onCancelDiff={() => {}}
          onCloseDiff={() => {}}
          l={l}
        />,
      );
    });

    expect(container.textContent).toContain("2 项 · 1 待处理");
    expect(container.textContent).toContain("软链");
  });

  it("冲突列表超过分页阈值时支持翻页", () => {
    const conflictPairs = Array.from({ length: 9 }).map((_, index) => ({
      key: `pair-${index + 1}`,
      name: `demo-skill-${index + 1}`,
      left: { id: `left-${index + 1}`, localPath: `/tmp/left-${index + 1}` },
      right: { id: `right-${index + 1}`, localPath: `/tmp/right-${index + 1}` },
    }));

    act(() => {
      root.render(
        <SkillsConfigPanel
          scanPhase="idle"
          scanMessage=""
          scanGroups={[]}
          conflictPairs={conflictPairs}
          diffView={createDiffView()}
          onScanSkills={() => {}}
          onStartConflictDiff={() => {}}
          onCancelDiff={() => {}}
          onCloseDiff={() => {}}
          l={l}
        />,
      );
    });

    expect(container.textContent).toContain("demo-skill-8");
    expect(container.textContent).not.toContain("demo-skill-9");

    const nextButton = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.trim() === "下一页",
    );
    expect(nextButton).toBeTruthy();

    act(() => {
      nextButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("demo-skill-9");
  });
});
