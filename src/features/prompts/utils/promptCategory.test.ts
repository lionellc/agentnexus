import { describe, expect, it } from "vitest";

import {
  PROMPT_CATEGORY_ALL_KEY,
  PROMPT_CATEGORY_UNCATEGORIZED_KEY,
  normalizePromptCategoryKey,
} from "./promptCategory";

describe("promptCategory", () => {
  it("导出固定分类 key", () => {
    expect(PROMPT_CATEGORY_ALL_KEY).toBe("__all__");
    expect(PROMPT_CATEGORY_UNCATEGORIZED_KEY).toBe("__uncategorized__");
  });

  it("空值与 default 归一为 uncategorized", () => {
    expect(normalizePromptCategoryKey("")).toBe(PROMPT_CATEGORY_UNCATEGORIZED_KEY);
    expect(normalizePromptCategoryKey("   ")).toBe(PROMPT_CATEGORY_UNCATEGORIZED_KEY);
    expect(normalizePromptCategoryKey(null)).toBe(PROMPT_CATEGORY_UNCATEGORIZED_KEY);
    expect(normalizePromptCategoryKey(undefined)).toBe(PROMPT_CATEGORY_UNCATEGORIZED_KEY);
    expect(normalizePromptCategoryKey("default")).toBe(PROMPT_CATEGORY_UNCATEGORIZED_KEY);
    expect(normalizePromptCategoryKey(" DEFAULT ")).toBe(PROMPT_CATEGORY_UNCATEGORIZED_KEY);
  });

  it("其他分类转为 trim + lowercase", () => {
    expect(normalizePromptCategoryKey(" Travel ")).toBe("travel");
    expect(normalizePromptCategoryKey("Finance")).toBe("finance");
  });
});
