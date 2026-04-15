export type SkillManagerStatus =
  | "linked"
  | "missing"
  | "blocked"
  | "wrong"
  | "directory"
  | "manual";

export type SkillsManagerMode = "operations" | "config";

export interface SkillsManagerRuleValue {
  only?: string[];
  exclude?: string[];
}

export interface SkillsManagerToolRuleValue {
  blockAll?: boolean;
  allow?: string[];
  allowGroups?: string[];
}

export interface SkillsManagerToolEntry {
  id: string;
  tool: string;
  skillsPath: string;
}

export interface SkillsManagerSkillEntry {
  id: string;
  name: string;
  group: string;
  source: string;
  localPath: string;
  sourceMissing?: boolean;
  statusByTool: Record<string, SkillManagerStatus>;
  conflict: boolean;
}

export interface SkillsManagerDeletedSkillEntry {
  name: string;
  existsOnDisk: boolean;
}

export interface SkillsManagerState {
  skills: SkillsManagerSkillEntry[];
  tools: SkillsManagerToolEntry[];
  rules: Record<string, SkillsManagerRuleValue>;
  groupRules: Record<string, SkillsManagerRuleValue>;
  toolRules: Record<string, SkillsManagerToolRuleValue>;
  manualUnlinks: Record<string, string[]>;
  deletedSkills: SkillsManagerDeletedSkillEntry[];
  nameConflicts: Record<string, boolean>;
}

export interface SkillsManagerToolStatusCell {
  tool: string;
  status: SkillManagerStatus;
}

export interface SkillsManagerMatrixSummary {
  tool: string;
  linked: number;
  missing: number;
  blocked: number;
  wrong: number;
  directory: number;
  manual: number;
  total: number;
  issueCount: number;
}

export interface SkillsManagerOperationsRow {
  id: string;
  name: string;
  group: string;
  source: string;
  localPath: string;
  sourceMissing?: boolean;
  conflict: boolean;
  linkedCount: number;
  totalCount: number;
  issueCount: number;
  statusCells: SkillsManagerToolStatusCell[];
  statusPreview: SkillsManagerToolStatusCell[];
  hiddenStatusCount: number;
  rowHint?: string;
}

export interface SkillsManagerMatrixFilter {
  tool: string | null;
  status: "all" | SkillManagerStatus;
}

export interface SkillsManagerActionInput {
  workspaceId: string;
  operator?: string;
}

export interface SkillsManagerBatchItemInput {
  skillId: string;
  tool: string;
  force?: boolean;
}

export interface SkillsManagerBatchInput extends SkillsManagerActionInput {
  items: SkillsManagerBatchItemInput[];
}

export interface SkillsManagerBatchRow {
  skillId: string;
  tool: string;
  ok: boolean;
  message: string;
}

export interface SkillsManagerBatchResult {
  ok: boolean;
  results: SkillsManagerBatchRow[];
  summary: {
    total: number;
    success: number;
    failed: number;
  };
}

export interface SkillsManagerSyncResult {
  ok: boolean;
  summary: {
    created: number;
    skipped: number;
    blocked: number;
    manual: number;
    warned: number;
  };
  output: string;
}

export interface SkillsManagerCleanResult {
  ok: boolean;
  summary: {
    cleaned: number;
    warned: number;
  };
  output: string;
}

export interface SkillsManagerDeleteInput extends SkillsManagerActionInput {
  skillId: string;
}

export interface SkillsManagerDeleteResult {
  ok: boolean;
  skillId: string;
  skillName: string;
  removedTools: string[];
  deletedCount: number;
}

export interface SkillsManagerPurgeInput extends SkillsManagerActionInput {
  skillId: string;
}

export interface SkillsManagerPurgeResult {
  ok: boolean;
  skillId: string;
  skillName: string;
  removedTools: string[];
  deletedAssets: number;
}

export interface SkillsManagerRestoreInput extends SkillsManagerActionInput {
  skillName: string;
}

export interface SkillsManagerRestoreResult {
  ok: boolean;
  skillName: string;
  deletedCount: number;
}

export interface SkillsManagerRulesUpdateInput extends SkillsManagerActionInput {
  rules?: Record<string, SkillsManagerRuleValue>;
  groupRules?: Record<string, SkillsManagerRuleValue>;
  toolRules?: Record<string, SkillsManagerToolRuleValue>;
}

export interface SkillsManagerRulesUpdateResult {
  ok: boolean;
  rules: Record<string, SkillsManagerRuleValue>;
  groupRules: Record<string, SkillsManagerRuleValue>;
  toolRules: Record<string, SkillsManagerToolRuleValue>;
}

export type SkillsManagerDiffStatus =
  | "running"
  | "cancelling"
  | "cancelled"
  | "completed"
  | "failed";

export interface SkillsManagerDiffStartInput extends SkillsManagerActionInput {
  leftSkillId: string;
  rightSkillId: string;
}

export interface SkillsManagerDiffJobInput extends SkillsManagerActionInput {
  jobId: string;
}

export interface SkillsManagerLinkPreviewInput extends SkillsManagerActionInput {
  skillId: string;
  tool: string;
  maxEntries?: number;
}

export interface SkillsManagerDiffEntry {
  relativePath: string;
  status: "added" | "removed" | "changed" | string;
  leftBytes: number;
  rightBytes: number;
}

export interface SkillsManagerDiffProgress {
  jobId: string;
  workspaceId: string;
  leftSkillId: string;
  rightSkillId: string;
  leftSkillName: string;
  rightSkillName: string;
  status: SkillsManagerDiffStatus;
  totalFiles: number;
  processedFiles: number;
  currentFile: string;
  diffFiles: number;
  sameSkill: boolean | null;
  errorMessage: string;
  startedAt: string;
  updatedAt: string;
  entries: SkillsManagerDiffEntry[];
}

export interface SkillsManagerLinkPreviewResult {
  workspaceId: string;
  skillId: string;
  skillName: string;
  tool: string;
  targetPath: string;
  targetKind: "missing" | "symlink" | "directory" | "file" | "other" | string;
  canLink: boolean;
  requiresConfirm: boolean;
  sameTarget: boolean;
  totalFiles: number;
  diffFiles: number;
  entries: SkillsManagerDiffEntry[];
  entriesTruncated: boolean;
  message: string;
}
