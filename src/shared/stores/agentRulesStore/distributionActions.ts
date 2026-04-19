import { agentRulesApi } from "../../services/api";

import {
  callAgentApi,
  jobToDistributionJob,
  message,
  normalizeApplyJob,
  patchAssetTags,
  toErrorMessage,
  upsertJob,
} from "./normalizers";
import type {
  AgentRuleApplyJob,
  AgentRuleConnection,
  AgentRuleTag,
  AgentRulesState,
  AgentRulesStoreGet,
  AgentRulesStoreSet,
} from "./types";

type AgentRuleDistributionActions = Pick<
  AgentRulesState,
  | "runApply"
  | "retryFailed"
  | "refreshAsset"
  | "loadConnections"
  | "loadDistributionJobs"
  | "runDistribution"
  | "retryFailedTargets"
  | "detectDrift"
  | "loadAudits"
>;

export function createAgentRuleDistributionActions(
  set: AgentRulesStoreSet,
  get: AgentRulesStoreGet,
): AgentRuleDistributionActions {
  return {
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
        set((state) => {
          const applyJobs = upsertJob(state.applyJobs, job);
          return {
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

    retryFailed: async (jobId) => {
      set({ lastActionError: null });
      try {
        const job = normalizeApplyJob(
          (await callAgentApi<Record<string, unknown>>(["retryFailed", "applyRetryFailed"], {
            jobId,
          })) ?? {},
        );
        set((state) => {
          const applyJobs = upsertJob(state.applyJobs, job);
          return {
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

    refreshAsset: async (workspaceId, assetId) => {
      set({ lastActionError: null });
      try {
        const response =
          (await callAgentApi<Record<string, unknown> | AgentRuleTag[]>(
            ["refreshAsset", "assetRefresh", "detectDrift"],
            {
              workspaceId,
              assetId,
            },
          )) ?? {};
        const result = Array.isArray(response)
          ? ({ tags: response } as Record<string, unknown>)
          : response;
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

    loadDistributionJobs: async (workspaceId, limit = 20) => {
      set({ loadingJobs: true, loadingDistribution: true, lastActionError: null });
      try {
        const list = await callAgentApi<unknown[]>(
          ["listApplyJobs", "applyStatus", "distribution_status"],
          workspaceId,
          limit,
        );
        const jobs = (Array.isArray(list) ? list : []).map((item) =>
          normalizeApplyJob((item ?? {}) as Record<string, unknown>),
        );
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
        const api = agentRulesApi as unknown as {
          queryAudit?: (input: {
            workspaceId?: string;
            limit?: number;
          }) => Promise<AgentRulesState["audits"]>;
        };
        const audits = api.queryAudit ? await api.queryAudit({ workspaceId, limit }) : [];
        set({ audits });
      } catch (error) {
        set({ lastActionError: toErrorMessage(error) });
      } finally {
        set({ loadingAudits: false });
      }
    },
  };
}
