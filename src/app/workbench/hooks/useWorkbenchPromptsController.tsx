import { useMemo } from "react";
import type { ReactElement } from "react";

import { PromptsModule } from "../../../features/prompts/module/PromptsModule";

type UseWorkbenchPromptsControllerInput = {
  promptDetailView: "list" | "detail";
  promptCenter: ReactElement;
  promptDetail: ReactElement;
  createPromptDialog: ReactElement;
  promptRunDialog: ReactElement;
  promptVersionDialog: ReactElement;
};

export function useWorkbenchPromptsController({
  promptDetailView,
  promptCenter,
  promptDetail,
  createPromptDialog,
  promptRunDialog,
  promptVersionDialog,
}: UseWorkbenchPromptsControllerInput) {
  const module = useMemo(
    () => (
      <PromptsModule
        promptDetailView={promptDetailView}
        promptCenter={promptCenter}
        promptDetail={promptDetail}
        createPromptDialog={createPromptDialog}
        promptRunDialog={promptRunDialog}
        promptVersionDialog={promptVersionDialog}
      />
    ),
    [
      createPromptDialog,
      promptCenter,
      promptDetail,
      promptDetailView,
      promptRunDialog,
      promptVersionDialog,
    ],
  );

  return {
    module,
  };
}
