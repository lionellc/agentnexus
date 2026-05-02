import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ChannelChainAttributionReport } from "../../../shared/types";
import { ChannelAttributionPanel } from "./ChannelAttributionPanel";

const zh = (value: string) => value;
const en = (_zh: string, value: string) => value;

const report: ChannelChainAttributionReport = {
  version: 1,
  summary: "中转/反代候选",
  modelRewrite: {
    status: "suspected_rewrite",
    label: "疑似模型被改写",
    severity: "warn",
    requestModel: "claude-sonnet",
    responseModel: "claude-haiku",
    note: "请求模型与响应模型字段不一致，这是模型被路由或改写的强证据。",
  },
  candidates: [
    {
      id: "relay_or_proxy",
      label: "中转/反代候选",
      confidence: 76,
      confidenceLabel: "medium",
      reasons: ["Base URL 不是官方域名"],
      proven: false,
    },
  ],
  evidences: [
    {
      id: "host",
      level: "observed_fact",
      label: "Base URL Host",
      detail: "api.example.com",
    },
    {
      id: "client_limit",
      level: "client_unverifiable",
      label: "客户端观测边界",
      detail: "无法证明真实账号池",
    },
  ],
  samples: {
    summary: {
      label: "疑似多路由/负载均衡/号池分发",
      note: "这是行为推断，不是账号池证明。",
      dimensions: [
        { name: "模型字段", status: "稳定", distinctCount: 1 },
        { name: "Header 组合", status: "分簇", distinctCount: 2 },
        { name: "完成耗时", status: "波动明显", spreadMs: 2200, note: "耗时波动只能作为辅助信号。" },
      ],
    },
    items: [
      {
        sample: 1,
        httpStatus: 200,
        responseModel: "claude-haiku",
        server: "railway-edge",
        xCache: "MISS",
        requestId: "request-abcdef1234567890",
        firstTokenMs: 1200,
        completedMs: 3400,
      },
    ],
  },
  unverifiableItems: ["真实账号池", "真实额度来源"],
  note: "本报告只基于客户端可见证据。",
};

const probeReport: ChannelChainAttributionReport = {
  ...report,
  samples: [
    {
      id: "invalid_model_boundary",
      label: "非法模型边界请求",
      httpStatus: 404,
      responseModel: null,
      errorFingerprint: {
        type: "invalid_request_error",
        code: "model_not_found",
        message: "model not found",
      },
    },
  ],
};

describe("ChannelAttributionPanel", () => {
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

  it("展示候选、模型改写和不可判断项", () => {
    act(() => {
      root.render(<ChannelAttributionPanel report={report} l={zh} />);
    });

    expect(document.body.textContent).toContain("中转/反代候选");
    expect(document.body.textContent).toContain("疑似模型被改写");
    expect(document.body.textContent).toContain("claude-sonnet");
    expect(document.body.textContent).toContain("真实账号池");
    expect(document.body.textContent).toContain("采样稳定性");
    expect(document.body.textContent).toContain("Header 组合");
    expect(document.body.textContent).toContain("railway-edge");
  });

  it("展示诊断探针错误指纹", () => {
    act(() => {
      root.render(<ChannelAttributionPanel report={probeReport} l={zh} />);
    });

    expect(document.body.textContent).toContain("非法模型边界请求");
    expect(document.body.textContent).toContain("model_not_found");
  });

  it("兼容旧连接诊断", () => {
    act(() => {
      root.render(
        <ChannelAttributionPanel
          l={zh}
          legacyDiagnostics={{
            connectionType: "proxy_candidate",
            baseUrlHost: "api.example.com",
            officialHostCandidate: false,
            proxyHeaderCandidate: true,
            headers: [{ via: "proxy" }],
            reasons: ["host 不是官方 API 域名"],
            note: "旧诊断",
          }}
        />,
      );
    });

    expect(document.body.textContent).toContain("反代候选");
    expect(document.body.textContent).toContain("旧诊断");
  });

  it("英文模式翻译报告 UI 和已知报告标签", () => {
    act(() => {
      root.render(<ChannelAttributionPanel report={report} l={en} />);
    });

    expect(document.body.textContent).toContain("Relay/proxy candidate");
    expect(document.body.textContent).toContain("Model Rewrite Check");
    expect(document.body.textContent).toContain("Real account pool");
    expect(document.body.textContent).toContain("Sampling Stability");
    expect(document.body.textContent).toContain("Header combination");
    expect(document.body.textContent).not.toContain("采样稳定性");
  });
});
