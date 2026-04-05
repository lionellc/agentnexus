import type { DistributionTarget } from "./workspace";

export interface SkillAsset {
  id: string;
  identity: string;
  name: string;
  version: string;
  latestVersion: string;
  source: string;
  localPath: string;
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
