import { useEffect, useRef } from "react";
import * as echarts from "echarts";

import type { ModelUsageDashboardResult } from "../../../../shared/types";
import { formatTokenAmount } from "../../utils/usageFormat";

type ModelTokenDistributionChartProps = {
  l: (zh: string, en: string) => string;
  rows: ModelUsageDashboardResult["trends"]["modelTokenDistribution"];
};

export function ModelTokenDistributionChart({
  l,
  rows,
}: ModelTokenDistributionChartProps) {
  const chartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.userAgent.includes("jsdom")) {
      return;
    }
    if (!chartRef.current) {
      return;
    }
    const top = rows.slice(0, 8);
    let chart: echarts.ECharts | null = null;
    try {
      chart = echarts.init(chartRef.current);
      chart.setOption({
        tooltip: { trigger: "axis" },
        grid: { top: 24, left: 72, right: 16, bottom: 20 },
        xAxis: {
          type: "value",
          axisLabel: {
            color: "#64748b",
            formatter: (value: number) => formatTokenAmount(value),
          },
        },
        yAxis: {
          type: "category",
          data: top.map((item) => item.model || "-"),
          axisLabel: { color: "#64748b" },
        },
        series: [
          {
            type: "bar",
            data: top.map((item) => item.tokens),
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
      <h3 className="mb-2 text-sm font-semibold text-slate-900">{l("模型 Token 分布", "Model Token Distribution")}</h3>
      <div ref={chartRef} className="h-56 w-full" />
    </div>
  );
}
