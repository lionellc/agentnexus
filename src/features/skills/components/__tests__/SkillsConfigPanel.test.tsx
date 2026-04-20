import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SkillsConfigPanel } from "../SkillsConfigPanel";

const l = (zh: string) => zh;

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
          onScanSkills={() => {}}
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
          onScanSkills={onScanSkills}
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
          onScanSkills={() => {}}
          l={l}
        />,
      );
    });

    expect(container.textContent).toContain("2 项 · 1 待处理");
    expect(container.textContent).toContain("软链");
  });

  it("不再展示同名冲突全量 Diff 模块", () => {
    act(() => {
      root.render(
        <SkillsConfigPanel
          scanPhase="idle"
          scanMessage=""
          scanGroups={[]}
          onScanSkills={() => {}}
          l={l}
        />,
      );
    });

    expect(container.textContent).not.toContain("同名冲突全量 Diff");
    expect(container.textContent).not.toContain("开始全量 Diff");
  });
});
