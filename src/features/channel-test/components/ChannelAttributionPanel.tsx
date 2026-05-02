import type { ChannelChainAttributionReport, ChannelChainEvidenceLevel } from "../../../shared/types";
import { translateReportList, translateReportText, type Localize } from "../utils/reportI18n";
import { ReportBadge } from "./ReportBadge";

type ConnectionDiagnostics = {
  connectionType: string;
  baseUrlHost?: string | null;
  officialHostCandidate?: boolean;
  proxyHeaderCandidate?: boolean;
  headers: unknown[];
  reasons: string[];
  note: string;
};

type ChannelAttributionPanelProps = {
  report?: ChannelChainAttributionReport | null;
  legacyDiagnostics?: ConnectionDiagnostics | null;
  l: Localize;
};

type SamplingDetails = {
  summary?: {
    label?: string;
    note?: string;
    dimensions?: Array<{
      name: string;
      status: string;
      distinctCount?: number;
      spreadMs?: number;
      note?: string;
    }>;
  };
  items?: Array<{
    sample: number;
    httpStatus?: number | null;
    responseModel?: string | null;
    server?: string | null;
    xCache?: string | null;
    requestId?: string | null;
    ratelimit?: string | null;
    firstTokenMs?: number | null;
    completedMs?: number | null;
    errorReason?: string | null;
  }>;
};

type ProbeDetails = Array<{
  id: string;
  label: string;
  httpStatus?: number | null;
  responseModel?: string | null;
  errorReason?: string | null;
  errorFingerprint?: {
    type?: string | null;
    code?: string | null;
    param?: string | null;
    message?: string | null;
  };
}>;

export function ChannelAttributionPanel({ report, legacyDiagnostics, l }: ChannelAttributionPanelProps) {
  if (report) {
    return (
      <div className="min-w-0 max-w-full space-y-3 overflow-hidden">
        <div className="flex min-w-0 max-w-full flex-wrap gap-2 overflow-hidden">
          <ReportBadge tone="info">{translateReportText(report.summary, l)}</ReportBadge>
          <ReportBadge tone={report.modelRewrite.status === "suspected_rewrite" ? "warning" : "success"}>
            {translateReportText(report.modelRewrite.label, l)}
          </ReportBadge>
        </div>
        <div className="rounded-md border border-border bg-background p-3">
          <div className="mb-1 font-medium text-foreground">{l("模型改写检测", "Model Rewrite Check")}</div>
          <div>{translateReportText(report.modelRewrite.note, l)}</div>
          <div className="mt-1 text-xs">
            {l("请求", "Request")}：{report.modelRewrite.requestModel || "-"}；{l("响应", "Response")}：{report.modelRewrite.responseModel || "-"}
          </div>
        </div>
        <div className="overflow-auto rounded-md border border-border bg-background">
          <table className="w-full table-fixed text-left text-xs">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="w-1/4 px-3 py-2">{l("候选", "Candidate")}</th>
                <th className="w-24 px-3 py-2">{l("置信度", "Confidence")}</th>
                <th className="px-3 py-2">{l("证据", "Evidence")}</th>
              </tr>
            </thead>
            <tbody>
              {report.candidates.map((candidate) => (
                <tr key={candidate.id} className="border-b border-border last:border-b-0">
                  <td className="break-words px-3 py-2">{translateReportText(candidate.label, l)}</td>
                  <td className="break-words px-3 py-2">{candidate.confidence}%</td>
                  <td className="break-words px-3 py-2">{translateReportList(candidate.reasons, l).join("；") || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="overflow-auto rounded-md border border-border bg-background">
          <table className="w-full table-fixed text-left text-xs">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="w-36 px-3 py-2">{l("等级", "Level")}</th>
                <th className="w-1/4 px-3 py-2">{l("证据", "Evidence")}</th>
                <th className="px-3 py-2">{l("详情", "Details")}</th>
              </tr>
            </thead>
            <tbody>
              {report.evidences.map((evidence) => (
                <tr key={evidence.id} className="border-b border-border last:border-b-0">
                  <td className="break-words px-3 py-2">
                    <ReportBadge tone={evidenceLevelTone(evidence.level)}>{evidenceLevelLabel(evidence.level, l)}</ReportBadge>
                  </td>
                  <td className="break-words px-3 py-2">{translateReportText(evidence.label, l)}</td>
                  <td className="break-words px-3 py-2">{translateReportText(evidence.detail, l)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <SamplingSection samples={asSamplingDetails(report.samples)} l={l} />
        <ProbeSection details={asProbeDetails(report.samples)} l={l} />
        <div className="rounded-md border border-border bg-background p-3 text-xs">
          <div className="mb-1 font-medium text-foreground">{l("客户端不可判断", "Client-side Unverifiable")}</div>
          <div>{translateReportList(report.unverifiableItems, l).join("、")}</div>
          <div className="mt-1">{translateReportText(report.note, l)}</div>
        </div>
      </div>
    );
  }

  if (!legacyDiagnostics) {
    return <div>{l("暂无链路归因数据", "No chain attribution data")}</div>;
  }

  return (
    <div className="min-w-0 max-w-full space-y-2 overflow-hidden">
      <div className="flex min-w-0 max-w-full flex-wrap gap-2 overflow-hidden">
        <ReportBadge tone={legacyDiagnostics.connectionType === "proxy_candidate" ? "warning" : "success"}>
          {connectionTypeLabel(legacyDiagnostics.connectionType, l)}
        </ReportBadge>
        <ReportBadge>Host: {legacyDiagnostics.baseUrlHost || "-"}</ReportBadge>
        {legacyDiagnostics.officialHostCandidate ? (
          <ReportBadge tone="success">{l("官方域名候选", "Official domain candidate")}</ReportBadge>
        ) : (
          <ReportBadge tone="warning">{l("非官方域名", "Non-official domain")}</ReportBadge>
        )}
        {legacyDiagnostics.proxyHeaderCandidate ? <ReportBadge tone="warning">{l("代理头线索", "Proxy header signal")}</ReportBadge> : null}
      </div>
      <div className="space-y-1">
        {legacyDiagnostics.reasons.map((reason) => (
          <div key={reason}>{translateReportText(reason, l)}</div>
        ))}
      </div>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-background p-3 text-xs">
        {JSON.stringify(legacyDiagnostics.headers, null, 2)}
      </pre>
      <div>{translateReportText(legacyDiagnostics.note, l)}</div>
    </div>
  );
}

function SamplingSection({ samples, l }: { samples: SamplingDetails | null; l: Localize }) {
  if (!samples) {
    return null;
  }
  return (
    <div className="space-y-2">
      <div className="rounded-md border border-border bg-background p-3">
        <div className="mb-1 font-medium text-foreground">{l("采样稳定性", "Sampling Stability")}</div>
        <div>{samples.summary?.label ? translateReportText(samples.summary.label, l) : "-"}</div>
        <div className="mt-1 text-xs">{samples.summary?.note ? translateReportText(samples.summary.note, l) : ""}</div>
      </div>
      {samples.summary?.dimensions?.length ? (
        <div className="overflow-auto rounded-md border border-border bg-background">
          <table className="w-full table-fixed text-left text-xs">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="w-1/4 px-3 py-2">{l("维度", "Dimension")}</th>
                <th className="w-32 px-3 py-2">{l("判断", "Judgment")}</th>
                <th className="px-3 py-2">{l("细节", "Details")}</th>
              </tr>
            </thead>
            <tbody>
              {samples.summary.dimensions.map((item) => (
                <tr key={item.name} className="border-b border-border last:border-b-0">
                  <td className="break-words px-3 py-2">{translateReportText(item.name, l)}</td>
                  <td className="break-words px-3 py-2">
                    <ReportBadge tone={item.status === "分簇" || item.status === "波动明显" ? "warning" : "success"}>
                      {translateReportText(item.status, l)}
                    </ReportBadge>
                  </td>
                  <td className="break-words px-3 py-2">
                    {typeof item.distinctCount === "number" ? l(`${item.distinctCount} 类`, `${item.distinctCount} classes`) : null}
                    {typeof item.spreadMs === "number" ? l(`最大差 ${formatMs(item.spreadMs)}`, `Max spread ${formatMs(item.spreadMs)}`) : null}
                    {item.note ? ` ${translateReportText(item.note, l)}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {samples.items?.length ? (
        <div className="overflow-auto rounded-md border border-border bg-background">
          <table className="w-full table-fixed text-left text-xs">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{l("样本", "Sample")}</th>
                <th className="px-3 py-2">HTTP</th>
                <th className="px-3 py-2">{l("模型", "Model")}</th>
                <th className="px-3 py-2">Server</th>
                <th className="px-3 py-2">Cache</th>
                <th className="px-3 py-2">Request ID</th>
                <th className="px-3 py-2">{l("首字/完成", "First/Complete")}</th>
                <th className="px-3 py-2">{l("错误", "Error")}</th>
              </tr>
            </thead>
            <tbody>
              {samples.items.map((item) => (
                <tr key={item.sample} className="border-b border-border last:border-b-0">
                  <td className="break-words px-3 py-2">{item.sample}</td>
                  <td className="break-words px-3 py-2">{item.httpStatus ?? "-"}</td>
                  <td className="break-words px-3 py-2">{item.responseModel || "-"}</td>
                  <td className="break-words px-3 py-2">{item.server || "-"}</td>
                  <td className="break-words px-3 py-2">{item.xCache || "-"}</td>
                  <td className="break-words px-3 py-2">{shorten(item.requestId)}</td>
                  <td className="break-words px-3 py-2">{formatMs(item.firstTokenMs)} / {formatMs(item.completedMs)}</td>
                  <td className="break-words px-3 py-2">{item.errorReason ? translateReportText(item.errorReason, l) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function ProbeSection({ details, l }: { details: ProbeDetails | null; l: Localize }) {
  if (!details?.length) {
    return null;
  }
  return (
    <div className="overflow-auto rounded-md border border-border bg-background">
      <table className="w-full table-fixed text-left text-xs">
        <thead className="border-b border-border text-muted-foreground">
          <tr>
            <th className="px-3 py-2">{l("探针", "Probe")}</th>
            <th className="px-3 py-2">HTTP</th>
            <th className="px-3 py-2">{l("响应模型", "Response Model")}</th>
            <th className="px-3 py-2">{l("错误指纹", "Error Fingerprint")}</th>
          </tr>
        </thead>
        <tbody>
          {details.map((item) => (
            <tr key={item.id} className="border-b border-border last:border-b-0">
              <td className="break-words px-3 py-2">{translateReportText(item.label, l)}</td>
              <td className="break-words px-3 py-2">{item.httpStatus ?? "-"}</td>
              <td className="break-words px-3 py-2">{item.responseModel || "-"}</td>
              <td className="break-words px-3 py-2">
                {[
                  item.errorFingerprint?.type,
                  item.errorFingerprint?.code,
                  item.errorFingerprint?.param,
                  item.errorFingerprint?.message || item.errorReason,
                ].filter(Boolean).join(" / ") || "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function evidenceLevelLabel(value: ChannelChainEvidenceLevel, l: Localize) {
  const labels: Record<ChannelChainEvidenceLevel, [string, string]> = {
    observed_fact: ["已观测事实", "Observed fact"],
    strong_inference: ["强推断", "Strong inference"],
    weak_inference: ["弱推断", "Weak inference"],
    unknown: ["不确定", "Unknown"],
    client_unverifiable: ["客户端不可判断", "Client-side unverifiable"],
  };
  const label = labels[value];
  return label ? l(label[0], label[1]) : value;
}

function evidenceLevelTone(value: ChannelChainEvidenceLevel) {
  if (value === "observed_fact") return "success";
  if (value === "strong_inference" || value === "weak_inference") return "warning";
  if (value === "client_unverifiable") return "danger";
  return "neutral";
}

function connectionTypeLabel(value: string, l: Localize) {
  if (value === "official_direct_candidate") {
    return l("直连候选", "Direct candidate");
  }
  if (value === "proxy_candidate") {
    return l("反代候选", "Proxy candidate");
  }
  return l("未知", "Unknown");
}

function asSamplingDetails(value: unknown): SamplingDetails | null {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return null;
  }
  const candidate = value as SamplingDetails;
  return Array.isArray(candidate.items) ? candidate : null;
}

function asProbeDetails(value: unknown): ProbeDetails | null {
  return Array.isArray(value) ? (value as ProbeDetails) : null;
}

function formatMs(value?: number | null) {
  if (typeof value !== "number") {
    return "-";
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} s`;
  }
  return `${value} ms`;
}

function shorten(value?: string | null) {
  if (!value) {
    return "-";
  }
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}
