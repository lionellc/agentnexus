export interface AgentRuleDraft {
  content: string;
  contentHash: string;
  updatedAt: string;
}

export interface AgentRuleSaveInput {
  workspaceId: string;
  content: string;
}

export interface AgentRuleSaveResult {
  workspaceId: string;
  contentHash: string;
  updatedAt: string;
}

export interface AgentRuleHashResult {
  contentHash: string;
}

export interface AgentRuleRelease {
  id: string;
  workspaceId: string;
  version: string;
  title: string;
  notes: string;
  contentHash: string;
  active: boolean;
  createdAt: string;
}

export interface AgentRuleReleaseCreateInput {
  workspaceId: string;
  title: string;
  notes?: string;
}

export interface AgentRuleRollbackInput {
  workspaceId: string;
  releaseVersion: string;
}

export interface AgentRuleDistributionRunInput {
  workspaceId: string;
  releaseVersion: string;
  targetIds?: string[];
  mode?: string;
  allowFallback?: boolean;
}

export interface AgentRuleDistributionRetryInput {
  jobId: string;
}

export interface AgentRuleDriftDetectInput {
  workspaceId: string;
  targetIds?: string[];
}

export interface AgentRuleDistributionRecord {
  id: string;
  targetId: string;
  status: string;
  message: string;
  expectedHash: string;
  actualHash: string;
  usedMode: string;
}

export interface AgentRuleDistributionJob {
  id: string;
  workspaceId: string;
  releaseVersion: string;
  mode: string;
  status: string;
  retryOfJobId: string | null;
  records: AgentRuleDistributionRecord[];
  createdAt: string;
}

export interface AgentRuleAuditQueryInput {
  workspaceId?: string;
  limit?: number;
}

export interface AgentRuleAuditEvent {
  id: string;
  workspaceId: string | null;
  eventType: string;
  payload: unknown;
  createdAt: string;
}

export type AgentRuleTagStatus = "clean" | "drifted" | "error" | "unchecked";

export interface AgentRuleAsset {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  latestVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRuleAssetCreateInput {
  workspaceId: string;
  name: string;
  description?: string;
  content: string;
}

export interface AgentRuleAssetDeleteInput {
  workspaceId: string;
  assetId: string;
}

export interface AgentRuleAssetRenameInput {
  workspaceId: string;
  assetId: string;
  name: string;
}

export interface AgentRuleVersion {
  id: string;
  assetId: string;
  workspaceId: string;
  version: number;
  content: string;
  contentHash: string;
  notes: string;
  createdAt: string;
}

export interface AgentRulePublishVersionInput {
  assetId: string;
  workspaceId: string;
  content: string;
  notes?: string;
}

export interface AgentRuleRollbackVersionInput {
  assetId: string;
  workspaceId: string;
  toVersion: number;
}

export interface AgentRuleAgentTag {
  id: string;
  assetId: string;
  workspaceId: string;
  platform: string;
  ruleFilePath: string;
  ruleFileHash: string;
  status: AgentRuleTagStatus;
  message: string;
  updatedAt: string;
}

export interface AgentRuleApplyInput {
  assetId: string;
  workspaceId: string;
  platforms: string[];
}

export interface AgentRuleApplyRetryInput {
  jobId: string;
}

export interface AgentRuleApplyRefreshInput {
  assetId: string;
  workspaceId: string;
  platforms?: string[];
}

export interface AgentRuleAccessCheckInput {
  workspaceId?: string;
  agentTypes?: string[];
  platforms?: string[];
}

export interface AgentRuleAccessTarget {
  agentType: string;
  rootDir: string;
  ruleFile: string;
  resolvedPath: string;
  parentDir: string;
  rootDirExists: boolean;
  parentDirExists: boolean;
  hiddenPath: boolean;
  preparedDir: boolean;
  canCreateFile: boolean;
  fileWritable: boolean;
  status: string;
  message: string;
  advice?: string | null;
}

export interface AgentRuleAccessCheck {
  ok: boolean;
  checkedAt: string;
  summary: string;
  targets: AgentRuleAccessTarget[];
}

export interface AgentRuleApplyRecord {
  id: string;
  jobId: string;
  assetId: string;
  workspaceId: string;
  platform: string;
  status: string;
  message: string;
  targetPath: string;
  expectedHash: string;
  actualHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRuleApplyJob {
  id: string;
  assetId: string;
  workspaceId: string;
  status: string;
  retryOfJobId: string | null;
  records: AgentRuleApplyRecord[];
  createdAt: string;
}

export interface AgentRuleFilePreviewInput {
  workspaceId: string;
  platform: string;
}

export interface AgentRuleFilePreviewResult {
  workspaceId: string;
  platform: string;
  rootDir: string;
  resolvedPath: string;
  exists: boolean;
  content: string;
  contentHash: string;
}
