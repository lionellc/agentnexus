import type {
  AgentConnection,
  AgentRuleAccessCheck,
  AgentRuleAccessCheckInput,
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

function withoutWorkspaceId<T extends Record<string, unknown>>(
  input: T,
): Omit<T, "workspaceId"> {
  const { workspaceId: _workspaceId, ...rest } = input;
  return rest;
}

export const agentRulesApi = {
  listAssets: async (_workspaceId?: string): Promise<AgentRuleAsset[]> => {
    const rows = await invokeRaw<Array<Record<string, unknown>>>(
      "agent_rule_asset_list",
    );
    return (rows ?? []).map((row) => ({
      id: String(row.id ?? ""),
      workspaceId: String(row.workspaceId ?? row.workspace_id ?? ""),
      name: String(row.name ?? ""),
      description: "",
      latestVersion: Number(row.latestVersion ?? row.latest_version ?? 0),
      createdAt: String(row.createdAt ?? row.created_at ?? ""),
      updatedAt: String(row.updatedAt ?? row.updated_at ?? ""),
      latestContentHash: String(
        row.latestContentHash ?? row.latest_content_hash ?? "",
      ),
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
        name: input.name,
        content: input.content,
      },
    }),
  deleteAsset: (input: AgentRuleAssetDeleteInput): Promise<void> =>
    invokeRaw<void>("agent_rule_asset_delete", {
      input: {
        assetId: input.assetId,
      },
    }),
  renameAsset: (input: AgentRuleAssetRenameInput): Promise<AgentRuleAsset> =>
    invokeRaw("agent_rule_asset_rename", {
      input: {
        assetId: input.assetId,
        name: input.name,
      },
    }),
  publishVersion: (
    input: AgentRulePublishVersionInput,
  ): Promise<AgentRuleVersion> =>
    invokeRaw("agent_rule_publish_version", {
      input: {
        assetId: input.assetId,
        content: input.content,
      },
    }),
  versions: (assetId: string): Promise<AgentRuleVersion[]> =>
    invokeRaw("agent_rule_versions", { assetId }),
  listVersions: (assetId: string): Promise<AgentRuleVersion[]> =>
    invokeRaw("agent_rule_versions", { assetId }),
  checkAccess: (
    input: AgentRuleAccessCheckInput,
  ): Promise<AgentRuleAccessCheck> =>
    invokeRaw("agent_rule_access_check", {
      input: {
        agentTypes: input.agentTypes ?? input.platforms,
      },
    }),
  rollbackVersion: (
    input: AgentRuleRollbackVersionInput & { version?: string | number },
  ): Promise<AgentRuleVersion> =>
    invokeRaw("agent_rule_rollback", {
      input: {
        assetId: input.assetId,
        version:
          typeof input.toVersion === "number"
            ? input.toVersion
            : Number(input.version ?? 0),
      },
    }),
  applyRule: (
    input: AgentRuleApplyInput & { agentTypes?: string[] },
  ): Promise<AgentRuleApplyJob> =>
    invokeRaw("agent_rule_apply", {
      input: {
        assetId: input.assetId,
        agentTypes: input.platforms ?? input.agentTypes,
      },
    }),
  runApply: (
    input: AgentRuleApplyInput & { agentTypes?: string[] },
  ): Promise<AgentRuleApplyJob> =>
    invokeRaw("agent_rule_apply", {
      input: {
        assetId: input.assetId,
        agentTypes: input.platforms ?? input.agentTypes,
      },
    }),
  applyStatus: (
    _workspaceId?: string,
    limit?: number,
  ): Promise<AgentRuleApplyJob[]> => invokeRaw("agent_rule_status", { limit }),
  listApplyJobs: (
    _workspaceId?: string,
    limit?: number,
  ): Promise<AgentRuleApplyJob[]> => invokeRaw("agent_rule_status", { limit }),
  retryApply: (input: AgentRuleApplyRetryInput): Promise<AgentRuleApplyJob> =>
    invokeRaw("agent_rule_retry", { input }),
  retryFailed: (input: AgentRuleApplyRetryInput): Promise<AgentRuleApplyJob> =>
    invokeRaw("agent_rule_retry", { input }),
  refreshTags: (
    input: AgentRuleApplyRefreshInput,
  ): Promise<AgentRuleApplyJob> =>
    invokeRaw("agent_rule_refresh", {
      input: {
        assetId: input.assetId,
      },
    }),
  refreshAsset: (
    input: AgentRuleApplyRefreshInput,
  ): Promise<AgentRuleApplyJob> =>
    invokeRaw("agent_rule_refresh", {
      input: {
        assetId: input.assetId,
      },
    }),
  listConnections: (_workspaceId?: string): Promise<AgentConnection[]> =>
    agentConnectionApi.list(),
  readDraft: (_workspaceId?: string): Promise<AgentRuleDraft> =>
    invokeCommand("agent_doc_read"),
  saveDraft: (
    _workspaceId: string | undefined,
    content: string,
  ): Promise<AgentRuleSaveResult> =>
    invokeCommand("agent_doc_save", { input: { content } }),
  hash: (_workspaceId?: string): Promise<AgentRuleHashResult> =>
    invokeCommand("agent_doc_hash"),
  createRelease: (
    input: AgentRuleReleaseCreateInput,
  ): Promise<AgentRuleRelease> =>
    invokeCommand("release_create", {
      input: withoutWorkspaceId(input as unknown as Record<string, unknown>),
    }),
  listReleases: (_workspaceId?: string): Promise<AgentRuleRelease[]> =>
    invokeCommand("release_list"),
  rollbackRelease: (input: AgentRuleRollbackInput): Promise<AgentRuleRelease> =>
    invokeCommand("release_rollback", {
      input: withoutWorkspaceId(input as unknown as Record<string, unknown>),
    }),
  runDistribution: (
    input: AgentRuleDistributionRunInput,
  ): Promise<AgentRuleDistributionJob> =>
    invokeCommand("distribution_run", {
      input: withoutWorkspaceId(input as unknown as Record<string, unknown>),
    }),
  listDistributionJobs: (
    _workspaceId?: string,
    limit?: number,
  ): Promise<AgentRuleDistributionJob[]> =>
    invokeCommand("distribution_status", { limit }),
  retryDistributionFailed: (
    input: AgentRuleDistributionRetryInput,
  ): Promise<AgentRuleDistributionJob> =>
    invokeCommand("distribution_retry_failed", { input }),
  detectDrift: (
    input: AgentRuleDriftDetectInput,
  ): Promise<AgentRuleDistributionJob> =>
    invokeCommand("distribution_detect_drift", {
      input: withoutWorkspaceId(input as unknown as Record<string, unknown>),
    }),
  queryAudit: (
    input: AgentRuleAuditQueryInput,
  ): Promise<AgentRuleAuditEvent[]> =>
    invokeCommand("audit_query", {
      input: withoutWorkspaceId(input as unknown as Record<string, unknown>),
    }),
};
