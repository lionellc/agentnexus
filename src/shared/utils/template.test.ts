import { describe, expect, it } from "vitest";

import { extractTemplateVariables, renderTemplatePreview } from "./template";

describe("extractTemplateVariables", () => {
  it("提取并去重模板变量", () => {
    const content = "Hello {{ name }}, from {{workspace.id}} and {{name}}";

    expect(extractTemplateVariables(content)).toEqual(["name", "workspace.id"]);
  });

  it("无变量时返回空数组", () => {
    expect(extractTemplateVariables("plain text")).toEqual([]);
  });
});

describe("renderTemplatePreview", () => {
  it("按变量映射渲染模板", () => {
    const content = "{{ greeting }}, {{name}}";

    expect(renderTemplatePreview(content, { greeting: "Hi", name: "Codex" })).toBe("Hi, Codex");
  });

  it("缺失变量时保留占位符", () => {
    const content = "{{known}} {{missing}}";

    expect(renderTemplatePreview(content, { known: "ok" })).toBe("ok {{missing}}");
  });
});
