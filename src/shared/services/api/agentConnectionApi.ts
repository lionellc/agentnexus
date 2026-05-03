import type {
  AgentConnection,
  AgentConnectionDeleteInput,
  AgentConnectionPresetActionInput,
  AgentConnectionToggleInput,
  AgentConnectionUpsertInput,
  AgentRuleFilePreviewInput,
  AgentRuleFilePreviewResult,
} from "../../types";
import { invokeRaw } from "../tauriClient";

function mapAgentConnection(row: Record<string, unknown>): AgentConnection {
  return {
    id: String(row.id ?? ""),
    workspaceId: String(row.workspaceId ?? row.workspace_id ?? ""),
    platform: String(row.agentType ?? row.agent_type ?? ""),
    rootDir: String(row.rootDir ?? row.root_dir ?? ""),
    ruleFile: String(row.ruleFile ?? row.rule_file ?? ""),
    rootDirSource: String(row.rootDirSource ?? row.root_dir_source ?? "inferred"),
    ruleFileSource: String(row.ruleFileSource ?? row.rule_file_source ?? "inferred"),
    detectionStatus: String(row.detectionStatus ?? row.detection_status ?? "undetected"),
    detectedAt:
      row.detectedAt === null || row.detectedAt === undefined
        ? row.detected_at === null || row.detected_at === undefined
          ? null
          : String(row.detected_at)
        : String(row.detectedAt),
    skillSearchDirs: Array.isArray(row.skillSearchDirs ?? row.skill_search_dirs)
      ? ((row.skillSearchDirs ?? row.skill_search_dirs) as Array<Record<string, unknown>>).map((item, index) => ({
          path: String(item.path ?? ""),
          enabled: Boolean(item.enabled ?? true),
          priority: Number(item.priority ?? index),
          source: String(item.source ?? "inferred"),
        }))
      : [],
    enabled: Boolean(row.enabled ?? true),
    resolvedPath:
      row.resolvedPath === null || row.resolvedPath === undefined ? null : String(row.resolvedPath),
    createdAt: String(row.createdAt ?? row.created_at ?? ""),
    updatedAt: String(row.updatedAt ?? row.updated_at ?? ""),
  };
}

export const agentConnectionApi = {
  list: async (_workspaceId?: string): Promise<AgentConnection[]> => {
    const rows = await invokeRaw<Array<Record<string, unknown>>>("agent_connection_list");
    return (rows ?? []).map(mapAgentConnection);
  },
  upsert: async (input: AgentConnectionUpsertInput): Promise<AgentConnection> => {
    const row = await invokeRaw<Record<string, unknown>>("agent_connection_upsert", {
      input: {
        agentType: input.platform,
        rootDir: input.rootDir,
        ruleFile: input.ruleFile ?? "",
        rootDirSource: input.rootDirSource ?? "manual",
        ruleFileSource: input.ruleFileSource ?? "manual",
        detectionStatus: input.detectionStatus,
        skillSearchDirs: input.skillSearchDirs?.map((item, index) => ({
          path: item.path,
          enabled: item.enabled,
          priority: item.priority ?? index,
          source: item.source ?? "manual",
        })),
        enabled: input.enabled ?? true,
      },
    });
    return mapAgentConnection(row);
  },
  toggle: async (input: AgentConnectionToggleInput): Promise<AgentConnection> => {
    const row = await invokeRaw<Record<string, unknown>>("agent_connection_toggle", {
      input: {
        agentType: input.platform,
        enabled: input.enabled,
      },
    });
    return mapAgentConnection(row);
  },
  delete: async (input: AgentConnectionDeleteInput): Promise<AgentConnection[]> => {
    const rows = await invokeRaw<Array<Record<string, unknown>>>("agent_connection_delete", {
      input: {
        agentType: input.platform,
      },
    });
    return (rows ?? []).map(mapAgentConnection);
  },
  redetect: async (input: AgentConnectionPresetActionInput): Promise<AgentConnection> => {
    const row = await invokeRaw<Record<string, unknown>>("agent_connection_redetect", {
      input: {
        agentType: input.platform,
      },
    });
    return mapAgentConnection(row);
  },
  restoreDefaults: async (input: AgentConnectionPresetActionInput): Promise<AgentConnection> => {
    const row = await invokeRaw<Record<string, unknown>>("agent_connection_restore_defaults", {
      input: {
        agentType: input.platform,
      },
    });
    return mapAgentConnection(row);
  },
  preview: async (input: AgentRuleFilePreviewInput): Promise<AgentRuleFilePreviewResult> => {
    const row = await invokeRaw<Record<string, unknown>>("agent_connection_preview", {
      input: {
        agentType: input.platform,
      },
    });
    const status = String(row.status ?? "");
    const content = typeof row.content === "string" ? row.content : "";
    return {
      workspaceId: "",
      platform: input.platform,
      rootDir: "",
      resolvedPath: String(row.resolvedPath ?? row.resolved_path ?? ""),
      exists: status === "ok",
      content,
      contentHash: "",
    };
  },
};
