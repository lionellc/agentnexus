import { create } from "zustand";

import { agentRulesApi } from "../services/api";
import { TauriClientError } from "../services/tauriClient";
import type {
  AgentRuleAuditEvent,
  AgentRuleDistributionJob,
  AgentRuleDistributionRunInput,
  AgentRuleDraft,
  AgentRuleRelease,
} from "../types";

const LANGUAGE_STORAGE_KEY = "agentnexus.app.language";

function isEnglishLanguage(): boolean {
  try {
    const language = globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY)?.trim()?.toLowerCase() ?? "";
    return language === "en" || language.startsWith("en-");
  } catch {
    return false;
  }
}

function message(zh: string, en: string): string {
  return isEnglishLanguage() ? en : zh;
}

const EMPTY_DRAFT: AgentRuleDraft = {
  content: "",
  contentHash: "",
  updatedAt: "",
};

type AgentRuleConnection = {
  id: string;
  workspaceId: string;
  agentType: string;
  rootDir: string;
  ruleFile?: string;
  enabled: boolean;
  resolvedPath?: string | null;
  updatedAt?: string;
};

type AgentRuleTag = {
  id?: string;
  assetId?: string;
  workspaceId?: string;
  agentType: string;
  status: string;
  filePath?: string;
  expectedHash?: string;
  actualHash?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

type AgentRuleAsset = {
  id: string;
  workspaceId: string;
  name: string;
  latestVersion?: string;
  latestContentHash?: string;
  latestContent?: string;
  createdAt?: string;
  updatedAt?: string;
  tags?: AgentRuleTag[];
  [key: string]: unknown;
};

type AgentRuleVersion = {
  id?: string;
  assetId: string;
  version: string;
  content?: string;
  contentHash?: string;
  createdAt?: string;
  [key: string]: unknown;
};

type AgentRuleApplyJob = {
  id: string;
  workspaceId: string;
  assetId?: string;
  status: string;
  mode?: string;
  retryOfJobId?: string | null;
  createdAt?: string;
  records?: unknown[];
  [key: string]: unknown;
};

type AgentRulesState = {
  assets: AgentRuleAsset[];
  tagsByAsset: Record<string, AgentRuleTag[]>;
  versionsByAsset: Record<string, AgentRuleVersion[]>;
  applyJobs: AgentRuleApplyJob[];
  connections: AgentRuleConnection[];
  draft: AgentRuleDraft;
  releases: AgentRuleRelease[];
  distributionJobs: AgentRuleDistributionJob[];
  audits: AgentRuleAuditEvent[];
  lastActionError: string | null;
  loadingAssets: boolean;
  loadingVersions: boolean;
  loadingJobs: boolean;
  loadingConnections: boolean;
  loadingDraft: boolean;
  loadingReleases: boolean;
  loadingDistribution: boolean;
  loadingAudits: boolean;
  savingDraft: boolean;
  selectedAssetId: string | null;
  selectedReleaseVersion: string | null;
  loadModuleData: (workspaceId: string) => Promise<void>;
  loadAssets: (workspaceId: string) => Promise<void>;
  createAsset: (workspaceId: string, name: string, content: string) => Promise<AgentRuleAsset>;
  renameAsset: (workspaceId: string, assetId: string, name: string) => Promise<AgentRuleAsset>;
  deleteAsset: (workspaceId: string, assetId: string) => Promise<void>;
  publishVersion: (assetId: string, content: string) => Promise<AgentRuleVersion>;
  loadVersions: (assetId: string) => Promise<void>;
  rollbackVersion: (assetId: string, version: string) => Promise<AgentRuleVersion>;
  runApply: (workspaceId: string, assetId: string, agentTypes?: string[]) => Promise<AgentRuleApplyJob>;
  retryFailed: (jobId: string) => Promise<AgentRuleApplyJob>;
  refreshAsset: (workspaceId: string, assetId: string) => Promise<AgentRuleApplyJob | null>;
  loadConnections: (workspaceId: string) => Promise<void>;
  loadDraft: (workspaceId: string) => Promise<void>;
  saveDraft: (workspaceId: string, content: string) => Promise<void>;
  loadReleases: (workspaceId: string) => Promise<void>;
  createRelease: (input: { workspaceId: string; title: string; notes?: string }) => Promise<AgentRuleRelease>;
  rollbackRelease: (input: { workspaceId: string; releaseVersion: string }) => Promise<AgentRuleRelease>;
  loadDistributionJobs: (workspaceId: string, limit?: number) => Promise<void>;
  runDistribution: (input: AgentRuleDistributionRunInput) => Promise<AgentRuleDistributionJob>;
  retryFailedTargets: (input: { jobId: string }) => Promise<AgentRuleDistributionJob>;
  detectDrift: (input: { workspaceId: string; targetIds?: string[] }) => Promise<AgentRuleDistributionJob>;
  loadAudits: (workspaceId: string, limit?: number) => Promise<void>;
  setSelectedAssetId: (assetId: string | null) => void;
  setSelectedReleaseVersion: (releaseVersion: string | null) => void;
  clearError: () => void;
};

function toErrorMessage(error: unknown): string {
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

function isAgentDocNotFound(error: unknown): boolean {
  if (error instanceof TauriClientError) {
    return error.code === "AGENT_DOC_NOT_FOUND";
  }
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    return record.code === "AGENT_DOC_NOT_FOUND";
  }
  return false;
}

async function callAgentApi<T>(methodNames: string[], ...args: unknown[]): Promise<T> {
  const api = agentRulesApi as unknown as Record<string, (...methodArgs: unknown[]) => Promise<T>>;
  for (const name of methodNames) {
    const fn = api[name];
    if (typeof fn === "function") {
      return fn(...args);
    }
  }
  throw new Error(`agentRulesApi method unavailable: ${methodNames.join("/")}`);
}

function normalizeAsset(raw: Record<string, unknown>): AgentRuleAsset {
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

function normalizeVersion(assetId: string, raw: Record<string, unknown>): AgentRuleVersion {
  return {
    ...raw,
    assetId,
    version: String(raw.version ?? ""),
    content: typeof raw.content === "string" ? raw.content : "",
    contentHash: String(raw.contentHash ?? raw.content_hash ?? ""),
    createdAt: String(raw.createdAt ?? raw.created_at ?? ""),
  };
}

function normalizeApplyJob(raw: Record<string, unknown>): AgentRuleApplyJob {
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
    retryOfJobId: (raw.retryOfJobId as string | null | undefined) ?? (raw.retry_of_job_id as string | null | undefined) ?? null,
    createdAt: String(raw.createdAt ?? raw.created_at ?? ""),
    records,
  };
}

function jobToDistributionJob(job: AgentRuleApplyJob): AgentRuleDistributionJob {
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

function patchAssetTags(
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

function upsertJob(list: AgentRuleApplyJob[], job: AgentRuleApplyJob): AgentRuleApplyJob[] {
  return [job, ...list.filter((item) => item.id !== job.id)];
}

function toLegacyRelease(asset: AgentRuleAsset): AgentRuleRelease {
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

export const useAgentRulesStore = create<AgentRulesState>((set, get) => ({
  assets: [],
  tagsByAsset: {},
  versionsByAsset: {},
  applyJobs: [],
  connections: [],
  draft: EMPTY_DRAFT,
  releases: [],
  distributionJobs: [],
  audits: [],
  lastActionError: null,
  loadingAssets: false,
  loadingVersions: false,
  loadingJobs: false,
  loadingConnections: false,
  loadingDraft: false,
  loadingReleases: false,
  loadingDistribution: false,
  loadingAudits: false,
  savingDraft: false,
  selectedAssetId: null,
  selectedReleaseVersion: null,

  loadModuleData: async (workspaceId) => {
    set({ lastActionError: null });
    await Promise.all([
      get().loadAssets(workspaceId),
      get().loadConnections(workspaceId),
      get().loadDistributionJobs(workspaceId),
      get().loadAudits(workspaceId, 50),
    ]);
  },

  loadAssets: async (workspaceId) => {
    set({ loadingAssets: true, loadingReleases: true, lastActionError: null });
    try {
      const list = await callAgentApi<unknown[]>(["listAssets", "assetList"], workspaceId);
      const assets = (Array.isArray(list) ? list : []).map((item) => normalizeAsset((item ?? {}) as Record<string, unknown>));
      const selectedAssetId = get().selectedAssetId ?? assets[0]?.id ?? null;
      const releases = assets.map(toLegacyRelease);
      const selectedReleaseVersion =
        get().selectedReleaseVersion ?? releases[0]?.version ?? null;
      const tagsByAsset = assets.reduce<Record<string, AgentRuleTag[]>>((acc, asset) => {
        acc[asset.id] = asset.tags ?? [];
        return acc;
      }, {});
      set({ assets, tagsByAsset, selectedAssetId, releases, selectedReleaseVersion });

      const selected = assets.find((item) => item.id === selectedAssetId) ?? assets[0];
      if (selected) {
        set({
          draft: {
            content: selected.latestContent ?? "",
            contentHash: selected.latestContentHash ?? "",
            updatedAt: selected.updatedAt ?? "",
          },
        });
      }
    } catch (error) {
      set({ lastActionError: toErrorMessage(error) });
      throw error;
    } finally {
      set({ loadingAssets: false, loadingReleases: false });
    }
  },

  createAsset: async (workspaceId, name, content) => {
    set({ lastActionError: null });
    try {
      const created = normalizeAsset(
        (await callAgentApi<Record<string, unknown>>(["createAsset", "assetCreate"], {
          workspaceId,
          name,
          content,
        })) ?? {},
      );
      set((state) => {
        const assets = [created, ...state.assets.filter((item) => item.id !== created.id)];
        const releases = assets.map(toLegacyRelease);
        return {
          assets,
          releases,
          selectedAssetId: created.id,
          selectedReleaseVersion: created.latestVersion ?? state.selectedReleaseVersion,
          draft: {
            content: created.latestContent ?? content,
            contentHash: created.latestContentHash ?? "",
            updatedAt: created.updatedAt ?? "",
          },
          tagsByAsset: {
            ...state.tagsByAsset,
            [created.id]: created.tags ?? [],
          },
        };
      });
      return created;
    } catch (error) {
      set({ lastActionError: toErrorMessage(error) });
      throw error;
    }
  },

  renameAsset: async (workspaceId, assetId, name) => {
    set({ lastActionError: null });
    try {
      const renamed = normalizeAsset(
        (await callAgentApi<Record<string, unknown>>(["renameAsset", "assetRename"], {
          workspaceId,
          assetId,
          name,
        })) ?? {},
      );
      set((state) => {
        const assets = state.assets.map((item) => (item.id === assetId ? { ...item, ...renamed } : item));
        const releases = assets.map(toLegacyRelease);
        return {
          assets,
          releases,
        };
      });
      return renamed;
    } catch (error) {
      set({ lastActionError: toErrorMessage(error) });
      throw error;
    }
  },

  deleteAsset: async (workspaceId, assetId) => {
    set({ lastActionError: null });
    try {
      await callAgentApi<void>(["deleteAsset", "assetDelete"], {
        workspaceId,
        assetId,
      });
      set((state) => {
        const assets = state.assets.filter((item) => item.id !== assetId);
        const releases = assets.map(toLegacyRelease);
        const nextSelectedAssetId =
          state.selectedAssetId === assetId
            ? (assets[0]?.id ?? null)
            : state.selectedAssetId;
        const nextSelectedAsset =
          assets.find((item) => item.id === nextSelectedAssetId) ?? null;
        const { [assetId]: _removedTags, ...tagsByAsset } = state.tagsByAsset;
        const { [assetId]: _removedVersions, ...versionsByAsset } =
          state.versionsByAsset;
        return {
          assets,
          releases,
          tagsByAsset,
          versionsByAsset,
          selectedAssetId: nextSelectedAssetId,
          selectedReleaseVersion:
            nextSelectedAsset?.latestVersion ??
            (releases[0]?.version ?? null),
          draft: nextSelectedAsset
            ? {
                content: nextSelectedAsset.latestContent ?? "",
                contentHash: nextSelectedAsset.latestContentHash ?? "",
                updatedAt: nextSelectedAsset.updatedAt ?? "",
              }
            : EMPTY_DRAFT,
        };
      });
    } catch (error) {
      set({ lastActionError: toErrorMessage(error) });
      throw error;
    }
  },

  publishVersion: async (assetId, content) => {
    set({ lastActionError: null });
    try {
      const version = normalizeVersion(
        assetId,
        (await callAgentApi<Record<string, unknown>>(["publishVersion", "assetPublishVersion"], {
          assetId,
          content,
        })) ?? {},
      );
      set((state) => {
        const versions = [version, ...(state.versionsByAsset[assetId] ?? []).filter((item) => item.version !== version.version)];
        const nextVersions = { ...state.versionsByAsset, [assetId]: versions };
        const assets = state.assets.map((asset) =>
          asset.id === assetId
            ? {
                ...asset,
                latestVersion: version.version,
                latestContent: version.content ?? content,
                latestContentHash: version.contentHash ?? asset.latestContentHash,
                updatedAt: version.createdAt ?? asset.updatedAt,
              }
            : asset,
        );
        const releases = assets.map(toLegacyRelease);
        return {
          versionsByAsset: nextVersions,
          assets,
          releases,
          selectedReleaseVersion:
            state.selectedAssetId === assetId ? version.version : state.selectedReleaseVersion,
          draft:
            state.selectedAssetId === assetId
              ? {
                  content: version.content ?? content,
                  contentHash: version.contentHash ?? "",
                  updatedAt: version.createdAt ?? "",
                }
              : state.draft,
        };
      });
      return version;
    } catch (error) {
      set({ lastActionError: toErrorMessage(error) });
      throw error;
    }
  },

  loadVersions: async (assetId) => {
    set({ loadingVersions: true, lastActionError: null });
    try {
      const list = await callAgentApi<unknown[]>(["listVersions", "assetListVersions"], assetId);
      const versions = (Array.isArray(list) ? list : []).map((item) => normalizeVersion(assetId, (item ?? {}) as Record<string, unknown>));
      set((state) => ({ versionsByAsset: { ...state.versionsByAsset, [assetId]: versions } }));
    } catch (error) {
      set({ lastActionError: toErrorMessage(error) });
      throw error;
    } finally {
      set({ loadingVersions: false });
    }
  },

  rollbackVersion: async (assetId, version) => {
    set({ lastActionError: null });
    try {
      const rolled = normalizeVersion(
        assetId,
        (await callAgentApi<Record<string, unknown>>(["rollbackVersion", "assetRollbackVersion"], {
          assetId,
          version,
        })) ?? {},
      );
      await get().loadVersions(assetId);
      set((state) => {
        const assets = state.assets.map((asset) =>
          asset.id === assetId
            ? {
                ...asset,
                latestVersion: rolled.version,
                latestContent: rolled.content ?? asset.latestContent,
                latestContentHash: rolled.contentHash ?? asset.latestContentHash,
                updatedAt: rolled.createdAt ?? asset.updatedAt,
              }
            : asset,
        );
        const releases = assets.map(toLegacyRelease);
        return {
          assets,
          releases,
          selectedReleaseVersion:
            state.selectedAssetId === assetId ? rolled.version : state.selectedReleaseVersion,
        };
      });
      return rolled;
    } catch (error) {
      set({ lastActionError: toErrorMessage(error) });
      throw error;
    }
  },

  runApply: async (workspaceId, assetId, agentTypes) => {
    set({ lastActionError: null });
    try {
      const job = normalizeApplyJob(
        (await callAgentApi<Record<string, unknown>>(["runApply", "applyRun"], {
          workspaceId,
          assetId,
          agentTypes,
        })) ?? {},
      );
      set((state) => ({
        applyJobs: upsertJob(state.applyJobs, job),
        distributionJobs: upsertJob(state.applyJobs, job).map(jobToDistributionJob),
      }));
      return job;
    } catch (error) {
      set({ lastActionError: toErrorMessage(error) });
      throw error;
    }
  },

  retryFailed: async (jobId) => {
    set({ lastActionError: null });
    try {
      const job = normalizeApplyJob(
        (await callAgentApi<Record<string, unknown>>(["retryFailed", "applyRetryFailed"], {
          jobId,
        })) ?? {},
      );
      set((state) => ({
        applyJobs: upsertJob(state.applyJobs, job),
        distributionJobs: upsertJob(state.applyJobs, job).map(jobToDistributionJob),
      }));
      return job;
    } catch (error) {
      set({ lastActionError: toErrorMessage(error) });
      throw error;
    }
  },

  refreshAsset: async (workspaceId, assetId) => {
    set({ lastActionError: null });
    try {
      const response =
        (await callAgentApi<Record<string, unknown> | AgentRuleTag[]>(["refreshAsset", "assetRefresh", "detectDrift"], {
          workspaceId,
          assetId,
        })) ?? {};
      const result = Array.isArray(response) ? ({ tags: response } as Record<string, unknown>) : response;
      const tagsInput = Array.isArray(result.tags) ? (result.tags as AgentRuleTag[]) : [];
      const tags = tagsInput.map((tag) => ({
        ...tag,
        agentType: String(tag.agentType ?? tag.agent_type ?? ""),
        status: String(tag.status ?? tag.driftStatus ?? tag.drift_status ?? "unknown"),
        filePath: String(tag.filePath ?? tag.resolvedPath ?? tag.resolved_path ?? ""),
        updatedAt: String(tag.updatedAt ?? tag.lastCheckedAt ?? tag.last_checked_at ?? ""),
      }));
      let job: AgentRuleApplyJob | null = null;
      if (result.id) {
        job = normalizeApplyJob(result);
      }
      set((state) => {
        const tagsByAsset = { ...state.tagsByAsset, [assetId]: tags };
        const patched = patchAssetTags(state.assets, tagsByAsset, assetId);
        if (!job) {
          return patched;
        }
        const applyJobs = upsertJob(state.applyJobs, job);
        return {
          ...patched,
          applyJobs,
          distributionJobs: applyJobs.map(jobToDistributionJob),
        };
      });
      return job;
    } catch (error) {
      set({ lastActionError: toErrorMessage(error) });
      throw error;
    }
  },

  loadConnections: async (workspaceId) => {
    set({ loadingConnections: true, lastActionError: null });
    try {
      const list = await callAgentApi<unknown[]>(["listConnections", "connectionList"], workspaceId);
      const connections = (Array.isArray(list) ? list : []).map((item) => {
        const row = (item ?? {}) as Record<string, unknown>;
        return {
          ...row,
          id: String(row.id ?? ""),
          workspaceId: String(row.workspaceId ?? row.workspace_id ?? ""),
          agentType: String(row.agentType ?? row.agent_type ?? row.platform ?? ""),
          rootDir: String(row.rootDir ?? row.root_dir ?? ""),
          ruleFile: String(row.ruleFile ?? row.rule_file ?? ""),
          enabled: Boolean(row.enabled ?? true),
          resolvedPath:
            row.resolvedPath === null || row.resolvedPath === undefined
              ? null
              : String(row.resolvedPath),
          updatedAt: String(row.updatedAt ?? row.updated_at ?? ""),
        } as AgentRuleConnection;
      });
      set({ connections });
    } catch (error) {
      set({ lastActionError: toErrorMessage(error) });
      throw error;
    } finally {
      set({ loadingConnections: false });
    }
  },

  loadDraft: async (workspaceId) => {
    try {
      await get().loadAssets(workspaceId);
    } catch (error) {
      if (isAgentDocNotFound(error)) {
        set({ draft: EMPTY_DRAFT });
        return;
      }
      set({ lastActionError: toErrorMessage(error) });
    }
  },

  saveDraft: async (workspaceId, content) => {
    set({ savingDraft: true, lastActionError: null });
    try {
      const selectedAssetId = get().selectedAssetId;
      if (!selectedAssetId) {
        const created = await get().createAsset(workspaceId, message("未命名规则", "Untitled Rule"), content);
        set({ selectedAssetId: created.id });
      } else {
        await get().publishVersion(selectedAssetId, content);
      }
    } catch (error) {
      set({ lastActionError: toErrorMessage(error) });
      throw error;
    } finally {
      set({ savingDraft: false });
    }
  },

  loadReleases: async (workspaceId) => {
    await get().loadAssets(workspaceId);
  },

  createRelease: async ({ workspaceId, title, notes }) => {
    const state = get();
    const content = state.draft.content || "";
    if (state.selectedAssetId) {
      const version = await state.publishVersion(
        state.selectedAssetId,
        content || notes || "",
      );
      const asset =
        get().assets.find((item) => item.id === state.selectedAssetId) ?? state.assets[0];
      return {
        id: state.selectedAssetId,
        workspaceId,
        version: version.version,
        title: asset?.name ?? title,
        notes: notes ?? "",
        contentHash: version.contentHash ?? "",
        active: true,
        createdAt: version.createdAt ?? "",
      };
    }

    const created = await get().createAsset(
      workspaceId,
      title,
      content || notes || "",
    );
    return toLegacyRelease(created);
  },

  rollbackRelease: async ({ workspaceId, releaseVersion }) => {
    const assetId = get().selectedAssetId;
    if (!assetId) {
      throw new Error(message("未选择规则资产", "No rule asset selected"));
    }
    const rolled = await get().rollbackVersion(assetId, releaseVersion);
    return {
      id: assetId,
      workspaceId,
      version: rolled.version,
      title: get().assets.find((item) => item.id === assetId)?.name ?? "",
      notes: "",
      contentHash: rolled.contentHash ?? "",
      active: true,
      createdAt: rolled.createdAt ?? "",
    };
  },

  loadDistributionJobs: async (workspaceId, limit = 20) => {
    set({ loadingJobs: true, loadingDistribution: true, lastActionError: null });
    try {
      const list = await callAgentApi<unknown[]>(["listApplyJobs", "applyStatus", "distribution_status"], workspaceId, limit);
      const jobs = (Array.isArray(list) ? list : []).map((item) => normalizeApplyJob((item ?? {}) as Record<string, unknown>));
      set({
        applyJobs: jobs,
        distributionJobs: jobs.map(jobToDistributionJob),
      });
    } catch (error) {
      set({ lastActionError: toErrorMessage(error) });
    } finally {
      set({ loadingJobs: false, loadingDistribution: false });
    }
  },

  runDistribution: async (input) => {
    const selectedAssetId = get().selectedAssetId;
    const assetId = selectedAssetId || input.releaseVersion;
    const job = await get().runApply(input.workspaceId, assetId, input.targetIds);
    return jobToDistributionJob(job);
  },

  retryFailedTargets: async ({ jobId }) => {
    const job = await get().retryFailed(jobId);
    return jobToDistributionJob(job);
  },

  detectDrift: async ({ workspaceId, targetIds }) => {
    const assetId = get().selectedAssetId;
    if (!assetId) {
      throw new Error(message("未选择规则资产", "No rule asset selected"));
    }
    const maybeJob = await get().refreshAsset(workspaceId, assetId);
    if (maybeJob) {
      return jobToDistributionJob(maybeJob);
    }
    return {
      id: `refresh-${assetId}`,
      workspaceId,
      releaseVersion: assetId,
      mode: "detect_drift",
      status: targetIds?.length ? "partial" : "refreshed",
      retryOfJobId: null,
      records: [],
      createdAt: new Date().toISOString(),
    };
  },

  loadAudits: async (workspaceId, limit = 50) => {
    set({ loadingAudits: true, lastActionError: null });
    try {
      const api = agentRulesApi as unknown as { queryAudit?: (input: { workspaceId?: string; limit?: number }) => Promise<AgentRuleAuditEvent[]> };
      const audits = api.queryAudit ? await api.queryAudit({ workspaceId, limit }) : [];
      set({ audits });
    } catch (error) {
      set({ lastActionError: toErrorMessage(error) });
    } finally {
      set({ loadingAudits: false });
    }
  },

  setSelectedAssetId: (selectedAssetId) => {
    const state = useAgentRulesStore.getState();
    const selected = state.assets.find((item) => item.id === selectedAssetId);
    set({
      selectedAssetId,
      selectedReleaseVersion: selected?.latestVersion ?? state.selectedReleaseVersion,
      draft: selected
        ? {
            content: selected.latestContent ?? "",
            contentHash: selected.latestContentHash ?? "",
            updatedAt: selected.updatedAt ?? "",
          }
        : state.draft,
    });
  },

  setSelectedReleaseVersion: (selectedReleaseVersion) => set({ selectedReleaseVersion }),
  clearError: () => set({ lastActionError: null }),
}));
