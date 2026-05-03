import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { modelUsageApi } = vi.hoisted(() => ({
  modelUsageApi: {
    queryDashboard: vi.fn(),
    queryRequestLogs: vi.fn(),
    syncStart: vi.fn(),
    syncProgress: vi.fn(),
  },
}));

vi.mock("../../../../shared/services/api", () => ({
  modelUsageApi,
}));

import { UsageDashboard } from "../UsageDashboard";

const l = (zh: string) => zh;

const dashboardResult = {
  window: { startAt: "2026-04-01T00:00:00Z", endAt: "2026-04-21T00:00:00Z", days: 30, timezoneOffsetMinutes: 480 },
  summary: {
    requestCount: 10,
    completeRequestCount: 8,
    incompleteCount: 2,
    totalInputTokens: 1000,
    totalOutputTokens: 600,
    totalTokens: 1600,
    avgDurationMs: 1200,
    durationSampleCount: 1,
  },
  trends: {
    dailyTokens: [{ date: "2026-04-20", inputTokens: 500, outputTokens: 300, totalTokens: 800 }],
    statusDistribution: [
      { status: "success", count: 7 },
      { status: "failed", count: 2 },
      { status: "unknown", count: 1 },
    ],
    modelDistribution: [{ model: "gpt-4.1", count: 9 }],
    modelTokenDistribution: [
      { model: "gpt-4.1", requests: 8, inputTokens: 900, outputTokens: 500, tokens: 1400 },
    ],
  },
  sourceCoverage: [{ source: "session_jsonl", status: "completed", count: 1, updatedAt: "2026-04-21T00:00:00Z" }],
};

const requestLogResult = {
  items: [
    {
      id: "log-1",
      calledAt: "2026-04-20T10:00:00Z",
      agent: "planner",
      provider: "openai",
      model: "gpt-4.1",
      status: "success",
      inputTokens: 500,
      outputTokens: 300,
      totalTokens: 800,
      isComplete: true,
      source: "session_jsonl",
      sourcePath: "/tmp/session.jsonl",
      sessionId: "s1",
      requestId: "r1",
      totalDurationMs: 1200,
    },
  ],
  total: 1,
  nextCursor: null,
};

describe("UsageDashboard", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    modelUsageApi.queryDashboard.mockResolvedValue(dashboardResult);
    modelUsageApi.queryRequestLogs.mockResolvedValue(requestLogResult);
    modelUsageApi.syncStart.mockResolvedValue({
      jobId: "job-1",
      workspaceId: "w1",
      status: "running",
      totalFiles: 1,
      processedFiles: 0,
      parsedEvents: 0,
      insertedEvents: 0,
      mergedEvents: 0,
      parseFailures: 0,
      currentSource: "session_jsonl",
      errorMessage: "",
      startedAt: "2026-04-21T00:00:00Z",
      updatedAt: "2026-04-21T00:00:00Z",
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    vi.clearAllMocks();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("加载后展示首屏指标、来源和请求明细", async () => {
    await act(async () => {
      root.render(<UsageDashboard l={l} />);
    });

    expect(document.body.textContent).toContain("模型使用看板");
    expect(document.body.textContent).toContain("总 Token");
    expect(document.body.textContent).toContain("1.60K");
    expect(document.body.textContent).toContain("平均用时");
    expect(document.body.textContent).toContain("1.2s");
    expect(document.body.textContent).toContain("10 次请求");
    expect(document.body.textContent).toContain("2 失败");
    expect(document.body.textContent).toContain("状态分布");
    expect(document.body.textContent).toContain("7 / 2");
    expect(document.body.textContent).not.toContain("数据来源");
    expect(document.body.textContent).toContain("planner");
    expect(modelUsageApi.queryDashboard).toHaveBeenCalledWith(expect.objectContaining({ days: 7, status: undefined, timezoneOffsetMinutes: expect.any(Number) }));
    expect(modelUsageApi.queryDashboard).not.toHaveBeenCalledWith(expect.objectContaining({ workspaceId: expect.anything() }));
    expect(modelUsageApi.queryRequestLogs).toHaveBeenCalledWith(expect.objectContaining({ days: 7, limit: 20, status: undefined }));
    expect(modelUsageApi.queryRequestLogs).not.toHaveBeenCalledWith(expect.objectContaining({ workspaceId: expect.anything() }));
    expect(document.body.textContent).toContain("页面刷新成功");
    expect(document.body.textContent).toContain("最新调用时间");
  });

  it("进入看板自动触发刷新并展示可关闭反馈", async () => {
    await act(async () => {
      root.render(<UsageDashboard l={l} />);
    });

    expect(modelUsageApi.syncStart).toHaveBeenCalledWith({});
    expect(document.body.textContent).not.toContain("同步调用");
    expect(document.body.textContent).toContain("同步中");
    expect(document.body.textContent).toContain("session_jsonl");

    const closeButton = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "关闭",
    );
    await act(async () => {
      closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.textContent).not.toContain("同步中");
  });

  it("点击刷新触发增量同步，而不是只重查本地库", async () => {
    modelUsageApi.syncStart.mockResolvedValueOnce({
      jobId: "job-1",
      workspaceId: "w1",
      status: "completed",
      totalFiles: 1,
      processedFiles: 1,
      parsedEvents: 1,
      insertedEvents: 1,
      mergedEvents: 0,
      parseFailures: 0,
      currentSource: "session_jsonl",
      errorMessage: "",
      startedAt: "2026-04-21T00:00:00Z",
      updatedAt: "2026-04-21T00:00:00Z",
    });
    await act(async () => {
      root.render(<UsageDashboard l={l} />);
    });

    modelUsageApi.syncStart.mockClear();
    modelUsageApi.syncStart.mockResolvedValueOnce({
      jobId: "job-2",
      workspaceId: "w1",
      status: "running",
      totalFiles: 1,
      processedFiles: 0,
      parsedEvents: 0,
      insertedEvents: 0,
      mergedEvents: 0,
      parseFailures: 0,
      currentSource: "session_jsonl",
      errorMessage: "",
      startedAt: "2026-04-21T00:00:00Z",
      updatedAt: "2026-04-21T00:00:00Z",
    });
    const refreshButton = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "刷新",
    );
    await act(async () => {
      refreshButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(modelUsageApi.syncStart).toHaveBeenCalledWith({});
  });

  it("点击隐藏的全量分析触发 forceFull 同步", async () => {
    modelUsageApi.syncStart.mockResolvedValueOnce({
      jobId: "job-1",
      workspaceId: "w1",
      status: "completed",
      totalFiles: 1,
      processedFiles: 1,
      parsedEvents: 1,
      insertedEvents: 1,
      mergedEvents: 0,
      parseFailures: 0,
      currentSource: "session_jsonl",
      errorMessage: "",
      startedAt: "2026-04-21T00:00:00Z",
      updatedAt: "2026-04-21T00:00:00Z",
    });
    await act(async () => {
      root.render(<UsageDashboard l={l} />);
    });

    modelUsageApi.syncStart.mockClear();
    modelUsageApi.syncStart.mockResolvedValueOnce({
      jobId: "job-full",
      workspaceId: "w1",
      status: "running",
      totalFiles: 1,
      processedFiles: 0,
      parsedEvents: 0,
      insertedEvents: 0,
      mergedEvents: 0,
      parseFailures: 0,
      currentSource: "session_jsonl",
      errorMessage: "",
      startedAt: "2026-04-21T00:00:00Z",
      updatedAt: "2026-04-21T00:00:00Z",
    });
    const fullButton = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "全量分析",
    );
    await act(async () => {
      fullButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(modelUsageApi.syncStart).toHaveBeenCalledWith({ forceFull: true });
  });

});
