import type {
  AgentConnection,
  AgentConnectionDeleteInput,
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
    enabled: Boolean(row.enabled ?? true),
    resolvedPath:
      row.resolvedPath === null || row.resolvedPath === undefined ? null : String(row.resolvedPath),
    createdAt: String(row.createdAt ?? row.created_at ?? ""),
    updatedAt: String(row.updatedAt ?? row.updated_at ?? ""),
  };
}

export const agentConnectionApi = {
  list: async (workspaceId: string): Promise<AgentConnection[]> => {
    const rows = await invokeRaw<Array<Record<string, unknown>>>("agent_connection_list", { workspaceId });
    return (rows ?? []).map(mapAgentConnection);
  },
  upsert: async (input: AgentConnectionUpsertInput): Promise<AgentConnection> => {
    const row = await invokeRaw<Record<string, unknown>>("agent_connection_upsert", {
      input: {
        workspaceId: input.workspaceId,
        agentType: input.platform,
        rootDir: input.rootDir,
        ruleFile: input.ruleFile ?? "",
        enabled: input.enabled ?? true,
      },
    });
    return mapAgentConnection(row);
  },
  toggle: async (input: AgentConnectionToggleInput): Promise<AgentConnection> => {
    const row = await invokeRaw<Record<string, unknown>>("agent_connection_toggle", {
      input: {
        workspaceId: input.workspaceId,
        agentType: input.platform,
        enabled: input.enabled,
      },
    });
    return mapAgentConnection(row);
  },
  delete: async (input: AgentConnectionDeleteInput): Promise<AgentConnection[]> => {
    const rows = await invokeRaw<Array<Record<string, unknown>>>("agent_connection_delete", {
      input: {
        workspaceId: input.workspaceId,
        agentType: input.platform,
      },
    });
    return (rows ?? []).map(mapAgentConnection);
  },
  preview: async (input: AgentRuleFilePreviewInput): Promise<AgentRuleFilePreviewResult> => {
    const row = await invokeRaw<Record<string, unknown>>("agent_connection_preview", {
      input: {
        workspaceId: input.workspaceId,
        agentType: input.platform,
      },
    });
    const status = String(row.status ?? "");
    const content = typeof row.content === "string" ? row.content : "";
    return {
      workspaceId: input.workspaceId,
      platform: input.platform,
      rootDir: "",
      resolvedPath: String(row.resolvedPath ?? row.resolved_path ?? ""),
      exists: status === "ok",
      content,
      contentHash: "",
    };
  },
};
