import type {
  DistributionTarget,
  RuntimeFlags,
  RuntimeFlagsInput,
  TargetUpsertInput,
  Workspace,
  WorkspaceCreateInput,
} from "../types";

import { invokeCommand } from "./tauriClient";

export const workspaceService = {
  list(): Promise<Workspace[]> {
    return invokeCommand("workspace_list");
  },

  create(input: WorkspaceCreateInput): Promise<Workspace> {
    return invokeCommand("workspace_create", { input });
  },

  activate(id: string): Promise<Workspace> {
    return invokeCommand("workspace_activate", { input: { id } });
  },

  getRuntimeFlags(): Promise<RuntimeFlags> {
    return invokeCommand("runtime_flags_get");
  },

  updateRuntimeFlags(input: RuntimeFlagsInput): Promise<RuntimeFlags> {
    return invokeCommand("runtime_flags_update", { input });
  },

  listTargets(workspaceId: string): Promise<DistributionTarget[]> {
    return invokeCommand("target_list", { workspaceId });
  },

  upsertTarget(input: TargetUpsertInput): Promise<DistributionTarget> {
    return invokeCommand("target_upsert", { input });
  },
};
