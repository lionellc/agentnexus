import type {
  AgentConnection,
  AgentRuleAgentTag,
  AgentRuleApplyJob,
  AgentRuleAuditEvent,
  AgentRuleAsset,
  AgentRuleDistributionJob,
  AgentRuleDraft,
  AgentRuleRelease,
  AgentRuleVersion,
  DistributionTarget,
  ModelUsageDashboardResult,
  ModelUsageRequestLogsResult,
  PromptAsset,
  RuntimeFlags,
  SkillAsset,
  SkillsAssetDetail,
  SkillsBatchResult,
  SkillsUsageCallsResult,
  SkillsUsageStatsResult,
  Workspace,
} from "../../types";

export type PromptVersion = {
  version: number;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AgentNexusWorkspace = Workspace;
export type AgentNexusPrompt = PromptAsset;
export type AgentNexusSkill = SkillAsset;
export type AgentNexusSkillDetail = SkillsAssetDetail;
export type AgentNexusRuntimeFlags = RuntimeFlags;
export type AgentNexusTargets = DistributionTarget[];
export type AgentNexusBatchResult = SkillsBatchResult;
export type AgentNexusSkillsUsageStats = SkillsUsageStatsResult;
export type AgentNexusSkillsUsageCalls = SkillsUsageCallsResult;
export type AgentNexusModelUsageDashboard = ModelUsageDashboardResult;
export type AgentNexusModelUsageRequestLogs = ModelUsageRequestLogsResult;
export type AgentNexusAgentRuleDraft = AgentRuleDraft;
export type AgentNexusAgentRuleRelease = AgentRuleRelease;
export type AgentNexusAgentRuleDistributionJob = AgentRuleDistributionJob;
export type AgentNexusAgentRuleAuditEvent = AgentRuleAuditEvent;
export type AgentNexusAgentConnection = AgentConnection;
export type AgentNexusAgentRuleAsset = AgentRuleAsset;
export type AgentNexusAgentRuleVersion = AgentRuleVersion;
export type AgentNexusAgentRuleApplyJob = AgentRuleApplyJob;
export type AgentNexusAgentRuleTag = AgentRuleAgentTag;
