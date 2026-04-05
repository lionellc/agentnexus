import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { MainModule, PromptViewMode, SettingsCategory, SkillDetailTab } from "../../features/shell/types";

export type GlobalSearchHit = {
  module: MainModule;
  id: string;
  title: string;
  subtitle?: string;
};

type ShellState = {
  activeModule: MainModule;
  query: string;
  selectedIds: string[];
  mobilePaneState: "list" | "detail" | "split";
  featureFlags: Record<string, boolean>;
  mobileSidebarOpen: boolean;
  mobileDetailOpen: boolean;
  promptViewMode: PromptViewMode;
  skillDetailTab: SkillDetailTab;
  settingsCategory: SettingsCategory;
  searchHits: GlobalSearchHit[];
  setActiveModule: (module: MainModule) => void;
  setQuery: (query: string) => void;
  setSelectedIds: (ids: string[]) => void;
  toggleSelectedId: (id: string) => void;
  setMobilePaneState: (state: "list" | "detail" | "split") => void;
  setFeatureFlag: (name: string, enabled: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setMobileDetailOpen: (open: boolean) => void;
  setPromptViewMode: (mode: PromptViewMode) => void;
  setSkillDetailTab: (tab: SkillDetailTab) => void;
  setSettingsCategory: (category: SettingsCategory) => void;
  setSearchHits: (hits: GlobalSearchHit[]) => void;
};

export const useShellStore = create<ShellState>()(
  persist(
    (set) => ({
      activeModule: "prompts",
      query: "",
      selectedIds: [],
      mobilePaneState: "list",
      featureFlags: {},
      mobileSidebarOpen: false,
      mobileDetailOpen: false,
      promptViewMode: "list",
      skillDetailTab: "preview",
      settingsCategory: "general",
      searchHits: [],
      setActiveModule: (activeModule) => set({ activeModule }),
      setQuery: (query) => set({ query }),
      setSelectedIds: (selectedIds) => set({ selectedIds }),
      toggleSelectedId: (id) =>
        set((state) => ({
          selectedIds: state.selectedIds.includes(id)
            ? state.selectedIds.filter((item) => item !== id)
            : [...state.selectedIds, id],
        })),
      setMobilePaneState: (mobilePaneState) => set({ mobilePaneState }),
      setFeatureFlag: (name, enabled) =>
        set((state) => ({
          featureFlags: {
            ...state.featureFlags,
            [name]: enabled,
          },
        })),
      setMobileSidebarOpen: (mobileSidebarOpen) => set({ mobileSidebarOpen }),
      setMobileDetailOpen: (mobileDetailOpen) => set({ mobileDetailOpen }),
      setPromptViewMode: (promptViewMode) => set({ promptViewMode }),
      setSkillDetailTab: (skillDetailTab) => set({ skillDetailTab }),
      setSettingsCategory: (settingsCategory) => set({ settingsCategory }),
      setSearchHits: (searchHits) => set({ searchHits }),
    }),
    {
      name: "agentnexus-shell-store",
      partialize: (state) => ({
        activeModule: state.activeModule,
        promptViewMode: state.promptViewMode,
        skillDetailTab: state.skillDetailTab,
        settingsCategory: state.settingsCategory,
      }),
    },
  ),
);
