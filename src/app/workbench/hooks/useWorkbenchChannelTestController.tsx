import { useMemo } from "react";

import { ChannelApiTestModule } from "../../../features/channel-test/module/ChannelApiTestModule";
import type { AppLanguage } from "../../../features/shell/types";

type UseWorkbenchChannelTestControllerInput = {
  l: (zh: string, en: string) => string;
  language: AppLanguage;
  activeWorkspaceId: string | null;
};

export function useWorkbenchChannelTestController({
  l,
  language,
  activeWorkspaceId,
}: UseWorkbenchChannelTestControllerInput) {
  const module = useMemo(
    () => <ChannelApiTestModule l={l} language={language} workspaceId={activeWorkspaceId} />,
    [activeWorkspaceId, l, language],
  );

  return { module };
}
