import { Badge } from "../../../shared/ui";
import type { ModelUsageDashboardResult, ModelUsageDashboardSummary } from "../../../shared/types";
import { formatInteger, formatTimestamp } from "../utils/usageFormat";

type SourceCoverageBarProps = {
  l: (zh: string, en: string) => string;
  sourceCoverage: ModelUsageDashboardResult["sourceCoverage"];
  summary: ModelUsageDashboardSummary;
};

export function SourceCoverageBar({ l, sourceCoverage, summary }: SourceCoverageBarProps) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500">{l("数据可信度", "Data Trust")}</span>
        {sourceCoverage.length === 0 ? (
          <Badge variant="outline">{l("暂无来源覆盖", "No source coverage")}</Badge>
        ) : (
          sourceCoverage.map((item) => (
            <Badge key={`${item.source}-${item.status}`} variant={item.status === "failed" ? "destructive" : "secondary"}>
              {item.source} · {item.status} · {formatInteger(item.count)}
            </Badge>
          ))
        )}
        <Badge variant={summary.incompleteCount > 0 ? "outline" : "secondary"}>
          {l("不完整", "Incomplete")} · {formatInteger(summary.incompleteCount)}
        </Badge>
        <Badge variant={summary.fxStale ? "outline" : "secondary"}>
          {summary.fxStale ? l("汇率过期", "Stale FX") : l("汇率可用", "FX fresh")}
        </Badge>
      </div>
      <p className="text-xs text-slate-500">
        {l("来源、完整性和汇率会影响成本可信度；缺 model 或 token 的记录不会被估算进成本。", "Source coverage, completeness, and FX freshness affect cost trust; incomplete records are not estimated into cost.")}
        {sourceCoverage[0]?.updatedAt ? ` ${l("最近更新", "Updated")}: ${formatTimestamp(sourceCoverage[0].updatedAt)}` : ""}
      </p>
    </div>
  );
}
