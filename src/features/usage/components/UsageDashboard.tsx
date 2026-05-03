import { Button, Table, Tabs as SemiTabs } from "@douyinfe/semi-ui-19";
import type { ReactNode } from "react";
import { useState } from "react";

import type { ModelUsageCurrency, ModelUsageDashboardResult, ModelUsageSyncJobSnapshot } from "../../../shared/types";
import { SectionTitle } from "../../common/components/SectionTitle";
import { EmptyState } from "../../common/components/EmptyState";
import { useUsageDashboardController } from "../hooks/useUsageDashboardController";
import { formatCurrency, formatInteger, formatTimestamp, formatUsageRange, getSyncStatusLabel, type UsageStatusSummary } from "../utils/usageFormat";
import { PricingPanel } from "./PricingPanel";
import { RequestDetailTable } from "./RequestDetailTable";
import { SourceCoverageBar } from "./SourceCoverageBar";
import { UsageFiltersBar } from "./UsageFiltersBar";
import { UsageKpiCards } from "./UsageKpiCards";
import { CostTrendChart } from "./charts/CostTrendChart";
import { ModelDistributionChart } from "./charts/StatusDistributionChart";
import { ModelCostDistributionChart } from "./charts/ModelCostDistributionChart";
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
    currency,
    setCurrency,
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
    pricingSyncResult,
    pricingSaving,
    lastRefreshSucceededAt,
    latestCallAt,
    error,
    statusSummary,
    agentOptions,
    modelOptions,
    syncUsage,
    syncPricing,
    savePricingOverride,
    loadNextLogsPage,
    loadPreviousLogsPage,
  } = useUsageDashboardController();

  const syncKey = syncJob ? `${syncJob.jobId}:${syncJob.status}` : "";

  return (
    <div className="space-y-3">
      <SectionTitle
        title={l("模型使用与成本看板", "Model Usage & Cost Dashboard")}
        subtitle={l("先判断成本和数据可信度，再定位异常请求。", "Assess cost and trust first, then inspect anomalous requests.")}
      />
      {dashboard ? (
        <UsageOverview
          l={l}
          currency={currency}
          days={days}
          dashboard={dashboard}
          loading={loading}
          refreshing={refreshing}
          syncRunning={syncJob?.status === "running"}
          lastRefreshSucceededAt={lastRefreshSucceededAt}
          latestCallAt={latestCallAt}
          statusSummary={statusSummary}
          onRefresh={() => {
            void syncUsage();
          }}
          onSyncUsage={syncUsage}
        />
      ) : null}
      <UsageFiltersBar
        l={l}
        days={days}
        currency={currency}
        agent={agent}
        model={model}
        status={status}
        agentOptions={agentOptions}
        modelOptions={modelOptions}
        loading={loading}
        onDaysChange={setDays}
        onCurrencyChange={setCurrency}
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
          <SourceCoverageBar l={l} sourceCoverage={dashboard.sourceCoverage} summary={dashboard.summary} />
          <div className="grid gap-3 md:grid-cols-2">
            <CostTrendChart l={l} rows={dashboard.trends.dailyCost} currency={currency} />
            <TokenTrendChart l={l} rows={dashboard.trends.dailyTokens} />
            <ModelCostDistributionChart l={l} rows={dashboard.trends.modelCostDistribution} currency={currency} />
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
              <ModelRankingTable l={l} rows={dashboard.trends.modelCostDistribution} currency={currency} />
            )}
          </div>
          <PricingPanel
            l={l}
            currency={currency}
            rows={dashboard.pricing.rows}
            syncResult={pricingSyncResult}
            saving={pricingSaving}
            onSyncPricing={syncPricing}
            onSaveOverride={savePricingOverride}
          />
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
  currency: ModelUsageCurrency;
  days: number;
  dashboard: ModelUsageDashboardResult;
  loading?: boolean;
  refreshing?: boolean;
  syncRunning?: boolean;
  lastRefreshSucceededAt: string;
  latestCallAt: string;
  statusSummary: UsageStatusSummary;
  onRefresh: () => void;
  onSyncUsage: () => void;
};

function UsageOverview({ l, currency, days, dashboard, loading, refreshing, syncRunning, lastRefreshSucceededAt, latestCallAt, statusSummary, onRefresh, onSyncUsage }: UsageOverviewProps) {
  const failedText = statusSummary.failed > 0
    ? `${formatInteger(statusSummary.failed)} ${l("失败", "failed")}`
    : l("暂无失败", "No failures");
  const incompleteText = dashboard.summary.incompleteCount > 0
    ? `${formatInteger(dashboard.summary.incompleteCount)} ${l("不完整", "incomplete")}`
    : l("记录完整", "Complete records");

  return (
    <div className="rounded-xl border border-border bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm dark:from-slate-950 dark:to-slate-900 dark:shadow-none">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>{formatUsageRange(days, l)}</span>
            <span>·</span>
            <span>{currency}</span>
            <span>·</span>
            <span>{dashboard.sourceCoverage.length > 0 ? l("来源已覆盖", "Sources covered") : l("暂无来源覆盖", "No source coverage")}</span>
          </div>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{l("当前范围成本", "Current range cost")}</p>
              <p className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                {formatCurrency(dashboard.summary.displayCost, dashboard.summary.displayCurrency)}
              </p>
            </div>
            <div className="pb-1 text-sm text-slate-600 dark:text-slate-300">
              {formatInteger(dashboard.summary.requestCount)} {l("次请求", "requests")} · {formatInteger(dashboard.summary.totalTokens)} Token · {failedText}
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {incompleteText} · {dashboard.summary.fxStale ? l("汇率过期，使用最近快照", "Stale FX, using latest snapshot") : l("汇率快照可用", "FX snapshot fresh")}
            {lastRefreshSucceededAt ? ` · ${l("页面刷新成功", "Page refreshed")}: ${formatTimestamp(lastRefreshSucceededAt)}` : ""}
            {latestCallAt ? ` · ${l("最新调用时间", "Latest call")}: ${formatTimestamp(latestCallAt)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onSyncUsage} disabled={loading}>
            {l("同步调用", "Sync Calls")}
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
  currency,
}: {
  l: (zh: string, en: string) => string;
  rows: ModelUsageDashboardResult["trends"]["modelCostDistribution"];
  currency: ModelUsageCurrency;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title={l("暂无模型排行", "No model ranking")}
        description={l("当前筛选条件下没有可排行的模型成本数据。", "No model cost distribution under the current filters.")}
      />
    );
  }
  const columns: ModelRankingColumn[] = [
    { title: "model", dataIndex: "model", render: (_value, item) => item.model || "-" },
    { title: l("请求", "Requests"), dataIndex: "requests", width: 120, render: (_value, item) => formatInteger(item.requests) },
    { title: "Token", dataIndex: "tokens", width: 140, render: (_value, item) => formatInteger(item.tokens) },
    {
      title: l("成本", "Cost"),
      dataIndex: "cost",
      width: 140,
      render: (_value, item) => formatCurrency(currency === "CNY" ? item.costCny : item.costUsd, currency),
    },
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

type ModelRankingRow = ModelUsageDashboardResult["trends"]["modelCostDistribution"][number];

type ModelRankingColumn = {
  title: string;
  dataIndex: string;
  width?: number;
  render?: (_value: unknown, record: ModelRankingRow) => ReactNode;
};
