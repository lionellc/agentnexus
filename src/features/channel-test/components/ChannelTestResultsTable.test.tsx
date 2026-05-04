import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChannelApiTestRunItem } from "../../../shared/types";
import { ChannelTestRunDetail } from "./ChannelTestRunDetail";
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

  it("展示核心列和流式标签", () => {
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
    expect(document.body.textContent).not.toContain("usage");
  });

  it("输入列展示 Anthropic 缓存写入和读取 token", () => {
    const cachedRun: ChannelApiTestRunItem = {
      ...run,
      inputSize: 3,
      inputSizeSource: "usage",
      usageJson: JSON.stringify({
        input_tokens: 3,
        cache_creation_input_tokens: 3029,
        cache_read_input_tokens: 2048,
      }),
    };

    act(() => {
      root.render(
        <ChannelTestResultsTable
          items={[cachedRun]}
          total={1}
          page={1}
          pageSize={10}
          loading={false}
          l={(zh) => zh}
          onPageChange={vi.fn()}
        />,
      );
    });

    expect(document.body.textContent).toContain("缓存写 3,029");
    expect(document.body.textContent).toContain("缓存读 2,048");
  });

  it("Bedrock 记录展示协议标签", () => {
    const bedrockRun: ChannelApiTestRunItem = {
      ...run,
      id: "bedrock-run",
      protocol: "bedrock",
      model: "anthropic.claude-3-5-sonnet-20240620-v1:0",
      baseUrlDisplay: "https://bedrock-runtime.us-east-1.amazonaws.com",
      category: "small",
      runMode: "standard",
      firstTokenMs: 210,
      conversationJson: JSON.stringify({
        metrics: [
          {
            round: 1,
            httpHeadersMs: 80,
            firstSseEventMs: 120,
            firstTextDeltaMs: 210,
            bedrockLatencyMs: 180,
            completedMs: 640,
          },
        ],
        bedrock: {
          firstEventMs: 120,
          firstTextDeltaMs: 210,
          latencyMs: 180,
          usage: { inputTokens: 3, outputTokens: 5 },
          stopReason: "end_turn",
          eventCounts: { messageStart: 1, contentBlockDelta: 1, metadata: 1 },
          timeline: [{ index: 1, type: "messageStart", observedMs: 120 }],
          eventSamples: [{ type: "messageStart", payload: { messageStart: { role: "assistant" } } }],
        },
      }),
      checks: [
        { id: "bedrock_event_stream", label: "Bedrock event-stream", status: "pass" },
      ],
    };

    act(() => {
      root.render(
        <ChannelTestResultsTable
          items={[bedrockRun]}
          total={1}
          page={1}
          pageSize={10}
          loading={false}
          l={(zh) => zh}
          onPageChange={vi.fn()}
        />,
      );
    });

    expect(document.body.textContent).toContain("Bedrock");
  });

  it("Bedrock 展开详情展示实际请求体、响应过程和响应体", () => {
    const bedrockRun: ChannelApiTestRunItem = {
      ...run,
      id: "bedrock-run",
      protocol: "bedrock",
      model: "anthropic.claude-3-5-sonnet-20240620-v1:0",
      baseUrlDisplay: "https://bedrock-runtime.us-east-1.amazonaws.com",
      category: "small",
      runMode: "standard",
      firstTokenMs: 210,
      conversationJson: JSON.stringify({
        requests: [{ modelId: "anthropic.claude-3-5-sonnet-20240620-v1:0", messages: [{ role: "user", content: [{ text: "ping" }] }] }],
        responses: [{ raw: { output: { message: { content: [{ text: "pong" }] } } } }],
        metrics: [
          {
            round: 1,
            httpHeadersMs: 80,
            firstSseEventMs: 120,
            firstTextDeltaMs: 210,
            bedrockLatencyMs: 180,
            completedMs: 640,
          },
        ],
        bedrock: {
          firstEventMs: 120,
          firstTextDeltaMs: 210,
          latencyMs: 180,
          usage: { inputTokens: 3, outputTokens: 5 },
          stopReason: "end_turn",
          eventCounts: { messageStart: 1, contentBlockDelta: 1, metadata: 1 },
          timeline: [{ index: 1, type: "messageStart", observedMs: 120 }],
          eventSamples: [{ type: "messageStart", payload: { messageStart: { role: "assistant" } } }],
        },
      }),
      checks: [
        { id: "bedrock_event_stream", label: "Bedrock event-stream", status: "pass" },
      ],
    };

    act(() => {
      root.render(<ChannelTestRunDetail run={bedrockRun} l={(zh) => zh} />);
    });

    expect(document.body.textContent).toContain("Bedrock latency");
    expect(document.body.textContent).toContain("本次调用全链路");
    expect(document.body.textContent).toContain("实际请求体");
    expect(document.body.textContent).toContain("响应过程 / SSE 数据流");
    expect(document.body.textContent).toContain("实际响应体");
    expect(document.body.textContent).toContain("messageStart");
    expect(document.body.textContent).toContain("modelId");
    expect(document.body.textContent).not.toContain("bedrock-secret");
  });

  it("OpenAI SSE 记录展示数据流事件列表", () => {
    const openaiRun: ChannelApiTestRunItem = {
      ...run,
      protocol: "openai",
      model: "gpt-4.1-mini",
      conversationJson: JSON.stringify({
        requests: [{ model: "gpt-4.1-mini", messages: [{ role: "user", content: "ping" }], stream: true }],
        responses: [{
          raw: {
            streamEvents: [
              JSON.stringify({ id: "chatcmpl-1", choices: [{ delta: { role: "assistant" } }] }),
              JSON.stringify({ id: "chatcmpl-1", choices: [{ delta: { content: "pong" } }] }),
            ],
          },
        }],
      }),
    };

    act(() => {
      root.render(<ChannelTestRunDetail run={openaiRun} l={(zh) => zh} />);
    });

    expect(document.body.textContent).toContain("SSE 数据流");
    expect(document.body.textContent).toContain("chatcmpl-1");
    expect(document.body.textContent).toContain("role");
    expect(document.body.textContent).toContain("content");
  });
});
