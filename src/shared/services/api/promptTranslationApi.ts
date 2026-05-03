import type {
  LocalAgentProfileDeleteInput,
  LocalAgentProfileDto,
  LocalAgentProfileUpsertInput,
  LocalAgentTranslationTestInput,
  LocalAgentTranslationTestResult,
  PromptCreateInput,
  PromptRestoreInput,
  PromptSearchInput,
  PromptTranslationDto,
  PromptTranslationListInput,
  PromptTranslationRetranslateInput,
  PromptTranslationRunInput,
  PromptUpdateInput,
  TranslationConfigDto,
  TranslationConfigUpdateInput,
} from "../../types";
import { invokeCommand } from "../tauriClient";
import type { PromptVersion } from "./types";

function withoutWorkspaceId<T extends Record<string, unknown>>(input: T): Omit<T, "workspaceId"> {
  const { workspaceId: _workspaceId, ...rest } = input;
  return rest;
}

export const promptApi = {
  list: (_workspaceId?: string) => invokeCommand("prompt_list"),
  search: (input: PromptSearchInput) => invokeCommand("prompt_search", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  create: (input: PromptCreateInput) => invokeCommand("prompt_create", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  update: (input: PromptUpdateInput) => invokeCommand("prompt_update", { input }),
  remove: (promptId: string) => invokeCommand("prompt_delete", { input: { promptId } }),
  restoreVersion: (input: PromptRestoreInput) => invokeCommand("prompt_restore_version", { input }),
  render: (promptId: string, variables: Record<string, string>) =>
    invokeCommand("prompt_render", { input: { promptId, variables } }),
  versions: (promptId: string): Promise<PromptVersion[]> => invokeCommand("prompt_versions", { promptId }),
};

export const translationApi = {
  listProfiles: (_workspaceId?: string): Promise<LocalAgentProfileDto[]> =>
    invokeCommand("local_agent_profile_list"),
  upsertProfile: (input: LocalAgentProfileUpsertInput): Promise<LocalAgentProfileDto> =>
    invokeCommand("local_agent_profile_upsert", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  deleteProfile: (input: LocalAgentProfileDeleteInput): Promise<LocalAgentProfileDto[]> =>
    invokeCommand("local_agent_profile_delete", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  getConfig: (_workspaceId?: string): Promise<TranslationConfigDto> =>
    invokeCommand("translation_config_get"),
  updateConfig: (input: TranslationConfigUpdateInput): Promise<TranslationConfigDto> =>
    invokeCommand("translation_config_update", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  testTranslation: (input: LocalAgentTranslationTestInput): Promise<LocalAgentTranslationTestResult> =>
    invokeCommand("local_agent_translation_test", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  listPromptTranslations: (input: PromptTranslationListInput): Promise<PromptTranslationDto[]> =>
    invokeCommand("prompt_translation_list", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  runPromptTranslation: (input: PromptTranslationRunInput): Promise<PromptTranslationDto> =>
    invokeCommand("prompt_translation_run", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
  retranslate: (input: PromptTranslationRetranslateInput): Promise<PromptTranslationDto> =>
    invokeCommand("prompt_translation_retranslate", { input: withoutWorkspaceId(input as unknown as Record<string, unknown>) }),
};
