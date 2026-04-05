import { usePromptsStore } from "./promptsStore";
import { useSettingsStore } from "./settingsStore";
import { useShellStore } from "./shellStore";
import { useSkillsStore } from "./skillsStore";
import { useAgentRulesStore } from "./agentRulesStore";

export const useShellActiveModule = () => useShellStore((state) => state.activeModule);
export const useShellQuery = () => useShellStore((state) => state.query);
export const useShellSelectedIds = () => useShellStore((state) => state.selectedIds);
export const useShellMobilePaneState = () => useShellStore((state) => state.mobilePaneState);
export const useShellFeatureFlags = () => useShellStore((state) => state.featureFlags);

export const usePromptItems = () => usePromptsStore((state) => state.prompts);
export const usePromptSelectedId = () => usePromptsStore((state) => state.selectedPromptId);
export const usePromptViewMode = () => usePromptsStore((state) => state.promptViewMode);
export const usePromptBatchSelection = () => usePromptsStore((state) => state.selectedIds);

export const useSkillItems = () => useSkillsStore((state) => state.skills);
export const useSkillSelectedId = () => useSkillsStore((state) => state.selectedSkillId);
export const useSkillDetailById = () => useSkillsStore((state) => state.detailById);
export const useSkillViewTab = () => useSkillsStore((state) => state.viewTab);
export const useSkillBatchSelection = () => useSkillsStore((state) => state.selectedIds);

export const useSettingsWorkspaceForm = () => useSettingsStore((state) => state.workspaceForm);
export const useSettingsTargetForm = () => useSettingsStore((state) => state.targetForm);
export const useSettingsRuntimeFlagsForm = () => useSettingsStore((state) => state.runtimeFlagsForm);
export const useSettingsWebdavForm = () => useSettingsStore((state) => state.webdavForm);
export const useAgentRulesDraft = () => useAgentRulesStore((state) => state.draft);
export const useAgentRulesReleases = () => useAgentRulesStore((state) => state.releases);
export const useAgentRulesDistributionJobs = () => useAgentRulesStore((state) => state.distributionJobs);
export const useAgentRulesAudits = () => useAgentRulesStore((state) => state.audits);
export const useAgentRulesLastError = () => useAgentRulesStore((state) => state.lastActionError);
