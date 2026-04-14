import { afterEach, describe, expect, it, vi } from "vitest";

import { PROMPT_CATEGORY_ALL_KEY } from "./promptCategory";
import {
  parsePromptBrowseScope,
  promptBrowseContextStorageKey,
  readPromptBrowseContext,
  writePromptBrowseContext,
} from "./promptBrowseContext";

describe("promptBrowseContext", () => {
  const workspaceId = "ws-1";

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("scope 解析容错", () => {
    expect(parsePromptBrowseScope("categories")).toBe("categories");
    expect(parsePromptBrowseScope("favorites")).toBe("favorites");
    expect(parsePromptBrowseScope("all")).toBe("all");
    expect(parsePromptBrowseScope("invalid")).toBe("all");
    expect(parsePromptBrowseScope("")).toBe("all");
  });

  it("storage key 带 workspace 维度", () => {
    expect(promptBrowseContextStorageKey(workspaceId)).toBe("agentnexus.prompts.browse-context.ws-1.v1");
  });

  it("正常读写 browse context", () => {
    writePromptBrowseContext(workspaceId, {
      scope: "categories",
      categoryKey: "travel",
    });

    expect(readPromptBrowseContext(workspaceId)).toEqual({
      scope: "categories",
      categoryKey: "travel",
    });
  });

  it("读到非法 JSON 返回 null", () => {
    localStorage.setItem(promptBrowseContextStorageKey(workspaceId), "{bad json");
    expect(readPromptBrowseContext(workspaceId)).toBeNull();
  });

  it("读到非法 scope 回退 all，空 category 回退 __all__", () => {
    localStorage.setItem(
      promptBrowseContextStorageKey(workspaceId),
      JSON.stringify({
        scope: "unknown",
        categoryKey: "   ",
      }),
    );

    expect(readPromptBrowseContext(workspaceId)).toEqual({
      scope: "all",
      categoryKey: PROMPT_CATEGORY_ALL_KEY,
    });
  });

  it("写入异常不抛出", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    expect(() =>
      writePromptBrowseContext(workspaceId, {
        scope: "favorites",
        categoryKey: "cat-a",
      }),
    ).not.toThrow();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
