import { useMemo } from "react";

import { ChannelApiTestModule } from "../../../features/channel-test/module/ChannelApiTestModule";

type UseWorkbenchChannelTestControllerInput = {
  l: (zh: string, en: string) => string;
  activeWorkspaceId: string | null;
};

export function useWorkbenchChannelTestController({
  l,
  activeWorkspaceId,
}: UseWorkbenchChannelTestControllerInput) {
  const module = useMemo(
    () => <ChannelApiTestModule l={l} workspaceId={activeWorkspaceId} />,
    [activeWorkspaceId, l],
  );

  return { module };
}
