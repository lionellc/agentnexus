import { useEffect, useRef } from "react";
import * as echarts from "echarts";

import type { ModelUsageDashboardResult } from "../../../../shared/types";

type ModelDistributionChartProps = {
  l: (zh: string, en: string) => string;
  rows: ModelUsageDashboardResult["trends"]["modelDistribution"];
};

export function ModelDistributionChart({ l, rows }: ModelDistributionChartProps) {
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
        tooltip: { trigger: "item" },
        legend: { bottom: 0, textStyle: { color: "#64748b" } },
        series: [
          {
            type: "pie",
            radius: ["35%", "65%"],
            data: rows.map((item) => ({ name: item.model, value: item.count })),
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
      <h3 className="mb-2 text-sm font-semibold text-slate-900">{l("模型分布", "Model Distribution")}</h3>
      <div ref={chartRef} className="h-56 w-full" />
    </div>
  );
}
