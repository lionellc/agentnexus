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

  it("支持提取中文与 Unicode 变量", () => {
    const content = "你好 {{ 变量1 }}，欢迎 {{项目.名称}}，再见 {{变量1}}";

    expect(extractTemplateVariables(content)).toEqual(["变量1", "项目.名称"]);
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

  it("变量为空字符串或空白字符串时保留占位符", () => {
    const content = "{{empty}} {{blank}} {{value}}";

    expect(renderTemplatePreview(content, { empty: "", blank: "   ", value: "ok" })).toBe(
      "{{empty}} {{blank}} ok",
    );
  });

  it("支持中文变量替换", () => {
    const content = "{{变量1}} / {{变量2}} / {{缺失变量}}";

    expect(renderTemplatePreview(content, { 变量1: "值1", 变量2: "值2" })).toBe("值1 / 值2 / {{缺失变量}}");
  });
});
