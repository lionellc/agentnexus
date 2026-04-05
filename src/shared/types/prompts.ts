export interface PromptAsset {
  id: string;
  workspaceId: string;
  name: string;
  tags: string[];
  category: string;
  favorite: boolean;
  activeVersion: number;
  createdAt: string;
  updatedAt: string;
  content: string;
}

export interface PromptCreateInput {
  workspaceId: string;
  name: string;
  content: string;
  tags?: string[];
  category?: string;
  favorite?: boolean;
}

export interface PromptUpdateInput {
  promptId: string;
  content: string;
  tags?: string[];
  category?: string;
  favorite?: boolean;
}

export interface PromptDeleteInput {
  promptId: string;
}

export interface PromptRestoreInput {
  promptId: string;
  version: number;
}

export interface PromptSearchInput {
  workspaceId: string;
  keyword?: string;
  tags?: string[];
  category?: string;
  favorite?: boolean;
}

export interface PromptRenderInput {
  promptId: string;
  variables: Record<string, string>;
}

export interface PromptDeleteResult {
  deleted: boolean;
}

export interface PromptRenderResult {
  rendered: string;
}
