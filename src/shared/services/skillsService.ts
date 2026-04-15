import type {
  SkillAsset,
  SkillsAssetDetail,
  SkillsBatchInput,
  SkillsBatchResult,
  SkillsFileReadInput,
  SkillsFileReadResult,
  SkillsFileTreeInput,
  SkillsFileTreeResult,
  SkillsManagerBatchInput,
  SkillsManagerBatchResult,
  SkillsManagerCleanResult,
  SkillsManagerDiffJobInput,
  SkillsManagerDiffProgress,
  SkillsManagerDiffStartInput,
  SkillsManagerDeleteInput,
  SkillsManagerDeleteResult,
  SkillsManagerPurgeInput,
  SkillsManagerPurgeResult,
  SkillsOpenInput,
  SkillsOpenResult,
  SkillsManagerRestoreInput,
  SkillsManagerRestoreResult,
  SkillsManagerRulesUpdateInput,
  SkillsManagerRulesUpdateResult,
  SkillsManagerState,
  SkillsManagerSyncResult,
  SkillsScanInput,
} from "../types";
import { skillsApi, skillsManagerApi } from "./api";

export const skillsService = {
  list(): Promise<SkillAsset[]> {
    return skillsApi.list();
  },

  scan(input: SkillsScanInput): Promise<SkillAsset[]> {
    return skillsApi.scan(input);
  },

  assetDetail(skillId: string): Promise<SkillsAssetDetail> {
    return skillsApi.detail(skillId);
  },

  filesTree(input: SkillsFileTreeInput): Promise<SkillsFileTreeResult> {
    return skillsApi.filesTree(input);
  },

  fileRead(input: SkillsFileReadInput): Promise<SkillsFileReadResult> {
    return skillsApi.fileRead(input);
  },

  open(input: SkillsOpenInput): Promise<SkillsOpenResult> {
    return skillsApi.open(input);
  },

  distribute(input: SkillsBatchInput): Promise<SkillsBatchResult> {
    return skillsApi.distribute(input);
  },

  uninstall(input: SkillsBatchInput): Promise<SkillsBatchResult> {
    return skillsApi.uninstall(input);
  },

  managerState(workspaceId: string): Promise<SkillsManagerState> {
    return skillsManagerApi.state(workspaceId);
  },

  managerSync(input: { workspaceId: string; operator?: string }): Promise<SkillsManagerSyncResult> {
    return skillsManagerApi.sync(input);
  },

  managerClean(input: { workspaceId: string; operator?: string }): Promise<SkillsManagerCleanResult> {
    return skillsManagerApi.clean(input);
  },

  managerBatchLink(input: SkillsManagerBatchInput): Promise<SkillsManagerBatchResult> {
    return skillsManagerApi.batchLink(input);
  },

  managerBatchUnlink(input: SkillsManagerBatchInput): Promise<SkillsManagerBatchResult> {
    return skillsManagerApi.batchUnlink(input);
  },

  managerDelete(input: SkillsManagerDeleteInput): Promise<SkillsManagerDeleteResult> {
    return skillsManagerApi.softDelete(input);
  },

  managerPurge(input: SkillsManagerPurgeInput): Promise<SkillsManagerPurgeResult> {
    return skillsManagerApi.purge(input);
  },

  managerRestore(input: SkillsManagerRestoreInput): Promise<SkillsManagerRestoreResult> {
    return skillsManagerApi.restore(input);
  },

  managerUpdateRules(input: SkillsManagerRulesUpdateInput): Promise<SkillsManagerRulesUpdateResult> {
    return skillsManagerApi.updateRules(input);
  },

  managerDiffStart(input: SkillsManagerDiffStartInput): Promise<SkillsManagerDiffProgress> {
    return skillsManagerApi.diffStart(input);
  },

  managerDiffProgress(input: SkillsManagerDiffJobInput): Promise<SkillsManagerDiffProgress> {
    return skillsManagerApi.diffProgress(input);
  },

  managerDiffCancel(input: SkillsManagerDiffJobInput): Promise<SkillsManagerDiffProgress> {
    return skillsManagerApi.diffCancel(input);
  },
};
