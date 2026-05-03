import { useCallback, useEffect, useMemo, useState } from "react";

import { modelUsageApi } from "../../../shared/services/api";
import type {
  ModelUsageDashboardResult,
  ModelUsageRequestLogItem,
  ModelUsageStatus,
  ModelUsageSyncJobSnapshot,
} from "../../../shared/types";
import { buildStatusSummary } from "../utils/usageFormat";

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

export function useUsageDashboardController() {
  const [days, setDays] = useState(7);
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
  const [lastRefreshSucceededAt, setLastRefreshSucceededAt] = useState<string>("");
  const [latestCallAt, setLatestCallAt] = useState<string>("");
  const [error, setError] = useState("");
  const timezoneOffsetMinutes = useMemo(() => -new Date().getTimezoneOffset(), []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const timeWindow = buildTimeWindow(days);
      const result = await modelUsageApi.queryDashboard({
        days: timeWindow.days,
        startAt: timeWindow.startAt,
        endAt: timeWindow.endAt,
        agent: agent || undefined,
        model: model || undefined,
        status: status || undefined,
        timezoneOffsetMinutes,
      });
      setDashboard(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载看板失败");
      throw err;
    } finally {
      setLoading(false);
    }
  }, [agent, days, model, status, timezoneOffsetMinutes]);

  const loadLogsPage = useCallback(
    async (pageIndex: number, cursor: LogCursor) => {
      setLogsLoading(true);
      setError("");
      try {
        const timeWindow = buildTimeWindow(days);
        const result = await modelUsageApi.queryRequestLogs({
          days: timeWindow.days,
          startAt: timeWindow.startAt,
          endAt: timeWindow.endAt,
          agent: agent || undefined,
          model: model || undefined,
          status: status || undefined,
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
    [agent, days, model, status],
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

  const syncUsage = useCallback(async (forceFull = false) => {
    setError("");
    try {
      const job = await modelUsageApi.syncStart(forceFull ? { forceFull: true } : {});
      setSyncJob(job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "启动同步失败");
    }
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    void syncUsage();
  }, [syncUsage]);

  useEffect(() => {
    if (!syncJob || syncJob.status !== "running" ) {
      return;
    }
    let stopped = false;
    const timer = window.setInterval(() => {
      void modelUsageApi
        .syncProgress({ jobId: syncJob.jobId })
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
  }, [refreshAll, syncJob]);

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
    lastRefreshSucceededAt,
    latestCallAt,
    error,
    statusSummary,
    agentOptions,
    modelOptions,
    refreshAll,
    syncUsage,
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
