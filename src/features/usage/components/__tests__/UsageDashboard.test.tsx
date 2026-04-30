import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { modelUsageApi } = vi.hoisted(() => ({
  modelUsageApi: {
    queryDashboard: vi.fn(),
    queryRequestLogs: vi.fn(),
    syncStart: vi.fn(),
    syncProgress: vi.fn(),
    syncPricing: vi.fn(),
    upsertPricingOverride: vi.fn(),
  },
}));

vi.mock("../../../../shared/services/api", () => ({
  modelUsageApi,
}));

import { UsageDashboard } from "../UsageDashboard";

const l = (zh: string) => zh;

const dashboardResult = {
  window: { startAt: "2026-04-01T00:00:00Z", endAt: "2026-04-21T00:00:00Z", days: 30 },
  summary: {
    requestCount: 10,
    billableRequestCount: 8,
    incompleteCount: 2,
    totalInputTokens: 1000,
    totalOutputTokens: 600,
    totalTokens: 1600,
    totalCostUsd: 1.2,
    totalCostCny: 8.64,
    displayCurrency: "USD",
    displayCost: 1.2,
    fxRateUsdCny: 7.2,
    fxStale: false,
    fxFetchedAt: "2026-04-21T00:00:00Z",
    fxSource: "builtin",
  },
  trends: {
    dailyCost: [{ date: "2026-04-20", usd: 0.6, cny: 4.32, display: 0.6 }],
    dailyTokens: [{ date: "2026-04-20", inputTokens: 500, outputTokens: 300, totalTokens: 800 }],
    statusDistribution: [
      { status: "success", count: 7 },
      { status: "failed", count: 2 },
      { status: "unknown", count: 1 },
    ],
    modelDistribution: [{ model: "gpt-4.1", count: 9 }],
    modelCostDistribution: [
      { model: "gpt-4.1", requests: 8, tokens: 1400, costUsd: 1.2, costCny: 8.64, displayCost: 1.2 },
    ],
  },
  sourceCoverage: [{ source: "session_jsonl", status: "completed", count: 1, updatedAt: "2026-04-21T00:00:00Z" }],
  pricing: {
    rows: [
      {
        provider: "openai",
        model: "gpt-4.1",
        currency: "USD",
        inputCostPerMillion: 2,
        outputCostPerMillion: 8,
        effectiveFrom: "1970-01-01T00:00:00Z",
        source: "builtin",
      },
    ],
  },
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
      costUsd: 0.6,
      costCny: 4.32,
      displayCurrency: "USD",
      displayCost: 0.6,
    },
  ],
  total: 1,
  nextCursor: null,
  displayCurrency: "USD",
  fxRateUsdCny: 7.2,
  fxStale: false,
  fxFetchedAt: "2026-04-21T00:00:00Z",
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
    modelUsageApi.syncPricing.mockResolvedValue({
      workspaceId: "w1",
      syncedAt: "2026-04-21T00:00:00Z",
      pricingRows: 5,
      source: "builtin",
      fx: {
        rate: 7.2,
        stale: false,
        fetchedAt: "2026-04-21T00:00:00Z",
        source: "builtin",
      },
    });
    modelUsageApi.upsertPricingOverride.mockResolvedValue(undefined);
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

  it("加载后展示首屏判断、KPI、可信度和请求明细", async () => {
    await act(async () => {
      root.render(<UsageDashboard l={l} workspaceId="w1" />);
    });

    expect(document.body.textContent).toContain("模型使用与成本看板");
    expect(document.body.textContent).toContain("当前范围成本");
    expect(document.body.textContent).toContain("10 次请求");
    expect(document.body.textContent).toContain("2 失败");
    expect(document.body.textContent).toContain("状态分布");
    expect(document.body.textContent).toContain("7 / 2");
    expect(document.body.textContent).toContain("数据可信度");
    expect(document.body.textContent).toContain("session_jsonl · completed · 1");
    expect(document.body.textContent).toContain("planner");
    expect(modelUsageApi.queryDashboard).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "w1", days: 7, status: undefined }));
    expect(modelUsageApi.queryRequestLogs).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "w1", days: 7, limit: 20, status: undefined }));
    expect(document.body.textContent).toContain("页面刷新成功");
    expect(document.body.textContent).toContain("最新调用时间");
  });

  it("点击同步调用触发 syncStart 并展示可关闭反馈", async () => {
    await act(async () => {
      root.render(<UsageDashboard l={l} workspaceId="w1" />);
    });

    const syncButton = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "同步调用",
    );
    await act(async () => {
      syncButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(modelUsageApi.syncStart).toHaveBeenCalledWith({ workspaceId: "w1" });
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
    await act(async () => {
      root.render(<UsageDashboard l={l} workspaceId="w1" />);
    });

    modelUsageApi.syncStart.mockClear();
    const refreshButton = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "刷新",
    );
    await act(async () => {
      refreshButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(modelUsageApi.syncStart).toHaveBeenCalledWith({ workspaceId: "w1" });
  });

  it("定价规则默认收起，同步价格保留在定价区域", async () => {
    await act(async () => {
      root.render(<UsageDashboard l={l} workspaceId="w1" />);
    });

    expect(document.body.textContent).toContain("定价规则");
    expect(document.body.textContent).not.toContain("保存覆盖");

    const refreshPricingButton = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "刷新默认价格库",
    );
    await act(async () => {
      refreshPricingButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(modelUsageApi.syncPricing).toHaveBeenCalledWith({ workspaceId: "w1" });
    expect(document.body.textContent).toContain("默认价格库已刷新");
    expect(document.body.textContent).toContain("5 条");

    const expandButton = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "展开",
    );
    await act(async () => {
      expandButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(document.body.textContent).toContain("保存覆盖");
  });
});
