// @ts-nocheck
import { createWorkbenchPromptViewActions } from "./useWorkbenchSkillSettingsActions/promptViewActions";
import { createWorkbenchSettingsDataActions } from "./useWorkbenchSkillSettingsActions/settingsDataActions";
import { createWorkbenchSkillFileActions } from "./useWorkbenchSkillSettingsActions/skillFileActions";

export function createWorkbenchSkillSettingsActions(args: any) {
  const skillFileActions = createWorkbenchSkillFileActions(args);
  const settingsDataActions = createWorkbenchSettingsDataActions(args);
  const promptViewActions = createWorkbenchPromptViewActions(args);

  return {
    ...skillFileActions,
    ...settingsDataActions,
    ...promptViewActions,
  };
}
