import type { StoreApi } from "zustand";

import type {
  SkillAsset,
  SkillManagerStatus,
  SkillsAssetDetail,
  SkillsBatchResult,
  SkillsManagerBatchResult,
  SkillsManagerMatrixFilter,
  SkillsManagerMatrixSummary,
  SkillsManagerMode,
  SkillsManagerOperationsRow,
  SkillsManagerRuleValue,
  SkillsManagerState,
  SkillsManagerToolRuleValue,
  SkillsUsageCallItem,
  SkillsUsageStatsRow,
  SkillsUsageSyncJobSnapshot,
} from "../../types";

export type OptimisticMap = Record<string, Record<string, SkillManagerStatus>>;

export type SkillsStateValues = {
  skills: SkillAsset[];
  viewTab: "installed" | "discover" | "distribute";
  selectedSkillId: string | null;
  selectedIds: string[];
  loading: boolean;
  detailById: Record<string, SkillsAssetDetail>;
  lastBatchResult: SkillsBatchResult | null;
  managerMode: SkillsManagerMode;
  managerExpandedSkillId: string | null;
  managerMatrixFilter: SkillsManagerMatrixFilter;
  managerState: SkillsManagerState | null;
  managerLoading: boolean;
  managerCalibrating: boolean;
  managerOptimisticMap: OptimisticMap;
  managerRowHints: Record<string, string>;
  managerStatusFilter: "all" | SkillManagerStatus;
  managerSelectedTool: string;
  managerLastActionOutput: string;
  managerLastBatchResult: SkillsManagerBatchResult | null;
  usageAgentFilter: string;
  usageSourceFilter: string;
  usageStatsBySkillId: Record<string, SkillsUsageStatsRow>;
  usageStatsLoading: boolean;
  usageStatsError: string;
  usageListSyncJob: SkillsUsageSyncJobSnapshot | null;
  usageDetailSyncJob: SkillsUsageSyncJobSnapshot | null;
  usageDetailSkillId: string | null;
  usageDetailCalls: SkillsUsageCallItem[];
  usageDetailCallsTotal: number;
  usageDetailCallsLoading: boolean;
  usageDetailCallsError: string;
};

export type SkillsStateActions = {
  fetchSkills: () => Promise<void>;
  scanSkills: (workspaceId: string, directories?: string[]) => Promise<void>;
  setViewTab: (tab: "installed" | "discover" | "distribute") => void;
  selectSkill: (id: string | null) => void;
  toggleSelect: (id: string) => void;
  setSelection: (ids: string[]) => void;
  clearSelection: () => void;
  fetchDetail: (skillId: string) => Promise<void>;
  distribute: (workspaceId: string, targetIds: string[]) => Promise<void>;
  uninstall: (workspaceId: string, targetIds: string[]) => Promise<void>;
  loadManagerState: (workspaceId: string) => Promise<void>;
  syncManager: (workspaceId: string) => Promise<void>;
  cleanManager: (workspaceId: string) => Promise<void>;
  managerBatchLink: (
    workspaceId: string,
    skillIds: string[],
    tool: string,
    force?: boolean,
  ) => Promise<void>;
  managerBatchUnlink: (workspaceId: string, skillIds: string[], tool: string) => Promise<void>;
  managerSoftDelete: (workspaceId: string, skillId: string) => Promise<void>;
  managerRestore: (workspaceId: string, skillName: string) => Promise<void>;
  updateManagerRules: (
    workspaceId: string,
    patch: {
      rules?: Record<string, SkillsManagerRuleValue>;
      groupRules?: Record<string, SkillsManagerRuleValue>;
      toolRules?: Record<string, SkillsManagerToolRuleValue>;
    },
  ) => Promise<void>;
  setManagerMode: (value: SkillsManagerMode) => void;
  setManagerExpandedSkillId: (value: string | null) => void;
  setManagerMatrixFilter: (value: Partial<SkillsManagerMatrixFilter>) => void;
  clearManagerRowHint: (skillId: string) => void;
  setManagerStatusFilter: (value: "all" | SkillManagerStatus) => void;
  setManagerSelectedTool: (value: string) => void;
  setUsageFilters: (value: { agent?: string; source?: string }) => void;
  refreshUsageStats: (workspaceId: string) => Promise<void>;
  startListUsageSync: (workspaceId: string) => Promise<void>;
  startDetailUsageSync: (workspaceId: string, skillId: string) => Promise<void>;
  loadUsageCalls: (workspaceId: string, skillId: string) => Promise<void>;
  clearUsageDetail: () => void;
  getManagerOperationsRows: () => SkillsManagerOperationsRow[];
  getManagerFilteredOperationsRows: () => SkillsManagerOperationsRow[];
  getManagerMatrixSummaries: () => SkillsManagerMatrixSummary[];
};

export type SkillsState = SkillsStateValues & SkillsStateActions;

export type SkillsStoreSet = StoreApi<SkillsState>["setState"];
export type SkillsStoreGet = StoreApi<SkillsState>["getState"];
