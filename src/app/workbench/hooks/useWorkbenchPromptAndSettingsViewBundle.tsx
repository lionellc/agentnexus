import { buildWorkbenchPromptAndSettingsViews } from "./useWorkbenchPromptAndSettingsViews";

export function useWorkbenchPromptAndSettingsViewBundle(args: any) {
  return buildWorkbenchPromptAndSettingsViews({
    ...args.constants,
    ...args.workspace,
    ...args.prompts,
    ...args.settings,
    l: args.l,
    isZh: args.isZh,
    language: args.language,
    theme: args.theme,
    uiLanguage: args.language,
  });
}
