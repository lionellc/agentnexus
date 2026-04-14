import { Fragment, type ReactElement } from "react";

import { useAgentsModuleController } from "./useAgentsModuleController";

type AgentsModuleProps = {
  agentsCenter: ReactElement;
  agentVersionDialog: ReactElement;
  agentRuleEditorDialog: ReactElement;
  agentDistributionDialog: ReactElement;
  agentMappingPreviewDialog: ReactElement;
};

export function AgentsModule({
  agentsCenter,
  agentVersionDialog,
  agentRuleEditorDialog,
  agentDistributionDialog,
  agentMappingPreviewDialog,
}: AgentsModuleProps) {
  const { centerContent, dialogs } = useAgentsModuleController({
    agentsCenter,
    agentVersionDialog,
    agentRuleEditorDialog,
    agentDistributionDialog,
    agentMappingPreviewDialog,
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
