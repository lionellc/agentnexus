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

export const translationApi = {
  listProfiles: (workspaceId: string): Promise<LocalAgentProfileDto[]> =>
    invokeCommand("local_agent_profile_list", { workspaceId }),
  upsertProfile: (input: LocalAgentProfileUpsertInput): Promise<LocalAgentProfileDto> =>
    invokeCommand("local_agent_profile_upsert", { input }),
  deleteProfile: (input: LocalAgentProfileDeleteInput): Promise<LocalAgentProfileDto[]> =>
    invokeCommand("local_agent_profile_delete", { input }),
  getConfig: (workspaceId: string): Promise<TranslationConfigDto> =>
    invokeCommand("translation_config_get", { workspaceId }),
  updateConfig: (input: TranslationConfigUpdateInput): Promise<TranslationConfigDto> =>
    invokeCommand("translation_config_update", { input }),
  testTranslation: (input: LocalAgentTranslationTestInput): Promise<LocalAgentTranslationTestResult> =>
    invokeCommand("local_agent_translation_test", { input }),
  listPromptTranslations: (input: PromptTranslationListInput): Promise<PromptTranslationDto[]> =>
    invokeCommand("prompt_translation_list", { input }),
  runPromptTranslation: (input: PromptTranslationRunInput): Promise<PromptTranslationDto> =>
    invokeCommand("prompt_translation_run", { input }),
  retranslate: (input: PromptTranslationRetranslateInput): Promise<PromptTranslationDto> =>
    invokeCommand("prompt_translation_retranslate", { input }),
};
