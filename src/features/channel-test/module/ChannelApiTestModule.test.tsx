import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { channelApiTestApi } = vi.hoisted(() => ({
  channelApiTestApi: {
    queryRuns: vi.fn(),
    run: vi.fn(),
    listCases: vi.fn(),
    upsertCase: vi.fn(),
    deleteCase: vi.fn(),
  },
}));

vi.mock("../../../shared/services/api", () => ({
  channelApiTestApi,
}));

import { ChannelApiTestModule } from "./ChannelApiTestModule";

const l = (zh: string) => zh;
const defaultCases = [
  {
    id: "small-basic",
    category: "small",
    label: "算术短答",
    messages: [{ role: "user", content: "用一句中文回答：1+1 等于几？" }],
  },
];

describe("ChannelApiTestModule", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    channelApiTestApi.queryRuns.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
    channelApiTestApi.run.mockResolvedValue(undefined);
    channelApiTestApi.listCases.mockResolvedValue(defaultCases);
    channelApiTestApi.upsertCase.mockResolvedValue(undefined);
    channelApiTestApi.deleteCase.mockResolvedValue(undefined);
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

  it("不需要工作区也展示测试台入口", async () => {
    await act(async () => {
      root.render(<ChannelApiTestModule l={l} workspaceId={null} />);
    });

    expect(document.body.textContent).toContain("渠道 API 测试台");
    expect(channelApiTestApi.queryRuns).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
    expect(channelApiTestApi.listCases).toHaveBeenCalledWith({});
  });

  it("传入旧 workspaceId 时也不会下发到后端", async () => {
    await act(async () => {
      root.render(<ChannelApiTestModule l={l} workspaceId="workspace-1" />);
    });

    expect(document.body.textContent).toContain("渠道 API 测试台");
    expect(document.body.textContent).toContain("选择协议、模型、Base URL");
    expect(document.body.textContent).toContain("题库管理");
    expect(channelApiTestApi.queryRuns).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
    expect(channelApiTestApi.listCases).toHaveBeenCalledWith({});
  });

  it("点击题库管理进入二级页面", async () => {
    await act(async () => {
      root.render(<ChannelApiTestModule l={l} workspaceId="workspace-1" />);
    });

    const button = Array.from(document.body.querySelectorAll("button")).find((item) =>
      item.textContent?.includes("题库管理"),
    );
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.textContent).toContain("管理渠道 API 测试台的全部题目");
    expect(document.body.textContent).toContain("算术短答");
    expect(document.body.textContent).toContain("返回测试台");
  });
});
