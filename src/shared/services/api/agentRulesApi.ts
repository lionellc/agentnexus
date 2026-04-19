import type {
  AgentConnection,
  AgentRuleApplyInput,
  AgentRuleApplyJob,
  AgentRuleApplyRefreshInput,
  AgentRuleApplyRetryInput,
  AgentRuleAuditEvent,
  AgentRuleAuditQueryInput,
  AgentRuleAsset,
  AgentRuleAssetCreateInput,
  AgentRuleAssetDeleteInput,
  AgentRuleAssetRenameInput,
  AgentRuleDistributionJob,
  AgentRuleDistributionRetryInput,
  AgentRuleDistributionRunInput,
  AgentRuleDriftDetectInput,
  AgentRuleDraft,
  AgentRuleHashResult,
  AgentRulePublishVersionInput,
  AgentRuleRelease,
  AgentRuleReleaseCreateInput,
  AgentRuleRollbackInput,
  AgentRuleRollbackVersionInput,
  AgentRuleSaveResult,
  AgentRuleVersion,
} from "../../types";
import { invokeCommand, invokeRaw } from "../tauriClient";
import { agentConnectionApi } from "./agentConnectionApi";

export const agentRulesApi = {
  listAssets: async (workspaceId: string): Promise<AgentRuleAsset[]> => {
    const rows = await invokeRaw<Array<Record<string, unknown>>>("agent_rule_asset_list", { workspaceId });
    return (rows ?? []).map((row) => ({
      id: String(row.id ?? ""),
      workspaceId: String(row.workspaceId ?? row.workspace_id ?? ""),
      name: String(row.name ?? ""),
      description: "",
      latestVersion: Number(row.latestVersion ?? row.latest_version ?? 0),
      createdAt: String(row.createdAt ?? row.created_at ?? ""),
      updatedAt: String(row.updatedAt ?? row.updated_at ?? ""),
      latestContentHash: String(row.latestContentHash ?? row.latest_content_hash ?? ""),
      latestContent:
        typeof row.latestContent === "string"
          ? row.latestContent
          : typeof row.latest_content === "string"
            ? row.latest_content
            : undefined,
      tags: Array.isArray(row.tags) ? row.tags : [],
    })) as AgentRuleAsset[];
  },
  createAsset: (input: AgentRuleAssetCreateInput): Promise<AgentRuleAsset> =>
    invokeRaw("agent_rule_asset_create", {
      input: {
        workspaceId: input.workspaceId,
        name: input.name,
        content: input.content,
      },
    }),
  deleteAsset: (input: AgentRuleAssetDeleteInput): Promise<void> =>
    invokeRaw<void>("agent_rule_asset_delete", {
      input: {
        workspaceId: input.workspaceId,
        assetId: input.assetId,
      },
    }),
  renameAsset: (input: AgentRuleAssetRenameInput): Promise<AgentRuleAsset> =>
    invokeRaw("agent_rule_asset_rename", {
      input: {
        workspaceId: input.workspaceId,
        assetId: input.assetId,
        name: input.name,
      },
    }),
  publishVersion: (input: AgentRulePublishVersionInput): Promise<AgentRuleVersion> =>
    invokeRaw("agent_rule_publish_version", {
      input: {
        assetId: input.assetId,
        content: input.content,
      },
    }),
  versions: (assetId: string): Promise<AgentRuleVersion[]> => invokeRaw("agent_rule_versions", { assetId }),
  listVersions: (assetId: string): Promise<AgentRuleVersion[]> => invokeRaw("agent_rule_versions", { assetId }),
  rollbackVersion: (input: AgentRuleRollbackVersionInput & { version?: string | number }): Promise<AgentRuleVersion> =>
    invokeRaw("agent_rule_rollback", {
      input: {
        assetId: input.assetId,
        version:
          typeof input.toVersion === "number"
            ? input.toVersion
            : Number(input.version ?? 0),
      },
    }),
  applyRule: (input: AgentRuleApplyInput & { agentTypes?: string[] }): Promise<AgentRuleApplyJob> =>
    invokeRaw("agent_rule_apply", {
      input: {
        workspaceId: input.workspaceId,
        assetId: input.assetId,
        agentTypes: input.platforms ?? input.agentTypes,
      },
    }),
  runApply: (input: AgentRuleApplyInput & { agentTypes?: string[] }): Promise<AgentRuleApplyJob> =>
    invokeRaw("agent_rule_apply", {
      input: {
        workspaceId: input.workspaceId,
        assetId: input.assetId,
        agentTypes: input.platforms ?? input.agentTypes,
      },
    }),
  applyStatus: (workspaceId: string, limit?: number): Promise<AgentRuleApplyJob[]> =>
    invokeRaw("agent_rule_status", { workspaceId, limit }),
  listApplyJobs: (workspaceId: string, limit?: number): Promise<AgentRuleApplyJob[]> =>
    invokeRaw("agent_rule_status", { workspaceId, limit }),
  retryApply: (input: AgentRuleApplyRetryInput): Promise<AgentRuleApplyJob> =>
    invokeRaw("agent_rule_retry", { input }),
  retryFailed: (input: AgentRuleApplyRetryInput): Promise<AgentRuleApplyJob> =>
    invokeRaw("agent_rule_retry", { input }),
  refreshTags: (input: AgentRuleApplyRefreshInput): Promise<AgentRuleApplyJob> =>
    invokeRaw("agent_rule_refresh", {
      input: {
        workspaceId: input.workspaceId,
        assetId: input.assetId,
      },
    }),
  refreshAsset: (input: AgentRuleApplyRefreshInput): Promise<AgentRuleApplyJob> =>
    invokeRaw("agent_rule_refresh", {
      input: {
        workspaceId: input.workspaceId,
        assetId: input.assetId,
      },
    }),
  listConnections: (workspaceId: string): Promise<AgentConnection[]> => agentConnectionApi.list(workspaceId),
  readDraft: (workspaceId: string): Promise<AgentRuleDraft> => invokeCommand("agent_doc_read", { workspaceId }),
  saveDraft: (workspaceId: string, content: string): Promise<AgentRuleSaveResult> =>
    invokeCommand("agent_doc_save", { input: { workspaceId, content } }),
  hash: (workspaceId: string): Promise<AgentRuleHashResult> => invokeCommand("agent_doc_hash", { workspaceId }),
  createRelease: (input: AgentRuleReleaseCreateInput): Promise<AgentRuleRelease> =>
    invokeCommand("release_create", { input }),
  listReleases: (workspaceId: string): Promise<AgentRuleRelease[]> => invokeCommand("release_list", { workspaceId }),
  rollbackRelease: (input: AgentRuleRollbackInput): Promise<AgentRuleRelease> =>
    invokeCommand("release_rollback", { input }),
  runDistribution: (input: AgentRuleDistributionRunInput): Promise<AgentRuleDistributionJob> =>
    invokeCommand("distribution_run", { input }),
  listDistributionJobs: (workspaceId: string, limit?: number): Promise<AgentRuleDistributionJob[]> =>
    invokeCommand("distribution_status", { workspaceId, limit }),
  retryDistributionFailed: (input: AgentRuleDistributionRetryInput): Promise<AgentRuleDistributionJob> =>
    invokeCommand("distribution_retry_failed", { input }),
  detectDrift: (input: AgentRuleDriftDetectInput): Promise<AgentRuleDistributionJob> =>
    invokeCommand("distribution_detect_drift", { input }),
  queryAudit: (input: AgentRuleAuditQueryInput): Promise<AgentRuleAuditEvent[]> =>
    invokeCommand("audit_query", { input }),
};
