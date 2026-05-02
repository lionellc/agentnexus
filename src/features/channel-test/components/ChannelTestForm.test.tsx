import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChannelApiTestCase } from "../../../shared/types";
import { ChannelTestForm } from "./ChannelTestForm";

const testCases: ChannelApiTestCase[] = [
  {
    id: "small-basic",
    category: "small",
    label: "算术短答",
    messages: [{ role: "user", content: "用一句中文回答：1+1 等于几？" }],
  },
];

describe("ChannelTestForm", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("必填未完成时禁用运行按钮", () => {
    act(() => {
      root.render(
        <ChannelTestForm
          protocol="openai"
          model=""
          baseUrl=""
          apiKey=""
          stream
          category="small"
          caseMode="specific"
          caseId="small-basic"
          categoryCases={testCases}
          selectedCase={testCases[0]}
          running={false}
          canRun={false}
          l={(zh) => zh}
          onChange={vi.fn()}
          onRun={vi.fn()}
          onRunDiagnostic={vi.fn()}
          onRunSampling={vi.fn()}
        />,
      );
    });

    const button = Array.from(document.body.querySelectorAll("button")).find((item) =>
      item.textContent?.includes("运行测试"),
    );
    expect(button?.hasAttribute("disabled")).toBe(true);
  });

  it("可运行时点击运行按钮触发回调", () => {
    const onRun = vi.fn();
    act(() => {
      root.render(
        <ChannelTestForm
          protocol="openai"
          model="gpt-4.1-mini"
          baseUrl="https://api.example.com"
          apiKey="sk-secret"
          stream
          category="small"
          caseMode="specific"
          caseId="small-basic"
          categoryCases={testCases}
          selectedCase={testCases[0]}
          running={false}
          canRun
          l={(zh) => zh}
          onChange={vi.fn()}
          onRun={onRun}
          onRunDiagnostic={vi.fn()}
          onRunSampling={vi.fn()}
        />,
      );
    });

    const button = Array.from(document.body.querySelectorAll("button")).find((item) =>
      item.textContent?.includes("运行测试"),
    );
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onRun).toHaveBeenCalled();
  });

  it("提供诊断探针和路由采样入口", () => {
    const onRunDiagnostic = vi.fn();
    const onRunSampling = vi.fn();
    act(() => {
      root.render(
        <ChannelTestForm
          protocol="openai"
          model="gpt-4.1-mini"
          baseUrl="https://api.example.com"
          apiKey="sk-secret"
          stream
          category="small"
          caseMode="specific"
          caseId="small-basic"
          categoryCases={testCases}
          selectedCase={testCases[0]}
          running={false}
          canRun
          l={(zh) => zh}
          onChange={vi.fn()}
          onRun={vi.fn()}
          onRunDiagnostic={onRunDiagnostic}
          onRunSampling={onRunSampling}
        />,
      );
    });

    const diagnostic = Array.from(document.body.querySelectorAll("button")).find((item) =>
      item.textContent?.includes("诊断探针"),
    );
    const sampling = Array.from(document.body.querySelectorAll("button")).find((item) =>
      item.textContent?.includes("路由采样"),
    );
    act(() => {
      diagnostic?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      sampling?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onRunDiagnostic).toHaveBeenCalled();
    expect(onRunSampling).toHaveBeenCalled();
  });

  it("展示当前题目名称", () => {
    const testCase = {
      ...testCases[0],
      id: "case-1",
      label: "我的短答题",
    };
    act(() => {
      root.render(
        <ChannelTestForm
          protocol="openai"
          model="gpt-4.1-mini"
          baseUrl="https://api.example.com"
          apiKey="sk-secret"
          stream
          category="small"
          caseMode="specific"
          caseId="case-1"
          categoryCases={[testCase]}
          selectedCase={testCase}
          running={false}
          canRun
          l={(zh) => zh}
          onChange={vi.fn()}
          onRun={vi.fn()}
          onRunDiagnostic={vi.fn()}
          onRunSampling={vi.fn()}
        />,
      );
    });

    expect(document.body.textContent).toContain("我的短答题");
  });
});
