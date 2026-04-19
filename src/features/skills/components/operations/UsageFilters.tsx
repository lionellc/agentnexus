import { useMemo } from "react";

import { Button, Card, CardContent, Select } from "../../../../shared/ui";
import type { SkillsUsageSyncJobSnapshot } from "../../../../shared/types";

import { usageProgressPercent } from "./helpers";

type UsageFiltersProps = {
  l: (zh: string, en: string) => string;
  usageAgentFilter: string;
  usageSourceFilter: string;
  usageStatsLoading: boolean;
  usageStatsError: string;
  usageSyncJob: SkillsUsageSyncJobSnapshot | null;
  sortByUsage: boolean;
  onToggleSortByUsage: () => void;
  onUsageFilterChange: (next: { agent?: string; source?: string }) => void;
  onUsageRefresh: () => Promise<void> | void;
  onBulkLink?: () => Promise<void> | void;
  bulkLinkEnabled: boolean;
  bulkLinking: boolean;
  runningDistribution: boolean;
};

export function UsageFilters({
  l,
  usageAgentFilter,
  usageSourceFilter,
  usageStatsLoading,
  usageStatsError,
  usageSyncJob,
  sortByUsage,
  onToggleSortByUsage,
  onUsageFilterChange,
  onUsageRefresh,
  onBulkLink,
  bulkLinkEnabled,
  bulkLinking,
  runningDistribution,
}: UsageFiltersProps) {
  const usageAgentOptions = useMemo(
    () => [
      { value: "", label: l("全部", "All") },
      { value: "codex", label: "Codex" },
      { value: "claude", label: "Claude" },
    ],
    [l],
  );
  const usageSourceOptions = useMemo(
    () => [
      { value: "", label: l("全部", "All") },
      { value: "codex_jsonl", label: "codex_jsonl" },
      { value: "claude_transcript", label: "claude_transcript" },
    ],
    [l],
  );

  const usageSyncRunning = usageSyncJob?.status === "running";
  const usagePercent = usageProgressPercent(usageSyncJob);

  return (
    <Card>
      <CardContent className="space-y-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-slate-600">
              <span>{l("Agent", "Agent")}</span>
              <Select
                aria-label={l("Agent 筛选", "Agent filter")}
                className="w-32"
                buttonClassName="h-8 text-xs"
                value={usageAgentFilter}
                options={usageAgentOptions}
                onChange={(value) => onUsageFilterChange({ agent: value })}
              />
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-600">
              <span>{l("来源", "Source")}</span>
              <Select
                aria-label={l("来源筛选", "Source filter")}
                className="w-44"
                buttonClassName="h-8 text-xs"
                value={usageSourceFilter}
                options={usageSourceOptions}
                onChange={(value) => onUsageFilterChange({ source: value })}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={onToggleSortByUsage}>
              {sortByUsage ? l("恢复默认排序", "Reset Sort") : l("按调用次数排序", "Sort by Calls")}
            </Button>
            {onBulkLink ? (
              <Button
                size="sm"
                variant="outline"
                disabled={runningDistribution || bulkLinking || !bulkLinkEnabled}
                onClick={() => void onBulkLink()}
              >
                {bulkLinking ? l("全部 Link 中...", "Linking All...") : l("全部 Link", "Link All")}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              disabled={usageSyncRunning}
              onClick={() => void onUsageRefresh()}
            >
              {usageSyncRunning ? l("分析中...", "Analyzing...") : l("刷新分析", "Refresh Analysis")}
            </Button>
          </div>
        </div>
        {usageSyncJob ? (
          <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>
                {l("状态", "Status")}：{usageSyncJob.status}
              </span>
              <span>
                {usageSyncJob.processedFiles}/{usageSyncJob.totalFiles} ({usagePercent}%)
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded bg-slate-200">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${usagePercent}%` }} />
            </div>
            {usageSyncJob.currentSource ? (
              <div className="truncate text-[11px] text-slate-500" title={usageSyncJob.currentSource}>
                {usageSyncJob.currentSource}
              </div>
            ) : null}
            {usageSyncJob.errorMessage ? (
              <div className="text-[11px] text-rose-600">{usageSyncJob.errorMessage}</div>
            ) : null}
          </div>
        ) : null}
        {usageStatsError ? (
          <div className="text-xs text-rose-600">{usageStatsError}</div>
        ) : usageStatsLoading ? (
          <div className="text-xs text-slate-500">{l("统计刷新中...", "Refreshing stats...")}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
