import type {
  SkillAsset,
  SkillsAssetDetail,
  SkillsBatchInput,
  SkillsBatchResult,
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

  distribute(input: SkillsBatchInput): Promise<SkillsBatchResult> {
    return invokeCommand("skills_distribute", { input });
  },

  uninstall(input: SkillsBatchInput): Promise<SkillsBatchResult> {
    return invokeCommand("skills_uninstall", { input });
  },
};
