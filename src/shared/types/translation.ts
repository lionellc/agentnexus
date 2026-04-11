export interface LocalAgentProfileDto {
  id: string;
  workspaceId: string;
  profileKey: string;
  name: string;
  executable: string;
  argsTemplate: string[];
  isBuiltin: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LocalAgentProfileUpsertInput {
  workspaceId: string;
  profileKey?: string;
  name: string;
  executable: string;
  argsTemplate: string[];
  enabled?: boolean;
}

export interface LocalAgentProfileDeleteInput {
  workspaceId: string;
  profileKey: string;
}

export interface TranslationConfigDto {
  workspaceId: string;
  defaultProfileKey: string;
  promptTemplate: string;
  updatedAt: string;
}

export interface TranslationConfigUpdateInput {
  workspaceId: string;
  defaultProfileKey: string;
  promptTemplate: string;
}

export interface LocalAgentTranslationTestInput {
  workspaceId: string;
  profileKey: string;
  sourceText: string;
  targetLanguage: string;
  timeoutSeconds?: number;
  requestId?: string;
}

export interface LocalAgentTranslationTestResult {
  ok: boolean;
  requestId: string;
  profileKey: string;
  targetLanguage: string;
  translatedText: string;
  stdoutPreview: string;
  stderrPreview: string;
}

export interface PromptTranslationDto {
  id: string;
  workspaceId: string;
  promptId: string;
  promptVersion: number;
  targetLanguage: string;
  variantNo: number;
  variantLabel: string;
  translatedText: string;
  sourceTextHash: string;
  profileKey: string;
  applyMode: PromptTranslationApplyMode;
  createdAt: string;
  updatedAt: string;
}

export interface PromptTranslationListInput {
  workspaceId: string;
  promptId: string;
  promptVersion?: number;
  targetLanguage?: string;
  limit?: number;
}

export type PromptTranslationConflictStrategy = "overwrite" | "save_as";
export type PromptTranslationApplyMode = "immersive" | "overwrite";

export interface PromptTranslationRunInput {
  workspaceId: string;
  promptId: string;
  promptVersion?: number;
  sourceText?: string;
  targetLanguage: string;
  profileKey?: string;
  strategy?: PromptTranslationConflictStrategy;
  applyMode?: PromptTranslationApplyMode;
  timeoutSeconds?: number;
  requestId?: string;
}

export interface PromptTranslationRetranslateInput {
  workspaceId: string;
  translationId: string;
  sourceText?: string;
  profileKey?: string;
  strategy?: PromptTranslationConflictStrategy;
  timeoutSeconds?: number;
}
