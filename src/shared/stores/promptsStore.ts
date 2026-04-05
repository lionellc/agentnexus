import { create } from "zustand";

import { promptApi } from "../services/api";
import type { PromptAsset } from "../types";

export type PromptBatchResult = {
  action: "favorite" | "move" | "delete";
  success: number;
  failed: number;
  failures: Array<{ id: string; message: string }>;
};

type PromptsState = {
  prompts: PromptAsset[];
  promptViewMode: "list" | "grid" | "editor";
  selectedPromptId: string | null;
  selectedIds: string[];
  loading: boolean;
  versionsByPromptId: Record<string, Array<{ version: number; content: string; metadata: Record<string, unknown>; createdAt: string }>>;
  lastBatchResult: PromptBatchResult | null;
  fetchPrompts: (workspaceId: string) => Promise<void>;
  searchPrompts: (workspaceId: string, keyword: string) => Promise<void>;
  setPromptViewMode: (mode: "list" | "grid" | "editor") => void;
  selectPrompt: (id: string | null) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  setSelection: (ids: string[]) => void;
  createPrompt: (input: { workspaceId: string; name: string; content: string; tags?: string[]; category?: string; favorite?: boolean }) => Promise<PromptAsset>;
  updatePrompt: (input: { promptId: string; content: string; tags?: string[]; category?: string; favorite?: boolean }) => Promise<PromptAsset>;
  renderPrompt: (promptId: string, variables: Record<string, string>) => Promise<string>;
  fetchVersions: (promptId: string) => Promise<void>;
  restoreVersion: (promptId: string, version: number) => Promise<void>;
  batchFavorite: (favorite: boolean) => Promise<void>;
  batchMove: (category: string) => Promise<void>;
  batchDelete: () => Promise<void>;
};

function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  return tags.map((tag) => tag.trim()).filter(Boolean);
}

export const usePromptsStore = create<PromptsState>((set, get) => ({
  prompts: [],
  promptViewMode: "list",
  selectedPromptId: null,
  selectedIds: [],
  loading: false,
  versionsByPromptId: {},
  lastBatchResult: null,
  fetchPrompts: async (workspaceId) => {
    set({ loading: true });
    try {
      const prompts = await promptApi.list(workspaceId);
      const selectedPromptId = get().selectedPromptId;
      const stillExists = selectedPromptId && prompts.some((item) => item.id === selectedPromptId);
      set({
        prompts,
        selectedPromptId: stillExists ? selectedPromptId : prompts[0]?.id ?? null,
      });
    } finally {
      set({ loading: false });
    }
  },
  searchPrompts: async (workspaceId, keyword) => {
    set({ loading: true });
    try {
      const prompts = await promptApi.search({ workspaceId, keyword });
      set({ prompts });
    } finally {
      set({ loading: false });
    }
  },
  setPromptViewMode: (promptViewMode) => set({ promptViewMode }),
  selectPrompt: (selectedPromptId) => set({ selectedPromptId }),
  toggleSelect: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((item) => item !== id)
        : [...state.selectedIds, id],
    })),
  clearSelection: () => set({ selectedIds: [] }),
  setSelection: (selectedIds) => set({ selectedIds }),
  createPrompt: async (input) => {
    const created = await promptApi.create({
      workspaceId: input.workspaceId,
      name: input.name,
      content: input.content,
      tags: normalizeTags(input.tags),
      category: input.category,
      favorite: input.favorite,
    });
    set((state) => ({
      prompts: [created, ...state.prompts],
      selectedPromptId: created.id,
    }));
    return created;
  },
  updatePrompt: async (input) => {
    const updated = await promptApi.update({
      promptId: input.promptId,
      content: input.content,
      tags: normalizeTags(input.tags),
      category: input.category,
      favorite: input.favorite,
    });
    set((state) => ({
      prompts: state.prompts.map((item) => (item.id === updated.id ? updated : item)),
      selectedPromptId: updated.id,
    }));
    return updated;
  },
  renderPrompt: async (promptId, variables) => {
    const result = await promptApi.render(promptId, variables);
    return result.rendered;
  },
  fetchVersions: async (promptId) => {
    const versions = await promptApi.versions(promptId);
    set((state) => ({
      versionsByPromptId: {
        ...state.versionsByPromptId,
        [promptId]: versions,
      },
    }));
  },
  restoreVersion: async (promptId, version) => {
    const restored = await promptApi.restoreVersion({ promptId, version });
    set((state) => ({
      prompts: state.prompts.map((item) => (item.id === restored.id ? restored : item)),
    }));
    await get().fetchVersions(promptId);
  },
  batchFavorite: async (favorite) => {
    const { selectedIds, prompts } = get();
    const target = prompts.filter((item) => selectedIds.includes(item.id));
    const failures: Array<{ id: string; message: string }> = [];
    let success = 0;

    for (const item of target) {
      try {
        await promptApi.update({
          promptId: item.id,
          content: item.content,
          tags: item.tags,
          category: item.category,
          favorite,
        });
        success += 1;
      } catch (error) {
        failures.push({ id: item.id, message: error instanceof Error ? error.message : "更新失败" });
      }
    }

    set({
      lastBatchResult: {
        action: "favorite",
        success,
        failed: failures.length,
        failures,
      },
    });
  },
  batchMove: async (category) => {
    const { selectedIds, prompts } = get();
    const target = prompts.filter((item) => selectedIds.includes(item.id));
    const failures: Array<{ id: string; message: string }> = [];
    let success = 0;

    for (const item of target) {
      try {
        await promptApi.update({
          promptId: item.id,
          content: item.content,
          tags: item.tags,
          category,
          favorite: item.favorite,
        });
        success += 1;
      } catch (error) {
        failures.push({ id: item.id, message: error instanceof Error ? error.message : "移动失败" });
      }
    }

    set({
      lastBatchResult: {
        action: "move",
        success,
        failed: failures.length,
        failures,
      },
    });
  },
  batchDelete: async () => {
    const { selectedIds } = get();
    const failures: Array<{ id: string; message: string }> = [];
    let success = 0;

    for (const id of selectedIds) {
      try {
        await promptApi.remove(id);
        success += 1;
      } catch (error) {
        failures.push({ id, message: error instanceof Error ? error.message : "删除失败" });
      }
    }

    set((state) => ({
      prompts: state.prompts.filter((item) => !selectedIds.includes(item.id)),
      selectedIds: [],
      selectedPromptId: null,
      lastBatchResult: {
        action: "delete",
        success,
        failed: failures.length,
        failures,
      },
    }));
  },
}));
