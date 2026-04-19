import { skillsApi } from "../../../services/api";

import { EMPTY_BATCH_SUMMARY } from "../constants";
import type { SkillsState, SkillsStoreGet, SkillsStoreSet } from "../types";

type SkillsOperationsActions = Pick<
  SkillsState,
  | "fetchSkills"
  | "scanSkills"
  | "setViewTab"
  | "selectSkill"
  | "toggleSelect"
  | "setSelection"
  | "clearSelection"
  | "fetchDetail"
  | "distribute"
  | "uninstall"
>;

export function createOperationsActions(
  set: SkillsStoreSet,
  get: SkillsStoreGet,
): SkillsOperationsActions {
  return {
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
    setSelection: (selectedIds) => set({ selectedIds }),
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
            summary: EMPTY_BATCH_SUMMARY,
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
            summary: EMPTY_BATCH_SUMMARY,
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
  };
}
