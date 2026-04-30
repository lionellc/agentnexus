import { useEffect, useRef } from "react";
import * as echarts from "echarts";

import type { ModelUsageDashboardResult } from "../../../../shared/types";

type TokenTrendChartProps = {
  l: (zh: string, en: string) => string;
  rows: ModelUsageDashboardResult["trends"]["dailyTokens"];
};

export function TokenTrendChart({ l, rows }: TokenTrendChartProps) {
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
        legend: { top: 0, textStyle: { color: "#64748b" } },
        grid: { top: 28, left: 32, right: 16, bottom: 28 },
        xAxis: {
          type: "category",
          data: rows.map((item) => item.date),
          axisLabel: { color: "#64748b" },
        },
        yAxis: {
          type: "value",
          axisLabel: { color: "#64748b" },
        },
        series: [
          {
            name: "input",
            type: "line",
            smooth: true,
            data: rows.map((item) => item.inputTokens),
          },
          {
            name: "output",
            type: "line",
            smooth: true,
            data: rows.map((item) => item.outputTokens),
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
  }, [rows]);

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <h3 className="mb-2 text-sm font-semibold text-slate-900">{l("Token 趋势", "Token Trend")}</h3>
      <div ref={chartRef} className="h-56 w-full" />
    </div>
  );
}
