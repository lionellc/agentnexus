import { useEffect, useRef } from "react";
import * as echarts from "echarts";

import type { ModelUsageCurrency, ModelUsageDashboardResult } from "../../../../shared/types";

type CostTrendChartProps = {
  l: (zh: string, en: string) => string;
  rows: ModelUsageDashboardResult["trends"]["dailyCost"];
  currency: ModelUsageCurrency;
};

export function CostTrendChart({ l, rows, currency }: CostTrendChartProps) {
  const chartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.userAgent.includes("jsdom")) {
      return;
    }
    if (!chartRef.current) {
      return;
    }
    let chart: echarts.ECharts | null = null;
    try {
      chart = echarts.init(chartRef.current);
      chart.setOption({
        tooltip: { trigger: "axis" },
        grid: { top: 24, left: 32, right: 16, bottom: 28 },
        xAxis: {
          type: "category",
          data: rows.map((item) => item.date),
          axisLabel: { color: "#64748b" },
        },
        yAxis: {
          type: "value",
          axisLabel: {
            color: "#64748b",
            formatter: (value: number) => (currency === "CNY" ? `¥${value.toFixed(2)}` : `$${value.toFixed(2)}`),
          },
        },
        series: [
          {
            type: "line",
            smooth: true,
            data: rows.map((item) => (currency === "CNY" ? item.cny : item.usd)),
            areaStyle: {},
          },
        ],
      });
    } catch (_err) {
      return;
    }
    const handleResize = () => chart?.resize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart?.dispose();
    };
  }, [currency, rows]);

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <h3 className="mb-2 text-sm font-semibold text-slate-900">{l("成本趋势", "Cost Trend")}</h3>
      <div ref={chartRef} className="h-56 w-full" />
    </div>
  );
}
