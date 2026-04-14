import { PROMPT_CATEGORY_ALL_KEY } from "./promptCategory";

export type PromptBrowseScope = "all" | "categories" | "favorites";

export type PromptBrowseContext = {
  scope: PromptBrowseScope;
  categoryKey: string;
};

export const PROMPT_BROWSE_CONTEXT_STORAGE_PREFIX = "agentnexus.prompts.browse-context.";

export function parsePromptBrowseScope(value: string): PromptBrowseScope {
  if (value === "categories" || value === "favorites") {
    return value;
  }
  return "all";
}

export function promptBrowseContextStorageKey(workspaceId: string): string {
  return `${PROMPT_BROWSE_CONTEXT_STORAGE_PREFIX}${workspaceId}.v1`;
}

export function readPromptBrowseContext(workspaceId: string): PromptBrowseContext | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(promptBrowseContextStorageKey(workspaceId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { scope?: string; categoryKey?: string };
    const scope = parsePromptBrowseScope(parsed.scope ?? "");
    const categoryKey = (parsed.categoryKey ?? "").trim() || PROMPT_CATEGORY_ALL_KEY;
    return {
      scope,
      categoryKey,
    };
  } catch {
    return null;
  }
}

export function writePromptBrowseContext(workspaceId: string, context: PromptBrowseContext): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(promptBrowseContextStorageKey(workspaceId), JSON.stringify(context));
  } catch {
    // ignore storage write errors
  }
}
