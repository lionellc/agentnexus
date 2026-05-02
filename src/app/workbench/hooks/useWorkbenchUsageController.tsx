import { useMemo } from "react";

import { UsageModule } from "../../../features/usage/module/UsageModule";

type UseWorkbenchUsageControllerInput = {
  l: (zh: string, en: string) => string;
  activeWorkspaceId: string | null;
};

export function useWorkbenchUsageController({ l, activeWorkspaceId }: UseWorkbenchUsageControllerInput) {
  const module = useMemo(
    () => <UsageModule l={l} workspaceId={activeWorkspaceId} />,
    [activeWorkspaceId, l],
  );

  return { module };
}
