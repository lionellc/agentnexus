import { useMemo, type ReactElement } from "react";

type UseSkillsModuleControllerInput = {
  skillsCenter: ReactElement;
};

export function useSkillsModuleController({ skillsCenter }: UseSkillsModuleControllerInput) {
  const centerContent = useMemo(() => skillsCenter, [skillsCenter]);

  return {
    centerContent,
  };
}
