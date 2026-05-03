export type ModelUsageSyncStatus =
  | "running"
  | "completed"
  | "completed_with_errors"
  | "failed"
  | string;

export type ModelUsageStatus = "success" | "failed" | "unknown" | string;

export interface ModelUsageSyncStartInput {
  forceFull?: boolean;
}

export interface ModelUsageSyncProgressInput {
  jobId: string;
}

export interface ModelUsageDashboardQueryInput {
  days?: number;
  startAt?: string;
  endAt?: string;
  agent?: string;
  model?: string;
  status?: ModelUsageStatus;
  timezoneOffsetMinutes?: number;
}

export interface ModelUsageRequestLogsQueryInput {
  days?: number;
  startAt?: string;
  endAt?: string;
  agent?: string;
  model?: string;
  status?: ModelUsageStatus;
  limit?: number;
  cursorTimestamp?: string;
  cursorId?: string;
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
  completeRequestCount: number;
  incompleteCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  avgDurationMs?: number | null;
  durationSampleCount: number;
  avgFirstTokenMs?: number | null;
  firstTokenSampleCount: number;
}

export interface ModelUsageDashboardResult {
  window: {
    startAt: string;
    endAt: string;
    days: number;
    timezoneOffsetMinutes: number;
  };
  summary: ModelUsageDashboardSummary;
  trends: {
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
    modelTokenDistribution: Array<{
      model: string;
      requests: number;
      inputTokens: number;
      outputTokens: number;
      tokens: number;
    }>;
  };
  sourceCoverage: Array<{
    source: string;
    status: string;
    count: number;
    updatedAt?: string | null;
  }>;
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
  totalDurationMs?: number | null;
  firstTokenMs?: number | null;
}

export interface ModelUsageRequestLogsResult {
  items: ModelUsageRequestLogItem[];
  total: number;
  nextCursor?: {
    timestamp: string;
    id: string;
  } | null;
}
