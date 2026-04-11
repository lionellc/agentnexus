import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PROMPT_RUN_HISTORY_MAX,
  buildPromptRunHistoryKey,
  getPromptRunHistory,
  writePromptRunHistory,
} from "./promptRunHistory";

const scope = {
  workspaceId: "w1",
  promptId: "p1",
  variableName: "name",
};

describe("promptRunHistory", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("生成作用域隔离 key", () => {
    expect(buildPromptRunHistoryKey(scope)).toBe("agentnexus:prompt-run-history:w1:p1:name");
  });

  it("读取空历史返回空数组", () => {
    expect(getPromptRunHistory(scope)).toEqual([]);
  });

  it("读取时遇到非数组或损坏 JSON 返回空数组", () => {
    localStorage.setItem(buildPromptRunHistoryKey(scope), "{bad json");
    expect(getPromptRunHistory(scope)).toEqual([]);

    localStorage.setItem(buildPromptRunHistoryKey(scope), JSON.stringify({ value: "x" }));
    expect(getPromptRunHistory(scope)).toEqual([]);
  });

  it("写入去重并按最近顺序前置", () => {
    writePromptRunHistory(scope, "A");
    writePromptRunHistory(scope, "B");
    const result = writePromptRunHistory(scope, "A");

    expect(result).toEqual(["A", "B"]);
    expect(getPromptRunHistory(scope)).toEqual(["A", "B"]);
  });

  it("默认仅保留最近 5 条", () => {
    const values = ["1", "2", "3", "4", "5", "6"];
    values.forEach((value) => writePromptRunHistory(scope, value));

    expect(getPromptRunHistory(scope)).toEqual(["6", "5", "4", "3", "2"]);
    expect(getPromptRunHistory(scope)).toHaveLength(PROMPT_RUN_HISTORY_MAX);
  });

  it("可通过 max 覆盖保留条数", () => {
    writePromptRunHistory(scope, "A", { max: 2 });
    writePromptRunHistory(scope, "B", { max: 2 });
    writePromptRunHistory(scope, "C", { max: 2 });

    expect(getPromptRunHistory(scope)).toEqual(["C", "B"]);
  });

  it("按 workspaceId + promptId + variableName 隔离", () => {
    writePromptRunHistory(scope, "A");
    writePromptRunHistory({ ...scope, workspaceId: "w2" }, "B");
    writePromptRunHistory({ ...scope, promptId: "p2" }, "C");
    writePromptRunHistory({ ...scope, variableName: "email" }, "D");

    expect(getPromptRunHistory(scope)).toEqual(["A"]);
    expect(getPromptRunHistory({ ...scope, workspaceId: "w2" })).toEqual(["B"]);
    expect(getPromptRunHistory({ ...scope, promptId: "p2" })).toEqual(["C"]);
    expect(getPromptRunHistory({ ...scope, variableName: "email" })).toEqual(["D"]);
  });

  it("写入异常时容错返回旧值", () => {
    writePromptRunHistory(scope, "A");

    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });

    const result = writePromptRunHistory(scope, "B");

    expect(result).toEqual(["A"]);
    expect(getPromptRunHistory(scope)).toEqual(["A"]);
    expect(setItemSpy).toHaveBeenCalled();
  });
});
