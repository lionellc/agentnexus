import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChannelApiTestRunItem } from "../../../shared/types";
import { ChannelTestResultsTable } from "./ChannelTestResultsTable";

const run: ChannelApiTestRunItem = {
  id: "run-1",
  workspaceId: "workspace-1",
  startedAt: "2026-05-02T00:00:00Z",
  completedAt: "2026-05-02T00:00:01Z",
  protocol: "anthropic",
  model: "claude-sonnet-4-5",
  baseUrlDisplay: "https://api.example.com",
  category: "followup",
  caseId: "followup-context",
  runMode: "sampling",
  stream: true,
  status: "success",
  totalDurationMs: 1200,
  firstTokenMs: 300,
  firstMetricKind: "first_token",
  inputSize: 30,
  inputSizeSource: "chars",
  outputSize: 80,
  outputSizeSource: "usage",
  responseText: "ok",
  checks: [{ id: "non_empty_response", label: "响应非空", status: "pass" }],
  rounds: [
    {
      id: "round-1",
      status: "success",
      totalDurationMs: 500,
      firstTokenMs: 100,
      firstMetricKind: "first_token",
      inputSize: 10,
      inputSizeSource: "chars",
      outputSize: 20,
      outputSizeSource: "chars",
      promptPreview: "问题",
      responsePreview: "回答",
    },
  ],
};

describe("ChannelTestResultsTable", () => {
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

  it("展示核心列、流式标签和 usage/字符来源", () => {
    act(() => {
      root.render(
        <ChannelTestResultsTable
          items={[run]}
          total={1}
          page={1}
          pageSize={10}
          loading={false}
          l={(zh) => zh}
          onPageChange={vi.fn()}
        />,
      );
    });

    expect(document.body.textContent).toContain("时间");
    expect(document.body.textContent).toContain("模型");
    expect(document.body.textContent).toContain("用时/首字");
    expect(document.body.textContent).toContain("claude-sonnet-4-5");
    expect(document.body.textContent).toContain("Anthropic");
    expect(document.body.textContent).toContain("连续追问型");
    expect(document.body.textContent).toContain("采样");
    expect(document.body.textContent).toContain("流");
    expect(document.body.textContent).toContain("字符");
    expect(document.body.textContent).toContain("usage");
  });
});
