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
  Select,
} from "../../../../shared/ui";

import type { DistributionTargetDraft, Translator } from "./types";

type CreateTargetDialogProps = {
  l: Translator;
  open: boolean;
  draft: DistributionTargetDraft;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (field: "platform" | "targetPath" | "installMode", value: string) => void;
  onPickDirectory: () => void;
  onSubmit: () => void;
};

export function CreateTargetDialog({
  l,
  open,
  draft,
  saving,
  onOpenChange,
  onDraftChange,
  onPickDirectory,
  onSubmit,
}: CreateTargetDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{l("新增目录", "Add Directory")}</DialogTitle>
        </DialogHeader>
        <FormFieldset className="space-y-3 text-sm">
          <FormField>
            <FormLabel>{l("名称", "Name")}</FormLabel>
            <Input
              value={draft.platform}
              onChange={(value) => onDraftChange("platform", value)}
              placeholder=".codex"
            />
          </FormField>
          <FormField>
            <FormLabel>{l("安装模式", "Install Mode")}</FormLabel>
            <Select
              value={draft.installMode}
              onChange={(value) => onDraftChange("installMode", value)}
              options={[
                { value: "copy", label: "copy" },
                { value: "symlink", label: "symlink" },
              ]}
            />
          </FormField>
          <DirectoryPathField
            label={l("目标目录", "Target Directory")}
            value={draft.targetPath}
            onChange={(value) => onDraftChange("targetPath", value)}
            placeholder="/Users/you/.codex"
            onPickDirectory={onPickDirectory}
            pickButtonLabel={l("从 Finder 选择文件夹", "Choose Folder in Finder")}
            disabled={saving}
          />
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
