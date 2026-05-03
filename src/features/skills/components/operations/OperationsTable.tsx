import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Tag } from "@douyinfe/semi-ui-19";
import { ChevronDown, ChevronUp } from "lucide-react";

import { EmptyState } from "../../../common/components/EmptyState";
import { Button, Card, CardContent } from "../../../../shared/ui";
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
  return (
    <button
      type="button"
      className="appearance-none rounded border-0 bg-transparent p-0 text-left leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onClick}
    >
      <Tag color={color} type="light" size="small" className="cursor-pointer">
        {children}
      </Tag>
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
      <div className="space-y-2">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {visibleMatrixSummaries.map((summary) => {
            const active = matrixFilter.tool === summary.tool;
            return (
              <Card key={summary.tool} className="border-slate-200">
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto px-0 py-0 text-left text-sm font-semibold text-slate-900"
                      onClick={() => onMatrixFilterChange({ tool: active ? null : summary.tool, status: "all" })}
                    >
                      {summary.tool}
                    </Button>
                    <span className="text-xs text-slate-500">
                      {summary.linked}/{summary.total} {l("已链接", "linked")}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
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
                </CardContent>
              </Card>
            );
          })}
        </div>
        {hiddenMatrixCount > 0 ? (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
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
              <Button variant="outline" onClick={() => onMatrixFilterChange({ tool: null, status: "all" })}>
                {l("重置状态筛选", "Reset Status Filters")}
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
              const statusRows = expanded ? row.statusCells : row.statusPreview;

              return (
                <div key={row.id} className="rounded-xl border border-slate-200 bg-white">
                  <div className="space-y-3 px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">{row.name}</span>
                          {row.sourceMissing ? <Tag color="red" type="light">{l("源目录缺失", "Source Missing")}</Tag> : null}
                          {row.conflict ? <Tag color="orange" type="light">{l("命名冲突", "Conflict")}</Tag> : null}
                          {row.rowHint ? <Tag color="orange" type="light">{row.rowHint}</Tag> : null}
                        </div>
                        <div className="text-xs text-slate-500">
                          {row.linkedCount}/{row.totalCount} {l("已链接", "linked")} · {row.issueCount} {l("异常", "issues")} ·{" "}
                          {l("调用", "Calls")} {row.totalCalls} · 7d {row.last7dCalls} · {l("最近", "Last")}{" "}
                          {formatLastCalled(row.lastCalledAt)}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
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
                        {row.rowHint ? (
                          <Button size="sm" variant="outline" onClick={() => onDismissRowHint(row.id)}>
                            {l("忽略提示", "Dismiss hint")}
                          </Button>
                        ) : null}
                        <Button size="sm" onClick={() => onOpenDistributionForRow(row)}>
                          {l("链接", "Link")}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onOpenSkillDetail(row.id)}>
                          {l("详情", "Detail")}
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
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
                        <Button size="sm" variant="ghost" className="px-2 text-slate-600" onClick={() => onToggleExpanded(row.id)}>
                          {expanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
                          {expanded ? l("收起", "Collapse") : l(`查看更多 (${row.hiddenStatusCount})`, `More (${row.hiddenStatusCount})`)}
                        </Button>
                      ) : null}
                    </div>
                  </div>
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
