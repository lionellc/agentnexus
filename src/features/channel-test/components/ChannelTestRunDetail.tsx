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
  const metrics = parseMetrics(run.conversationJson);
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
  completedMs?: number | null;
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

function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 font-medium text-foreground">{title}</h3>
      <div className="text-muted-foreground">{children}</div>
    </section>
  );
}
