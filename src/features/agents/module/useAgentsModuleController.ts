import { useMemo, type ReactElement } from "react";

type UseAgentsModuleControllerInput = {
  agentsCenter: ReactElement;
  agentVersionDialog: ReactElement;
  agentRuleEditorDialog: ReactElement;
  agentDistributionDialog: ReactElement;
};

export function useAgentsModuleController({
  agentsCenter,
  agentVersionDialog,
  agentRuleEditorDialog,
  agentDistributionDialog,
}: UseAgentsModuleControllerInput) {
  const centerContent = useMemo(() => agentsCenter, [agentsCenter]);
  const dialogs = useMemo(
    () => [agentVersionDialog, agentRuleEditorDialog, agentDistributionDialog],
    [agentVersionDialog, agentRuleEditorDialog, agentDistributionDialog],
  );

  return {
    centerContent,
    dialogs,
  };
}
