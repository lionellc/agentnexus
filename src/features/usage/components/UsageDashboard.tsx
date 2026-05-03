import { Button, Table, Tabs as SemiTabs } from "@douyinfe/semi-ui-19";
import type { ReactNode } from "react";
import { useState } from "react";

import type { ModelUsageDashboardResult, ModelUsageSyncJobSnapshot } from "../../../shared/types";
import { SectionTitle } from "../../common/components/SectionTitle";
import { EmptyState } from "../../common/components/EmptyState";
import { useUsageDashboardController } from "../hooks/useUsageDashboardController";
import { formatInteger, formatTimestamp, formatTokenAmount, formatUsageRange, getSyncStatusLabel, type UsageStatusSummary } from "../utils/usageFormat";
import { RequestDetailTable } from "./RequestDetailTable";
import { UsageFiltersBar } from "./UsageFiltersBar";
import { UsageKpiCards } from "./UsageKpiCards";
import { ModelDistributionChart } from "./charts/StatusDistributionChart";
import { ModelTokenDistributionChart } from "./charts/ModelTokenDistributionChart";
import { TokenTrendChart } from "./charts/TokenTrendChart";

type UsageDashboardProps = {
  l: (zh: string, en: string) => string;
};

export function UsageDashboard({ l }: UsageDashboardProps) {
  const [hiddenSyncKey, setHiddenSyncKey] = useState("");
  const [detailTab, setDetailTab] = useState("logs");
  const {
    days,
    setDays,
    agent,
    setAgent,
    model,
    setModel,
    status,
    setStatus,
    dashboard,
    logs,
    logsTotal,
    logsCursor,
    logsPageIndex,
    logsPageSize,
    loading,
    refreshing,
    logsLoading,
    syncJob,
    lastRefreshSucceededAt,
    latestCallAt,
    error,
    statusSummary,
    agentOptions,
    modelOptions,
    syncUsage,
    loadNextLogsPage,
    loadPreviousLogsPage,
  } = useUsageDashboardController();

  const syncKey = syncJob ? `${syncJob.jobId}:${syncJob.status}` : "";

  return (
    <div className="space-y-3">
      <SectionTitle
        title={l("模型使用看板", "Model Usage Dashboard")}
      />
      {dashboard ? (
        <UsageOverview
          l={l}
          days={days}
          dashboard={dashboard}
          refreshing={refreshing}
          syncRunning={syncJob?.status === "running"}
          lastRefreshSucceededAt={lastRefreshSucceededAt}
          latestCallAt={latestCallAt}
          statusSummary={statusSummary}
          onRefresh={() => {
            void syncUsage();
          }}
          onFullRefresh={() => {
            void syncUsage(true);
          }}
        />
      ) : null}
      <UsageFiltersBar
        l={l}
        days={days}
        agent={agent}
        model={model}
        status={status}
        agentOptions={agentOptions}
        modelOptions={modelOptions}
        loading={loading}
        onDaysChange={setDays}
        onAgentChange={setAgent}
        onModelChange={setModel}
        onStatusChange={setStatus}
      />
      {syncJob && hiddenSyncKey !== syncKey ? (
        <SyncFeedback l={l} job={syncJob} onDismiss={() => setHiddenSyncKey(syncKey)} />
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </div>
      ) : null}
      {dashboard ? (
        <>
          <UsageKpiCards l={l} summary={dashboard.summary} statusSummary={statusSummary} />
          <div className="grid gap-3 md:grid-cols-2">
            <TokenTrendChart l={l} rows={dashboard.trends.dailyTokens} />
            <ModelTokenDistributionChart l={l} rows={dashboard.trends.modelTokenDistribution} />
            <ModelDistributionChart l={l} rows={dashboard.trends.modelDistribution} />
          </div>
          <div className="space-y-3">
            <SemiTabs
              activeKey={detailTab}
              onChange={(value) => setDetailTab(String(value))}
              preventScroll
              size="small"
              tabList={[
                { itemKey: "logs", tab: l("请求明细", "Request Logs") },
                { itemKey: "models", tab: l("模型排行", "Model Ranking") },
              ]}
              type="button"
            />
            {detailTab === "logs" ? (
              <RequestDetailTable
                l={l}
                rows={logs}
                total={logsTotal}
                pageIndex={logsPageIndex}
                pageSize={logsPageSize}
                loading={logsLoading}
                hasNextPage={Boolean(logsCursor)}
                hasPreviousPage={logsPageIndex > 0}
                onNextPage={loadNextLogsPage}
                onPreviousPage={loadPreviousLogsPage}
              />
            ) : (
              <ModelRankingTable l={l} rows={dashboard.trends.modelTokenDistribution} />
            )}
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-slate-600 dark:text-slate-300">
          {loading ? l("正在加载看板数据...", "Loading dashboard...") : l("暂无可展示的数据。", "No data available yet.")}
        </div>
      )}
    </div>
  );
}

type UsageOverviewProps = {
  l: (zh: string, en: string) => string;
  days: number;
  dashboard: ModelUsageDashboardResult;
  refreshing?: boolean;
  syncRunning?: boolean;
  lastRefreshSucceededAt: string;
  latestCallAt: string;
  statusSummary: UsageStatusSummary;
  onRefresh: () => void;
  onFullRefresh: () => void;
};

function UsageOverview({ l, days, dashboard, refreshing, syncRunning, lastRefreshSucceededAt, latestCallAt, statusSummary, onRefresh, onFullRefresh }: UsageOverviewProps) {
  const failedText = statusSummary.failed > 0
    ? `${formatInteger(statusSummary.failed)} ${l("失败", "failed")}`
    : l("暂无失败", "No failures");

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>{formatUsageRange(days, l)}</span>
            <span>·</span>
            <span>{dashboard.sourceCoverage.length > 0 ? l("来源已覆盖", "Sources covered") : l("暂无来源覆盖", "No source coverage")}</span>
          </div>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{l("总 Token", "Total Tokens")}</p>
              <p className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                {formatTokenAmount(dashboard.summary.totalTokens)}
              </p>
            </div>
            <div className="pb-1 text-sm text-slate-600 dark:text-slate-300">
              {formatInteger(dashboard.summary.requestCount)} {l("次请求", "requests")} · {failedText}
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {formatTokenAmount(dashboard.summary.totalInputTokens)} input · {formatTokenAmount(dashboard.summary.totalOutputTokens)} output
            {lastRefreshSucceededAt ? ` · ${l("页面刷新成功", "Page refreshed")}: ${formatTimestamp(lastRefreshSucceededAt)}` : ""}
            {latestCallAt ? ` · ${l("最新调用时间", "Latest call")}: ${formatTimestamp(latestCallAt)}` : ""}
          </p>
        </div>
        <div className="group flex flex-wrap gap-2">
          <Button
            type="tertiary"
            className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
            onClick={onFullRefresh}
            disabled={refreshing || syncRunning}
          >
            {l("全量分析", "Full Analysis")}
          </Button>
          <Button onClick={onRefresh} disabled={refreshing || syncRunning}>
            {syncRunning ? l("增量刷新中", "Refreshing incrementally") : l("刷新", "Refresh")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SyncFeedback({ l, job, onDismiss }: { l: (zh: string, en: string) => string; job: ModelUsageSyncJobSnapshot; onDismiss: () => void }) {
  const isFailed = job.status === "failed" || job.status === "completed_with_errors";
  return (
    <div className={`rounded-md border px-3 py-2 text-xs ${isFailed ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/60 dark:bg-amber-500/15 dark:text-amber-200" : "border-border bg-card text-slate-600 dark:text-slate-300"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          {getSyncStatusLabel(job.status, l)} · {job.processedFiles}/{job.totalFiles}
          {job.currentSource ? ` · ${job.currentSource}` : ""}
        </span>
        <Button htmlType="button" onClick={onDismiss}>
          {l("关闭", "Dismiss")}
        </Button>
      </div>
      <div className="mt-1">
        {l("插入", "Inserted")} {formatInteger(job.insertedEvents)} · {l("合并", "Merged")} {formatInteger(job.mergedEvents)} · {l("解析失败", "Parse failures")} {formatInteger(job.parseFailures)}
        {job.errorMessage ? ` · ${job.errorMessage}` : ""}
      </div>
    </div>
  );
}

function ModelRankingTable({
  l,
  rows,
}: {
  l: (zh: string, en: string) => string;
  rows: ModelUsageDashboardResult["trends"]["modelTokenDistribution"];
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title={l("暂无模型排行", "No model ranking")}
        description={l("当前筛选条件下没有可排行的模型使用数据。", "No model usage data under the current filters.")}
      />
    );
  }
  const columns: ModelRankingColumn[] = [
    { title: "model", dataIndex: "model", render: (_value, item) => item.model || "-" },
    { title: l("请求", "Requests"), dataIndex: "requests", width: 120, render: (_value, item) => formatInteger(item.requests) },
    { title: "input", dataIndex: "inputTokens", width: 120, render: (_value, item) => formatTokenAmount(item.inputTokens) },
    { title: "output", dataIndex: "outputTokens", width: 120, render: (_value, item) => formatTokenAmount(item.outputTokens) },
    { title: "total", dataIndex: "tokens", width: 140, render: (_value, item) => formatTokenAmount(item.tokens) },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <Table
        rowKey="model"
        columns={columns}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 640 }}
      />
    </div>
  );
}

type ModelRankingRow = ModelUsageDashboardResult["trends"]["modelTokenDistribution"][number];

type ModelRankingColumn = {
  title: string;
  dataIndex: string;
  width?: number;
  render?: (_value: unknown, record: ModelRankingRow) => ReactNode;
};
