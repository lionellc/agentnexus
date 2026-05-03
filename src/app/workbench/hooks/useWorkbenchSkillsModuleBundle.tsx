import { useWorkbenchSkillsController } from "./useWorkbenchSkillsController";

export function useWorkbenchSkillsModuleBundle(args: any) {
  return useWorkbenchSkillsController({
    ...args,
    skillsCenterProps: {
      ...args.skillsCenterProps,
      selectBaseClass: args.SELECT_BASE_CLASS,
      filteredSkillCount: args.filteredSkills.length,
      onOpenSkillDetail: (skillId: string) => void args.handleOpenSkillDetail(skillId),
      onSkillOpen: (skillId: string, relativePath?: string) =>
        void args.handleSkillOpen(skillId, relativePath),
      onReadSkillFile: (skillId: string, relativePath: string) =>
        void args.handleReadSkillFile(skillId, relativePath),
      onLoadSkillTree: (skillId: string, force?: boolean) =>
        void args.handleLoadSkillTree(skillId, force),
    },
    onOpenSkillDetail: (skillId: string) => void args.handleOpenSkillDetail(skillId),
    resetSkillDetailView: () => args.setSkillDetailView("list"),
  });
}
