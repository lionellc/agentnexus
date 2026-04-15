import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "../../common/components/EmptyState";
import { Button, Card, CardContent, Input } from "../../../shared/ui";
import type {
  SkillManagerStatus,
  SkillsManagerMatrixFilter,
  SkillsManagerMatrixSummary,
  SkillsManagerOperationsRow,
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
  expandedSkillId: string | null;
  runningDistribution: boolean;
  purgingSkillId: string | null;
  onMatrixFilterChange: (next: Partial<SkillsManagerMatrixFilter>) => void;
  onToggleExpanded: (skillId: string | null) => void;
  onOpenSkillDetail: (skillId: string) => void;
  onRunDistribution: (skillId: string, tools: string[]) => Promise<void> | void;
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

function statusBadgeClass(status: SkillManagerStatus): string {
  if (status === "linked") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-500/20 dark:text-emerald-200";
  }
  if (isPendingLinkStatus(status)) {
    return "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-700/60 dark:bg-orange-500/20 dark:text-orange-200";
  }
  if (status === "manual") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700/60 dark:bg-amber-500/20 dark:text-amber-200";
  }
  if (status === "blocked") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-700/60 dark:bg-rose-500/20 dark:text-rose-200";
  }
  return "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800/70 dark:text-slate-200";
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
  expandedSkillId,
  runningDistribution,
  purgingSkillId,
  onMatrixFilterChange,
  onToggleExpanded,
  onOpenSkillDetail,
  onRunDistribution,
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
  const [operationsPage, setOperationsPage] = useState(1);
  const [distributionPreviewItems, setDistributionPreviewItems] = useState<
    Array<{ id: string; label: string; kind: SkillDistributionPreviewKind; retryable?: boolean; message?: string }>
  >([]);
  const totalOperationsPages = useMemo(
    () => Math.max(1, Math.ceil(rows.length / OPERATIONS_PAGE_SIZE)),
    [rows.length],
  );
  const pagedRows = useMemo(() => {
    const start = (operationsPage - 1) * OPERATIONS_PAGE_SIZE;
    return rows.slice(start, start + OPERATIONS_PAGE_SIZE);
  }, [rows, operationsPage]);

  useEffect(() => {
    setOperationsPage((previous) => Math.min(previous, totalOperationsPages));
  }, [totalOperationsPages]);

  const distributionRow = useMemo(
    () => rows.find((row) => row.id === distributionSkillId) ?? null,
    [rows, distributionSkillId],
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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
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
                    className={`rounded border px-2 py-0.5 ${statusBadgeClass("linked")}`}
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
                    className={`rounded border px-2 py-0.5 ${statusBadgeClass("missing")}`}
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
                    className={`rounded border px-2 py-0.5 ${statusBadgeClass("wrong")}`}
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

      {rows.length === 0 ? (
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
                          <span className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs text-rose-700 dark:border-rose-700/60 dark:bg-rose-500/20 dark:text-rose-200">
                            {l("源目录缺失", "Source Missing")}
                          </span>
                        ) : null}
                        {row.conflict ? (
                          <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700 dark:border-amber-700/60 dark:bg-amber-500/20 dark:text-amber-200">
                            {l("命名冲突", "Conflict")}
                          </span>
                        ) : null}
                        {row.rowHint ? (
                          <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700 dark:border-amber-700/60 dark:bg-amber-500/20 dark:text-amber-200">
                            {row.rowHint}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-slate-500">
                        {row.group || "-"} · {row.linkedCount}/{row.totalCount} {l("已链接", "linked")} · {row.issueCount}{" "}
                        {l("异常", "issues")}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {row.statusPreview.map((cell) => (
                        <button
                          key={`${row.id}:${cell.tool}`}
                          type="button"
                          className={`rounded border px-2 py-0.5 text-xs ${statusBadgeClass(cell.status)}`}
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
                                <span className={`rounded border px-2 py-0.5 text-xs ${statusBadgeClass(cell.status)}`}>
                                  {statusLabel(cell.status, l)}
                                </span>
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
            {rows.length > OPERATIONS_PAGE_SIZE ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
                <span className="text-xs text-slate-500">
                  {l(
                    `共 ${rows.length} 项 · 每页 ${OPERATIONS_PAGE_SIZE} 条`,
                    `${rows.length} items · ${OPERATIONS_PAGE_SIZE} / page`,
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
