import { create } from "zustand";

import { createManagerActions } from "./actions/managerActions";
import { createOperationsActions } from "./actions/operationsActions";
import { createUsageActions } from "./actions/usageActions";
import { EMPTY_BATCH_SUMMARY, EMPTY_MANAGER_BATCH_SUMMARY } from "./constants";
import {
  applyOperationsFilters,
  skillManagerStatusLabel,
  skillManagerStatusSortWeight,
  toMatrixSummaries,
  toOperationsRows,
} from "./selectors";
import type { SkillsState } from "./types";

export const useSkillsStore = create<SkillsState>((set, get) => ({
  skills: [],
  viewTab: "installed",
  selectedSkillId: null,
  selectedIds: [],
  loading: false,
  detailById: {},
  lastBatchResult: null,
  managerMode: "operations",
  managerExpandedSkillId: null,
  managerMatrixFilter: {
    tool: null,
    status: "all",
  },
  managerState: null,
  managerLoading: false,
  managerCalibrating: false,
  managerOptimisticMap: {},
  managerRowHints: {},
  managerStatusFilter: "all",
  managerSelectedTool: "",
  managerLastActionOutput: "",
  managerLastBatchResult: null,
  usageAgentFilter: "",
  usageSourceFilter: "",
  usageEvidenceSourceFilter: "",
  usageStatsBySkillId: {},
  usageStatsLoading: false,
  usageStatsError: "",
  usageListSyncJob: null,
  usageDetailSyncJob: null,
  usageDetailSkillId: null,
  usageDetailCalls: [],
  usageDetailCallsTotal: 0,
  usageDetailCallsLoading: false,
  usageDetailCallsError: "",
  ...createOperationsActions(set, get),
  ...createManagerActions(set, get),
  ...createUsageActions(set, get),
  getManagerOperationsRows: () =>
    toOperationsRows(get().managerState, get().managerRowHints, get().usageStatsBySkillId),
  getManagerFilteredOperationsRows: () => {
    const rows = toOperationsRows(
      get().managerState,
      get().managerRowHints,
      get().usageStatsBySkillId,
    );
    return applyOperationsFilters(rows, get().managerStatusFilter, get().managerMatrixFilter);
  },
  getManagerMatrixSummaries: () => toMatrixSummaries(get().managerState),
}));

export { skillManagerStatusLabel, skillManagerStatusSortWeight };

export const EMPTY_SUMMARIES = {
  batch: EMPTY_BATCH_SUMMARY,
  managerBatch: EMPTY_MANAGER_BATCH_SUMMARY,
} as const;
