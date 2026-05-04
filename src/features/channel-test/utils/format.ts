import type {
  ChannelApiTestCategory,
  ChannelApiTestFirstMetricKind,
  ChannelApiTestProtocol,
  ChannelApiTestRunMode,
  ChannelApiTestSizeSource,
  ChannelApiTestStatus,
} from "../../../shared/types";

export function formatDuration(ms?: number | null) {
  if (ms == null) {
    return "-";
  }
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)} s`;
  }
  return `${ms} ms`;
}

export function metricLabel(kind: ChannelApiTestFirstMetricKind) {
  return kind === "first_token" ? "首字" : "首响应";
}

export function sizeSourceLabel(source: ChannelApiTestSizeSource) {
  return source === "usage" ? "usage" : "字符";
}

export function protocolLabel(protocol: ChannelApiTestProtocol) {
  switch (protocol) {
    case "anthropic":
      return "Anthropic";
    case "bedrock":
      return "Bedrock";
    case "openai":
    default:
      return "OpenAI";
  }
}

export function categoryLabel(category: ChannelApiTestCategory) {
  switch (category) {
    case "small":
      return "小请求";
    case "medium":
      return "中等请求";
    case "large":
      return "大请求";
    case "followup":
      return "连续追问型";
    default:
      return category;
  }
}

export function runModeLabel(mode?: ChannelApiTestRunMode) {
  switch (mode) {
    case "diagnostic":
      return "探针";
    case "sampling":
      return "采样";
    case "standard":
    default:
      return "测试";
  }
}

export function runModeTone(mode?: ChannelApiTestRunMode) {
  switch (mode) {
    case "diagnostic":
      return "orange";
    case "sampling":
      return "purple";
    case "standard":
    default:
      return "blue";
  }
}

export function statusLabel(status: ChannelApiTestStatus) {
  switch (status) {
    case "success":
      return "成功";
    case "partial_failed":
      return "部分失败";
    case "failed":
      return "失败";
    default:
      return status;
  }
}

export function statusTone(status: ChannelApiTestStatus) {
  if (status === "success") {
    return "green";
  }
  if (status === "partial_failed") {
    return "orange";
  }
  return "red";
}
