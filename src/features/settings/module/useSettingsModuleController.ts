import { useMemo, type ReactElement } from "react";

type UseSettingsModuleControllerInput = {
  centerContent: ReactElement;
};

export function useSettingsModuleController({ centerContent }: UseSettingsModuleControllerInput) {
  const memoizedCenterContent = useMemo(() => centerContent, [centerContent]);

  return {
    centerContent: memoizedCenterContent,
  };
}
