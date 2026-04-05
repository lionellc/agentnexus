import { describe, expect, it } from "vitest";

import { buildLineDiff } from "./diff";

describe("buildLineDiff", () => {
  it("相同行输出 unchanged", () => {
    expect(buildLineDiff("a\nb", "a\nb")).toEqual([
      { type: "unchanged", text: "a" },
      { type: "unchanged", text: "b" },
    ]);
  });

  it("同位置差异输出 removed + added", () => {
    expect(buildLineDiff("a\nb", "a\nc")).toEqual([
      { type: "unchanged", text: "a" },
      { type: "removed", text: "b" },
      { type: "added", text: "c" },
    ]);
  });

  it("处理增减行", () => {
    expect(buildLineDiff("a\nb", "a")).toEqual([
      { type: "unchanged", text: "a" },
      { type: "removed", text: "b" },
    ]);

    expect(buildLineDiff("a", "a\nb")).toEqual([
      { type: "unchanged", text: "a" },
      { type: "added", text: "b" },
    ]);
  });
});
