import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "../../../common/components/EmptyState";
import { cn } from "../../../../shared/lib/cn";
import { Button, Card, CardContent, Input, Tag, tagVariants } from "../../../../shared/ui";
import type {
  SkillsManagerMatrixFilter,
  SkillsManagerMatrixSummary,
  SkillsManagerOperationsRow,
} from "../../../../shared/types";

import {
  OPERATIONS_PAGE_SIZE,
  formatLastCalled,
  statusLabel,
  statusTagTone,
} from "./helpers";

type OperationsTableProps = {
  l: (zh: string, en: string) => string;
  rows: SkillsManagerOperationsRow[];
  matrixSummaries: SkillsManagerMatrixSummary[];
  matrixFilter: SkillsManagerMatrixFilter;
  expandedSkillId: string | null;
  purgingSkillId: string | null;
  onMatrixFilterChange: (next: Partial<SkillsManagerMatrixFilter>) => void;
  onToggleExpanded: (skillId: string | null) => void;
  onOpenSkillDetail: (skillId: string) => void;
  onRunLink: (skillId: string, tool: string) => Promise<void> | void;
  onRunUnlink: (skillId: string, tool: string) => Promise<void> | void;
  onPurgeSkill: (skillId: string, skillName: string) => Promise<void> | void;
  onDismissRowHint: (skillId: string) => void;
  onJumpToConfig: () => void;
  onOpenDistributionForRow: (row: SkillsManagerOperationsRow) => void;
  onOpenStatus: (row: SkillsManagerOperationsRow, tool: string, status: SkillsManagerOperationsRow["statusCells"][number]["status"]) => void;
};

export function OperationsTable({
  l,
  rows,
  matrixSummaries,
  matrixFilter,
  expandedSkillId,
  purgingSkillId,
  onMatrixFilterChange,
  onToggleExpanded,
  onOpenSkillDetail,
  onRunLink,
  onRunUnlink,
  onPurgeSkill,
  onDismissRowHint,
  onJumpToConfig,
  onOpenDistributionForRow,
  onOpenStatus,
}: OperationsTableProps) {
  const [targetSearch, setTargetSearch] = useState<Record<string, string>>({});
  const [operationsPage, setOperationsPage] = useState(1);

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

  return (
    <>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {matrixSummaries.map((summary) => {
          const active = matrixFilter.tool === summary.tool;
          return (
            <Card key={summary.tool} className={active ? "border-blue-300 shadow-sm" : "border-slate-200"}>
              <CardContent className="space-y-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="text-left text-sm font-semibold text-slate-900"
                    onClick={() => onMatrixFilterChange({ tool: active ? null : summary.tool, status: "all" })}
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
                    onClick={() => onMatrixFilterChange({ tool: summary.tool, status: "linked" })}
                  >
                    {statusLabel("linked", l)} {summary.linked}
                  </button>
                  <button
                    type="button"
                    className={cn(
                      tagVariants({ tone: statusTagTone("missing") }),
                      "cursor-pointer hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                    onClick={() => onMatrixFilterChange({ tool: summary.tool, status: "missing" })}
                  >
                    {statusLabel("missing", l)} {summary.missing}
                  </button>
                  <button
                    type="button"
                    className={cn(
                      tagVariants({ tone: statusTagTone("wrong") }),
                      "cursor-pointer hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                    onClick={() => onMatrixFilterChange({ tool: summary.tool, status: "wrong" })}
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
              <Button variant="outline" onClick={() => onMatrixFilterChange({ tool: null, status: "all" })}>
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
                        {row.sourceMissing ? <Tag tone="danger">{l("源目录缺失", "Source Missing")}</Tag> : null}
                        {row.conflict ? <Tag tone="warning">{l("命名冲突", "Conflict")}</Tag> : null}
                        {row.rowHint ? <Tag tone="warning">{row.rowHint}</Tag> : null}
                      </div>
                      <div className="text-xs text-slate-500">
                        {row.group || "-"} · {row.linkedCount}/{row.totalCount} {l("已链接", "linked")} · {row.issueCount}{" "}
                        {l("异常", "issues")} · {l("调用", "Calls")} {row.totalCalls} · 7d {row.last7dCalls} · {l("最近", "Last")}{" "}
                        {formatLastCalled(row.lastCalledAt)}
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
                          onClick={() => onOpenStatus(row, cell.tool, cell.status)}
                        >
                          {cell.tool}: {statusLabel(cell.status, l)}
                        </button>
                      ))}
                      {row.hiddenStatusCount > 0 ? (
                        <Button size="sm" variant="outline" onClick={() => onToggleExpanded(row.id)}>
                          {expanded ? l("收起", "Collapse") : l(`查看更多 (${row.hiddenStatusCount})`, `More (${row.hiddenStatusCount})`)}
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
                      <Button size="sm" variant="outline" onClick={() => onOpenDistributionForRow(row)}>
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
                                onClick={() => onOpenStatus(row, cell.tool, cell.status)}
                              >
                                <span className="text-sm text-slate-800">{cell.tool}</span>
                                <Tag tone={statusTagTone(cell.status)}>{statusLabel(cell.status, l)}</Tag>
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
                          <Button size="sm" variant="outline" onClick={() => onOpenDistributionForRow(row)}>
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
                  {l(`共 ${rows.length} 项 · 每页 ${OPERATIONS_PAGE_SIZE} 条`, `${rows.length} items · ${OPERATIONS_PAGE_SIZE} / page`)}
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
                    onClick={() =>
                      setOperationsPage((previous) => Math.min(totalOperationsPages, previous + 1))
                    }
                  >
                    {l("下一页", "Next")}
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </>
  );
}
