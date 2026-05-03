import { Button, Input, Modal, Select } from "@douyinfe/semi-ui-19";

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
    <Modal visible={open} onCancel={() => onOpenChange(false)} footer={null} title={null} width={680}>
      <div className="space-y-6 px-1 pb-1 pt-1">
        <div className="pr-10">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{l("新增目录", "Add Directory")}</h2>
        </div>
        <div className="grid gap-5 text-sm">
          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{l("名称", "Name")}</label>
            <Input
              value={draft.platform}
              onChange={(value) => onDraftChange("platform", value)}
              placeholder=".codex"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{l("安装模式", "Install Mode")}</label>
            <Select
              className="w-44"
              value={draft.installMode}
              onChange={(value) => onDraftChange("installMode", String(value ?? ""))}
              optionList={[
                { value: "copy", label: "copy" },
                { value: "symlink", label: "symlink" },
              ]}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{l("目标目录", "Target Directory")}</label>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <Input
                value={draft.targetPath}
                onChange={(value) => onDraftChange("targetPath", value)}
                placeholder="/Users/you/.codex"
                disabled={saving}
              />
              <Button className="whitespace-nowrap" type="tertiary" onClick={onPickDirectory} disabled={saving}>
                {l("从 Finder 选择文件夹", "Choose Folder in Finder")}
              </Button>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
          <Button type="tertiary" onClick={() => onOpenChange(false)}>
            {l("取消", "Cancel")}
          </Button>
          <Button theme="solid" type="primary" onClick={onSubmit} disabled={saving}>
            {saving ? l("保存中...", "Saving...") : l("保存", "Save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
