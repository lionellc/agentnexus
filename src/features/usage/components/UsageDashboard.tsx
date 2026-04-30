import { useState } from "react";

import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "../../../shared/ui";
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
  workspaceId: string | null;
};

export function UsageDashboard({ l, workspaceId }: UsageDashboardProps) {
  const [hiddenSyncKey, setHiddenSyncKey] = useState("");
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
  } = useUsageDashboardController({ workspaceId });

  if (!workspaceId) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-sm text-slate-500">
        {l("请先创建并激活工作区后再查看模型使用看板。", "Create and activate a workspace first.")}
      </div>
    );
  }

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
          <Tabs defaultValue="logs" className="space-y-3">
            <TabsList className="bg-muted/60">
              <TabsTrigger value="logs">{l("请求明细", "Request Logs")}</TabsTrigger>
              <TabsTrigger value="models">{l("模型排行", "Model Ranking")}</TabsTrigger>
            </TabsList>
            <TabsContent value="logs" className="mt-0">
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
            </TabsContent>
            <TabsContent value="models" className="mt-0">
              <ModelRankingTable l={l} rows={dashboard.trends.modelCostDistribution} currency={currency} />
            </TabsContent>
          </Tabs>
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
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-slate-600">
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
    <div className="rounded-xl border border-border bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{formatUsageRange(days, l)}</span>
            <span>·</span>
            <span>{currency}</span>
            <span>·</span>
            <span>{dashboard.sourceCoverage.length > 0 ? l("来源已覆盖", "Sources covered") : l("暂无来源覆盖", "No source coverage")}</span>
          </div>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <p className="text-xs text-slate-500">{l("当前范围成本", "Current range cost")}</p>
              <p className="text-3xl font-semibold tracking-tight text-slate-950">
                {formatCurrency(dashboard.summary.displayCost, dashboard.summary.displayCurrency)}
              </p>
            </div>
            <div className="pb-1 text-sm text-slate-600">
              {formatInteger(dashboard.summary.requestCount)} {l("次请求", "requests")} · {formatInteger(dashboard.summary.totalTokens)} Token · {failedText}
            </div>
          </div>
          <p className="text-xs text-slate-500">
            {incompleteText} · {dashboard.summary.fxStale ? l("汇率过期，使用最近快照", "Stale FX, using latest snapshot") : l("汇率快照可用", "FX snapshot fresh")}
            {lastRefreshSucceededAt ? ` · ${l("页面刷新成功", "Page refreshed")}: ${formatTimestamp(lastRefreshSucceededAt)}` : ""}
            {latestCallAt ? ` · ${l("最新调用时间", "Latest call")}: ${formatTimestamp(latestCallAt)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onSyncUsage} disabled={loading}>
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
    <div className={`rounded-md border px-3 py-2 text-xs ${isFailed ? "border-amber-200 bg-amber-50 text-amber-800" : "border-border bg-card text-slate-600"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          {getSyncStatusLabel(job.status, l)} · {job.processedFiles}/{job.totalFiles}
          {job.currentSource ? ` · ${job.currentSource}` : ""}
        </span>
        <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
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

  return (
    <div className="overflow-auto rounded-lg border border-border bg-card p-3">
      <table className="min-w-full text-left text-xs">
        <thead>
          <tr className="border-b border-border text-slate-500">
            <th className="py-2 pr-3">model</th>
            <th className="py-2 pr-3">{l("请求", "Requests")}</th>
            <th className="py-2 pr-3">Token</th>
            <th className="py-2 pr-3">{l("成本", "Cost")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.model} className="border-b border-border/60">
              <td className="py-2 pr-3">{item.model || "-"}</td>
              <td className="py-2 pr-3">{formatInteger(item.requests)}</td>
              <td className="py-2 pr-3">{formatInteger(item.tokens)}</td>
              <td className="py-2 pr-3">{formatCurrency(currency === "CNY" ? item.costCny : item.costUsd, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
