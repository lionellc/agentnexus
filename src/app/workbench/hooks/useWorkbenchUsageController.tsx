import { useMemo } from "react";

import { UsageModule } from "../../../features/usage/module/UsageModule";

type UseWorkbenchUsageControllerInput = {
  l: (zh: string, en: string) => string;
};

export function useWorkbenchUsageController({ l }: UseWorkbenchUsageControllerInput) {
  const module = useMemo(
    () => <UsageModule l={l} />,
    [l],
  );

  return { module };
}
