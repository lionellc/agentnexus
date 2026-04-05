import type {
  AgentConnection,
  AgentConnectionToggleInput,
  AgentConnectionUpsertInput,
  AgentRuleAgentTag,
  AgentRuleApplyInput,
  AgentRuleApplyJob,
  AgentRuleApplyRefreshInput,
  AgentRuleApplyRetryInput,
  AgentRuleAuditEvent,
  AgentRuleAuditQueryInput,
  AgentRuleAsset,
  AgentRuleAssetCreateInput,
  AgentRuleAssetDeleteInput,
  AgentRuleDistributionJob,
  AgentRuleDistributionRetryInput,
  AgentRuleDistributionRunInput,
  AgentRuleDriftDetectInput,
  AgentRuleDraft,
  AgentRuleFilePreviewInput,
  AgentRuleFilePreviewResult,
  AgentRuleHashResult,
  AgentRulePublishVersionInput,
  AgentRuleRelease,
  AgentRuleReleaseCreateInput,
  AgentRuleRollbackVersionInput,
  AgentRuleRollbackInput,
  AgentRuleSaveResult,
  AgentRuleVersion,
  DistributionTarget,
  MetricsByAsset,
  MetricsByAssetInput,
  MetricsOverview,
  PromptAsset,
  PromptCreateInput,
  PromptRestoreInput,
  PromptSearchInput,
  PromptUpdateInput,
  RuntimeFlags,
  RuntimeFlagsInput,
  SkillAsset,
  SkillsAssetDetail,
  SkillsBatchInput,
  SkillsBatchResult,
  SkillsScanInput,
  TargetUpsertInput,
  Workspace,
  WorkspaceCreateInput,
} from "../types";
import { invokeCommand, invokeRaw } from "./tauriClient";

export const workspaceApi = {
  list: () => invokeCommand("workspace_list"),
  create: (input: WorkspaceCreateInput) => invokeCommand("workspace_create", { input }),
  activate: (id: string) => invokeCommand("workspace_activate", { input: { id } }),
};

export const runtimeApi = {
  getFlags: () => invokeCommand("runtime_flags_get"),
  updateFlags: (input: RuntimeFlagsInput) => invokeCommand("runtime_flags_update", { input }),
};

export const targetApi = {
  list: (workspaceId: string) => invokeCommand("target_list", { workspaceId }),
  upsert: (input: TargetUpsertInput) => invokeCommand("target_upsert", { input }),
};

export const agentConnectionApi = {
  list: async (workspaceId: string): Promise<AgentConnection[]> => {
    const rows = await invokeRaw<Array<Record<string, unknown>>>("agent_connection_list", { workspaceId });
    return (rows ?? []).map((row) => ({
      id: String(row.id ?? ""),
      workspaceId: String(row.workspaceId ?? row.workspace_id ?? ""),
      platform: String(row.agentType ?? row.agent_type ?? ""),
      rootDir: String(row.rootDir ?? row.root_dir ?? ""),
      enabled: Boolean(row.enabled ?? true),
      resolvedPath:
        row.resolvedPath === null || row.resolvedPath === undefined
          ? null
          : String(row.resolvedPath),
      createdAt: String(row.createdAt ?? row.created_at ?? ""),
      updatedAt: String(row.updatedAt ?? row.updated_at ?? ""),
    }));
  },
  upsert: async (input: AgentConnectionUpsertInput): Promise<AgentConnection> => {
    const row = await invokeRaw<Record<string, unknown>>("agent_connection_upsert", {
      input: {
        workspaceId: input.workspaceId,
        agentType: input.platform,
        rootDir: input.rootDir,
        enabled: input.enabled ?? true,
      },
    });
    return {
      id: String(row.id ?? ""),
      workspaceId: String(row.workspaceId ?? row.workspace_id ?? ""),
      platform: String(row.agentType ?? row.agent_type ?? ""),
      rootDir: String(row.rootDir ?? row.root_dir ?? ""),
      enabled: Boolean(row.enabled ?? true),
      resolvedPath:
        row.resolvedPath === null || row.resolvedPath === undefined
          ? null
          : String(row.resolvedPath),
      createdAt: String(row.createdAt ?? row.created_at ?? ""),
      updatedAt: String(row.updatedAt ?? row.updated_at ?? ""),
    };
  },
  toggle: async (input: AgentConnectionToggleInput): Promise<AgentConnection> => {
    const row = await invokeRaw<Record<string, unknown>>("agent_connection_toggle", {
      input: {
        workspaceId: input.workspaceId,
        agentType: input.platform,
        enabled: input.enabled,
      },
    });
    return {
      id: String(row.id ?? ""),
      workspaceId: String(row.workspaceId ?? row.workspace_id ?? ""),
      platform: String(row.agentType ?? row.agent_type ?? ""),
      rootDir: String(row.rootDir ?? row.root_dir ?? ""),
      enabled: Boolean(row.enabled ?? true),
      resolvedPath:
        row.resolvedPath === null || row.resolvedPath === undefined
          ? null
          : String(row.resolvedPath),
      createdAt: String(row.createdAt ?? row.created_at ?? ""),
      updatedAt: String(row.updatedAt ?? row.updated_at ?? ""),
    };
  },
  preview: async (input: AgentRuleFilePreviewInput): Promise<AgentRuleFilePreviewResult> => {
    const row = await invokeRaw<Record<string, unknown>>("agent_connection_preview", {
      input: {
        workspaceId: input.workspaceId,
        agentType: input.platform,
      },
    });
    const status = String(row.status ?? "");
    const content = typeof row.content === "string" ? row.content : "";
    return {
      workspaceId: input.workspaceId,
      platform: input.platform,
      rootDir: "",
      resolvedPath: String(row.resolvedPath ?? row.resolved_path ?? ""),
      exists: status === "ok",
      content,
      contentHash: "",
    };
  },
};

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
  queryAudit: (input: AgentRuleAuditQueryInput): Promise<AgentRuleAuditEvent[]> => invokeCommand("audit_query", { input }),
};

export const promptApi = {
  list: (workspaceId: string) => invokeCommand("prompt_list", { workspaceId }),
  search: (input: PromptSearchInput) => invokeCommand("prompt_search", { input }),
  create: (input: PromptCreateInput) => invokeCommand("prompt_create", { input }),
  update: (input: PromptUpdateInput) => invokeCommand("prompt_update", { input }),
  remove: (promptId: string) => invokeCommand("prompt_delete", { input: { promptId } }),
  restoreVersion: (input: PromptRestoreInput) => invokeCommand("prompt_restore_version", { input }),
  render: (promptId: string, variables: Record<string, string>) =>
    invokeCommand("prompt_render", { input: { promptId, variables } }),
  versions: (promptId: string): Promise<PromptVersion[]> => invokeCommand("prompt_versions", { promptId }),
};

export const skillsApi = {
  list: () => invokeCommand("skills_list"),
  scan: (input: SkillsScanInput) => invokeCommand("skills_scan", { input }),
  detail: (skillId: string) => invokeCommand("skills_asset_detail", { skillId }),
  distribute: (input: SkillsBatchInput) => invokeCommand("skills_distribute", { input }),
  uninstall: (input: SkillsBatchInput) => invokeCommand("skills_uninstall", { input }),
};

export const observabilityApi = {
  overview: (workspaceId: string, days?: number) => invokeCommand("metrics_query_overview", { workspaceId, days }),
  byAsset: (input: MetricsByAssetInput) => invokeCommand("metrics_query_by_asset", { input }),
};

export const securityApi = {
  checkExternalSource: (url: string) => invokeRaw<{ ok: boolean; normalizedUrl: string }>("security_check_external_source", { input: { url } }),
};

export type WebDavRunMode = "off" | "startup" | "interval";

export interface WebDavConfig {
  enabled: boolean;
  endpoint: string;
  username: string;
  password: string;
  autoMode: WebDavRunMode;
  startupDelaySec: number;
  intervalMin: number;
  lastSyncAt: string | null;
}

const WEBDAV_KEY = "agentnexus.webdav.config";

export function loadWebDavConfig(): WebDavConfig {
  const fallback: WebDavConfig = {
    enabled: false,
    endpoint: "",
    username: "",
    password: "",
    autoMode: "off",
    startupDelaySec: 10,
    intervalMin: 30,
    lastSyncAt: null,
  };

  const raw = window.localStorage.getItem(WEBDAV_KEY);
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<WebDavConfig>;
    return {
      ...fallback,
      ...parsed,
    };
  } catch {
    return fallback;
  }
}

export function saveWebDavConfig(next: WebDavConfig): void {
  window.localStorage.setItem(WEBDAV_KEY, JSON.stringify(next));
}

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
export type AgentNexusMetricsOverview = MetricsOverview;
export type AgentNexusMetricsByAsset = MetricsByAsset;
export type AgentNexusAgentRuleDraft = AgentRuleDraft;
export type AgentNexusAgentRuleRelease = AgentRuleRelease;
export type AgentNexusAgentRuleDistributionJob = AgentRuleDistributionJob;
export type AgentNexusAgentRuleAuditEvent = AgentRuleAuditEvent;
export type AgentNexusAgentConnection = AgentConnection;
export type AgentNexusAgentRuleAsset = AgentRuleAsset;
export type AgentNexusAgentRuleVersion = AgentRuleVersion;
export type AgentNexusAgentRuleApplyJob = AgentRuleApplyJob;
export type AgentNexusAgentRuleTag = AgentRuleAgentTag;
