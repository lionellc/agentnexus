import { create } from "zustand";

import { skillsApi } from "../services/api";
import type { SkillAsset, SkillsBatchResult, SkillsAssetDetail } from "../types";

type SkillsState = {
  skills: SkillAsset[];
  viewTab: "installed" | "discover" | "distribute";
  selectedSkillId: string | null;
  selectedIds: string[];
  loading: boolean;
  detailById: Record<string, SkillsAssetDetail>;
  lastBatchResult: SkillsBatchResult | null;
  fetchSkills: () => Promise<void>;
  scanSkills: (workspaceId: string, directories?: string[]) => Promise<void>;
  setViewTab: (tab: "installed" | "discover" | "distribute") => void;
  selectSkill: (id: string | null) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  fetchDetail: (skillId: string) => Promise<void>;
  distribute: (workspaceId: string, targetIds: string[]) => Promise<void>;
  uninstall: (workspaceId: string, targetIds: string[]) => Promise<void>;
};

export const useSkillsStore = create<SkillsState>((set, get) => ({
  skills: [],
  viewTab: "installed",
  selectedSkillId: null,
  selectedIds: [],
  loading: false,
  detailById: {},
  lastBatchResult: null,
  fetchSkills: async () => {
    set({ loading: true });
    try {
      const skills = await skillsApi.list();
      const selectedSkillId = get().selectedSkillId;
      const stillExists = selectedSkillId && skills.some((item) => item.id === selectedSkillId);
      set({
        skills,
        selectedSkillId: stillExists ? selectedSkillId : skills[0]?.id ?? null,
      });
    } finally {
      set({ loading: false });
    }
  },
  scanSkills: async (workspaceId, directories) => {
    set({ loading: true });
    try {
      const skills = await skillsApi.scan({ workspaceId, directories });
      set({ skills });
    } finally {
      set({ loading: false });
    }
  },
  setViewTab: (viewTab) => set({ viewTab }),
  selectSkill: (selectedSkillId) => set({ selectedSkillId }),
  toggleSelect: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((item) => item !== id)
        : [...state.selectedIds, id],
    })),
  clearSelection: () => set({ selectedIds: [] }),
  fetchDetail: async (skillId) => {
    const detail = await skillsApi.detail(skillId);
    set((state) => ({
      detailById: {
        ...state.detailById,
        [skillId]: detail,
      },
    }));
  },
  distribute: async (workspaceId, targetIds) => {
    const selectedIds = get().selectedIds;
    if (selectedIds.length === 0) {
      set({
        lastBatchResult: {
          results: [],
          summary: { total: 0, success: 0, failed: 0, unknown: 0 },
        },
      });
      return;
    }

    const result = await skillsApi.distribute({
      workspaceId,
      skillIds: selectedIds,
      targetIds,
    });
    set({ lastBatchResult: result });
  },
  uninstall: async (workspaceId, targetIds) => {
    const selectedIds = get().selectedIds;
    if (selectedIds.length === 0) {
      set({
        lastBatchResult: {
          results: [],
          summary: { total: 0, success: 0, failed: 0, unknown: 0 },
        },
      });
      return;
    }

    const result = await skillsApi.uninstall({
      workspaceId,
      skillIds: selectedIds,
      targetIds,
    });
    set({ lastBatchResult: result });
  },
}));
