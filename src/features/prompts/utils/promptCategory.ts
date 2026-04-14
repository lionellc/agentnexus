export const PROMPT_CATEGORY_ALL_KEY = "__all__";
export const PROMPT_CATEGORY_UNCATEGORIZED_KEY = "__uncategorized__";

export function normalizePromptCategoryKey(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return PROMPT_CATEGORY_UNCATEGORIZED_KEY;
  }
  const lowered = trimmed.toLowerCase();
  if (lowered === "default") {
    return PROMPT_CATEGORY_UNCATEGORIZED_KEY;
  }
  return lowered;
}
