import { Button, Card } from "@douyinfe/semi-ui-19";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { EmptyState } from "../../../common/components/EmptyState";
import { PlatformPresetIcon } from "../../../settings/components/data-settings/PlatformPresetIcon";
import type {
  SkillsManagerMatrixFilter,
  SkillsManagerMatrixSummary,
  SkillsManagerOperationsRow,
} from "../../../../shared/types";

import {
  OPERATIONS_PAGE_SIZE,
  formatLastCalled,
  statusLabel,
  statusTagColor,
  type SkillStatusTagColor,
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
  onPurgeSkill: (skillId: string, skillName: string) => Promise<void> | void;
  onDismissRowHint: (skillId: string) => void;
  onJumpToConfig: () => void;
  onOpenDistributionForRow: (row: SkillsManagerOperationsRow) => void;
  onOpenStatus: (row: SkillsManagerOperationsRow, tool: string, status: SkillsManagerOperationsRow["statusCells"][number]["status"]) => void;
};

const AGENT_BOARD_COLLAPSE_LIMIT = 6;

function ClickableTag({
  color,
  children,
  onClick,
}: {
  color: SkillStatusTagColor;
  children: ReactNode;
  onClick: () => void;
}) {
  const dotClass =
    color === "green"
      ? "bg-emerald-500"
      : color === "orange"
        ? "bg-amber-500"
        : color === "red"
          ? "bg-red-500"
          : "bg-slate-400";

  return (
    <button
      type="button"
      className="inline-flex appearance-none items-center gap-1.5 rounded-full bg-slate-50 px-2 py-0.5 text-left text-xs font-medium leading-5 text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-slate-900/70 dark:text-slate-300 dark:ring-slate-800 dark:hover:bg-slate-800"
      onClick={onClick}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
      {children}
    </button>
  );
}

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
  onPurgeSkill,
  onDismissRowHint,
  onJumpToConfig,
  onOpenDistributionForRow,
  onOpenStatus,
}: OperationsTableProps) {
  const [agentBoardExpanded, setAgentBoardExpanded] = useState(false);
  const [operationsPage, setOperationsPage] = useState(1);

  const visibleMatrixSummaries = useMemo(() => {
    if (agentBoardExpanded) {
      return matrixSummaries;
    }
    return matrixSummaries.slice(0, AGENT_BOARD_COLLAPSE_LIMIT);
  }, [agentBoardExpanded, matrixSummaries]);
  const hiddenMatrixCount = Math.max(0, matrixSummaries.length - AGENT_BOARD_COLLAPSE_LIMIT);

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
      <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/30">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {l("Agent 覆盖", "Agent Coverage")}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {l("按目标 Agent 查看链接状态", "Check link status by target agent")}
            </div>
          </div>
          {matrixFilter.tool || matrixFilter.status !== "all" ? (
            <Button type="tertiary" onClick={() => onMatrixFilterChange({ tool: null, status: "all" })}>
              {l("重置筛选", "Reset")}
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 px-3 py-2">
          {visibleMatrixSummaries.map((summary) => {
            const active = matrixFilter.tool === summary.tool;
            return (
              <div
                key={summary.tool}
                className={`min-w-[320px] rounded-md border px-3 py-2 ${
                  active
                    ? "border-slate-400 bg-slate-50 dark:border-slate-600 dark:bg-slate-900/60"
                    : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/30"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    className="flex min-w-0 items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onMatrixFilterChange({ tool: active ? null : summary.tool, status: "all" })}
                  >
                    <PlatformPresetIcon platformId={summary.tool} size={18} />
                    <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{summary.tool}</span>
                  </button>
                  <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                    {summary.linked}/{summary.total} {l("已链接", "linked")}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                  <ClickableTag
                    color={statusTagColor("linked")}
                    onClick={() => onMatrixFilterChange({ tool: summary.tool, status: "linked" })}
                  >
                    {statusLabel("linked", l)} {summary.linked}
                  </ClickableTag>
                  <ClickableTag
                    color={statusTagColor("missing")}
                    onClick={() => onMatrixFilterChange({ tool: summary.tool, status: "missing" })}
                  >
                    {statusLabel("missing", l)} {summary.missing}
                  </ClickableTag>
                  <ClickableTag
                    color={statusTagColor("wrong")}
                    onClick={() => onMatrixFilterChange({ tool: summary.tool, status: "wrong" })}
                  >
                    {statusLabel("wrong", l)} {summary.wrong + summary.directory}
                  </ClickableTag>
                </div>
              </div>
            );
          })}
        </div>
        {hiddenMatrixCount > 0 ? (
          <div className="flex justify-end border-t border-slate-200 px-3 py-2 dark:border-slate-800">
            <Button
              type="tertiary"
              onClick={() => setAgentBoardExpanded((previous) => !previous)}
            >
              {agentBoardExpanded ? (
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              )}
              {agentBoardExpanded
                ? l("收起 Agent 看板", "Collapse Agent Board")
                : l(`展开 Agent 看板 (+${hiddenMatrixCount})`, `Expand Agent Board (+${hiddenMatrixCount})`)}
            </Button>
          </div>
        ) : null}
      </div>

      {rows.length === 0 ? (
        matrixSummaries.some((summary) => summary.total > 0) ? (
          <EmptyState
            title={l("当前筛选无结果", "No results for current filters")}
            description={l("请切换状态筛选或重置筛选条件。", "Change status filter or reset filters.")}
            action={
              <Button type="tertiary" onClick={() => onMatrixFilterChange({ tool: null, status: "all" })}>
                {l("重置状态筛选", "Reset Status Filters")}
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={l("暂无可运营 Skills", "No skills")}
            description={l("请先前往扫描并收编 skills。", "Scan and borrow skills first.")}
            action={
              <Button theme="solid" type="primary" onClick={onJumpToConfig}>
                {l("前往扫描", "Open Scan")}
              </Button>
            }
          />
        )
      ) : (
        <Card bodyStyle={{ padding: 0 }}>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {pagedRows.map((row) => {
              const expanded = expandedSkillId === row.id;
              const statusRows = expanded ? row.statusCells : row.statusPreview;

              return (
                <div key={row.id} className="px-3 py-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-900/40">
                  <div className="grid gap-3 xl:grid-cols-[minmax(240px,1.4fr)_180px_minmax(260px,2fr)_auto] xl:items-center">
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="truncate font-medium text-slate-900 dark:text-slate-100">{row.name}</span>
                        {row.issueCount > 0 ? (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900">
                            {row.issueCount} {l("异常", "issues")}
                          </span>
                        ) : null}
                        {row.sourceMissing ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-200 dark:bg-red-950/30 dark:text-red-300 dark:ring-red-900">{l("源目录缺失", "Source Missing")}</span> : null}
                        {row.conflict ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-200 dark:bg-red-950/30 dark:text-red-300 dark:ring-red-900">{l("命名冲突", "Conflict")}</span> : null}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span>{row.linkedCount}/{row.totalCount} {l("已链接", "linked")}</span>
                        {row.totalCalls > 0 ? <span>{l("调用", "Calls")} {row.totalCalls}</span> : null}
                        {row.rowHint ? <span className="text-slate-700 dark:text-slate-300">{row.rowHint}</span> : null}
                      </div>
                    </div>

                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      <div className="font-medium text-slate-700 dark:text-slate-300">7d {row.last7dCalls}</div>
                      <div className="truncate">{l("最近", "Last")} {formatLastCalled(row.lastCalledAt)}</div>
                    </div>

                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      {statusRows.map((cell) => (
                        <ClickableTag
                          key={`${row.id}:${expanded ? "expanded" : "preview"}:${cell.tool}`}
                          color={statusTagColor(cell.status)}
                          onClick={() => onOpenStatus(row, cell.tool, cell.status)}
                        >
                          {cell.tool}: {statusLabel(cell.status, l)}
                        </ClickableTag>
                      ))}
                      {row.hiddenStatusCount > 0 ? (
                        <Button type="tertiary" className="px-2 text-slate-600" onClick={() => onToggleExpanded(row.id)}>
                          {expanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
                          {expanded ? l("收起", "Collapse") : l(`查看更多 (${row.hiddenStatusCount})`, `More (${row.hiddenStatusCount})`)}
                        </Button>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 xl:justify-end">
                      {row.sourceMissing ? (
                        <Button
                          type="danger"
                          onClick={() => void onPurgeSkill(row.id, row.name)}
                          disabled={purgingSkillId === row.id}
                        >
                          {purgingSkillId === row.id ? l("清除中...", "Clearing...") : l("清除", "Clear")}
                        </Button>
                      ) : null}
                      {row.rowHint ? (
                        <Button type="tertiary" onClick={() => onDismissRowHint(row.id)}>
                          {l("忽略提示", "Dismiss hint")}
                        </Button>
                      ) : null}
                      <Button type="tertiary" onClick={() => onOpenDistributionForRow(row)}>
                        {l("链接", "Link")}
                      </Button>
                      <Button type="tertiary" onClick={() => onOpenSkillDetail(row.id)}>
                        {l("详情", "Detail")}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}

            {rows.length > OPERATIONS_PAGE_SIZE ? (
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {l(`共 ${rows.length} 项 · 每页 ${OPERATIONS_PAGE_SIZE} 条`, `${rows.length} items · ${OPERATIONS_PAGE_SIZE} / page`)}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="tertiary"
                    disabled={operationsPage <= 1}
                    onClick={() => setOperationsPage((previous) => Math.max(1, previous - 1))}
                  >
                    {l("上一页", "Prev")}
                  </Button>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {operationsPage} / {totalOperationsPages}
                  </span>
                  <Button
                    type="tertiary"
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
          </div>
        </Card>
      )}
    </>
  );
}
