import type { ReactElement } from "react";

import type { SkillsManagerMode } from "../../../shared/types";
import { useSkillsModuleController } from "./useSkillsModuleController";

export function SkillsModule({
  skillsCenter,
  managerMode,
  setManagerMode,
}: {
  skillsCenter: ReactElement;
  managerMode: SkillsManagerMode;
  setManagerMode: (value: SkillsManagerMode) => void;
}) {
  const { centerContent } = useSkillsModuleController({
    skillsCenter,
    managerMode,
    setManagerMode,
  });

  return <>{centerContent}</>;
}
