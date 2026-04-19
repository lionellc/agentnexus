// @ts-nocheck
import { createWorkbenchAgentConnectionActions } from "./agentConnectionActions";
import { createWorkbenchDistributionStorageActions } from "./distributionStorageActions";

export function createWorkbenchSettingsDataActions(args: any) {
  const distributionStorageActions = createWorkbenchDistributionStorageActions(args);
  const agentConnectionActions = createWorkbenchAgentConnectionActions(args);

  return {
    ...distributionStorageActions,
    ...agentConnectionActions,
  };
}
