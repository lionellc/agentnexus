export type ModelUsageSyncStatus =
  | "running"
  | "completed"
  | "completed_with_errors"
  | "failed"
  | string;

export type ModelUsageStatus = "success" | "failed" | "unknown" | string;
export type ModelUsageCurrency = "USD" | "CNY" | string;

export interface ModelUsageSyncStartInput {
  workspaceId: string;
}

export interface ModelUsageSyncProgressInput {
  workspaceId: string;
  jobId: string;
}

export interface ModelUsageDashboardQueryInput {
  workspaceId: string;
  days?: number;
  startAt?: string;
  endAt?: string;
  agent?: string;
  model?: string;
  status?: ModelUsageStatus;
  currency?: ModelUsageCurrency;
}

export interface ModelUsageRequestLogsQueryInput {
  workspaceId: string;
  days?: number;
  startAt?: string;
  endAt?: string;
  agent?: string;
  model?: string;
  status?: ModelUsageStatus;
  currency?: ModelUsageCurrency;
  limit?: number;
  cursorTimestamp?: string;
  cursorId?: string;
}

export interface ModelPricingSyncInput {
  workspaceId: string;
}

export interface ModelPricingSyncResult {
  workspaceId: string;
  syncedAt: string;
  pricingRows: number;
  source: string;
  fx: {
    rate: number;
    stale: boolean;
    fetchedAt: string;
    source: string;
  };
}

export interface ModelPricingQueryInput {
  workspaceId: string;
  currency?: ModelUsageCurrency;
}

export interface ModelPricingOverrideUpsertInput {
  workspaceId: string;
  provider: string;
  model: string;
  currency?: ModelUsageCurrency;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
}

export interface ModelUsageSyncJobSnapshot {
  jobId: string;
  workspaceId: string;
  status: ModelUsageSyncStatus;
  totalFiles: number;
  processedFiles: number;
  parsedEvents: number;
  insertedEvents: number;
  mergedEvents: number;
  parseFailures: number;
  currentSource: string;
  errorMessage: string;
  startedAt: string;
  updatedAt: string;
}

export interface ModelUsageDashboardSummary {
  requestCount: number;
  billableRequestCount: number;
  incompleteCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  totalCostCny: number;
  displayCurrency: ModelUsageCurrency;
  displayCost: number;
  fxRateUsdCny: number;
  fxStale: boolean;
  fxFetchedAt: string;
  fxSource: string;
}

export interface ModelUsageDashboardResult {
  window: {
    startAt: string;
    endAt: string;
    days: number;
  };
  summary: ModelUsageDashboardSummary;
  trends: {
    dailyCost: Array<{
      date: string;
      usd: number;
      cny: number;
      display: number;
    }>;
    dailyTokens: Array<{
      date: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    }>;
    statusDistribution: Array<{
      status: ModelUsageStatus;
      count: number;
    }>;
    modelDistribution: Array<{
      model: string;
      count: number;
    }>;
    modelCostDistribution: Array<{
      model: string;
      requests: number;
      tokens: number;
      costUsd: number;
      costCny: number;
      displayCost: number;
    }>;
  };
  sourceCoverage: Array<{
    source: string;
    status: string;
    count: number;
    updatedAt?: string | null;
  }>;
  pricing: {
    rows: ModelPricingItem[];
  };
}

export interface ModelUsageRequestLogItem {
  id: string;
  calledAt: string;
  agent: string;
  provider: string;
  model: string;
  status: ModelUsageStatus;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number;
  isComplete: boolean;
  source: string;
  sourcePath: string;
  sessionId: string;
  requestId?: string | null;
  costUsd: number;
  costCny: number;
  displayCurrency: ModelUsageCurrency;
  displayCost: number;
}

export interface ModelUsageRequestLogsResult {
  items: ModelUsageRequestLogItem[];
  total: number;
  nextCursor?: {
    timestamp: string;
    id: string;
  } | null;
  displayCurrency: ModelUsageCurrency;
  fxRateUsdCny: number;
  fxStale: boolean;
  fxFetchedAt: string;
}

export interface ModelPricingItem {
  provider: string;
  model: string;
  currency: ModelUsageCurrency;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  effectiveFrom: string;
  source: string;
}

export interface ModelPricingQueryResult {
  items: ModelPricingItem[];
  fx: {
    rate: number;
    stale: boolean;
    fetchedAt: string;
    source: string;
  };
  currency: ModelUsageCurrency;
}
