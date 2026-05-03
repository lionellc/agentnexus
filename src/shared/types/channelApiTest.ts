export type ChannelApiTestProtocol = "openai" | "anthropic";
export type ChannelApiTestCategory = "small" | "medium" | "large" | "followup";
export type ChannelApiTestStatus = "success" | "failed" | "partial_failed";
export type ChannelApiTestRunMode = "standard" | "diagnostic" | "sampling";
export type ChannelApiTestFirstMetricKind = "first_token" | "first_response";
export type ChannelApiTestSizeSource = "usage" | "chars";
export type ChannelChainEvidenceLevel =
  | "observed_fact"
  | "strong_inference"
  | "weak_inference"
  | "unknown"
  | "client_unverifiable";

export interface ChannelApiTestMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChannelApiTestRoundInput {
  id: string;
  prompt: string;
}

export interface ChannelApiTestCase {
  id: string;
  workspaceId?: string;
  category: ChannelApiTestCategory;
  label: string;
  messages?: ChannelApiTestMessage[];
  rounds?: ChannelApiTestRoundInput[];
  createdAt?: string;
  updatedAt?: string;
}

export type ChannelApiTestCasesQueryInput = Record<string, never>;

export interface ChannelApiTestCaseUpsertInput {
  id?: string;
  category: ChannelApiTestCategory;
  label: string;
  messages?: ChannelApiTestMessage[];
  rounds?: ChannelApiTestRoundInput[];
}

export interface ChannelApiTestCaseDeleteInput {
  caseId: string;
}

export interface ChannelApiTestRunInput {
  protocol: ChannelApiTestProtocol;
  model: string;
  baseUrl: string;
  apiKey: string;
  stream: boolean;
  category: ChannelApiTestCategory;
  caseId: string;
  runMode?: ChannelApiTestRunMode;
  messages?: ChannelApiTestMessage[];
  rounds?: ChannelApiTestRoundInput[];
}

export interface ChannelApiTestRunsQueryInput {
  page: number;
  pageSize: number;
}

export interface ChannelApiTestCheck {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail?: string;
}

export interface ChannelApiTestRoundResult {
  id: string;
  status: ChannelApiTestStatus;
  totalDurationMs: number;
  firstTokenMs: number | null;
  firstMetricKind: ChannelApiTestFirstMetricKind;
  inputSize: number;
  inputSizeSource: ChannelApiTestSizeSource;
  outputSize: number;
  outputSizeSource: ChannelApiTestSizeSource;
  promptPreview: string;
  responsePreview: string;
  errorReason?: string | null;
}

export interface ChannelApiTestRunItem {
  id: string;
  workspaceId: string;
  startedAt: string;
  completedAt: string;
  protocol: ChannelApiTestProtocol;
  model: string;
  baseUrlDisplay: string;
  category: ChannelApiTestCategory;
  caseId: string;
  runMode?: ChannelApiTestRunMode;
  stream: boolean;
  status: ChannelApiTestStatus;
  errorReason?: string | null;
  httpStatus?: number | null;
  totalDurationMs: number;
  firstTokenMs?: number | null;
  firstMetricKind: ChannelApiTestFirstMetricKind;
  inputSize: number;
  inputSizeSource: ChannelApiTestSizeSource;
  outputSize: number;
  outputSizeSource: ChannelApiTestSizeSource;
  responseText?: string | null;
  responseJsonExcerpt?: string | null;
  rawErrorExcerpt?: string | null;
  usageJson?: string | null;
  conversationJson?: string | null;
  checks: ChannelApiTestCheck[];
  rounds: ChannelApiTestRoundResult[];
}

export interface ChannelApiTestRunsResult {
  items: ChannelApiTestRunItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ChannelChainEvidence {
  id: string;
  level: ChannelChainEvidenceLevel;
  label: string;
  detail: string;
}

export interface ChannelChainCandidate {
  id: string;
  label: string;
  confidence: number;
  confidenceLabel: "high" | "medium" | "low" | "unknown";
  reasons: string[];
  proven: boolean;
}

export interface ChannelModelRewriteReport {
  status: "same_field" | "suspected_rewrite" | "unknown";
  label: string;
  severity: "info" | "warn";
  requestModel: string;
  responseModel?: string | null;
  note: string;
}

export interface ChannelChainAttributionReport {
  version: number;
  summary: string;
  modelRewrite: ChannelModelRewriteReport;
  candidates: ChannelChainCandidate[];
  evidences: ChannelChainEvidence[];
  samples?: unknown;
  diagnosticDetails?: unknown;
  unverifiableItems: string[];
  note: string;
}
