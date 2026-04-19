import type { StoreApi } from "zustand";

import type {
  AgentRuleAuditEvent,
  AgentRuleDistributionJob,
  AgentRuleDistributionRunInput,
  AgentRuleDraft,
  AgentRuleRelease,
} from "../../types";

export type AgentRuleConnection = {
  id: string;
  workspaceId: string;
  agentType: string;
  rootDir: string;
  ruleFile?: string;
  enabled: boolean;
  resolvedPath?: string | null;
  updatedAt?: string;
};

export type AgentRuleTag = {
  id?: string;
  assetId?: string;
  workspaceId?: string;
  agentType: string;
  status: string;
  filePath?: string;
  expectedHash?: string;
  actualHash?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

export type AgentRuleAsset = {
  id: string;
  workspaceId: string;
  name: string;
  latestVersion?: string;
  latestContentHash?: string;
  latestContent?: string;
  createdAt?: string;
  updatedAt?: string;
  tags?: AgentRuleTag[];
  [key: string]: unknown;
};

export type AgentRuleVersion = {
  id?: string;
  assetId: string;
  version: string;
  content?: string;
  contentHash?: string;
  createdAt?: string;
  [key: string]: unknown;
};

export type AgentRuleApplyJob = {
  id: string;
  workspaceId: string;
  assetId?: string;
  status: string;
  mode?: string;
  retryOfJobId?: string | null;
  createdAt?: string;
  records?: unknown[];
  [key: string]: unknown;
};

export type AgentRulesState = {
  assets: AgentRuleAsset[];
  tagsByAsset: Record<string, AgentRuleTag[]>;
  versionsByAsset: Record<string, AgentRuleVersion[]>;
  applyJobs: AgentRuleApplyJob[];
  connections: AgentRuleConnection[];
  draft: AgentRuleDraft;
  releases: AgentRuleRelease[];
  distributionJobs: AgentRuleDistributionJob[];
  audits: AgentRuleAuditEvent[];
  lastActionError: string | null;
  loadingAssets: boolean;
  loadingVersions: boolean;
  loadingJobs: boolean;
  loadingConnections: boolean;
  loadingDraft: boolean;
  loadingReleases: boolean;
  loadingDistribution: boolean;
  loadingAudits: boolean;
  savingDraft: boolean;
  selectedAssetId: string | null;
  selectedReleaseVersion: string | null;
  loadModuleData: (workspaceId: string) => Promise<void>;
  loadAssets: (workspaceId: string) => Promise<void>;
  createAsset: (workspaceId: string, name: string, content: string) => Promise<AgentRuleAsset>;
  renameAsset: (workspaceId: string, assetId: string, name: string) => Promise<AgentRuleAsset>;
  deleteAsset: (workspaceId: string, assetId: string) => Promise<void>;
  publishVersion: (assetId: string, content: string) => Promise<AgentRuleVersion>;
  loadVersions: (assetId: string) => Promise<void>;
  rollbackVersion: (assetId: string, version: string) => Promise<AgentRuleVersion>;
  runApply: (workspaceId: string, assetId: string, agentTypes?: string[]) => Promise<AgentRuleApplyJob>;
  retryFailed: (jobId: string) => Promise<AgentRuleApplyJob>;
  refreshAsset: (workspaceId: string, assetId: string) => Promise<AgentRuleApplyJob | null>;
  loadConnections: (workspaceId: string) => Promise<void>;
  loadDraft: (workspaceId: string) => Promise<void>;
  saveDraft: (workspaceId: string, content: string) => Promise<void>;
  loadReleases: (workspaceId: string) => Promise<void>;
  createRelease: (input: {
    workspaceId: string;
    title: string;
    notes?: string;
  }) => Promise<AgentRuleRelease>;
  rollbackRelease: (input: {
    workspaceId: string;
    releaseVersion: string;
  }) => Promise<AgentRuleRelease>;
  loadDistributionJobs: (workspaceId: string, limit?: number) => Promise<void>;
  runDistribution: (input: AgentRuleDistributionRunInput) => Promise<AgentRuleDistributionJob>;
  retryFailedTargets: (input: { jobId: string }) => Promise<AgentRuleDistributionJob>;
  detectDrift: (input: {
    workspaceId: string;
    targetIds?: string[];
  }) => Promise<AgentRuleDistributionJob>;
  loadAudits: (workspaceId: string, limit?: number) => Promise<void>;
  setSelectedAssetId: (assetId: string | null) => void;
  setSelectedReleaseVersion: (releaseVersion: string | null) => void;
  clearError: () => void;
};

export type AgentRulesStoreSet = StoreApi<AgentRulesState>["setState"];
export type AgentRulesStoreGet = StoreApi<AgentRulesState>["getState"];
