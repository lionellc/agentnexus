import { invoke } from "@tauri-apps/api/core";

import type {
  AgentConnection,
  AgentConnectionDeleteInput,
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
  AgentRuleAssetRenameInput,
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
  ApiErrorPayload,
  DistributionTarget,
  MetricsByAsset,
  MetricsByAssetInput,
  MetricsIdResult,
  MetricsOverview,
  LocalAgentProfileDeleteInput,
  LocalAgentProfileDto,
  LocalAgentProfileUpsertInput,
  LocalAgentTranslationTestInput,
  LocalAgentTranslationTestResult,
  PromptAsset,
  PromptCreateInput,
  PromptDeleteInput,
  PromptDeleteResult,
  PromptRenderInput,
  PromptRenderResult,
  PromptRestoreInput,
  PromptSearchInput,
  PromptTranslationDto,
  PromptTranslationListInput,
  PromptTranslationRetranslateInput,
  PromptTranslationRunInput,
  PromptUpdateInput,
  RatingInput,
  RuntimeFlags,
  RuntimeFlagsInput,
  SkillAsset,
  SkillsFileReadInput,
  SkillsFileReadResult,
  SkillsFileTreeInput,
  SkillsFileTreeResult,
  SkillsOpenInput,
  SkillsOpenResult,
  SkillsAssetDetail,
  SkillsBatchInput,
  SkillsBatchResult,
  SkillsScanInput,
  TranslationConfigDto,
  TranslationConfigUpdateInput,
  TargetUpsertInput,
  UsageEventInput,
  Workspace,
  WorkspaceActivateInput,
  WorkspaceCreateInput,
  WorkspaceUpdateInput,
} from "../types";

import { isRecord as isUnknownRecord } from "../types";

type CommandMap = {
  workspace_list: { args: undefined; result: Workspace[] };
  workspace_create: { args: { input: WorkspaceCreateInput }; result: Workspace };
  workspace_update: { args: { input: WorkspaceUpdateInput }; result: Workspace };
  workspace_activate: { args: { input: WorkspaceActivateInput }; result: Workspace };
  runtime_flags_get: { args: undefined; result: RuntimeFlags };
  runtime_flags_update: { args: { input: RuntimeFlagsInput }; result: RuntimeFlags };
  target_list: { args: { workspaceId: string }; result: DistributionTarget[] };
  target_upsert: { args: { input: TargetUpsertInput }; result: DistributionTarget };
  agent_connection_list: { args: { workspaceId: string }; result: AgentConnection[] };
  agent_connection_upsert: { args: { input: AgentConnectionUpsertInput }; result: AgentConnection };
  agent_connection_toggle: { args: { input: AgentConnectionToggleInput }; result: AgentConnection };
  agent_connection_delete: { args: { input: AgentConnectionDeleteInput }; result: AgentConnection[] };
  agent_connection_preview: { args: { input: AgentRuleFilePreviewInput }; result: AgentRuleFilePreviewResult };
  agent_rule_asset_list: { args: { workspaceId: string }; result: AgentRuleAsset[] };
  agent_rule_asset_create: { args: { input: AgentRuleAssetCreateInput }; result: AgentRuleAsset };
  agent_rule_asset_delete: { args: { input: AgentRuleAssetDeleteInput }; result: null };
  agent_rule_asset_rename: { args: { input: AgentRuleAssetRenameInput }; result: AgentRuleAsset };
  agent_rule_publish_version: { args: { input: AgentRulePublishVersionInput }; result: AgentRuleVersion };
  agent_rule_versions: { args: { assetId: string }; result: AgentRuleVersion[] };
  agent_rule_rollback: { args: { input: AgentRuleRollbackVersionInput }; result: AgentRuleVersion };
  agent_rule_apply: { args: { input: AgentRuleApplyInput }; result: AgentRuleApplyJob };
  agent_rule_status: { args: { workspaceId: string; limit?: number }; result: AgentRuleApplyJob[] };
  agent_rule_retry: { args: { input: AgentRuleApplyRetryInput }; result: AgentRuleApplyJob };
  agent_rule_refresh: { args: { input: AgentRuleApplyRefreshInput }; result: AgentRuleAgentTag[] };
  agent_doc_read: { args: { workspaceId: string }; result: AgentRuleDraft };
  agent_doc_save: {
    args: { input: { workspaceId: string; content: string } };
    result: AgentRuleSaveResult;
  };
  agent_doc_hash: { args: { workspaceId: string }; result: AgentRuleHashResult };
  release_create: { args: { input: AgentRuleReleaseCreateInput }; result: AgentRuleRelease };
  release_list: { args: { workspaceId: string }; result: AgentRuleRelease[] };
  release_rollback: { args: { input: AgentRuleRollbackInput }; result: AgentRuleRelease };
  distribution_run: { args: { input: AgentRuleDistributionRunInput }; result: AgentRuleDistributionJob };
  distribution_status: { args: { workspaceId: string; limit?: number }; result: AgentRuleDistributionJob[] };
  distribution_retry_failed: { args: { input: AgentRuleDistributionRetryInput }; result: AgentRuleDistributionJob };
  distribution_detect_drift: { args: { input: AgentRuleDriftDetectInput }; result: AgentRuleDistributionJob };
  audit_query: { args: { input: AgentRuleAuditQueryInput }; result: AgentRuleAuditEvent[] };
  skills_list: { args: undefined; result: SkillAsset[] };
  skills_scan: { args: { input: SkillsScanInput }; result: SkillAsset[] };
  skills_asset_detail: { args: { skillId: string }; result: SkillsAssetDetail };
  skills_files_tree: { args: { input: SkillsFileTreeInput }; result: SkillsFileTreeResult };
  skills_file_read: { args: { input: SkillsFileReadInput }; result: SkillsFileReadResult };
  skills_open: { args: { input: SkillsOpenInput }; result: SkillsOpenResult };
  skills_distribute: { args: { input: SkillsBatchInput }; result: SkillsBatchResult };
  skills_uninstall: { args: { input: SkillsBatchInput }; result: SkillsBatchResult };
  prompt_list: { args: { workspaceId: string }; result: PromptAsset[] };
  prompt_versions: {
    args: { promptId: string };
    result: Array<{
      version: number;
      content: string;
      metadata: Record<string, unknown>;
      createdAt: string;
    }>;
  };
  prompt_create: { args: { input: PromptCreateInput }; result: PromptAsset };
  prompt_update: { args: { input: PromptUpdateInput }; result: PromptAsset };
  prompt_delete: { args: { input: PromptDeleteInput }; result: PromptDeleteResult };
  prompt_search: { args: { input: PromptSearchInput }; result: PromptAsset[] };
  prompt_render: { args: { input: PromptRenderInput }; result: PromptRenderResult };
  prompt_restore_version: { args: { input: PromptRestoreInput }; result: PromptAsset };
  local_agent_profile_list: { args: { workspaceId: string }; result: LocalAgentProfileDto[] };
  local_agent_profile_upsert: { args: { input: LocalAgentProfileUpsertInput }; result: LocalAgentProfileDto };
  local_agent_profile_delete: { args: { input: LocalAgentProfileDeleteInput }; result: LocalAgentProfileDto[] };
  translation_config_get: { args: { workspaceId: string }; result: TranslationConfigDto };
  translation_config_update: { args: { input: TranslationConfigUpdateInput }; result: TranslationConfigDto };
  local_agent_translation_test: { args: { input: LocalAgentTranslationTestInput }; result: LocalAgentTranslationTestResult };
  prompt_translation_list: { args: { input: PromptTranslationListInput }; result: PromptTranslationDto[] };
  prompt_translation_run: { args: { input: PromptTranslationRunInput }; result: PromptTranslationDto };
  prompt_translation_retranslate: { args: { input: PromptTranslationRetranslateInput }; result: PromptTranslationDto };
  metrics_ingest_usage_event: { args: { input: UsageEventInput }; result: MetricsIdResult };
  metrics_query_overview: { args: { workspaceId: string; days?: number }; result: MetricsOverview };
  metrics_query_by_asset: { args: { input: MetricsByAssetInput }; result: MetricsByAsset };
  metrics_submit_rating: { args: { input: RatingInput }; result: MetricsIdResult };
};

export type TauriCommandName = keyof CommandMap;
export type CommandArgs<K extends TauriCommandName> = CommandMap[K]["args"];
export type CommandResult<K extends TauriCommandName> = CommandMap[K]["result"];

export class TauriClientError extends Error implements ApiErrorPayload {
  code: string;
  raw?: unknown;

  constructor(payload: ApiErrorPayload, raw?: unknown) {
    super(payload.message);
    this.name = "TauriClientError";
    this.code = payload.code;
    this.raw = raw;
  }
}

function asApiErrorPayload(value: unknown): ApiErrorPayload | null {
  if (!isUnknownRecord(value)) {
    return null;
  }

  const code = value.code;
  const message = value.message;
  if (typeof code === "string" && typeof message === "string") {
    return { code, message };
  }

  return null;
}

function extractApiError(error: unknown): ApiErrorPayload {
  if (typeof error === "string") {
    return { code: "TAURI_INVOKE_ERROR", message: error };
  }

  if (error instanceof Error) {
    const nestedFromCause = asApiErrorPayload((error as Error & { cause?: unknown }).cause);
    if (nestedFromCause) {
      return nestedFromCause;
    }

    const nestedFromMessage = asApiErrorPayload(error.message);
    if (nestedFromMessage) {
      return nestedFromMessage;
    }

    const direct = asApiErrorPayload(error);
    if (direct) {
      return direct;
    }

    return {
      code: "TAURI_INVOKE_ERROR",
      message: error.message || "Tauri invoke failed",
    };
  }

  const payload = asApiErrorPayload(error);
  if (payload) {
    return payload;
  }

  if (isUnknownRecord(error)) {
    const nestedError = asApiErrorPayload(error.error);
    if (nestedError) {
      return nestedError;
    }
  }

  return {
    code: "TAURI_INVOKE_ERROR",
    message: "Tauri invoke failed",
  };
}

export function toTauriClientError(error: unknown): TauriClientError {
  const payload = extractApiError(error);
  return new TauriClientError(payload, error);
}

export async function invokeRaw<TResult = unknown>(
  command: string,
  args?: Record<string, unknown>,
): Promise<TResult> {
  try {
    return await invoke<TResult>(command, args);
  } catch (error) {
    throw toTauriClientError(error);
  }
}

export async function invokeCommand<K extends TauriCommandName>(
  command: K,
  args: CommandArgs<K>,
): Promise<CommandResult<K>>;

export async function invokeCommand<K extends TauriCommandName>(
  command: K,
): Promise<CommandResult<K>>;

export async function invokeCommand<K extends TauriCommandName>(
  command: K,
  args?: CommandArgs<K>,
): Promise<CommandResult<K>> {
  const payload = args as Record<string, unknown> | undefined;
  return invokeRaw<CommandResult<K>>(command, payload);
}
