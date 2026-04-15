import type { DistributionTarget } from "./workspace";

export interface SkillAsset {
  id: string;
  identity: string;
  name: string;
  version: string;
  latestVersion: string;
  source: string;
  sourceParent: string;
  isSymlink: boolean;
  localPath: string;
  sourceLocalPath?: string;
  sourceIsSymlink?: boolean;
  updateCandidate: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SkillVersion {
  version: string;
  source: string;
  installedAt: string;
}

export interface SkillsAssetDetail {
  asset: SkillAsset;
  versions: SkillVersion[];
}

export interface SkillsScanInput {
  workspaceId: string;
  directories?: string[];
  latestVersions?: Record<string, string>;
}

export interface SkillsBatchInput {
  workspaceId: string;
  skillIds: string[];
  targetIds: string[];
}

export interface SkillsBatchRow {
  skillId: string;
  skillName: string;
  targetId: string;
  platform: string;
  status: "success" | "failed" | string;
  message: string;
  usedMode?: string;
}

export interface SkillsBatchSummary {
  total: number;
  success: number;
  failed: number;
  unknown: number;
}

export interface SkillsBatchResult {
  results: SkillsBatchRow[];
  summary: SkillsBatchSummary;
}

export interface SkillsStoreHydrateInput {
  list: SkillAsset[];
  detailById: Record<string, SkillsAssetDetail>;
  targets: DistributionTarget[];
}

export type SkillOpenMode =
  | "vscode"
  | "cursor"
  | "zed"
  | "finder"
  | "terminal"
  | "iterm2"
  | "xcode"
  | "goland"
  | "default";

export interface SkillsFileTreeInput {
  skillId: string;
}

export interface SkillsFileTreeNode {
  name: string;
  relativePath: string;
  isDir: boolean;
  isSymlink: boolean;
  children?: SkillsFileTreeNode[];
}

export interface SkillsFileTreeResult {
  rootPath: string;
  entries: SkillsFileTreeNode[];
}

export interface SkillsFileReadInput {
  skillId: string;
  relativePath: string;
}

export interface SkillsFileReadResult {
  relativePath: string;
  absolutePath: string;
  language: string;
  supported: boolean;
  content: string;
  message: string;
}

export interface SkillsOpenInput {
  skillId: string;
  relativePath?: string;
  mode?: SkillOpenMode;
}

export interface SkillsOpenResult {
  ok: boolean;
}
