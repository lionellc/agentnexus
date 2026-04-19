import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "../../common/components/EmptyState";
import { cn } from "../../../shared/lib/cn";
import { Button, Card, CardContent, Input, Select, Tag, type TagProps, tagVariants } from "../../../shared/ui";
import type {
  SkillManagerStatus,
  SkillsManagerMatrixFilter,
  SkillsManagerMatrixSummary,
  SkillsManagerOperationsRow,
  SkillsUsageSyncJobSnapshot,
} from "../../../shared/types";
import { SkillDistributionDialog } from "./SkillDistributionDialog";
import { SkillStatusPopover } from "./SkillStatusPopover";

type SkillDistributionPreviewKind = "safe" | "conflict" | "error";

type ActiveStatus = {
  row: SkillsManagerOperationsRow;
  tool: string;
  status: SkillManagerStatus;
};

export type SkillsOperationsPanelProps = {
  rows: SkillsManagerOperationsRow[];
  matrixSummaries: SkillsManagerMatrixSummary[];
  matrixFilter: SkillsManagerMatrixFilter;
  usageAgentFilter: string;
  usageSourceFilter: string;
  usageStatsLoading: boolean;
  usageStatsError: string;
  usageSyncJob: SkillsUsageSyncJobSnapshot | null;
  expandedSkillId: string | null;
  runningDistribution: boolean;
  purgingSkillId: string | null;
  onMatrixFilterChange: (next: Partial<SkillsManagerMatrixFilter>) => void;
  onUsageFilterChange: (next: { agent?: string; source?: string }) => void;
  onUsageRefresh: () => Promise<void> | void;
  onToggleExpanded: (skillId: string | null) => void;
  onOpenSkillDetail: (skillId: string) => void;
  onRunDistribution: (skillId: string, tools: string[]) => Promise<void> | void;
  onRunBulkLink?: (plans: Array<{ skillId: string; tools: string[] }>) => Promise<void> | void;
  onRunLink: (skillId: string, tool: string) => Promise<void> | void;
  onRunUnlink: (skillId: string, tool: string) => Promise<void> | void;
  onPurgeSkill: (skillId: string, skillName: string) => Promise<void> | void;
  onDismissRowHint: (skillId: string) => void;
  onJumpToConfig: () => void;
  l: (zh: string, en: string) => string;
};

const OPERATIONS_PAGE_SIZE = 10;

function isPendingLinkStatus(status: SkillManagerStatus): boolean {
  return status === "wrong" || status === "directory";
}

function isLinkCandidateStatus(status: SkillManagerStatus): boolean {
  return (
    status === "missing" ||
    status === "manual" ||
    status === "wrong" ||
    status === "directory"
  );
}

function statusTagTone(status: SkillManagerStatus): NonNullable<TagProps["tone"]> {
  if (status === "linked") {
    return "success";
  }
  if (isPendingLinkStatus(status)) {
    return "warning";
  }
  if (status === "manual") {
    return "warning";
  }
  if (status === "blocked") {
    return "danger";
  }
  return "neutral";
}

function statusLabel(status: SkillManagerStatus, l: (zh: string, en: string) => string): string {
  if (status === "linked") {
    return l("已链接", "Linked");
  }
  if (status === "missing") {
    return l("缺失", "Missing");
  }
  if (isPendingLinkStatus(status)) {
    return l("待链接", "Pending Link");
  }
  if (status === "manual") {
    return l("手动断链", "Manual Unlink");
  }
  if (status === "blocked") {
    return l("规则阻断", "Blocked");
  }
  return l("缺失", "Missing");
}

function statusToPreviewKind(status: SkillManagerStatus): SkillDistributionPreviewKind {
  if (status === "linked" || status === "missing" || status === "manual") {
    return "safe";
  }
  if (isPendingLinkStatus(status)) {
    return "conflict";
  }
  return "error";
}

function usageProgressPercent(job: SkillsUsageSyncJobSnapshot | null): number {
  if (!job || job.totalFiles <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((job.processedFiles / job.totalFiles) * 100)));
}

function formatLastCalled(lastCalledAt: string | null): string {
  if (!lastCalledAt) {
    return "--";
  }
  const parsed = new Date(lastCalledAt);
  if (Number.isNaN(parsed.getTime())) {
    return lastCalledAt;
  }
  return parsed.toLocaleString();
}

function buildStatusSummaryLines(
  row: SkillsManagerOperationsRow,
  status: SkillManagerStatus,
  targetLabel: string,
  l: (zh: string, en: string) => string,
): string[] {
  if (status === "linked") {
    const lines = [
      `${l("目标", "Target")}: ${targetLabel}`,
      l("状态正常，软链已就绪。", "The symlink is healthy."),
      `${l("技能目录", "Skill path")}: ${row.localPath}`,
    ];
    if (row.sourceMissing) {
      lines.push(l("源目录已不存在，可使用清除操作移除记录。", "Source directory is missing. Purge to remove record."));
    }
    return lines;
  }
  if (status === "wrong") {
    const lines = [
      `${l("目标", "Target")}: ${targetLabel}`,
      l("该平台下存在同名项，但没有链接到当前技能源。", "Same skill exists on this platform but not linked to current source."),
      l("链接操作会覆盖为当前技能源的软链接。", "Link will replace it with symlink to current source."),
    ];
    if (row.sourceMissing) {
      lines.push(l("源目录已不存在，可使用清除操作移除记录。", "Source directory is missing. Purge to remove record."));
    }
    return lines;
  }
  if (status === "directory") {
    const lines = [
      `${l("目标", "Target")}: ${targetLabel}`,
      l("该平台下存在同名文件/目录，但不是当前技能链接。", "Same name file/folder exists, but not current skill link."),
      l("链接操作会替换为当前技能源的软链接。", "Link will replace it with symlink to current source."),
      `${l("技能目录", "Skill path")}: ${row.localPath}`,
    ];
    if (row.sourceMissing) {
      lines.push(l("源目录已不存在，可使用清除操作移除记录。", "Source directory is missing. Purge to remove record."));
    }
    return lines;
  }
  if (status === "manual") {
    const lines = [
      `${l("目标", "Target")}: ${targetLabel}`,
      l("该目标执行过手动断链，当前没有链接。", "This target was manually unlinked and currently has no link."),
      `${l("技能目录", "Skill path")}: ${row.localPath}`,
    ];
    if (row.sourceMissing) {
      lines.push(l("源目录已不存在，可使用清除操作移除记录。", "Source directory is missing. Purge to remove record."));
    }
    return lines;
  }
  if (status === "blocked") {
    const lines = [
      `${l("目标", "Target")}: ${targetLabel}`,
      l("当前被规则阻断，需先调整规则后再链接。", "Blocked by rules, update rules before linking."),
      `${l("技能目录", "Skill path")}: ${row.localPath}`,
    ];
    if (row.sourceMissing) {
      lines.push(l("源目录已不存在，可使用清除操作移除记录。", "Source directory is missing. Purge to remove record."));
    }
    return lines;
  }
  const lines = [
    `${l("目标", "Target")}: ${targetLabel}`,
    l("该平台下缺少这个技能，可直接补链。", "This skill is missing on this platform and can be linked directly."),
    `${l("技能目录", "Skill path")}: ${row.localPath}`,
  ];
  if (row.sourceMissing) {
    lines.push(l("源目录已不存在，可使用清除操作移除记录。", "Source directory is missing. Purge to remove record."));
  }
  return lines;
}

export function SkillsOperationsPanel({
  rows,
  matrixSummaries,
  matrixFilter,
  usageAgentFilter,
  usageSourceFilter,
  usageStatsLoading,
  usageStatsError,
  usageSyncJob,
  expandedSkillId,
  runningDistribution,
  purgingSkillId,
  onMatrixFilterChange,
  onUsageFilterChange,
  onUsageRefresh,
  onToggleExpanded,
  onOpenSkillDetail,
  onRunDistribution,
  onRunBulkLink,
  onRunLink,
  onRunUnlink,
  onPurgeSkill,
  onDismissRowHint,
  onJumpToConfig,
  l,
}: SkillsOperationsPanelProps) {
  const [targetSearch, setTargetSearch] = useState<Record<string, string>>({});
  const [activeStatus, setActiveStatus] = useState<ActiveStatus | null>(null);
  const [distributionSkillId, setDistributionSkillId] = useState<string | null>(null);
  const [distributionTargetIds, setDistributionTargetIds] = useState<string[]>([]);
  const [distributionPreviewLoading, setDistributionPreviewLoading] = useState(false);
  const [distributionSubmitLoading, setDistributionSubmitLoading] = useState(false);
  const [bulkLinking, setBulkLinking] = useState(false);
  const [sortByUsage, setSortByUsage] = useState(false);
  const [operationsPage, setOperationsPage] = useState(1);
  const [distributionPreviewItems, setDistributionPreviewItems] = useState<
    Array<{ id: string; label: string; kind: SkillDistributionPreviewKind; retryable?: boolean; message?: string }>
  >([]);
  const usageAgentOptions = useMemo(
    () => [
      { value: "", label: l("全部", "All") },
      { value: "codex", label: "Codex" },
      { value: "claude", label: "Claude" },
    ],
    [l],
  );
  const usageSourceOptions = useMemo(
    () => [
      { value: "", label: l("全部", "All") },
      { value: "codex_jsonl", label: "codex_jsonl" },
      { value: "claude_transcript", label: "claude_transcript" },
    ],
    [l],
  );
  const sortedRows = useMemo(() => {
    const list = [...rows];
    if (!sortByUsage) {
      return list;
    }
    list.sort(
      (left, right) =>
        right.totalCalls - left.totalCalls ||
        right.last7dCalls - left.last7dCalls ||
        left.name.localeCompare(right.name),
    );
    return list;
  }, [rows, sortByUsage]);
  const bulkLinkPlans = useMemo(
    () =>
      sortedRows
        .map((row) => ({
          skillId: row.id,
          tools: row.statusCells
            .filter((cell) => isLinkCandidateStatus(cell.status))
            .map((cell) => cell.tool),
        }))
        .filter((item) => item.tools.length > 0),
    [sortedRows],
  );
  const totalOperationsPages = useMemo(
    () => Math.max(1, Math.ceil(sortedRows.length / OPERATIONS_PAGE_SIZE)),
    [sortedRows.length],
  );
  const pagedRows = useMemo(() => {
    const start = (operationsPage - 1) * OPERATIONS_PAGE_SIZE;
    return sortedRows.slice(start, start + OPERATIONS_PAGE_SIZE);
  }, [sortedRows, operationsPage]);

  useEffect(() => {
    setOperationsPage((previous) => Math.min(previous, totalOperationsPages));
  }, [totalOperationsPages]);

  const distributionRow = useMemo(
    () => sortedRows.find((row) => row.id === distributionSkillId) ?? null,
    [sortedRows, distributionSkillId],
  );

  function openDistributionForRow(row: SkillsManagerOperationsRow) {
    const defaults = row.statusCells
      .filter((cell) => isLinkCandidateStatus(cell.status))
      .map((cell) => cell.tool);
    setDistributionSkillId(row.id);
    setDistributionTargetIds(defaults);
    setDistributionPreviewItems([]);
  }

  async function handleRequestPreview() {
    if (!distributionRow) {
      return;
    }
    setDistributionPreviewLoading(true);
    try {
      const previewItems = distributionTargetIds.map((tool) => {
        const status =
          distributionRow.statusCells.find((cell) => cell.tool === tool)?.status ?? "missing";
        const kind = statusToPreviewKind(status);
        const retryable = kind === "conflict" || kind === "error";
        let message = "";
        if (status === "wrong") {
          message = l("检测到错误链接，将尝试覆盖。", "Wrong link detected and will be replaced.");
        } else if (status === "directory") {
          message = l(
            "检测到同名文件/目录，将替换为软链接。",
            "Same name file/folder detected and will be replaced with symlink.",
          );
        } else if (status === "blocked") {
          message = l("该目标被规则阻断，无法执行链接。", "This target is blocked by rules.");
        }
        return {
          id: `${distributionRow.id}:${tool}`,
          label: tool,
          kind,
          retryable,
          message,
        };
      });
      setDistributionPreviewItems(previewItems);
    } finally {
      setDistributionPreviewLoading(false);
    }
  }

  async function handleSubmitDistribution() {
    if (!distributionRow || distributionTargetIds.length === 0) {
      return;
    }
    setDistributionSubmitLoading(true);
    try {
      await onRunDistribution(distributionRow.id, distributionTargetIds);
      setDistributionSkillId(null);
      setDistributionTargetIds([]);
      setDistributionPreviewItems([]);
    } finally {
      setDistributionSubmitLoading(false);
    }
  }

  async function handleBulkLink() {
    if (!onRunBulkLink || bulkLinkPlans.length === 0 || bulkLinking || runningDistribution) {
      return;
    }
    setBulkLinking(true);
    try {
      await onRunBulkLink(bulkLinkPlans);
    } finally {
      setBulkLinking(false);
    }
  }

  const usageSyncRunning = usageSyncJob?.status === "running";
  const usagePercent = usageProgressPercent(usageSyncJob);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 text-xs text-slate-600">
                <span>{l("Agent", "Agent")}</span>
                <Select
                  aria-label={l("Agent 筛选", "Agent filter")}
                  className="w-32"
                  buttonClassName="h-8 text-xs"
                  value={usageAgentFilter}
                  options={usageAgentOptions}
                  onChange={(value) => onUsageFilterChange({ agent: value })}
                />
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-600">
                <span>{l("来源", "Source")}</span>
                <Select
                  aria-label={l("来源筛选", "Source filter")}
                  className="w-44"
                  buttonClassName="h-8 text-xs"
                  value={usageSourceFilter}
                  options={usageSourceOptions}
                  onChange={(value) => onUsageFilterChange({ source: value })}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setSortByUsage((prev) => !prev)}>
                {sortByUsage ? l("恢复默认排序", "Reset Sort") : l("按调用次数排序", "Sort by Calls")}
              </Button>
              {onRunBulkLink ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={runningDistribution || bulkLinking || bulkLinkPlans.length === 0}
                  onClick={() => void handleBulkLink()}
                >
                  {bulkLinking ? l("全部 Link 中...", "Linking All...") : l("全部 Link", "Link All")}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                disabled={usageSyncRunning}
                onClick={() => void onUsageRefresh()}
              >
                {usageSyncRunning ? l("分析中...", "Analyzing...") : l("刷新分析", "Refresh Analysis")}
              </Button>
            </div>
          </div>
          {usageSyncJob ? (
            <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>
                  {l("状态", "Status")}：{usageSyncJob.status}
                </span>
                <span>
                  {usageSyncJob.processedFiles}/{usageSyncJob.totalFiles} ({usagePercent}%)
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded bg-slate-200">
                <div className="h-full bg-blue-500 transition-all" style={{ width: `${usagePercent}%` }} />
              </div>
              {usageSyncJob.currentSource ? (
                <div className="truncate text-[11px] text-slate-500" title={usageSyncJob.currentSource}>
                  {usageSyncJob.currentSource}
                </div>
              ) : null}
              {usageSyncJob.errorMessage ? (
                <div className="text-[11px] text-rose-600">{usageSyncJob.errorMessage}</div>
              ) : null}
            </div>
          ) : null}
          {usageStatsError ? (
            <div className="text-xs text-rose-600">{usageStatsError}</div>
          ) : usageStatsLoading ? (
            <div className="text-xs text-slate-500">{l("统计刷新中...", "Refreshing stats...")}</div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {matrixSummaries.map((summary) => {
          const active = matrixFilter.tool === summary.tool;
          return (
            <Card
              key={summary.tool}
              className={active ? "border-blue-300 shadow-sm" : "border-slate-200"}
            >
              <CardContent className="space-y-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="text-left text-sm font-semibold text-slate-900"
                    onClick={() =>
                      onMatrixFilterChange({
                        tool: active ? null : summary.tool,
                        status: "all",
                      })
                    }
                  >
                    {summary.tool}
                  </button>
                  <span className="text-xs text-slate-500">
                    {summary.linked}/{summary.total} {l("已链接", "linked")}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    className={cn(
                      tagVariants({ tone: statusTagTone("linked") }),
                      "cursor-pointer hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                    onClick={() =>
                      onMatrixFilterChange({
                        tool: summary.tool,
                        status: "linked",
                      })
                    }
                  >
                    {statusLabel("linked", l)} {summary.linked}
                  </button>
                  <button
                    type="button"
                    className={cn(
                      tagVariants({ tone: statusTagTone("missing") }),
                      "cursor-pointer hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                    onClick={() =>
                      onMatrixFilterChange({
                        tool: summary.tool,
                        status: "missing",
                      })
                    }
                  >
                    {statusLabel("missing", l)} {summary.missing}
                  </button>
                  <button
                    type="button"
                    className={cn(
                      tagVariants({ tone: statusTagTone("wrong") }),
                      "cursor-pointer hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                    onClick={() =>
                      onMatrixFilterChange({
                        tool: summary.tool,
                        status: "wrong",
                      })
                    }
                  >
                    {statusLabel("wrong", l)} {summary.wrong + summary.directory}
                  </button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {sortedRows.length === 0 ? (
        matrixSummaries.some((summary) => summary.total > 0) ? (
          <EmptyState
            title={l("当前筛选无结果", "No results for current filters")}
            description={l("请切换状态筛选或重置筛选条件。", "Change status filter or reset filters.")}
            action={
              <Button
                variant="outline"
                onClick={() => onMatrixFilterChange({ tool: null, status: "all" })}
              >
                {l("重置筛选", "Reset Filters")}
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={l("暂无可运营 Skills", "No skills")}
            description={l("请先前往扫描并收编 skills。", "Scan and borrow skills first.")}
            action={
              <Button variant="outline" onClick={onJumpToConfig}>
                {l("前往扫描", "Open Scan")}
              </Button>
            }
          />
        )
      ) : (
        <Card>
          <CardContent className="space-y-3 p-3">
            {pagedRows.map((row) => {
              const expanded = expandedSkillId === row.id;
              const searchValue = targetSearch[row.id] ?? "";
              const statusRows = row.statusCells.filter((item) =>
                searchValue.trim()
                  ? item.tool.toLowerCase().includes(searchValue.trim().toLowerCase())
                  : true,
              );

              return (
                <div key={row.id} className="rounded-xl border border-slate-200 bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{row.name}</span>
                      {row.sourceMissing ? (
                          <Tag tone="danger">
                            {l("源目录缺失", "Source Missing")}
                          </Tag>
                        ) : null}
                      {row.conflict ? (
                          <Tag tone="warning">
                            {l("命名冲突", "Conflict")}
                          </Tag>
                        ) : null}
                      {row.rowHint ? (
                          <Tag tone="warning">
                            {row.rowHint}
                          </Tag>
                        ) : null}
                      </div>
                      <div className="text-xs text-slate-500">
                        {row.group || "-"} · {row.linkedCount}/{row.totalCount} {l("已链接", "linked")} · {row.issueCount}{" "}
                        {l("异常", "issues")} · {l("调用", "Calls")} {row.totalCalls} · 7d {row.last7dCalls} ·{" "}
                        {l("最近", "Last")} {formatLastCalled(row.lastCalledAt)}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {row.statusPreview.map((cell) => (
                        <button
                          key={`${row.id}:${cell.tool}`}
                          type="button"
                          className={cn(
                            tagVariants({ tone: statusTagTone(cell.status) }),
                            "cursor-pointer hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          )}
                          onClick={() => setActiveStatus({ row, tool: cell.tool, status: cell.status })}
                        >
                          {cell.tool}: {statusLabel(cell.status, l)}
                        </button>
                      ))}
                      {row.hiddenStatusCount > 0 ? (
                        <Button size="sm" variant="outline" onClick={() => onToggleExpanded(row.id)}>
                          {expanded
                            ? l("收起", "Collapse")
                            : l(`查看更多 (${row.hiddenStatusCount})`, `More (${row.hiddenStatusCount})`)}
                        </Button>
                      ) : null}
                      {row.sourceMissing ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void onPurgeSkill(row.id, row.name)}
                          disabled={purgingSkillId === row.id}
                        >
                          {purgingSkillId === row.id ? l("清除中...", "Clearing...") : l("清除", "Clear")}
                        </Button>
                      ) : null}
                      <Button size="sm" variant="outline" onClick={() => openDistributionForRow(row)}>
                        {l("链接", "Link")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onOpenSkillDetail(row.id)}>
                        {l("详情", "Detail")}
                      </Button>
                    </div>
                  </div>

                  {expanded ? (
                    <div className="grid gap-3 border-t border-slate-100 p-3 lg:grid-cols-[1.1fr_0.9fr]">
                      <div className="space-y-2">
                        <Input
                          value={searchValue}
                          onChange={(event) =>
                            setTargetSearch((prev) => ({
                              ...prev,
                              [row.id]: event.currentTarget.value,
                            }))
                          }
                          placeholder={l("搜索目标目录", "Search targets")}
                        />
                        <div className="max-h-52 space-y-2 overflow-auto">
                          {statusRows.length === 0 ? (
                            <div className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-500">
                              {l("没有匹配的目标目录", "No matching targets")}
                            </div>
                          ) : (
                            statusRows.map((cell) => (
                              <button
                                key={`${row.id}:expanded:${cell.tool}`}
                                type="button"
                                className="flex w-full items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-left"
                                onClick={() => setActiveStatus({ row, tool: cell.tool, status: cell.status })}
                              >
                                <span className="text-sm text-slate-800">{cell.tool}</span>
                                <Tag tone={statusTagTone(cell.status)}>
                                  {statusLabel(cell.status, l)}
                                </Tag>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                      <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-medium text-slate-600">{l("快捷动作", "Quick actions")}</div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (row.statusCells[0]) {
                                void onRunLink(row.id, row.statusCells[0].tool);
                              }
                            }}
                          >
                            {l("快速补链", "Quick Link")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (row.statusCells[0]) {
                                void onRunUnlink(row.id, row.statusCells[0].tool);
                              }
                            }}
                          >
                            {l("快速断链", "Quick Unlink")}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openDistributionForRow(row)}>
                            {l("打开链接向导", "Open Link Wizard")}
                          </Button>
                          {row.rowHint ? (
                            <Button size="sm" variant="outline" onClick={() => onDismissRowHint(row.id)}>
                              {l("忽略提示", "Dismiss hint")}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {sortedRows.length > OPERATIONS_PAGE_SIZE ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
                <span className="text-xs text-slate-500">
                  {l(
                    `共 ${sortedRows.length} 项 · 每页 ${OPERATIONS_PAGE_SIZE} 条`,
                    `${sortedRows.length} items · ${OPERATIONS_PAGE_SIZE} / page`,
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={operationsPage <= 1}
                    onClick={() => setOperationsPage((previous) => Math.max(1, previous - 1))}
                  >
                    {l("上一页", "Prev")}
                  </Button>
                  <span className="text-xs text-slate-500">
                    {operationsPage} / {totalOperationsPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={operationsPage >= totalOperationsPages}
                    onClick={() => setOperationsPage((previous) => Math.min(totalOperationsPages, previous + 1))}
                  >
                    {l("下一页", "Next")}
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      <SkillDistributionDialog
        open={distributionSkillId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDistributionSkillId(null);
            setDistributionTargetIds([]);
            setDistributionPreviewItems([]);
          }
        }}
        l={l}
        skillName={distributionRow?.name ?? "-"}
        targets={(distributionRow?.statusCells ?? []).map((cell) => ({
          id: cell.tool,
          label: cell.tool,
          defaultSelected: isLinkCandidateStatus(cell.status),
        }))}
        selectedTargetIds={distributionTargetIds}
        onSelectedTargetIdsChange={setDistributionTargetIds}
        previewItems={distributionPreviewItems}
        onRequestPreview={handleRequestPreview}
        previewLoading={distributionPreviewLoading}
        submitLoading={distributionSubmitLoading || runningDistribution}
        onSubmit={handleSubmitDistribution}
      />

      <SkillStatusPopover
        open={activeStatus !== null}
        onOpenChange={(open) => {
          if (!open) {
            setActiveStatus(null);
          }
        }}
        skillName={activeStatus?.row.name ?? ""}
        targetLabel={activeStatus?.tool ?? ""}
        status={activeStatus?.status ?? "missing"}
        summaryLines={
          activeStatus
            ? buildStatusSummaryLines(activeStatus.row, activeStatus.status, activeStatus.tool, l)
            : []
        }
        primaryAction={
          activeStatus?.status === "linked"
            ? {
                label: l("执行断链", "Unlink"),
                onClick: () => {
                  if (activeStatus) {
                    void onRunUnlink(activeStatus.row.id, activeStatus.tool);
                    setActiveStatus(null);
                  }
                },
              }
            : {
                label: l("执行补链", "Link"),
                onClick: () => {
                  if (activeStatus) {
                    void onRunLink(activeStatus.row.id, activeStatus.tool);
                    setActiveStatus(null);
                  }
                },
              }
        }
        secondaryActions={
          activeStatus
            ? [
                {
                  key: "detail",
                  label: l("查看详情", "Open Detail"),
                  onClick: () => {
                    onOpenSkillDetail(activeStatus.row.id);
                    setActiveStatus(null);
                  },
                },
                {
                  key: "distribute",
                  label: l("打开链接向导", "Open Link Wizard"),
                  onClick: () => {
                    openDistributionForRow(activeStatus.row);
                    setActiveStatus(null);
                  },
                },
              ]
            : []
        }
        l={l}
      />
    </div>
  );
}
