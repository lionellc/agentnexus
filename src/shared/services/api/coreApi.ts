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
  WorkspaceCreateInput,
  WorkspaceUpdateInput,
} from "../../types";
import { invokeCommand, invokeRaw } from "../tauriClient";

export const workspaceApi = {
  list: () => invokeCommand("workspace_list"),
  create: (input: WorkspaceCreateInput) => invokeCommand("workspace_create", { input }),
  update: (input: WorkspaceUpdateInput) => invokeCommand("workspace_update", { input }),
  activate: (id: string) => invokeCommand("workspace_activate", { input: { id } }),
};

export const runtimeApi = {
  getFlags: () => invokeCommand("runtime_flags_get"),
  updateFlags: (input: RuntimeFlagsInput) => invokeCommand("runtime_flags_update", { input }),
};

export const targetApi = {
  list: (workspaceId: string) => invokeCommand("target_list", { workspaceId }),
  upsert: (input: TargetUpsertInput) => invokeCommand("target_upsert", { input }),
  delete: (input: TargetDeleteInput) => invokeCommand("target_delete", { input }),
};

export const skillsApi = {
  list: () => invokeCommand("skills_list"),
  scan: (input: SkillsScanInput) => invokeCommand("skills_scan", { input }),
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
  distribute: (input: SkillsBatchInput) => invokeCommand("skills_distribute", { input }),
  uninstall: (input: SkillsBatchInput) => invokeCommand("skills_uninstall", { input }),
};

export const skillsManagerApi = {
  state: (workspaceId: string): Promise<SkillsManagerState> =>
    invokeCommand("skills_manager_state", { input: { workspaceId } }),
  sync: (input: { workspaceId: string; operator?: string }): Promise<SkillsManagerSyncResult> =>
    invokeCommand("skills_manager_sync", { input }),
  clean: (input: { workspaceId: string; operator?: string }): Promise<SkillsManagerCleanResult> =>
    invokeCommand("skills_manager_clean", { input }),
  batchLink: (input: SkillsManagerBatchInput): Promise<SkillsManagerBatchResult> =>
    invokeCommand("skills_manager_batch_link", { input }),
  batchUnlink: (input: SkillsManagerBatchInput): Promise<SkillsManagerBatchResult> =>
    invokeCommand("skills_manager_batch_unlink", { input }),
  softDelete: (input: SkillsManagerDeleteInput): Promise<SkillsManagerDeleteResult> =>
    invokeCommand("skills_manager_delete", { input }),
  purge: (input: SkillsManagerPurgeInput): Promise<SkillsManagerPurgeResult> =>
    invokeCommand("skills_manager_purge", { input }),
  restore: (input: SkillsManagerRestoreInput): Promise<SkillsManagerRestoreResult> =>
    invokeCommand("skills_manager_restore", { input }),
  updateRules: (input: SkillsManagerRulesUpdateInput): Promise<SkillsManagerRulesUpdateResult> =>
    invokeCommand("skills_manager_rules_update", { input }),
  diffStart: (input: SkillsManagerDiffStartInput): Promise<SkillsManagerDiffProgress> =>
    invokeCommand("skills_manager_diff_start", { input }),
  diffProgress: (input: SkillsManagerDiffJobInput): Promise<SkillsManagerDiffProgress> =>
    invokeCommand("skills_manager_diff_progress", { input }),
  diffCancel: (input: SkillsManagerDiffJobInput): Promise<SkillsManagerDiffProgress> =>
    invokeCommand("skills_manager_diff_cancel", { input }),
  linkPreview: (input: SkillsManagerLinkPreviewInput): Promise<SkillsManagerLinkPreviewResult> =>
    invokeCommand("skills_manager_link_preview", { input }),
  updateThenLink: (input: SkillsManagerUpdateThenLinkInput): Promise<SkillsManagerUpdateThenLinkResult> =>
    invokeCommand("skills_manager_update_then_link", { input }),
};

export const skillsUsageApi = {
  syncStart: (input: SkillsUsageSyncStartInput): Promise<SkillsUsageSyncJobSnapshot> =>
    invokeCommand("skills_usage_sync_start", { input }),
  syncProgress: (input: SkillsUsageSyncProgressInput): Promise<SkillsUsageSyncJobSnapshot> =>
    invokeCommand("skills_usage_sync_progress", { input }),
  queryStats: (input: SkillsUsageStatsQueryInput): Promise<SkillsUsageStatsResult> =>
    invokeCommand("skills_usage_query_stats", { input }),
  queryCalls: (input: SkillsUsageCallsQueryInput): Promise<SkillsUsageCallsResult> =>
    invokeCommand("skills_usage_query_calls", { input }),
};

export const modelUsageApi = {
  syncStart: (input: ModelUsageSyncStartInput): Promise<ModelUsageSyncJobSnapshot> =>
    invokeCommand("model_usage_sync_start", { input }),
  syncProgress: (input: ModelUsageSyncProgressInput): Promise<ModelUsageSyncJobSnapshot> =>
    invokeCommand("model_usage_sync_progress", { input }),
  queryDashboard: (input: ModelUsageDashboardQueryInput): Promise<ModelUsageDashboardResult> =>
    invokeCommand("model_usage_query_dashboard", { input }),
  queryRequestLogs: (input: ModelUsageRequestLogsQueryInput): Promise<ModelUsageRequestLogsResult> =>
    invokeCommand("model_usage_query_request_logs", { input }),
  syncPricing: (input: ModelPricingSyncInput): Promise<ModelPricingSyncResult> =>
    invokeCommand("model_pricing_sync_trigger", { input }),
  queryPricing: (input: ModelPricingQueryInput): Promise<ModelPricingQueryResult> =>
    invokeCommand("model_pricing_query", { input }),
  upsertPricingOverride: (input: ModelPricingOverrideUpsertInput) =>
    invokeCommand("model_pricing_override_upsert", { input }),
};

export const channelApiTestApi = {
  run: (input: ChannelApiTestRunInput): Promise<ChannelApiTestRunItem> =>
    invokeCommand("channel_test_run", { input }),
  queryRuns: (input: ChannelApiTestRunsQueryInput): Promise<ChannelApiTestRunsResult> =>
    invokeCommand("channel_test_query_runs", { input }),
  listCases: (input: ChannelApiTestCasesQueryInput): Promise<ChannelApiTestCase[]> =>
    invokeCommand("channel_test_cases_list", { input }),
  upsertCase: (input: ChannelApiTestCaseUpsertInput): Promise<ChannelApiTestCase> =>
    invokeCommand("channel_test_case_upsert", { input }),
  deleteCase: (input: ChannelApiTestCaseDeleteInput): Promise<{ workspaceId: string; caseId: string; deleted: boolean }> =>
    invokeCommand("channel_test_case_delete", { input }),
};

export const securityApi = {
  checkExternalSource: (url: string) =>
    invokeRaw<{ ok: boolean; normalizedUrl: string }>("security_check_external_source", {
      input: { url },
    }),
};
