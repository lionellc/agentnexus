import { skillsManagerApi } from "../../../services/api";

import { EMPTY_MANAGER_BATCH_SUMMARY } from "../constants";
import {
  buildCalibrationHints,
  mergeOptimisticMap,
  nextManagerStateWithPatch,
} from "../selectors";
import type { SkillsState, SkillsStoreGet, SkillsStoreSet } from "../types";

type SkillsManagerActions = Pick<
  SkillsState,
  | "loadManagerState"
  | "syncManager"
  | "cleanManager"
  | "managerBatchLink"
  | "managerBatchUnlink"
  | "managerSoftDelete"
  | "managerRestore"
  | "updateManagerRules"
  | "setManagerMode"
  | "setManagerExpandedSkillId"
  | "setManagerMatrixFilter"
  | "clearManagerRowHint"
  | "setManagerStatusFilter"
  | "setManagerSelectedTool"
>;

export function createManagerActions(
  set: SkillsStoreSet,
  get: SkillsStoreGet,
): SkillsManagerActions {
  return {
    loadManagerState: async (workspaceId) => {
      set({ managerLoading: true });
      try {
        const managerState = await skillsManagerApi.state(workspaceId);
        const managerSelectedTool = get().managerSelectedTool || managerState.tools[0]?.tool || "";
        set((state) => ({
          managerState,
          managerSelectedTool,
          managerOptimisticMap: {},
          managerRowHints: {
            ...state.managerRowHints,
            ...buildCalibrationHints(managerState, state.managerOptimisticMap),
          },
        }));
      } finally {
        set({ managerLoading: false });
      }
    },
    syncManager: async (workspaceId) => {
      set({ managerLoading: true });
      try {
        const result = await skillsManagerApi.sync({ workspaceId });
        const managerState = await skillsManagerApi.state(workspaceId);
        set({
          managerState,
          managerLastActionOutput: result.output,
          managerOptimisticMap: {},
        });
      } finally {
        set({ managerLoading: false });
      }
    },
    cleanManager: async (workspaceId) => {
      set({ managerLoading: true });
      try {
        const result = await skillsManagerApi.clean({ workspaceId });
        const managerState = await skillsManagerApi.state(workspaceId);
        set({
          managerState,
          managerLastActionOutput: result.output,
          managerOptimisticMap: {},
        });
      } finally {
        set({ managerLoading: false });
      }
    },
    managerBatchLink: async (workspaceId, skillIds, tool, force = false) => {
      if (skillIds.length === 0 || !tool) {
        set({
          managerLastBatchResult: {
            ok: true,
            results: [],
            summary: EMPTY_MANAGER_BATCH_SUMMARY,
          },
        });
        return;
      }

      set((state) => ({
        managerCalibrating: true,
        managerState: nextManagerStateWithPatch(state.managerState, skillIds, tool, "linked"),
        managerOptimisticMap: mergeOptimisticMap(state.managerOptimisticMap, skillIds, tool, "linked"),
        managerRowHints: Object.fromEntries(
          Object.entries(state.managerRowHints).filter(([skillId]) => !skillIds.includes(skillId)),
        ),
      }));

      try {
        const result = await skillsManagerApi.batchLink({
          workspaceId,
          items: skillIds.map((skillId) => ({
            skillId,
            tool,
            ...(force ? { force: true } : {}),
          })),
        });
        const managerState = await skillsManagerApi.state(workspaceId);
        const optimisticMap = get().managerOptimisticMap;
        const calibrationHints = buildCalibrationHints(managerState, optimisticMap);
        set({
          managerState,
          managerLastBatchResult: result,
          managerCalibrating: false,
          managerOptimisticMap: {},
          managerRowHints: calibrationHints,
        });
      } catch (error) {
        const current = await skillsManagerApi.state(workspaceId).catch(() => null);
        set((state) => ({
          managerState: current ?? state.managerState,
          managerCalibrating: false,
          managerOptimisticMap: {},
        }));
        throw error;
      }
    },
    managerBatchUnlink: async (workspaceId, skillIds, tool) => {
      if (skillIds.length === 0 || !tool) {
        set({
          managerLastBatchResult: {
            ok: true,
            results: [],
            summary: EMPTY_MANAGER_BATCH_SUMMARY,
          },
        });
        return;
      }

      set((state) => ({
        managerCalibrating: true,
        managerState: nextManagerStateWithPatch(state.managerState, skillIds, tool, "missing"),
        managerOptimisticMap: mergeOptimisticMap(
          state.managerOptimisticMap,
          skillIds,
          tool,
          "missing",
        ),
        managerRowHints: Object.fromEntries(
          Object.entries(state.managerRowHints).filter(([skillId]) => !skillIds.includes(skillId)),
        ),
      }));

      try {
        const result = await skillsManagerApi.batchUnlink({
          workspaceId,
          items: skillIds.map((skillId) => ({ skillId, tool })),
        });
        const managerState = await skillsManagerApi.state(workspaceId);
        const optimisticMap = get().managerOptimisticMap;
        const calibrationHints = buildCalibrationHints(managerState, optimisticMap);
        set({
          managerState,
          managerLastBatchResult: result,
          managerCalibrating: false,
          managerOptimisticMap: {},
          managerRowHints: calibrationHints,
        });
      } catch (error) {
        const current = await skillsManagerApi.state(workspaceId).catch(() => null);
        set((state) => ({
          managerState: current ?? state.managerState,
          managerCalibrating: false,
          managerOptimisticMap: {},
        }));
        throw error;
      }
    },
    managerSoftDelete: async (workspaceId, skillId) => {
      await skillsManagerApi.softDelete({ workspaceId, skillId });
      const managerState = await skillsManagerApi.state(workspaceId);
      set((state) => ({
        managerState,
        selectedIds: state.selectedIds.filter((item) => item !== skillId),
        managerRowHints: Object.fromEntries(
          Object.entries(state.managerRowHints).filter(([key]) => key !== skillId),
        ),
      }));
    },
    managerRestore: async (workspaceId, skillName) => {
      await skillsManagerApi.restore({ workspaceId, skillName });
      const managerState = await skillsManagerApi.state(workspaceId);
      set({ managerState });
    },
    updateManagerRules: async (workspaceId, patch) => {
      await skillsManagerApi.updateRules({
        workspaceId,
        rules: patch.rules,
        groupRules: patch.groupRules,
        toolRules: patch.toolRules,
      });
      const managerState = await skillsManagerApi.state(workspaceId);
      set({ managerState });
    },
    setManagerMode: (managerMode) => set({ managerMode }),
    setManagerExpandedSkillId: (value) =>
      set((state) => ({
        managerExpandedSkillId: state.managerExpandedSkillId === value ? null : value,
      })),
    setManagerMatrixFilter: (value) =>
      set((state) => ({
        managerMatrixFilter: {
          tool: value.tool === undefined ? state.managerMatrixFilter.tool : value.tool,
          status: value.status ?? state.managerMatrixFilter.status,
        },
      })),
    clearManagerRowHint: (skillId) =>
      set((state) => ({
        managerRowHints: Object.fromEntries(
          Object.entries(state.managerRowHints).filter(([key]) => key !== skillId),
        ),
      })),
    setManagerStatusFilter: (managerStatusFilter) => set({ managerStatusFilter }),
    setManagerSelectedTool: (managerSelectedTool) => set({ managerSelectedTool }),
  };
}
