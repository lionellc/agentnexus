import type {
  PromptAsset,
  PromptCreateInput,
  PromptDeleteResult,
  PromptRenderInput,
  PromptRenderResult,
  PromptRestoreInput,
  PromptSearchInput,
  PromptUpdateInput,
} from "../types";

import { invokeCommand } from "./tauriClient";

export const promptService = {
  list(_workspaceId?: string): Promise<PromptAsset[]> {
    return invokeCommand("prompt_list");
  },

  create(input: PromptCreateInput): Promise<PromptAsset> {
    return invokeCommand("prompt_create", { input });
  },

  update(input: PromptUpdateInput): Promise<PromptAsset> {
    return invokeCommand("prompt_update", { input });
  },

  delete(promptId: string): Promise<PromptDeleteResult> {
    return invokeCommand("prompt_delete", { input: { promptId } });
  },

  search(input: PromptSearchInput): Promise<PromptAsset[]> {
    return invokeCommand("prompt_search", { input });
  },

  render(input: PromptRenderInput): Promise<PromptRenderResult> {
    return invokeCommand("prompt_render", { input });
  },

  restoreVersion(input: PromptRestoreInput): Promise<PromptAsset> {
    return invokeCommand("prompt_restore_version", { input });
  },

  versions(promptId: string): Promise<
    Array<{ version: number; content: string; metadata: Record<string, unknown>; createdAt: string }>
  > {
    return invokeCommand("prompt_versions", { promptId });
  },
};
