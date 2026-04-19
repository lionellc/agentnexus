import { agentRulesApi } from "../../services/api";
import { TauriClientError } from "../../services/tauriClient";

import type {
  AgentRuleDistributionJob,
  AgentRuleDraft,
  AgentRuleRelease,
} from "../../types";
import type {
  AgentRuleApplyJob,
  AgentRuleAsset,
  AgentRuleTag,
  AgentRuleVersion,
} from "./types";

const LANGUAGE_STORAGE_KEY = "agentnexus.app.language";

function isEnglishLanguage(): boolean {
  try {
    const language = globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY)?.trim()?.toLowerCase() ?? "";
    return language === "en" || language.startsWith("en-");
  } catch {
    return false;
  }
}

export function message(zh: string, en: string): string {
  return isEnglishLanguage() ? en : zh;
}

export const EMPTY_DRAFT: AgentRuleDraft = {
  content: "",
  contentHash: "",
  updatedAt: "",
};

export function toErrorMessage(error: unknown): string {
  if (error instanceof TauriClientError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return message("未知错误", "Unknown error");
}

export function isAgentDocNotFound(error: unknown): boolean {
  if (error instanceof TauriClientError) {
    return error.code === "AGENT_DOC_NOT_FOUND";
  }
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    return record.code === "AGENT_DOC_NOT_FOUND";
  }
  return false;
}

export async function callAgentApi<T>(methodNames: string[], ...args: unknown[]): Promise<T> {
  const api = agentRulesApi as unknown as Record<string, (...methodArgs: unknown[]) => Promise<T>>;
  for (const name of methodNames) {
    const fn = api[name];
    if (typeof fn === "function") {
      return fn(...args);
    }
  }
  throw new Error(`agentRulesApi method unavailable: ${methodNames.join("/")}`);
}

export function normalizeAsset(raw: Record<string, unknown>): AgentRuleAsset {
  return {
    ...raw,
    id: String(raw.id ?? ""),
    workspaceId: String(raw.workspaceId ?? raw.workspace_id ?? ""),
    name: String(raw.name ?? ""),
    latestVersion: String(raw.latestVersion ?? raw.latest_version ?? ""),
    latestContentHash: String(raw.latestContentHash ?? raw.latest_content_hash ?? ""),
    latestContent:
      typeof raw.latestContent === "string"
        ? raw.latestContent
        : typeof raw.latest_content === "string"
          ? raw.latest_content
          : undefined,
    createdAt: String(raw.createdAt ?? raw.created_at ?? ""),
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? ""),
    tags: Array.isArray(raw.tags) ? (raw.tags as AgentRuleTag[]) : [],
  };
}

export function normalizeVersion(assetId: string, raw: Record<string, unknown>): AgentRuleVersion {
  return {
    ...raw,
    assetId,
    version: String(raw.version ?? ""),
    content: typeof raw.content === "string" ? raw.content : "",
    contentHash: String(raw.contentHash ?? raw.content_hash ?? ""),
    createdAt: String(raw.createdAt ?? raw.created_at ?? ""),
  };
}

export function normalizeApplyJob(raw: Record<string, unknown>): AgentRuleApplyJob {
  const records = Array.isArray(raw.records)
    ? raw.records
    : Array.isArray(raw.results)
      ? raw.results
      : [];
  return {
    ...raw,
    id: String(raw.id ?? ""),
    workspaceId: String(raw.workspaceId ?? raw.workspace_id ?? ""),
    assetId: String(raw.assetId ?? raw.asset_id ?? ""),
    status: String(raw.status ?? ""),
    mode: String(raw.mode ?? ""),
    retryOfJobId:
      (raw.retryOfJobId as string | null | undefined) ??
      (raw.retry_of_job_id as string | null | undefined) ??
      null,
    createdAt: String(raw.createdAt ?? raw.created_at ?? ""),
    records,
  };
}

export function jobToDistributionJob(job: AgentRuleApplyJob): AgentRuleDistributionJob {
  const records = Array.isArray(job.records) ? job.records : [];
  return {
    id: job.id,
    workspaceId: job.workspaceId,
    releaseVersion: job.assetId ?? "",
    mode: job.mode ?? "apply",
    status: job.status,
    retryOfJobId: job.retryOfJobId ?? null,
    records: records.map((raw) => {
      const row = (raw ?? {}) as Record<string, unknown>;
      return {
        id: String(row.id ?? ""),
        targetId: String(row.targetId ?? row.agentType ?? row.agent_type ?? ""),
        status: String(row.status ?? ""),
        message: String(row.message ?? ""),
        expectedHash: String(row.expectedHash ?? row.expected_hash ?? ""),
        actualHash: String(row.actualHash ?? row.actual_hash ?? ""),
        usedMode: String(row.usedMode ?? row.used_mode ?? job.mode ?? "apply"),
      };
    }),
    createdAt: job.createdAt ?? "",
  };
}

export function patchAssetTags(
  assets: AgentRuleAsset[],
  tagsByAsset: Record<string, AgentRuleTag[]>,
  assetId: string,
): { assets: AgentRuleAsset[]; tagsByAsset: Record<string, AgentRuleTag[]> } {
  const tags = tagsByAsset[assetId] ?? [];
  return {
    tagsByAsset,
    assets: assets.map((asset) => (asset.id === assetId ? { ...asset, tags } : asset)),
  };
}

export function upsertJob(list: AgentRuleApplyJob[], job: AgentRuleApplyJob): AgentRuleApplyJob[] {
  return [job, ...list.filter((item) => item.id !== job.id)];
}

export function toLegacyRelease(asset: AgentRuleAsset): AgentRuleRelease {
  return {
    id: asset.id,
    workspaceId: asset.workspaceId,
    version: asset.latestVersion ?? "",
    title: asset.name,
    notes: "",
    contentHash: asset.latestContentHash ?? "",
    active: true,
    createdAt: asset.updatedAt ?? asset.createdAt ?? "",
  };
}
