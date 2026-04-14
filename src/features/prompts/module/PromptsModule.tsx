import type { ReactElement } from "react";

import { usePromptsModuleController } from "./usePromptsModuleController";

export function PromptsModule({
  promptDetailView,
  promptCenter,
  promptDetail,
  createPromptDialog,
  promptRunDialog,
  promptVersionDialog,
}: {
  promptDetailView: "list" | "detail";
  promptCenter: ReactElement;
  promptDetail: ReactElement;
  createPromptDialog: ReactElement;
  promptRunDialog: ReactElement;
  promptVersionDialog: ReactElement;
}) {
  const { centerContent, createPromptDialog: createDialog, promptRunDialog: runDialog, promptVersionDialog: versionDialog } =
    usePromptsModuleController({
      promptDetailView,
      promptCenter,
      promptDetail,
      createPromptDialog,
      promptRunDialog,
      promptVersionDialog,
    });

  return (
    <>
      {centerContent}
      {createDialog}
      {runDialog}
      {versionDialog}
    </>
  );
}
