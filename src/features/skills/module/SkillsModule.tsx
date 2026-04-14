import type { ReactElement } from "react";

import { useSkillsModuleController } from "./useSkillsModuleController";

export function SkillsModule({ skillsCenter }: { skillsCenter: ReactElement }) {
  const { centerContent } = useSkillsModuleController({
    skillsCenter,
  });

  return <>{centerContent}</>;
}
