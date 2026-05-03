import { Card } from "@douyinfe/semi-ui-19";
import type { ModelUsageDashboardSummary } from "../../../shared/types";
import {
  formatDurationMs,
  formatInteger,
  formatTokenAmount,
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
      desc: `${l("完整记录", "Complete")}: ${formatInteger(summary.completeRequestCount)}`,
    },
    {
      key: "tokens",
      label: l("总 Token", "Total Tokens"),
      value: formatTokenAmount(summary.totalTokens),
      desc: `in ${formatTokenAmount(summary.totalInputTokens)} / out ${formatTokenAmount(summary.totalOutputTokens)}`,
    },
    {
      key: "latency",
      label: l("平均用时", "Avg Duration"),
      value: formatDurationMs(summary.avgDurationMs),
      desc: `${l("样本", "Samples")}: ${formatInteger(summary.durationSampleCount)}`,
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
            <div className="space-y-1 p-4">
              <p className="text-xs text-slate-500">{card.label}</p>
              <p className="text-xl font-semibold text-slate-900">{card.value}</p>
              <p className="text-xs text-slate-500">{card.desc}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
