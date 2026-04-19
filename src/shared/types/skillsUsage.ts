export type SkillsUsageSyncStatus =
  | "running"
  | "completed"
  | "completed_with_errors"
  | "failed"
  | string;

export type SkillsUsageResultStatus = "success" | "failed" | "unknown" | string;

export interface SkillsUsageSyncStartInput {
  workspaceId: string;
}

export interface SkillsUsageSyncProgressInput {
  workspaceId: string;
  jobId: string;
}

export interface SkillsUsageStatsQueryInput {
  workspaceId: string;
  agent?: string;
  source?: string;
}

export interface SkillsUsageCallsQueryInput {
  workspaceId: string;
  skillId: string;
  agent?: string;
  source?: string;
  limit?: number;
  offset?: number;
}

export interface SkillsUsageSyncJobSnapshot {
  jobId: string;
  workspaceId: string;
  status: SkillsUsageSyncStatus;
  totalFiles: number;
  processedFiles: number;
  parsedEvents: number;
  insertedEvents: number;
  duplicateEvents: number;
  parseFailures: number;
  currentSource: string;
  errorMessage: string;
  startedAt: string;
  updatedAt: string;
}

export interface SkillsUsageStatsRow {
  skillId: string;
  totalCalls: number;
  last7dCalls: number;
  lastCalledAt: string | null;
}

export interface SkillsUsageStatsResult {
  rows: SkillsUsageStatsRow[];
}

export interface SkillsUsageCallItem {
  calledAt: string;
  agent: string;
  source: string;
  resultStatus: SkillsUsageResultStatus;
  confidence: number;
  sessionId: string;
  eventRef: string;
  rawRef: string;
}

export interface SkillsUsageCallsResult {
  items: SkillsUsageCallItem[];
  total: number;
}

