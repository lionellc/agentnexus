import { useMemo, type ReactElement } from "react";

type UsePromptsModuleControllerInput = {
  promptDetailView: "list" | "detail";
  promptCenter: ReactElement;
  promptDetail: ReactElement;
  createPromptDialog: ReactElement;
  promptRunDialog: ReactElement;
  promptVersionDialog: ReactElement;
};

export function usePromptsModuleController({
  promptDetailView,
  promptCenter,
  promptDetail,
  createPromptDialog,
  promptRunDialog,
  promptVersionDialog,
}: UsePromptsModuleControllerInput) {
  const centerContent = useMemo(
    () => (promptDetailView === "detail" ? promptDetail : promptCenter),
    [promptDetailView, promptDetail, promptCenter],
  );

  return {
    centerContent,
    createPromptDialog,
    promptRunDialog,
    promptVersionDialog,
  };
}
