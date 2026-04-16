import { Fragment, type ReactElement } from "react";

import { useAgentsModuleController } from "./useAgentsModuleController";

type AgentsModuleProps = {
  agentsCenter: ReactElement;
  agentVersionDialog: ReactElement;
  agentRuleEditorDialog: ReactElement;
  agentDistributionDialog: ReactElement;
};

export function AgentsModule({
  agentsCenter,
  agentVersionDialog,
  agentRuleEditorDialog,
  agentDistributionDialog,
}: AgentsModuleProps) {
  const { centerContent, dialogs } = useAgentsModuleController({
    agentsCenter,
    agentVersionDialog,
    agentRuleEditorDialog,
    agentDistributionDialog,
  });

  return (
    <>
      {centerContent}
      {dialogs.map((dialog, index) => (
        <Fragment key={`agents-module-dialog-${index}`}>
          {dialog}
        </Fragment>
      ))}
    </>
  );
}
