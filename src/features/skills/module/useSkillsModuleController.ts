import { useCallback, useMemo, type ReactElement } from "react";
import type { SkillsManagerMode } from "../../../shared/types";

type UseSkillsModuleControllerInput = {
  skillsCenter: ReactElement;
  managerMode: SkillsManagerMode;
  setManagerMode: (value: SkillsManagerMode) => void;
};

export function useSkillsModuleController({
  skillsCenter,
  managerMode,
  setManagerMode,
}: UseSkillsModuleControllerInput) {
  const centerContent = useMemo(() => skillsCenter, [skillsCenter]);
  const resolvedManagerMode = managerMode === "config" ? "config" : "operations";
  const handleManagerModeChange = useCallback(
    (value: SkillsManagerMode) => {
      const next = value === "config" ? "config" : "operations";
      setManagerMode(next);
    },
    [setManagerMode],
  );

  return {
    centerContent,
    managerMode: resolvedManagerMode,
    setManagerMode: handleManagerModeChange,
  };
}
