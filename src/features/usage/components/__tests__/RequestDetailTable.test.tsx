import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RequestDetailTable } from "../RequestDetailTable";

const l = (zh: string) => zh;

const row = {
  id: "log-1",
  calledAt: "2026-04-20T10:00:00Z",
  agent: "planner",
  provider: "openai",
  model: "gpt-4.1",
  status: "failed",
  inputTokens: 500,
  outputTokens: 300,
  totalTokens: 800,
  isComplete: false,
  source: "session_jsonl",
  sourcePath: "/tmp/session.jsonl",
  sessionId: "s1",
  requestId: "r1",
  totalDurationMs: 1200,
};

describe("RequestDetailTable", () => {
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

  it("展示排障需要的明细列", async () => {
    await act(async () => {
      root.render(
        <RequestDetailTable
          l={l}
          rows={[row]}
          total={1}
          pageIndex={0}
          pageSize={20}
          hasNextPage
          onNextPage={vi.fn()}
          onPreviousPage={vi.fn()}
        />,
      );
    });

    expect(document.body.textContent).toContain("请求明细 · 1");
    expect(document.body.textContent).toContain("第 1 页");
    expect(document.body.textContent).toContain("1-1 / 1");
    expect(document.body.textContent).toContain("planner");
    expect(document.body.textContent).toContain("openai/gpt-4.1");
    expect(document.body.textContent).toContain("失败");
    expect(document.body.textContent).toContain("1.2s");
    expect(document.body.textContent).not.toContain("300ms");
    expect(document.body.textContent).toContain("不完整");
    expect(document.body.textContent).toContain("session_jsonl");
  });

  it("空明细时给出下一步建议", async () => {
    await act(async () => {
      root.render(
        <RequestDetailTable
          l={l}
          rows={[]}
          total={0}
          pageIndex={0}
          pageSize={20}
          onNextPage={vi.fn()}
          onPreviousPage={vi.fn()}
        />,
      );
    });

    expect(document.body.textContent).toContain("暂无请求明细");
    expect(document.body.textContent).toContain("0-0 / 0");
    expect(document.body.textContent).toContain("刷新调用记录");
    expect(document.body.textContent).toContain("放宽时间、Agent、模型、状态筛选");
  });
});
