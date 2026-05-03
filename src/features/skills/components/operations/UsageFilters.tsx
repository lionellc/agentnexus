import { Button } from "@douyinfe/semi-ui-19";
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@douyinfe/semi-ui-19";
import { RefreshCw, X } from "lucide-react";
import type { SkillsUsageSyncJobSnapshot } from "../../../../shared/types";

import { usageProgressPercent } from "./helpers";

export type UsageSortMode =
  | "default"
  | "calls_desc"
  | "calls_asc"
  | "created_desc"
  | "created_asc";

type UsageFiltersProps = {
  l: (zh: string, en: string) => string;
  skillQuery: string;
  onSkillQueryChange: (value: string) => void;
  onRefreshSkills: () => Promise<void> | void;
  skillsLoading: boolean;
  usageAgentFilter: string;
  usageSourceFilter: string;
  usageEvidenceSourceFilter: string;
  usageStatsLoading: boolean;
  usageStatsError: string;
  usageSyncJob: SkillsUsageSyncJobSnapshot | null;
  onDismissUsageSyncJob?: () => void;
  sortMode: UsageSortMode;
  onSortModeChange: (next: UsageSortMode) => void;
  onUsageFilterChange: (next: { agent?: string; source?: string; evidenceSource?: string }) => void;
  onUsageRefresh: () => Promise<void> | void;
  onBulkLink?: () => Promise<void> | void;
  bulkLinkEnabled: boolean;
  bulkLinking: boolean;
  runningDistribution: boolean;
};

export function UsageFilters({
  l,
  skillQuery,
  onSkillQueryChange,
  onRefreshSkills,
  skillsLoading,
  usageAgentFilter: _usageAgentFilter,
  usageSourceFilter: _usageSourceFilter,
  usageEvidenceSourceFilter: _usageEvidenceSourceFilter,
  usageStatsLoading,
  usageStatsError,
  usageSyncJob,
  onDismissUsageSyncJob,
  sortMode,
  onSortModeChange,
  onUsageFilterChange: _onUsageFilterChange,
  onUsageRefresh,
  onBulkLink,
  bulkLinkEnabled,
  bulkLinking,
  runningDistribution,
}: UsageFiltersProps) {
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement | null>(null);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);

  const usageSyncRunning = usageSyncJob?.status === "running";
  const usagePercent = usageProgressPercent(usageSyncJob);
  const sortOptions = useMemo(
    () => [
      {
        value: "calls_asc" as const,
        label: l("调用次数（升序）", "Calls (Asc)"),
      },
      {
        value: "calls_desc" as const,
        label: l("调用次数（降序）", "Calls (Desc)"),
      },
      {
        value: "created_asc" as const,
        label: l("创建时间（升序）", "Created Time (Asc)"),
      },
      {
        value: "created_desc" as const,
        label: l("创建时间（降序）", "Created Time (Desc)"),
      },
    ],
    [l],
  );

  useEffect(() => {
    if (!toolsMenuOpen && !sortMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (toolsMenuOpen && toolsMenuRef.current && !toolsMenuRef.current.contains(target)) {
        setToolsMenuOpen(false);
      }
      if (sortMenuOpen && sortMenuRef.current && !sortMenuRef.current.contains(target)) {
        setSortMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [sortMenuOpen, toolsMenuOpen]);

  return (
    <div className="space-y-3 px-0.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={skillQuery}
            onChange={(value) => onSkillQueryChange(value)}
            placeholder={l("搜索 Skill...", "Search skills...")}
            className="w-56"
          />
          <Button
            onClick={() => {
              void onRefreshSkills();
            }}
            disabled={skillsLoading}
          >
            <RefreshCw className="mr-1 h-4 w-4" />
            {l("刷新", "Refresh")}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div ref={sortMenuRef} className="relative">
            <Button
              onClick={() => {
                setSortMenuOpen((prev) => !prev);
                setToolsMenuOpen(false);
              }}
            >
              {l("排序", "Sort")}
            </Button>
            {sortMenuOpen ? (
              <div className="absolute right-0 top-10 z-20 min-w-44 rounded-md border border-slate-200 bg-white p-1 shadow-md">
                {sortOptions.map((option) => (
                  <Button
                    key={option.value}
                    htmlType="button"
                    className="h-auto w-full justify-start px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                    onClick={() => {
                      onSortModeChange(option.value);
                      setSortMenuOpen(false);
                    }}
                  >
                    {sortMode === option.value ? `✓ ${option.label}` : option.label}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
          <div ref={toolsMenuRef} className="relative">
            <Button
              onClick={() => {
                setToolsMenuOpen((prev) => !prev);
                setSortMenuOpen(false);
              }}
            >
              {l("工具", "Tools")}
            </Button>
            {toolsMenuOpen ? (
              <div className="absolute right-0 top-10 z-20 min-w-44 rounded-md border border-slate-200 bg-white p-1 shadow-md">
                <Button
                  htmlType="button"
                  className="h-auto w-full justify-start px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={usageSyncRunning}
                  onClick={() => {
                    void onUsageRefresh();
                    setToolsMenuOpen(false);
                  }}
                >
                  {usageSyncRunning ? l("调用次数分析中...", "Calls Analysis Running...") : l("调用次数分析", "Calls Analysis")}
                </Button>
                {onBulkLink ? (
                  <Button
                    htmlType="button"
                    className="h-auto w-full justify-start px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={runningDistribution || bulkLinking || !bulkLinkEnabled}
                    onClick={() => {
                      void onBulkLink();
                      setToolsMenuOpen(false);
                    }}
                  >
                    {bulkLinking ? l("批量 Link 中...", "Bulk Linking...") : l("批量Link", "Bulk Link")}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {usageSyncJob ? (
        <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
            <div className="flex min-w-0 items-center gap-2">
              <span>
                {l("状态", "Status")}：{usageSyncJob.status}
              </span>
              {onDismissUsageSyncJob ? (
                <Button
                  htmlType="button"
                  className="h-5 w-5 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                  onClick={onDismissUsageSyncJob}
                  aria-label={l("关闭状态", "Close Status")}
                  title={l("关闭状态", "Close Status")}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
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
    </div>
  );
}
