import { Badge, Button } from "../../../shared/ui";
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
        <div className="overflow-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-slate-500">
                <th className="py-2 pr-3">{l("时间", "Time")}</th>
                <th className="py-2 pr-3">Agent</th>
                <th className="py-2 pr-3">provider/model</th>
                <th className="py-2 pr-3">status</th>
                <th className="py-2 pr-3">input</th>
                <th className="py-2 pr-3">output</th>
                <th className="py-2 pr-3">total</th>
                <th className="py-2 pr-3">{l("成本", "Cost")}</th>
                <th className="py-2 pr-3">source</th>
                <th className="py-2 pr-3">{l("完整性", "Complete")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">{formatTimestamp(item.calledAt)}</td>
                  <td className="py-2 pr-3">{item.agent || "-"}</td>
                  <td className="py-2 pr-3">{item.provider}/{item.model || "-"}</td>
                  <td className="py-2 pr-3">
                    <Badge variant={item.status === "failed" ? "destructive" : "secondary"}>{getStatusLabel(item.status, l)}</Badge>
                  </td>
                  <td className="py-2 pr-3">{formatOptionalInteger(item.inputTokens)}</td>
                  <td className="py-2 pr-3">{formatOptionalInteger(item.outputTokens)}</td>
                  <td className="py-2 pr-3">{formatInteger(item.totalTokens)}</td>
                  <td className="py-2 pr-3">{formatCurrency(item.displayCost, item.displayCurrency)}</td>
                  <td className="py-2 pr-3">{item.source}</td>
                  <td className="py-2 pr-3">
                    <Badge variant={item.isComplete ? "secondary" : "outline"}>
                      {item.isComplete ? l("完整", "Complete") : l("不参与成本估算", "Excluded")}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
