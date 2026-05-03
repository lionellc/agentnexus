import type {
  ChannelApiTestRunInput,
  ChannelApiTestRunItem,
  ChannelApiTestRunsQueryInput,
  ChannelApiTestRunsResult,
  ChannelApiTestCase,
  ChannelApiTestCaseDeleteInput,
  ChannelApiTestCasesQueryInput,
  ChannelApiTestCaseUpsertInput,
  ModelPricingOverrideUpsertInput,
  ModelPricingQueryInput,
  ModelPricingQueryResult,
  ModelPricingSyncInput,
  ModelPricingSyncResult,
  ModelUsageDashboardQueryInput,
  ModelUsageDashboardResult,
  ModelUsageRequestLogsQueryInput,
  ModelUsageRequestLogsResult,
  ModelUsageSyncJobSnapshot,
  ModelUsageSyncProgressInput,
  ModelUsageSyncStartInput,
  RuntimeFlagsInput,
  SkillsBatchInput,
  SkillsFileReadInput,
  SkillsFileReadResult,
  SkillsFileTreeInput,
  SkillsFileTreeResult,
  SkillsManagerBatchInput,
  SkillsManagerBatchResult,
  SkillsManagerCleanResult,
  SkillsManagerDeleteInput,
  SkillsManagerDeleteResult,
  SkillsManagerDiffJobInput,
  SkillsManagerDiffProgress,
  SkillsManagerDiffStartInput,
  SkillsManagerLinkPreviewInput,
  SkillsManagerLinkPreviewResult,
  SkillsManagerPurgeInput,
  SkillsManagerPurgeResult,
  SkillsManagerRestoreInput,
  SkillsManagerRestoreResult,
  SkillsManagerRulesUpdateInput,
  SkillsManagerRulesUpdateResult,
  SkillsManagerState,
  SkillsManagerSyncResult,
  SkillsManagerUpdateThenLinkInput,
  SkillsManagerUpdateThenLinkResult,
  SkillsOpenInput,
  SkillsOpenResult,
  SkillsUsageCallsQueryInput,
  SkillsUsageCallsResult,
  SkillsUsageStatsQueryInput,
  SkillsUsageStatsResult,
  SkillsUsageSyncJobSnapshot,
  SkillsUsageSyncProgressInput,
  SkillsUsageSyncStartInput,
  SkillsScanInput,
  TargetDeleteInput,
  TargetUpsertInput,
} from "../../types";
import { invokeCommand, invokeRaw } from "../tauriClient";

function withoutWorkspaceId<T extends Record<string, unknown>>(input: T): Omit<T, "workspaceId"> {
  const { workspaceId: _workspaceId, ...rest } = input;
  return rest;
}

export const runtimeApi = {
  getFlags: () => invokeCommand("runtime_flags_get"),
  updateFlags: (input: RuntimeFlagsInput) => invokeCommand("runtime_flags_update", { input }),
};

export const targetApi = {
  list: (_workspaceId?: string) => invokeCommand("target_list"),
  upsert: (input: TargetUpsertInput) => invokeCommand("target_upsert", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  delete: (input: TargetDeleteInput) => invokeCommand("target_delete", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
};

export const skillsApi = {
  list: () => invokeCommand("skills_list"),
  scan: (input: SkillsScanInput) => invokeCommand("skills_scan", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  detail: (skillId: string) => invokeCommand("skills_asset_detail", { skillId }),
  filesTree: (input: SkillsFileTreeInput): Promise<SkillsFileTreeResult> =>
    invokeCommand("skills_files_tree", { input }),
  fileRead: (input: SkillsFileReadInput): Promise<SkillsFileReadResult> =>
    invokeCommand("skills_file_read", {
      input: {
        skillId: input.skillId,
        relativePath: input.relativePath,
      },
    }),
  open: (input: SkillsOpenInput): Promise<SkillsOpenResult> =>
    invokeCommand("skills_open", {
      input: {
        skillId: input.skillId,
        relativePath: input.relativePath,
        mode: input.mode,
      },
    }),
  distribute: (input: SkillsBatchInput) => invokeCommand("skills_distribute", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  uninstall: (input: SkillsBatchInput) => invokeCommand("skills_uninstall", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
};

export const skillsManagerApi = {
  state: (_workspaceId?: string): Promise<SkillsManagerState> =>
    invokeCommand("skills_manager_state", { input: {} }),
  sync: (input: { workspaceId?: string; operator?: string }): Promise<SkillsManagerSyncResult> =>
    invokeCommand("skills_manager_sync", { input: withoutWorkspaceId(input) }),
  clean: (input: { workspaceId?: string; operator?: string }): Promise<SkillsManagerCleanResult> =>
    invokeCommand("skills_manager_clean", { input: withoutWorkspaceId(input) }),
  batchLink: (input: SkillsManagerBatchInput): Promise<SkillsManagerBatchResult> =>
    invokeCommand("skills_manager_batch_link", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  batchUnlink: (input: SkillsManagerBatchInput): Promise<SkillsManagerBatchResult> =>
    invokeCommand("skills_manager_batch_unlink", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  softDelete: (input: SkillsManagerDeleteInput): Promise<SkillsManagerDeleteResult> =>
    invokeCommand("skills_manager_delete", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  purge: (input: SkillsManagerPurgeInput): Promise<SkillsManagerPurgeResult> =>
    invokeCommand("skills_manager_purge", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  restore: (input: SkillsManagerRestoreInput): Promise<SkillsManagerRestoreResult> =>
    invokeCommand("skills_manager_restore", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  updateRules: (input: SkillsManagerRulesUpdateInput): Promise<SkillsManagerRulesUpdateResult> =>
    invokeCommand("skills_manager_rules_update", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  diffStart: (input: SkillsManagerDiffStartInput): Promise<SkillsManagerDiffProgress> =>
    invokeCommand("skills_manager_diff_start", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  diffProgress: (input: SkillsManagerDiffJobInput): Promise<SkillsManagerDiffProgress> =>
    invokeCommand("skills_manager_diff_progress", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  diffCancel: (input: SkillsManagerDiffJobInput): Promise<SkillsManagerDiffProgress> =>
    invokeCommand("skills_manager_diff_cancel", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  linkPreview: (input: SkillsManagerLinkPreviewInput): Promise<SkillsManagerLinkPreviewResult> =>
    invokeCommand("skills_manager_link_preview", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  updateThenLink: (input: SkillsManagerUpdateThenLinkInput): Promise<SkillsManagerUpdateThenLinkResult> =>
    invokeCommand("skills_manager_update_then_link", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
};

export const skillsUsageApi = {
  syncStart: (input: SkillsUsageSyncStartInput): Promise<SkillsUsageSyncJobSnapshot> =>
    invokeCommand("skills_usage_sync_start", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  syncProgress: (input: SkillsUsageSyncProgressInput): Promise<SkillsUsageSyncJobSnapshot> =>
    invokeCommand("skills_usage_sync_progress", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  queryStats: (input: SkillsUsageStatsQueryInput): Promise<SkillsUsageStatsResult> =>
    invokeCommand("skills_usage_query_stats", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  queryCalls: (input: SkillsUsageCallsQueryInput): Promise<SkillsUsageCallsResult> =>
    invokeCommand("skills_usage_query_calls", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
};

export const modelUsageApi = {
  syncStart: (input: ModelUsageSyncStartInput): Promise<ModelUsageSyncJobSnapshot> =>
    invokeCommand("model_usage_sync_start", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  syncProgress: (input: ModelUsageSyncProgressInput): Promise<ModelUsageSyncJobSnapshot> =>
    invokeCommand("model_usage_sync_progress", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  queryDashboard: (input: ModelUsageDashboardQueryInput): Promise<ModelUsageDashboardResult> =>
    invokeCommand("model_usage_query_dashboard", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  queryRequestLogs: (input: ModelUsageRequestLogsQueryInput): Promise<ModelUsageRequestLogsResult> =>
    invokeCommand("model_usage_query_request_logs", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  syncPricing: (input: ModelPricingSyncInput): Promise<ModelPricingSyncResult> =>
    invokeCommand("model_pricing_sync_trigger", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  queryPricing: (input: ModelPricingQueryInput): Promise<ModelPricingQueryResult> =>
    invokeCommand("model_pricing_query", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  upsertPricingOverride: (input: ModelPricingOverrideUpsertInput) =>
    invokeCommand("model_pricing_override_upsert", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
};

export const channelApiTestApi = {
  run: (input: ChannelApiTestRunInput): Promise<ChannelApiTestRunItem> =>
    invokeCommand("channel_test_run", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  queryRuns: (input: ChannelApiTestRunsQueryInput): Promise<ChannelApiTestRunsResult> =>
    invokeCommand("channel_test_query_runs", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  listCases: (input: ChannelApiTestCasesQueryInput): Promise<ChannelApiTestCase[]> =>
    invokeCommand("channel_test_cases_list", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  upsertCase: (input: ChannelApiTestCaseUpsertInput): Promise<ChannelApiTestCase> =>
    invokeCommand("channel_test_case_upsert", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  deleteCase: (input: ChannelApiTestCaseDeleteInput): Promise<{ workspaceId: string; caseId: string; deleted: boolean }> =>
    invokeCommand("channel_test_case_delete", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
};

export const securityApi = {
  checkExternalSource: (url: string) =>
    invokeRaw<{ ok: boolean; normalizedUrl: string }>("security_check_external_source", {
      input: { url },
    }),
};
