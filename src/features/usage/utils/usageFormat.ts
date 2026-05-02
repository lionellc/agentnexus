import type {
  ModelUsageCurrency,
  ModelUsageDashboardResult,
  ModelUsageStatus,
  ModelUsageSyncJobSnapshot,
} from "../../../shared/types";

export type UsageStatusSummary = {
  success: number;
  failed: number;
  unknown: number;
  total: number;
};

export function formatInteger(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
}

export function formatDecimal(value: number, digits = 4) {
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatCurrency(value: number, currency: ModelUsageCurrency) {
  if (currency === "CNY") {
    return `¥${formatDecimal(value, 2)}`;
  }
  return `$${formatDecimal(value, 2)}`;
}

export function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function formatOptionalInteger(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }
  return formatInteger(value);
}

export function formatUsageRange(days: number, l: (zh: string, en: string) => string) {
  if (days === 0) {
    return l("当天 · 小时维度", "Today · hourly");
  }
  return `${days}d`;
}

export function buildStatusSummary(
  rows: ModelUsageDashboardResult["trends"]["statusDistribution"] = [],
): UsageStatusSummary {
  const summary: UsageStatusSummary = { success: 0, failed: 0, unknown: 0, total: 0 };
  for (const item of rows) {
    const count = Number.isFinite(item.count) ? item.count : 0;
    if (item.status === "success") {
      summary.success += count;
    } else if (item.status === "failed") {
      summary.failed += count;
    } else {
      summary.unknown += count;
    }
    summary.total += count;
  }
  return summary;
}

export function getStatusLabel(status: ModelUsageStatus, l: (zh: string, en: string) => string) {
  if (status === "success") {
    return l("成功", "Success");
  }
  if (status === "failed") {
    return l("失败", "Failed");
  }
  if (status === "unknown") {
    return l("未知", "Unknown");
  }
  return status || l("未知", "Unknown");
}

export function getSyncStatusLabel(status: ModelUsageSyncJobSnapshot["status"], l: (zh: string, en: string) => string) {
  if (status === "running") {
    return l("同步中", "Syncing");
  }
  if (status === "completed") {
    return l("同步完成", "Completed");
  }
  if (status === "completed_with_errors") {
    return l("同步完成但有异常", "Completed with errors");
  }
  if (status === "failed") {
    return l("同步失败", "Failed");
  }
  return status;
}
