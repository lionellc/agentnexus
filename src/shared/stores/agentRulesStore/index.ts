import { create } from "zustand";

import { createAgentRuleAssetActions } from "./assetActions";
import { createAgentRuleDistributionActions } from "./distributionActions";
import { EMPTY_DRAFT } from "./normalizers";
import type { AgentRulesState } from "./types";

export const useAgentRulesStore = create<AgentRulesState>((set, get) => ({
  assets: [],
  tagsByAsset: {},
  versionsByAsset: {},
  applyJobs: [],
  connections: [],
  draft: EMPTY_DRAFT,
  releases: [],
  distributionJobs: [],
  audits: [],
  lastActionError: null,
  loadingAssets: false,
  loadingVersions: false,
  loadingJobs: false,
  loadingConnections: false,
  loadingDraft: false,
  loadingReleases: false,
  loadingDistribution: false,
  loadingAudits: false,
  savingDraft: false,
  selectedAssetId: null,
  selectedReleaseVersion: null,

  ...createAgentRuleAssetActions(set, get),
  ...createAgentRuleDistributionActions(set, get),

  loadModuleData: async (workspaceId) => {
    set({ lastActionError: null });
    await Promise.all([
      get().loadAssets(workspaceId),
      get().loadConnections(workspaceId),
      get().loadDistributionJobs(workspaceId),
      get().loadAudits(workspaceId, 50),
    ]);
  },
  clearError: () => set({ lastActionError: null }),
}));
