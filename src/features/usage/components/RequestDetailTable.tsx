import { Empty, Table } from "@douyinfe/semi-ui-19";
import type { ReactNode } from "react";

import { Button, Tag } from "../../../shared/ui";
import { EmptyState } from "../../common/components/EmptyState";
import type { ModelUsageRequestLogItem } from "../../../shared/types";
import { formatCurrency, formatInteger, formatOptionalInteger, formatTimestamp, getStatusLabel } from "../utils/usageFormat";

type RequestDetailTableProps = {
  l: (zh: string, en: string) => string;
  rows: ModelUsageRequestLogItem[];
  total: number;
  pageIndex: number;
  pageSize: number;
  loading?: boolean;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
  onNextPage: () => void;
  onPreviousPage: () => void;
};

export function RequestDetailTable({
  l,
  rows,
  total,
  pageIndex,
  pageSize,
  loading,
  hasNextPage,
  hasPreviousPage,
  onNextPage,
  onPreviousPage,
}: RequestDetailTableProps) {
  const pageStart = total === 0 ? 0 : pageIndex * pageSize + 1;
  const pageEnd = Math.min(total, pageIndex * pageSize + rows.length);
  const columns: TableColumn[] = [
    {
      title: l("时间", "Time"),
      dataIndex: "calledAt",
      width: 180,
      render: (_value, item) => <span className="whitespace-nowrap">{formatTimestamp(item.calledAt)}</span>,
    },
    { title: "Agent", dataIndex: "agent", width: 140, render: (_value, item) => item.agent || "-" },
    { title: "provider/model", dataIndex: "model", width: 180, render: (_value, item) => `${item.provider}/${item.model || "-"}` },
    {
      title: "status",
      dataIndex: "status",
      width: 120,
      render: (_value, item) => (
        <Tag tone={item.status === "failed" ? "danger" : "success"}>{getStatusLabel(item.status, l)}</Tag>
      ),
    },
    { title: "input", dataIndex: "inputTokens", width: 100, render: (_value, item) => formatOptionalInteger(item.inputTokens) },
    { title: "output", dataIndex: "outputTokens", width: 100, render: (_value, item) => formatOptionalInteger(item.outputTokens) },
    { title: "total", dataIndex: "totalTokens", width: 100, render: (_value, item) => formatInteger(item.totalTokens) },
    { title: l("成本", "Cost"), dataIndex: "displayCost", width: 120, render: (_value, item) => formatCurrency(item.displayCost, item.displayCurrency) },
    { title: "source", dataIndex: "source", width: 140 },
    {
      title: l("完整性", "Complete"),
      dataIndex: "isComplete",
      width: 160,
      render: (_value, item) => (
        <Tag tone={item.isComplete ? "success" : "warning"}>
          {item.isComplete ? l("完整", "Complete") : l("不参与成本估算", "Excluded")}
        </Tag>
      ),
    },
  ];

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            {l("请求明细", "Request Logs")} · {formatInteger(total)}
          </h3>
          <p className="text-xs text-slate-500">
            {l("按单次调用排查 Agent、模型、状态、Token、成本和来源。", "Inspect each call by agent, model, status, tokens, cost, and source.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>
            {l("第", "Page")} {formatInteger(pageIndex + 1)} {l("页", "")} · {formatInteger(pageStart)}-{formatInteger(pageEnd)} / {formatInteger(total)}
          </span>
          <Button size="sm" variant="outline" onClick={onPreviousPage} disabled={loading || !hasPreviousPage}>
            {l("上一页", "Previous")}
          </Button>
          <Button size="sm" variant="outline" onClick={onNextPage} disabled={loading || !hasNextPage}>
            {l("下一页", "Next")}
          </Button>
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          title={loading ? l("正在加载请求明细", "Loading request logs") : l("暂无请求明细", "No request logs")}
          description={l("可以先同步调用记录，或放宽时间、Agent、模型、状态筛选后再查看。", "Sync usage first, or broaden range, agent, model, and status filters.")}
        />
      ) : (
        <Table
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={loading}
          pagination={false}
          scroll={{ x: 1280 }}
          size="small"
          empty={<Empty title={l("暂无请求明细", "No request logs")} />}
        />
      )}
    </div>
  );
}

type TableColumn = {
  title: string;
  dataIndex: string;
  width?: number;
  render?: (_value: unknown, record: ModelUsageRequestLogItem) => ReactNode;
};
