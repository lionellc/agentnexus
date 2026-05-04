import { Tag } from "@douyinfe/semi-ui-19";
import type { ReactNode } from "react";

import type { ChannelApiTestRunItem, ChannelChainAttributionReport } from "../../../shared/types";
import { categoryLabel, formatDuration, metricLabel, statusLabel, statusTone } from "../utils/format";
import { translateReportText } from "../utils/reportI18n";
import { ChannelAttributionPanel } from "./ChannelAttributionPanel";
import { ReportBadge } from "./ReportBadge";

type ChannelTestRunDetailProps = {
  run: ChannelApiTestRunItem;
  l: (zh: string, en: string) => string;
};

export function ChannelTestRunDetail({ run, l }: ChannelTestRunDetailProps) {
  const conversation = parseConversation(run.conversationJson);
  const metrics = parseMetrics(run.conversationJson);
  const bedrock = parseBedrockDetails(run.conversationJson);
  const diagnostics = parseConnectionDiagnostics(run.conversationJson);
  const attribution = parseAttributionReport(run.conversationJson);
  return (
    <div className="min-w-0 max-w-full space-y-4 overflow-hidden bg-muted/30 p-4 text-sm">
      <div className="grid gap-3 lg:grid-cols-3">
        <DetailBlock title={l("请求摘要", "Request Summary")}>
          <div>{l("协议", "Protocol")}：{run.protocol}</div>
          <div>Base URL：{run.baseUrlDisplay}</div>
          <div>{l("题型", "Case Type")}：{l(categoryLabel(run.category), categoryEnglishLabel(run.category))}</div>
          <div>{l("题目", "Case")}：{run.caseId}</div>
        </DetailBlock>
        <DetailBlock title={l("响应摘要", "Response Summary")}>
          <div>{l("状态", "Status")}：{l(statusLabel(run.status), statusEnglishLabel(run.status))}</div>
          <div>HTTP：{run.httpStatus ?? "-"}</div>
          <div>
            {l(metricLabel(run.firstMetricKind), firstMetricEnglishLabel(run.firstMetricKind))}：{formatDuration(run.firstTokenMs)}
          </div>
        </DetailBlock>
        <DetailBlock title={l("错误信息", "Error")}>
          <div className="break-words">{run.errorReason || run.rawErrorExcerpt || l("无", "None")}</div>
        </DetailBlock>
      </div>

      {run.rounds.length > 0 ? (
        <DetailBlock title={l("连续追问明细", "Follow-up Rounds")}>
          <div className="space-y-2">
            {run.rounds.map((round) => (
              <div key={round.id} className="rounded-md border border-border bg-card p-3">
                <div className="mb-1 flex items-center gap-2">
                  <Tag color={statusTone(round.status)}>{l(statusLabel(round.status), statusEnglishLabel(round.status))}</Tag>
                  <span>{round.id}</span>
                  <span>{formatDuration(round.totalDurationMs)}</span>
                  <span>
                    {l(metricLabel(round.firstMetricKind), firstMetricEnglishLabel(round.firstMetricKind))} {formatDuration(round.firstTokenMs)}
                  </span>
                </div>
                <div className="text-muted-foreground">{l("问", "Q")}：{round.promptPreview}</div>
                <div className="mt-1 break-words">{l("答", "A")}：{round.responsePreview || round.errorReason || "-"}</div>
              </div>
            ))}
          </div>
        </DetailBlock>
      ) : null}

      {bedrock ? <BedrockDetailBlock details={bedrock} l={l} /> : null}

      <DetailBlock title={l("检查项", "Checks")}>
        <div className="flex min-w-0 max-w-full flex-wrap gap-2 overflow-hidden">
          {run.checks.map((check) => (
            <ReportBadge key={check.id} tone={checkBadgeTone(check.status)}>
              {translateReportText(check.label, l)}{check.detail ? `: ${translateReportText(check.detail, l)}` : ""}
            </ReportBadge>
          ))}
        </div>
      </DetailBlock>

      <DetailBlock title={l("响应体", "Response Body")}>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-background p-3 text-xs">
          {run.responseText || run.responseJsonExcerpt || "-"}
        </pre>
      </DetailBlock>

      <DetailBlock title={l("本次调用全链路", "Actual Call Trace")}>
        <div className="space-y-3">
          <TracePanel title={l("实际请求体", "Actual Request Body")} badge={conversation?.requests?.length ? String(conversation.requests.length) : undefined}>
            <JsonCodeBlock value={conversation?.requests?.[0] ?? conversation?.messages ?? null} />
          </TracePanel>
          <TracePanel title={run.stream ? l("响应过程 / SSE 数据流", "Response Process / SSE Stream") : l("响应过程", "Response Process")} badge={streamEventCount(conversation, bedrock)}>
            <StreamTrace conversation={conversation} bedrock={bedrock} l={l} />
          </TracePanel>
          <TracePanel title={l("实际响应体", "Actual Response Body")}>
            <JsonCodeBlock value={conversation?.responses?.[0]?.raw ?? conversation?.responses?.[0] ?? run.responseJsonExcerpt ?? run.responseText ?? null} />
          </TracePanel>
        </div>
      </DetailBlock>

      {metrics.length > 0 ? (
        <DetailBlock title={l("耗时分解", "Timing Breakdown")}>
          <div className="overflow-auto rounded-md border border-border bg-background">
            <table className="w-full table-fixed text-left text-xs">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">{l("轮次", "Round")}</th>
                  <th className="px-3 py-2">{l("响应头", "Headers")}</th>
                  <th className="px-3 py-2">{l("首个 SSE", "First SSE")}</th>
                  <th className="px-3 py-2">{l("首个文本", "First Text")}</th>
                  <th className="px-3 py-2">Bedrock latency</th>
                  <th className="px-3 py-2">{l("完成", "Complete")}</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((item) => (
                  <tr key={item.round} className="border-b border-border last:border-b-0">
                    <td className="break-words px-3 py-2">{item.round}</td>
                    <td className="break-words px-3 py-2">{formatDuration(item.httpHeadersMs)}</td>
                    <td className="break-words px-3 py-2">{formatDuration(item.firstSseEventMs)}</td>
                    <td className="break-words px-3 py-2">{formatDuration(item.firstTextDeltaMs)}</td>
                    <td className="break-words px-3 py-2">{formatDuration(item.bedrockLatencyMs)}</td>
                    <td className="break-words px-3 py-2">{formatDuration(item.completedMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DetailBlock>
      ) : null}

      <DetailBlock title={l("链路归因", "Chain Attribution")}>
        <ChannelAttributionPanel report={attribution} legacyDiagnostics={diagnostics} l={l} />
      </DetailBlock>

      <DetailBlock title={l("对账说明", "Reconciliation Notes")}>
        <div className="space-y-1">
          <div>{l("AgentNexus 的输入/输出优先使用响应 usage；没有 usage 时回退为字符数，所以会和后台 token 统计不同。", "AgentNexus uses response usage for input/output first; when usage is missing it falls back to character counts, so it can differ from backend token statistics.")}</div>
          <div>{l("流式请求的“首字”是首个非空增量文本到达时间；“首个 SSE”更接近网关后台的首包口径。", "For streaming requests, first token is the first non-empty text delta arrival time; first SSE is closer to a gateway first-packet metric.")}</div>
          <div>{l("后台如果按原始网关日志展示，时间、缓存命中、usage 字段和输出口径都可能与本地测试摘要不同。", "If the backend displays raw gateway logs, timing, cache hits, usage fields, and output metrics may differ from the local test summary.")}</div>
          {run.protocol === "bedrock" ? (
            <div>{l("Bedrock latency 是 AWS metadata 返回的云端口径，本地完成耗时是客户端观察口径，二者不能直接相减当作网络耗时。", "Bedrock latency is the AWS metadata latency, while local completion duration is observed by the client; do not subtract them as network latency.")}</div>
          ) : null}
        </div>
      </DetailBlock>

      <DetailBlock title={l("完整对话 JSON", "Full Conversation JSON")}>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-background p-3 text-xs">
          {formatJson(run.conversationJson) || "-"}
        </pre>
      </DetailBlock>
    </div>
  );
}

function categoryEnglishLabel(category: ChannelApiTestRunItem["category"]) {
  switch (category) {
    case "small":
      return "Small";
    case "medium":
      return "Medium";
    case "large":
      return "Large";
    case "followup":
      return "Follow-up";
    default:
      return category;
  }
}

function statusEnglishLabel(status: ChannelApiTestRunItem["status"]) {
  switch (status) {
    case "success":
      return "Success";
    case "partial_failed":
      return "Partial failed";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

function firstMetricEnglishLabel(kind: ChannelApiTestRunItem["firstMetricKind"]) {
  return kind === "first_token" ? "First token" : "First response";
}

function checkBadgeTone(status: string) {
  if (status === "pass") return "success";
  if (status === "warn") return "warning";
  return "danger";
}

function formatJson(value?: string | null) {
  if (!value) {
    return "";
  }
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

type TimingMetric = {
  round: number;
  httpHeadersMs?: number | null;
  firstSseEventMs?: number | null;
  firstTextDeltaMs?: number | null;
  bedrockLatencyMs?: number | null;
  completedMs?: number | null;
};

type ConversationResponse = {
  httpStatus?: number | null;
  model?: string | null;
  text?: string | null;
  usage?: unknown;
  finishReason?: string | null;
  firstMetricKind?: string;
  firstTokenMs?: number | null;
  errorReason?: string | null;
  raw?: unknown;
};

type ConversationJson = {
  messages?: unknown[];
  requests?: unknown[];
  responses?: ConversationResponse[];
};

type BedrockDetails = {
  firstEventMs?: number | null;
  firstTextDeltaMs?: number | null;
  latencyMs?: number | null;
  usage?: unknown;
  stopReason?: string | null;
  eventCounts?: Record<string, number>;
  timeline?: Array<{ index?: number; type?: string; observedMs?: number | null }>;
  streamException?: string | null;
  eventSamples?: Array<{ type?: string; payload?: unknown }>;
};

type ConnectionDiagnostics = {
  connectionType: string;
  baseUrlHost?: string | null;
  officialHostCandidate?: boolean;
  proxyHeaderCandidate?: boolean;
  headers: unknown[];
  reasons: string[];
  note: string;
};

function parseMetrics(value?: string | null): TimingMetric[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as { metrics?: TimingMetric[] };
    return Array.isArray(parsed.metrics) ? parsed.metrics : [];
  } catch {
    return [];
  }
}

function parseConversation(value?: string | null): ConversationJson | null {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as ConversationJson;
  } catch {
    return null;
  }
}

function parseConnectionDiagnostics(value?: string | null): ConnectionDiagnostics | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as { connectionDiagnostics?: ConnectionDiagnostics };
    return parsed.connectionDiagnostics ?? null;
  } catch {
    return null;
  }
}

function parseAttributionReport(value?: string | null): ChannelChainAttributionReport | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as { attributionReport?: ChannelChainAttributionReport };
    return parsed.attributionReport ?? null;
  } catch {
    return null;
  }
}

function parseBedrockDetails(value?: string | null): BedrockDetails | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as { bedrock?: BedrockDetails | null };
    return parsed.bedrock ?? null;
  } catch {
    return null;
  }
}

function BedrockDetailBlock({ details, l }: { details: BedrockDetails; l: (zh: string, en: string) => string }) {
  const eventCounts = details.eventCounts
    ? Object.entries(details.eventCounts).map(([key, value]) => `${key}: ${value}`).join("；")
    : "-";
  return (
    <DetailBlock title="Bedrock Converse Stream">
      <div className="space-y-3">
        <div className="grid gap-2 md:grid-cols-3">
          <MetricItem label={l("首个 event", "First event")} value={formatDuration(details.firstEventMs)} />
          <MetricItem label={l("首个文本", "First text")} value={formatDuration(details.firstTextDeltaMs)} />
          <MetricItem label="Bedrock latency" value={formatDuration(details.latencyMs)} />
          <MetricItem label={l("结束原因", "Stop reason")} value={details.stopReason || "-"} />
          <MetricItem label="Usage" value={formatCompactJson(details.usage)} />
          <MetricItem label={l("事件计数", "Event counts")} value={eventCounts} />
        </div>
        {details.timeline?.length ? (
          <div className="overflow-auto rounded-md border border-border bg-background">
            <table className="w-full table-fixed text-left text-xs">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Event</th>
                  <th className="px-3 py-2">Observed</th>
                </tr>
              </thead>
              <tbody>
                {details.timeline.map((item, index) => (
                  <tr key={`${item.index ?? index}-${item.type ?? "event"}`} className="border-b border-border last:border-b-0">
                    <td className="break-words px-3 py-2">{item.index ?? index + 1}</td>
                    <td className="break-words px-3 py-2">{item.type || "-"}</td>
                    <td className="break-words px-3 py-2">{formatDuration(item.observedMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {details.streamException ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive">
            {details.streamException}
          </div>
        ) : null}
      </div>
    </DetailBlock>
  );
}

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-foreground">{value}</div>
    </div>
  );
}

function formatCompactJson(value: unknown) {
  if (value == null) {
    return "-";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function TracePanel({ title, badge, children }: { title: string; badge?: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-md border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="font-medium text-foreground">{title}</span>
        {badge ? <Tag color="blue">{badge}</Tag> : null}
      </div>
      <div>{children}</div>
    </section>
  );
}

function JsonCodeBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-96 overflow-auto whitespace-pre-wrap bg-neutral-950 p-4 font-mono text-xs leading-relaxed text-neutral-100">
      {formatUnknownJson(value)}
    </pre>
  );
}

function StreamTrace({ conversation, bedrock, l }: { conversation: ConversationJson | null; bedrock: BedrockDetails | null; l: (zh: string, en: string) => string }) {
  const events = buildStreamEvents(conversation, bedrock);
  if (!events.length) {
    return <div className="p-3 text-muted-foreground">{l("没有记录到流式事件。", "No streaming events recorded.")}</div>;
  }
  return (
    <div className="divide-y divide-border">
      {events.map((event, index) => (
        <details key={`${event.type}-${index}`} className="group">
          <summary className="flex cursor-pointer items-center gap-3 px-3 py-3">
            <Tag color="grey">#{index + 1}</Tag>
            <span className="min-w-0 flex-1 break-words font-medium text-foreground">{event.id || event.type}</span>
            <span className="text-muted-foreground">{event.type}</span>
            {typeof event.observedMs === "number" ? <span className="text-muted-foreground">{formatDuration(event.observedMs)}</span> : null}
          </summary>
          <JsonCodeBlock value={event.payload} />
        </details>
      ))}
    </div>
  );
}

function buildStreamEvents(conversation: ConversationJson | null, bedrock: BedrockDetails | null) {
  if (bedrock?.eventSamples?.length) {
    return bedrock.eventSamples.map((event, index) => ({
      id: event.type,
      type: event.type || "event",
      observedMs: bedrock.timeline?.[index]?.observedMs,
      payload: event.payload,
    }));
  }
  const raw = conversation?.responses?.[0]?.raw as { streamEvents?: unknown[] } | undefined;
  if (Array.isArray(raw?.streamEvents)) {
    return raw.streamEvents.map((event, index) => {
      const parsed = parsePossibleJson(event);
      return {
        id: eventId(parsed) || `event-${index + 1}`,
        type: eventType(parsed),
        observedMs: undefined,
        payload: parsed,
      };
    });
  }
  return [];
}

function streamEventCount(conversation: ConversationJson | null, bedrock: BedrockDetails | null) {
  const count = bedrock?.eventSamples?.length
    ?? ((conversation?.responses?.[0]?.raw as { streamEvents?: unknown[] } | undefined)?.streamEvents?.length);
  return typeof count === "number" ? String(count) : undefined;
}

function parsePossibleJson(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function eventId(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const object = value as Record<string, unknown>;
  return stringValue(object.id) || stringValue(object.messageId) || stringValue(object["message_id"]);
}

function eventType(value: unknown) {
  if (!value || typeof value !== "object") {
    return "event";
  }
  const object = value as Record<string, unknown>;
  if (typeof object.type === "string") return object.type;
  if (Array.isArray(object.choices)) {
    const first = object.choices[0] as { delta?: Record<string, unknown>; finish_reason?: unknown } | undefined;
    if (typeof first?.finish_reason === "string") return "finish";
    if (first?.delta?.role) return "role";
    if (first?.delta?.content) return "content";
  }
  return "event";
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function formatUnknownJson(value: unknown) {
  if (value == null) {
    return "-";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 font-medium text-foreground">{title}</h3>
      <div className="text-muted-foreground">{children}</div>
    </section>
  );
}
