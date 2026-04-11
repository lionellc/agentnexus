export const PROMPT_RUN_HISTORY_MAX = 5;
const PROMPT_RUN_HISTORY_KEY_PREFIX = "agentnexus:prompt-run-history";

export interface PromptRunHistoryScope {
  workspaceId: string;
  promptId: string;
  variableName: string;
}

export interface WritePromptRunHistoryOptions {
  max?: number;
}

function normalizeMax(max?: number): number {
  if (!Number.isFinite(max) || (max ?? 0) <= 0) {
    return PROMPT_RUN_HISTORY_MAX;
  }
  return Math.floor(max as number);
}

export function buildPromptRunHistoryKey(scope: PromptRunHistoryScope): string {
  return [
    PROMPT_RUN_HISTORY_KEY_PREFIX,
    scope.workspaceId,
    scope.promptId,
    scope.variableName,
  ].join(":");
}

export function getPromptRunHistory(scope: PromptRunHistoryScope): string[] {
  try {
    const raw = localStorage.getItem(buildPromptRunHistoryKey(scope));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

export function writePromptRunHistory(
  scope: PromptRunHistoryScope,
  value: string,
  options: WritePromptRunHistoryOptions = {}
): string[] {
  const max = normalizeMax(options.max);
  const current = getPromptRunHistory(scope);
  const next = [value, ...current.filter((item) => item !== value)].slice(0, max);

  try {
    localStorage.setItem(buildPromptRunHistoryKey(scope), JSON.stringify(next));
  } catch {
    return current;
  }

  return next;
}
