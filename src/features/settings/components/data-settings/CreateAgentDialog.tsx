import { Input } from "@douyinfe/semi-ui-19";

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DirectoryPathField,
  FormField,
  FormFieldset,
  FormLabel,
} from "../../../../shared/ui";

import type { AgentConnectionDraft, Translator } from "./types";

type CreateAgentDialogProps = {
  l: Translator;
  open: boolean;
  draft: AgentConnectionDraft;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (field: "platform" | "rootDir" | "ruleFile", value: string) => void;
  onPickRootDir: () => void;
  onSubmit: () => void;
};

export function CreateAgentDialog({
  l,
  open,
  draft,
  saving,
  onOpenChange,
  onDraftChange,
  onPickRootDir,
  onSubmit,
}: CreateAgentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{l("新增 Agent", "Add Agent")}</DialogTitle>
        </DialogHeader>
        <FormFieldset className="space-y-3 text-sm">
          <FormField>
            <FormLabel>{l("名称", "Name")}</FormLabel>
            <Input
              value={draft.platform}
              onChange={(value) => onDraftChange("platform", value)}
              placeholder="cursor"
            />
          </FormField>
          <DirectoryPathField
            label={l("Global Config 目录（绝对路径）", "Global Config Directory (Absolute Path)")}
            value={draft.rootDir}
            onChange={(value) => onDraftChange("rootDir", value)}
            placeholder="/Users/you/.cursor"
            onPickDirectory={onPickRootDir}
            pickButtonLabel={l("从 Finder 选择文件夹", "Choose Folder in Finder")}
            disabled={saving}
          />
          <FormField>
            <FormLabel>{l("规则文件（相对路径）", "Rule File (Relative Path)")}</FormLabel>
            <Input
              value={draft.ruleFile}
              onChange={(value) => onDraftChange("ruleFile", value)}
              placeholder="AGENTS.md"
            />
          </FormField>
        </FormFieldset>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {l("取消", "Cancel")}
          </Button>
          <Button onClick={onSubmit} disabled={saving}>
            {saving ? l("保存中...", "Saving...") : l("保存", "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
