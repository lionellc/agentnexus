import { Card, CardContent } from "../../../shared/ui";
import type { ModelUsageDashboardSummary } from "../../../shared/types";
import {
  formatCurrency,
  formatDecimal,
  formatInteger,
  formatTimestamp,
  type UsageStatusSummary,
} from "../utils/usageFormat";

type UsageKpiCardsProps = {
  l: (zh: string, en: string) => string;
  summary: ModelUsageDashboardSummary;
  statusSummary: UsageStatusSummary;
};

export function UsageKpiCards({ l, summary, statusSummary }: UsageKpiCardsProps) {
  const cards = [
    {
      key: "requests",
      label: l("请求总数", "Requests"),
      value: formatInteger(summary.requestCount),
      desc: `${l("完整可计费", "Billable")}: ${formatInteger(summary.billableRequestCount)}`,
    },
    {
      key: "cost",
      label: l("总成本", "Total Cost"),
      value: formatCurrency(summary.displayCost, summary.displayCurrency),
      desc: `USD ${formatCurrency(summary.totalCostUsd, "USD")} / CNY ${formatCurrency(summary.totalCostCny, "CNY")}`,
    },
    {
      key: "tokens",
      label: l("总 Token", "Total Tokens"),
      value: formatInteger(summary.totalTokens),
      desc: `in ${formatInteger(summary.totalInputTokens)} / out ${formatInteger(summary.totalOutputTokens)}`,
    },
    {
      key: "status",
      label: l("状态分布", "Status Mix"),
      value: `${formatInteger(statusSummary.success)} / ${formatInteger(statusSummary.failed)}`,
      desc: `${l("成功/失败", "Success/Failed")} · ${l("未知", "Unknown")} ${formatInteger(statusSummary.unknown)}`,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.key}>
            <CardContent className="space-y-1 p-4">
              <p className="text-xs text-slate-500">{card.label}</p>
              <p className="text-xl font-semibold text-slate-900">{card.value}</p>
              <p className="text-xs text-slate-500">{card.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-slate-600">
        <span>{l("解释条件", "Context")}</span>
        <span>·</span>
        <span>{l("不完整记录", "Incomplete")}: {formatInteger(summary.incompleteCount)}</span>
        <span>{l("缺 model 或 token，不参与成本估算", "Missing model or tokens, excluded from cost estimation")}</span>
        <span>·</span>
        <span>
          {l("汇率", "FX")}: {formatDecimal(summary.fxRateUsdCny, 4)}
          {summary.fxStale ? ` · ${l("汇率过期", "Stale FX snapshot")}` : ` · ${l("汇率新鲜", "Fresh FX snapshot")}`}
        </span>
        {summary.fxFetchedAt ? <span>· {formatTimestamp(summary.fxFetchedAt)}</span> : null}
      </div>
    </div>
  );
}
