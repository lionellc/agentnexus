import { useMemo, type ReactElement } from "react";

type UseAgentsModuleControllerInput = {
  agentsCenter: ReactElement;
  agentVersionDialog: ReactElement;
  agentRuleEditorDialog: ReactElement;
  agentDistributionDialog: ReactElement;
  agentMappingPreviewDialog: ReactElement;
};

export function useAgentsModuleController({
  agentsCenter,
  agentVersionDialog,
  agentRuleEditorDialog,
  agentDistributionDialog,
  agentMappingPreviewDialog,
}: UseAgentsModuleControllerInput) {
  const centerContent = useMemo(() => agentsCenter, [agentsCenter]);
  const dialogs = useMemo(
    () => [agentVersionDialog, agentRuleEditorDialog, agentDistributionDialog, agentMappingPreviewDialog],
    [agentVersionDialog, agentRuleEditorDialog, agentDistributionDialog, agentMappingPreviewDialog],
  );

  return {
    centerContent,
    dialogs,
  };
}
