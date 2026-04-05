import type {
  SkillAsset,
  SkillsAssetDetail,
  SkillsBatchInput,
  SkillsBatchResult,
  SkillsFileReadInput,
  SkillsFileReadResult,
  SkillsFileTreeInput,
  SkillsFileTreeResult,
  SkillsOpenInput,
  SkillsOpenResult,
  SkillsScanInput,
} from "../types";

import { invokeCommand } from "./tauriClient";

export const skillsService = {
  list(): Promise<SkillAsset[]> {
    return invokeCommand("skills_list");
  },

  scan(input: SkillsScanInput): Promise<SkillAsset[]> {
    return invokeCommand("skills_scan", { input });
  },

  assetDetail(skillId: string): Promise<SkillsAssetDetail> {
    return invokeCommand("skills_asset_detail", { skillId });
  },

  filesTree(input: SkillsFileTreeInput): Promise<SkillsFileTreeResult> {
    return invokeCommand("skills_files_tree", { input });
  },

  fileRead(input: SkillsFileReadInput): Promise<SkillsFileReadResult> {
    return invokeCommand("skills_file_read", {
      input: {
        skillId: input.skillId,
        relativePath: input.relativePath,
      },
    });
  },

  open(input: SkillsOpenInput): Promise<SkillsOpenResult> {
    return invokeCommand("skills_open", {
      input: {
        skillId: input.skillId,
        relativePath: input.relativePath,
        mode: input.mode,
      },
    });
  },

  distribute(input: SkillsBatchInput): Promise<SkillsBatchResult> {
    return invokeCommand("skills_distribute", { input });
  },

  uninstall(input: SkillsBatchInput): Promise<SkillsBatchResult> {
    return invokeCommand("skills_uninstall", { input });
  },
};
