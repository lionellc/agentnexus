export type Localize = (zh: string, en: string) => string;

const REPORT_TEXT: Record<string, string> = {
  "中转/反代候选": "Relay/proxy candidate",
  "直连候选": "Direct candidate",
  "反代候选": "Proxy candidate",
  "未知": "Unknown",
  "疑似模型被改写": "Suspected model rewrite",
  "响应模型字段一致": "Response model matches",
  "无法通过响应模型字段判断": "Cannot determine from response model",
  "请求模型与响应模型字段不一致，这是模型被路由或改写的强证据。":
    "The requested model differs from the response model, which is strong evidence of routing or rewriting.",
  "响应模型字段一致，但不能证明中转没有改写模型；中转可能回填或伪造该字段。":
    "The response model matches, but this does not prove the relay did not rewrite it; a relay may backfill or spoof this field.",
  "响应没有模型字段，不能默认认为中转未改写模型。":
    "The response has no model field, so model rewriting cannot be ruled out.",
  "真实账号池": "Real account pool",
  "真实额度来源": "Real quota source",
  "中转出口网络路径": "Relay egress path",
  "中转完整请求改写": "Full relay request rewriting",
  "本报告只基于客户端可见证据。": "This report is based only on client-visible evidence.",
  "本报告只基于客户端可见证据。候选上游和号池迹象是归因推断，不等于中转侧或上游账单证明。":
    "This report is based only on client-visible evidence. Upstream and account-pool signals are attribution inferences, not proof from relay-side or upstream billing.",
  "响应模型字段": "Response model field",
  "HTTP 状态": "HTTP status",
  "usage 字段": "usage field",
  "响应未返回 usage，可能是上游缺失或中转归一化": "The response did not include usage; it may be missing upstream or normalized by the relay.",
  "已观测到 SSE 事件到达时间": "SSE event arrival time observed",
  "客户端观测边界": "Client observation boundary",
  "无法仅凭客户端请求证明真实账号池、额度来源或中转出口路径":
    "Client requests alone cannot prove the real account pool, quota source, or relay egress path.",
  "没有足够客户端证据归因上游": "Not enough client-side evidence to attribute the upstream.",
  "模型字段": "Model field",
  "Header 组合": "Header combination",
  "完成耗时": "Completion latency",
  "稳定": "Stable",
  "相对稳定": "Relatively stable",
  "分簇": "Clustered",
  "波动明显": "High variance",
  "耗时波动只能作为辅助信号，不能单独证明多路由。":
    "Latency variance is only a supporting signal and cannot prove multi-route behavior by itself.",
  "疑似多路由/负载均衡/号池分发": "Possible multi-route/load-balancing/account-pool distribution",
  "未发现明显分簇": "No obvious clustering found",
  "这是基于客户端可见响应头、模型字段和请求表现的行为推断，不是账号池证明。":
    "This is a behavioral inference from client-visible headers, model fields, and request behavior, not proof of an account pool.",
  "采样结果未发现明显分簇；这不能证明没有中转或号池。":
    "Sampling did not find obvious clustering; this does not prove there is no relay or account pool.",
  "Base URL 不是当前协议官方域名": "Base URL is not an official domain for the current protocol",
  "Base URL 不是官方域名": "Base URL is not an official domain",
  "响应非空": "Non-empty response",
  "错误 JSON": "Error JSON",
  "结束原因": "Stop reason",
  "模型改写检测": "Model rewrite check",
  "响应模型字段一致；这不证明中转没有改写模型。":
    "The response model matches; this does not prove the relay did not rewrite the model.",
  "官方 API 候选": "Official API candidate",
  "host 匹配官方 API 域名": "Host matches an official API domain",
  "host 匹配官方 API 域名候选": "Host matches an official API domain candidate",
  "host 不是当前协议的官方 API 域名": "Host is not an official API domain for the current protocol",
  "baseUrl host 无法解析": "baseUrl host could not be parsed",
  "响应头包含代理或网关线索": "Response headers contain proxy or gateway signals",
  "响应头包含 via/x-cache/cf-ray 等代理线索": "Response headers contain proxy signals such as via/x-cache/cf-ray",
  "代理响应头线索": "Proxy response header signals",
  "响应包含 server/via/x-cache/cf-ray 等代理或网关线索": "The response contains proxy or gateway signals such as server/via/x-cache/cf-ray",
  "响应包含 usage，可用于观察 provider 形态": "The response includes usage, which can help observe provider shape.",
  "错误体摘要": "Error body summary",
  "流式事件": "Streaming event",
  "协议": "Protocol",
  "请求模型": "Request model",
  "缺失": "Missing",
  "OpenRouter 类路由候选": "OpenRouter-like routing candidate",
  "host 或响应体出现 OpenRouter 线索": "OpenRouter signal appears in the host or response body",
  "AWS Bedrock 类候选": "AWS Bedrock-like candidate",
  "响应形态出现 Bedrock Converse 类字段": "Response shape contains Bedrock Converse-like fields",
  "Google Vertex 类候选": "Google Vertex-like candidate",
  "响应形态出现 Vertex/Gemini 类字段": "Response shape contains Vertex/Gemini-like fields",
  "这是基于 baseUrl 和响应头的候选判断；透明反代可能无法被普通请求可靠识别。":
    "This is a candidate judgment based on baseUrl and response headers; transparent proxies may not be reliably identifiable from normal requests.",
  "疑似模型被改写：": "Suspected model rewrite:",
  "响应缺少模型字段，无法判断是否改写；请求模型:": "The response is missing the model field, so rewriting cannot be determined; request model:",
};

export function translateReportText(value: string, l: Localize) {
  return l(value, REPORT_TEXT[value] ?? translateDynamicReportText(value));
}

export function translateReportList(values: string[], l: Localize) {
  return values.map((value) => translateReportText(value, l));
}

function translateDynamicReportText(value: string) {
  const modelRewriteMatch = value.match(/^疑似模型被改写：请求 (.+)，响应 (.+)$/);
  if (modelRewriteMatch) {
    return `Suspected model rewrite: request ${modelRewriteMatch[1]}, response ${modelRewriteMatch[2]}`;
  }
  const missingModelMatch = value.match(/^响应缺少模型字段，无法判断是否改写；请求模型: (.+)$/);
  if (missingModelMatch) {
    return `The response is missing the model field, so rewriting cannot be determined; request model: ${missingModelMatch[1]}`;
  }
  return value;
}
