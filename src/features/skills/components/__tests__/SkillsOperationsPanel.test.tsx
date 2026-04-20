import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SkillsOperationsPanel } from "../SkillsOperationsPanel";

const l = (zh: string) => zh;

const baseRows = [
  {
    id: "s1",
    name: "skill-one",
    group: "core",
    source: "/Users/demo/.codex/skills",
    localPath: "/Users/demo/.codex/skills/skill-one",
    sourceMissing: false,
    conflict: false,
    linkedCount: 1,
    totalCount: 4,
    issueCount: 3,
    statusCells: [
      { tool: "codex", status: "linked" as const },
      { tool: "claude", status: "missing" as const },
      { tool: "cursor", status: "blocked" as const },
      { tool: "zed", status: "wrong" as const },
    ],
    statusPreview: [
      { tool: "codex", status: "linked" as const },
      { tool: "claude", status: "missing" as const },
      { tool: "cursor", status: "blocked" as const },
    ],
    hiddenStatusCount: 1,
    totalCalls: 4,
    last7dCalls: 2,
    lastCalledAt: "2026-04-18T12:00:00Z",
  },
];

const baseSummaries = [
  {
    tool: "codex",
    linked: 1,
    missing: 0,
    blocked: 0,
    wrong: 0,
    directory: 0,
    manual: 0,
    total: 1,
    issueCount: 0,
  },
];

const baseUsageProps = {
  skillQuery: "",
  onSkillQueryChange: vi.fn(),
  onRefreshSkills: vi.fn(),
  skillsLoading: false,
  usageAgentFilter: "",
  usageSourceFilter: "",
  usageEvidenceSourceFilter: "",
  usageStatsLoading: false,
  usageStatsError: "",
  usageSyncJob: null,
  onUsageFilterChange: vi.fn(),
  onUsageRefresh: vi.fn(),
};

function findButton(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === text,
  ) as HTMLButtonElement | undefined;
}

function getVisibleSkillTitles(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("span.font-medium.text-slate-900"))
    .map((node) => node.textContent?.trim() ?? "")
    .filter(Boolean);
}

describe("SkillsOperationsPanel", () => {
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

  it("点击矩阵状态会触发过滤回调", () => {
    const onMatrixFilterChange = vi.fn();

    act(() => {
      root.render(
        <SkillsOperationsPanel
          rows={baseRows}
          matrixSummaries={baseSummaries}
          matrixFilter={{ tool: null, status: "all" }}
          {...baseUsageProps}
          expandedSkillId={null}
          runningDistribution={false}
          purgingSkillId={null}
          onMatrixFilterChange={onMatrixFilterChange}
          onToggleExpanded={vi.fn()}
          onOpenSkillDetail={vi.fn()}
          onRunDistribution={vi.fn()}
          onRunLink={vi.fn()}
          onRunUnlink={vi.fn()}
          onPurgeSkill={vi.fn()}
          onDismissRowHint={vi.fn()}
          onJumpToConfig={vi.fn()}
          l={l}
        />,
      );
    });

    act(() => {
      findButton(container, "已链接 1")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(onMatrixFilterChange).toHaveBeenCalledWith({ tool: "codex", status: "linked" });
  });

  it("agent 看板默认折叠并支持展开收起", () => {
    const summaries = Array.from({ length: 7 }).map((_, index) => ({
      tool: `agent-${index + 1}`,
      linked: 0,
      missing: 1,
      blocked: 0,
      wrong: 0,
      directory: 0,
      manual: 0,
      total: 1,
      issueCount: 1,
    }));

    act(() => {
      root.render(
        <SkillsOperationsPanel
          rows={baseRows}
          matrixSummaries={summaries}
          matrixFilter={{ tool: null, status: "all" }}
          {...baseUsageProps}
          expandedSkillId={null}
          runningDistribution={false}
          purgingSkillId={null}
          onMatrixFilterChange={vi.fn()}
          onToggleExpanded={vi.fn()}
          onOpenSkillDetail={vi.fn()}
          onRunDistribution={vi.fn()}
          onRunLink={vi.fn()}
          onRunUnlink={vi.fn()}
          onPurgeSkill={vi.fn()}
          onDismissRowHint={vi.fn()}
          onJumpToConfig={vi.fn()}
          l={l}
        />,
      );
    });

    expect(container.textContent).toContain("agent-1");
    expect(container.textContent).not.toContain("agent-7");

    act(() => {
      findButton(container, "展开 Agent 看板 (+1)")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(container.textContent).toContain("agent-7");
    expect(container.textContent).toContain("收起 Agent 看板");
  });

  it("目标目录超过预览上限时显示查看更多按钮", () => {
    const onToggleExpanded = vi.fn();

    act(() => {
      root.render(
        <SkillsOperationsPanel
          rows={baseRows}
          matrixSummaries={baseSummaries}
          matrixFilter={{ tool: null, status: "all" }}
          {...baseUsageProps}
          expandedSkillId={null}
          runningDistribution={false}
          purgingSkillId={null}
          onMatrixFilterChange={vi.fn()}
          onToggleExpanded={onToggleExpanded}
          onOpenSkillDetail={vi.fn()}
          onRunDistribution={vi.fn()}
          onRunLink={vi.fn()}
          onRunUnlink={vi.fn()}
          onPurgeSkill={vi.fn()}
          onDismissRowHint={vi.fn()}
          onJumpToConfig={vi.fn()}
          l={l}
        />,
      );
    });

    const moreButton = findButton(container, "查看更多 (1)");
    expect(moreButton).toBeDefined();

    act(() => {
      moreButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onToggleExpanded).toHaveBeenCalledWith("s1");
  });

  it("空列表时展示前往扫描入口", () => {
    const onJumpToConfig = vi.fn();

    act(() => {
      root.render(
        <SkillsOperationsPanel
          rows={[]}
          matrixSummaries={[]}
          matrixFilter={{ tool: null, status: "all" }}
          {...baseUsageProps}
          expandedSkillId={null}
          runningDistribution={false}
          purgingSkillId={null}
          onMatrixFilterChange={vi.fn()}
          onToggleExpanded={vi.fn()}
          onOpenSkillDetail={vi.fn()}
          onRunDistribution={vi.fn()}
          onRunLink={vi.fn()}
          onRunUnlink={vi.fn()}
          onPurgeSkill={vi.fn()}
          onDismissRowHint={vi.fn()}
          onJumpToConfig={onJumpToConfig}
          l={l}
        />,
      );
    });

    act(() => {
      findButton(container, "前往扫描")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(onJumpToConfig).toHaveBeenCalledTimes(1);
  });

  it("筛选无结果时保留看板并支持重置筛选", () => {
    const onMatrixFilterChange = vi.fn();

    act(() => {
      root.render(
        <SkillsOperationsPanel
          rows={[]}
          matrixSummaries={baseSummaries}
          matrixFilter={{ tool: "codex", status: "wrong" }}
          {...baseUsageProps}
          expandedSkillId={null}
          runningDistribution={false}
          purgingSkillId={null}
          onMatrixFilterChange={onMatrixFilterChange}
          onToggleExpanded={vi.fn()}
          onOpenSkillDetail={vi.fn()}
          onRunDistribution={vi.fn()}
          onRunLink={vi.fn()}
          onRunUnlink={vi.fn()}
          onPurgeSkill={vi.fn()}
          onDismissRowHint={vi.fn()}
          onJumpToConfig={vi.fn()}
          l={l}
        />,
      );
    });

    expect(container.textContent).toContain("当前筛选无结果");
    expect(container.textContent).not.toContain("前往扫描");

    act(() => {
      findButton(container, "重置状态筛选")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(onMatrixFilterChange).toHaveBeenCalledWith({ tool: null, status: "all" });
  });

  it("列表超出分页阈值时支持翻页", () => {
    const rows = Array.from({ length: 11 }).map((_, index) => ({
      ...baseRows[0],
      id: `s${index + 1}`,
      name: `skill-${index + 1}`,
      localPath: `/tmp/skill-${index + 1}`,
    }));

    act(() => {
      root.render(
        <SkillsOperationsPanel
          rows={rows}
          matrixSummaries={baseSummaries}
          matrixFilter={{ tool: null, status: "all" }}
          {...baseUsageProps}
          expandedSkillId={null}
          runningDistribution={false}
          purgingSkillId={null}
          onMatrixFilterChange={vi.fn()}
          onToggleExpanded={vi.fn()}
          onOpenSkillDetail={vi.fn()}
          onRunDistribution={vi.fn()}
          onRunLink={vi.fn()}
          onRunUnlink={vi.fn()}
          onPurgeSkill={vi.fn()}
          onDismissRowHint={vi.fn()}
          onJumpToConfig={vi.fn()}
          l={l}
        />,
      );
    });

    const firstPageTitles = getVisibleSkillTitles(container);
    expect(firstPageTitles).toContain("skill-10");
    expect(firstPageTitles).not.toContain("skill-11");

    act(() => {
      findButton(container, "下一页")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    const secondPageTitles = getVisibleSkillTitles(container);
    expect(secondPageTitles).toContain("skill-11");
  });

  it("矩阵状态会区分缺失和待链接", () => {
    const summaries = [
      {
        tool: "codex",
        linked: 1,
        missing: 2,
        blocked: 0,
        wrong: 1,
        directory: 2,
        manual: 0,
        total: 6,
        issueCount: 5,
      },
    ];

    act(() => {
      root.render(
        <SkillsOperationsPanel
          rows={baseRows}
          matrixSummaries={summaries}
          matrixFilter={{ tool: null, status: "all" }}
          {...baseUsageProps}
          expandedSkillId={null}
          runningDistribution={false}
          purgingSkillId={null}
          onMatrixFilterChange={vi.fn()}
          onToggleExpanded={vi.fn()}
          onOpenSkillDetail={vi.fn()}
          onRunDistribution={vi.fn()}
          onRunLink={vi.fn()}
          onRunUnlink={vi.fn()}
          onPurgeSkill={vi.fn()}
          onDismissRowHint={vi.fn()}
          onJumpToConfig={vi.fn()}
          l={l}
        />,
      );
    });

    expect(container.textContent).toContain("缺失 2");
    expect(container.textContent).toContain("待链接 3");
  });

  it("行内状态会显示缺失", () => {
    act(() => {
      root.render(
        <SkillsOperationsPanel
          rows={baseRows}
          matrixSummaries={baseSummaries}
          matrixFilter={{ tool: null, status: "all" }}
          {...baseUsageProps}
          expandedSkillId={null}
          runningDistribution={false}
          purgingSkillId={null}
          onMatrixFilterChange={vi.fn()}
          onToggleExpanded={vi.fn()}
          onOpenSkillDetail={vi.fn()}
          onRunDistribution={vi.fn()}
          onRunLink={vi.fn()}
          onRunUnlink={vi.fn()}
          onPurgeSkill={vi.fn()}
          onDismissRowHint={vi.fn()}
          onJumpToConfig={vi.fn()}
          l={l}
        />,
      );
    });

    expect(container.textContent).toContain("claude: 缺失");
  });

  it("源目录缺失时展示异常标签并支持清除", () => {
    const onPurgeSkill = vi.fn();
    const rows = [
      {
        ...baseRows[0],
        sourceMissing: true,
      },
    ];

    act(() => {
      root.render(
        <SkillsOperationsPanel
          rows={rows}
          matrixSummaries={baseSummaries}
          matrixFilter={{ tool: null, status: "all" }}
          {...baseUsageProps}
          expandedSkillId={null}
          runningDistribution={false}
          purgingSkillId={null}
          onMatrixFilterChange={vi.fn()}
          onToggleExpanded={vi.fn()}
          onOpenSkillDetail={vi.fn()}
          onRunDistribution={vi.fn()}
          onRunLink={vi.fn()}
          onRunUnlink={vi.fn()}
          onPurgeSkill={onPurgeSkill}
          onDismissRowHint={vi.fn()}
          onJumpToConfig={vi.fn()}
          l={l}
        />,
      );
    });

    expect(container.textContent).toContain("源目录缺失");
    const clearButton = findButton(container, "清除");
    expect(clearButton).toBeDefined();
    act(() => {
      clearButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onPurgeSkill).toHaveBeenCalledWith("s1", "skill-one");
  });

  it("工具菜单中的调用次数分析会触发回调并展示进度", () => {
    const onUsageRefresh = vi.fn();

    act(() => {
      root.render(
        <SkillsOperationsPanel
          rows={baseRows}
          matrixSummaries={baseSummaries}
          matrixFilter={{ tool: null, status: "all" }}
          {...baseUsageProps}
          usageSyncJob={{
            jobId: "job-1",
            workspaceId: "w1",
            status: "completed",
            totalFiles: 10,
            processedFiles: 4,
            parsedEvents: 20,
            insertedEvents: 18,
            duplicateEvents: 2,
            parseFailures: 0,
            currentSource: "/tmp/demo.jsonl",
            errorMessage: "",
            startedAt: "2026-04-18T12:00:00Z",
            updatedAt: "2026-04-18T12:01:00Z",
          }}
          onUsageRefresh={onUsageRefresh}
          expandedSkillId={null}
          runningDistribution={false}
          purgingSkillId={null}
          onMatrixFilterChange={vi.fn()}
          onToggleExpanded={vi.fn()}
          onOpenSkillDetail={vi.fn()}
          onRunDistribution={vi.fn()}
          onRunLink={vi.fn()}
          onRunUnlink={vi.fn()}
          onPurgeSkill={vi.fn()}
          onDismissRowHint={vi.fn()}
          onJumpToConfig={vi.fn()}
          l={l}
        />,
      );
    });

    expect(container.textContent).toContain("4/10");
    expect(container.textContent).toContain("工具");
    act(() => {
      findButton(container, "工具")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    act(() => {
      findButton(container, "调用次数分析")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onUsageRefresh).toHaveBeenCalledTimes(1);
  });

  it("调用分析状态条支持关闭", () => {
    const onDismissUsageSyncJob = vi.fn();

    act(() => {
      root.render(
        <SkillsOperationsPanel
          rows={baseRows}
          matrixSummaries={baseSummaries}
          matrixFilter={{ tool: null, status: "all" }}
          {...baseUsageProps}
          usageSyncJob={{
            jobId: "job-2",
            workspaceId: "w1",
            status: "completed_with_errors",
            totalFiles: 10,
            processedFiles: 10,
            parsedEvents: 20,
            insertedEvents: 18,
            duplicateEvents: 2,
            parseFailures: 2,
            currentSource: "",
            errorMessage: "发现 2 条解析异常",
            startedAt: "2026-04-18T12:00:00Z",
            updatedAt: "2026-04-18T12:01:00Z",
          }}
          onDismissUsageSyncJob={onDismissUsageSyncJob}
          expandedSkillId={null}
          runningDistribution={false}
          purgingSkillId={null}
          onMatrixFilterChange={vi.fn()}
          onToggleExpanded={vi.fn()}
          onOpenSkillDetail={vi.fn()}
          onRunDistribution={vi.fn()}
          onRunLink={vi.fn()}
          onRunUnlink={vi.fn()}
          onPurgeSkill={vi.fn()}
          onDismissRowHint={vi.fn()}
          onJumpToConfig={vi.fn()}
          l={l}
        />,
      );
    });

    const closeButton = container.querySelector("button[aria-label='关闭状态']") as HTMLButtonElement | null;
    expect(closeButton).toBeTruthy();
    act(() => {
      closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onDismissUsageSyncJob).toHaveBeenCalledTimes(1);
  });

  it("排序菜单支持按调用次数排序", () => {
    const rows = [
      {
        ...baseRows[0],
        id: "s-low",
        name: "skill-low",
        totalCalls: 1,
        last7dCalls: 1,
        localPath: "/tmp/skill-low",
      },
      {
        ...baseRows[0],
        id: "s-high",
        name: "skill-high",
        totalCalls: 99,
        last7dCalls: 20,
        localPath: "/tmp/skill-high",
      },
    ];

    act(() => {
      root.render(
        <SkillsOperationsPanel
          rows={rows}
          matrixSummaries={baseSummaries}
          matrixFilter={{ tool: null, status: "all" }}
          {...baseUsageProps}
          expandedSkillId={null}
          runningDistribution={false}
          purgingSkillId={null}
          onMatrixFilterChange={vi.fn()}
          onToggleExpanded={vi.fn()}
          onOpenSkillDetail={vi.fn()}
          onRunDistribution={vi.fn()}
          onRunLink={vi.fn()}
          onRunUnlink={vi.fn()}
          onPurgeSkill={vi.fn()}
          onDismissRowHint={vi.fn()}
          onJumpToConfig={vi.fn()}
          l={l}
        />,
      );
    });

    const before = container.textContent ?? "";
    expect(before.indexOf("skill-low")).toBeLessThan(before.indexOf("skill-high"));

    act(() => {
      findButton(container, "排序")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    act(() => {
      findButton(container, "调用次数（降序）")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const after = container.textContent ?? "";
    expect(after.indexOf("skill-high")).toBeLessThan(after.indexOf("skill-low"));
  });

  it("排序菜单支持按创建时间排序", () => {
    const rows = [
      {
        ...baseRows[0],
        id: "s-new",
        name: "skill-a-new",
        totalCalls: 0,
        last7dCalls: 0,
        createdAt: "2026-04-01T00:00:00Z",
        localPath: "/tmp/skill-new",
      },
      {
        ...baseRows[0],
        id: "s-old",
        name: "skill-z-old",
        totalCalls: 0,
        last7dCalls: 0,
        createdAt: "2026-01-01T00:00:00Z",
        localPath: "/tmp/skill-old",
      },
    ];

    act(() => {
      root.render(
        <SkillsOperationsPanel
          rows={rows}
          matrixSummaries={baseSummaries}
          matrixFilter={{ tool: null, status: "all" }}
          {...baseUsageProps}
          expandedSkillId={null}
          runningDistribution={false}
          purgingSkillId={null}
          onMatrixFilterChange={vi.fn()}
          onToggleExpanded={vi.fn()}
          onOpenSkillDetail={vi.fn()}
          onRunDistribution={vi.fn()}
          onRunLink={vi.fn()}
          onRunUnlink={vi.fn()}
          onPurgeSkill={vi.fn()}
          onDismissRowHint={vi.fn()}
          onJumpToConfig={vi.fn()}
          l={l}
        />,
      );
    });

    const before = container.textContent ?? "";
    expect(before.indexOf("skill-a-new")).toBeLessThan(before.indexOf("skill-z-old"));

    act(() => {
      findButton(container, "排序")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    act(() => {
      findButton(container, "创建时间（升序）")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const after = container.textContent ?? "";
    expect(after.indexOf("skill-z-old")).toBeLessThan(after.indexOf("skill-a-new"));
  });

  it("支持全部 Link 操作", async () => {
    const onRunBulkLink = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      root.render(
        <SkillsOperationsPanel
          rows={baseRows}
          matrixSummaries={baseSummaries}
          matrixFilter={{ tool: null, status: "all" }}
          {...baseUsageProps}
          expandedSkillId={null}
          runningDistribution={false}
          purgingSkillId={null}
          onMatrixFilterChange={vi.fn()}
          onToggleExpanded={vi.fn()}
          onOpenSkillDetail={vi.fn()}
          onRunDistribution={vi.fn()}
          onRunBulkLink={onRunBulkLink}
          onRunLink={vi.fn()}
          onRunUnlink={vi.fn()}
          onPurgeSkill={vi.fn()}
          onDismissRowHint={vi.fn()}
          onJumpToConfig={vi.fn()}
          l={l}
        />,
      );
    });

    await act(async () => {
      findButton(container, "工具")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await act(async () => {
      findButton(container, "批量Link")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onRunBulkLink).toHaveBeenCalledWith([
      {
        skillId: "s1",
        tools: ["claude", "zed"],
      },
    ]);
  });

  it("刷新分析筛选不再使用原生 select", () => {
    act(() => {
      root.render(
        <SkillsOperationsPanel
          rows={baseRows}
          matrixSummaries={baseSummaries}
          matrixFilter={{ tool: null, status: "all" }}
          {...baseUsageProps}
          expandedSkillId={null}
          runningDistribution={false}
          purgingSkillId={null}
          onMatrixFilterChange={vi.fn()}
          onToggleExpanded={vi.fn()}
          onOpenSkillDetail={vi.fn()}
          onRunDistribution={vi.fn()}
          onRunLink={vi.fn()}
          onRunUnlink={vi.fn()}
          onPurgeSkill={vi.fn()}
          onDismissRowHint={vi.fn()}
          onJumpToConfig={vi.fn()}
          l={l}
        />,
      );
    });

    expect(container.querySelectorAll("select").length).toBe(0);
  });
});
