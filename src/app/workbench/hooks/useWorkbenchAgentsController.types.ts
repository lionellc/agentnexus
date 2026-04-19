import type {
  AgentRuleDistributionRunInput,
  LocalAgentTranslationTestResult,
} from "../../../shared/types";
import type {
  AgentRuleAsset,
  AgentRuleConnection,
  AgentRuleTag,
  AgentRuleVersion,
} from "../../../shared/stores/agentRulesStore/types";
import type { ToastOptions } from "../../../shared/ui";

export type TranslationTargetLanguageOption = {
  value: string;
  label: string;
};

export type UseWorkbenchAgentsControllerInput = {
  l: (zh: string, en: string) => string;
  isZh: boolean;
  toast: (options: ToastOptions) => string;
  activeWorkspaceId: string | null;
  projectBootingMessage: string;
  agentAssets: AgentRuleAsset[];
  agentTagsByAsset: Record<string, AgentRuleTag[]>;
  agentVersionsByAsset: Record<string, AgentRuleVersion[]>;
  agentConnections: AgentRuleConnection[];
  agentRulesError: string | null;
  selectedAssetId: string | null;
  setSelectedAssetId: (assetId: string | null) => void;
  clearAgentRulesError: () => void;
  loadAgentModuleData: (workspaceId: string) => Promise<void>;
  loadAgentVersions: (assetId: string) => Promise<void>;
  createAgentAsset: (workspaceId: string, name: string, content: string) => Promise<AgentRuleAsset>;
  renameAgentAsset: (workspaceId: string, assetId: string, name: string) => Promise<AgentRuleAsset>;
  deleteAgentAsset: (workspaceId: string, assetId: string) => Promise<void>;
  publishAgentVersion: (assetId: string, content: string) => Promise<AgentRuleVersion>;
  rollbackAgentRuleVersion: (assetId: string, version: string) => Promise<AgentRuleVersion>;
  refreshAgentAsset: (workspaceId: string, assetId: string) => Promise<unknown>;
  runAgentDistribution: (input: AgentRuleDistributionRunInput) => Promise<{ records?: unknown[] }>;
  translationTargetLanguage: string;
  translationTargetLanguageOptions: TranslationTargetLanguageOption[];
  modelTestRunning: boolean;
  setTranslationTargetLanguage: (value: string) => void;
  handleRunModelTranslationTest: (input: {
    sourceText: string;
    targetLanguage: string;
    syncModelTestForm: boolean;
  }) => Promise<LocalAgentTranslationTestResult | null>;
  toLocalTime: (value: string | null | undefined) => string;
  defaultAgentRuleFile: (platform: string) => string;
  joinRuleFilePath: (rootDir: string, ruleFile: string) => string;
};
