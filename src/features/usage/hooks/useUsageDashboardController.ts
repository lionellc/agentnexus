import { useCallback, useEffect, useMemo, useState } from "react";

import { modelUsageApi } from "../../../shared/services/api";
import type {
  ModelPricingOverrideUpsertInput,
  ModelPricingSyncResult,
  ModelUsageCurrency,
  ModelUsageDashboardResult,
  ModelUsageRequestLogItem,
  ModelUsageStatus,
  ModelUsageSyncJobSnapshot,
} from "../../../shared/types";
import { buildStatusSummary } from "../utils/usageFormat";

type UseUsageDashboardControllerInput = {
  workspaceId: string | null;
};

const DEFAULT_LIMIT = 20;

type LogCursor = { timestamp: string; id: string } | null;

function buildTimeWindow(days: number): { days?: number; startAt?: string; endAt?: string } {
  if (days !== 0) {
    return { days };
  }
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return {
    days: 0,
    startAt: start.toISOString(),
    endAt: now.toISOString(),
  };
}

export function useUsageDashboardController({ workspaceId }: UseUsageDashboardControllerInput) {
  const [days, setDays] = useState(7);
  const [currency, setCurrency] = useState<ModelUsageCurrency>("USD");
  const [agent, setAgent] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [status, setStatus] = useState<ModelUsageStatus>("");
  const [dashboard, setDashboard] = useState<ModelUsageDashboardResult | null>(null);
  const [logs, setLogs] = useState<ModelUsageRequestLogItem[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsCursor, setLogsCursor] = useState<LogCursor>(null);
  const [logsPageIndex, setLogsPageIndex] = useState(0);
  const [logsPageCursors, setLogsPageCursors] = useState<LogCursor[]>([null]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [syncJob, setSyncJob] = useState<ModelUsageSyncJobSnapshot | null>(null);
  const [pricingSyncResult, setPricingSyncResult] = useState<ModelPricingSyncResult | null>(null);
  const [pricingSaving, setPricingSaving] = useState(false);
  const [lastRefreshSucceededAt, setLastRefreshSucceededAt] = useState<string>("");
  const [latestCallAt, setLatestCallAt] = useState<string>("");
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    if (!workspaceId) {
      setDashboard(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const timeWindow = buildTimeWindow(days);
      const result = await modelUsageApi.queryDashboard({
        workspaceId,
        days: timeWindow.days,
        startAt: timeWindow.startAt,
        endAt: timeWindow.endAt,
        agent: agent || undefined,
        model: model || undefined,
        status: status || undefined,
        currency,
      });
      setDashboard(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载看板失败");
      throw err;
    } finally {
      setLoading(false);
    }
  }, [agent, currency, days, model, status, workspaceId]);

  const loadLogsPage = useCallback(
    async (pageIndex: number, cursor: LogCursor) => {
      if (!workspaceId) {
        setLogs([]);
        setLogsTotal(0);
        setLogsCursor(null);
        setLogsPageIndex(0);
        setLogsPageCursors([null]);
        return;
      }
      setLogsLoading(true);
      setError("");
      try {
        const timeWindow = buildTimeWindow(days);
        const result = await modelUsageApi.queryRequestLogs({
          workspaceId,
          days: timeWindow.days,
          startAt: timeWindow.startAt,
          endAt: timeWindow.endAt,
          agent: agent || undefined,
          model: model || undefined,
          status: status || undefined,
          currency,
          limit: DEFAULT_LIMIT,
          cursorTimestamp: cursor?.timestamp,
          cursorId: cursor?.id,
        });
        setLogsTotal(result.total);
        setLogsCursor(result.nextCursor ?? null);
        setLogs(result.items);
        if (pageIndex === 0) {
          setLatestCallAt(result.items[0]?.calledAt ?? "");
        }
        setLogsPageIndex(pageIndex);
        setLogsPageCursors((previous) => {
          const next = previous.slice(0, pageIndex + 1);
          next[pageIndex] = cursor;
          if (result.nextCursor) {
            next[pageIndex + 1] = result.nextCursor;
          }
          return next;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载请求明细失败");
        throw err;
      } finally {
        setLogsLoading(false);
      }
    },
    [agent, currency, days, model, status, workspaceId],
  );

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadDashboard(), loadLogsPage(0, null)]);
      setLastRefreshSucceededAt(new Date().toISOString());
    } catch (_err) {
      // loadDashboard/loadLogsPage already set the user-facing error.
    } finally {
      setRefreshing(false);
    }
  }, [loadDashboard, loadLogsPage]);

  const syncUsage = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    setError("");
    try {
      const job = await modelUsageApi.syncStart({ workspaceId });
      setSyncJob(job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "启动同步失败");
    }
  }, [workspaceId]);

  const syncPricing = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    setPricingSaving(true);
    setError("");
    try {
      const result = await modelUsageApi.syncPricing({ workspaceId });
      setPricingSyncResult(result);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "刷新内置价格库失败");
    } finally {
      setPricingSaving(false);
    }
  }, [loadDashboard, workspaceId]);

  const savePricingOverride = useCallback(
    async (input: Omit<ModelPricingOverrideUpsertInput, "workspaceId">) => {
      if (!workspaceId) {
        return;
      }
      setPricingSaving(true);
      setError("");
      try {
        await modelUsageApi.upsertPricingOverride({
          workspaceId,
          provider: input.provider,
          model: input.model,
          currency: input.currency,
          inputCostPerMillion: input.inputCostPerMillion,
          outputCostPerMillion: input.outputCostPerMillion,
        });
        await loadDashboard();
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存覆盖单价失败");
      } finally {
        setPricingSaving(false);
      }
    },
    [loadDashboard, workspaceId],
  );

  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    void refreshAll();
  }, [refreshAll, workspaceId]);

  useEffect(() => {
    if (!syncJob || syncJob.status !== "running" || !workspaceId) {
      return;
    }
    let stopped = false;
    const timer = window.setInterval(() => {
      void modelUsageApi
        .syncProgress({ workspaceId, jobId: syncJob.jobId })
        .then((next) => {
          if (stopped) {
            return;
          }
          setSyncJob(next);
          if (next.status !== "running") {
            void refreshAll();
          }
        })
        .catch(() => {
          if (!stopped) {
            setSyncJob((previous) =>
              previous
                ? {
                    ...previous,
                    status: "failed",
                    errorMessage: "同步进度轮询失败",
                  }
                : previous,
            );
          }
        });
    }, 1500);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [refreshAll, syncJob, workspaceId]);

  const agentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of logs) {
      if (item.agent) {
        set.add(item.agent);
      }
    }
    return Array.from(set).sort((left, right) => left.localeCompare(right));
  }, [logs]);

  const modelOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of dashboard?.trends.modelDistribution ?? []) {
      if (item.model) {
        set.add(item.model);
      }
    }
    if (set.size === 0) {
      for (const item of logs) {
        if (item.model) {
          set.add(item.model);
        }
      }
    }
    return Array.from(set).sort((left, right) => left.localeCompare(right));
  }, [dashboard, logs]);

  const statusSummary = useMemo(
    () => buildStatusSummary(dashboard?.trends.statusDistribution ?? []),
    [dashboard],
  );

  return {
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
    logsPageSize: DEFAULT_LIMIT,
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
    refreshAll,
    syncUsage,
    syncPricing,
    savePricingOverride,
    loadNextLogsPage: () => {
      if (!logsCursor) {
        return;
      }
      void loadLogsPage(logsPageIndex + 1, logsCursor);
    },
    loadPreviousLogsPage: () => {
      if (logsPageIndex <= 0) {
        return;
      }
      void loadLogsPage(logsPageIndex - 1, logsPageCursors[logsPageIndex - 1] ?? null);
    },
  };
}
