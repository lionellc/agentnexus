import { Button, Modal } from "@douyinfe/semi-ui-19";
import { Input } from "@douyinfe/semi-ui-19";

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
    <Modal visible={open} onCancel={() => onOpenChange(false)} footer={null} title={null}>
      <div>
        <div>
          <h2>{l("新增 Agent", "Add Agent")}</h2>
        </div>
        <div className="space-y-3 text-sm">
          <div>
            <label>{l("名称", "Name")}</label>
            <Input
              value={draft.platform}
              onChange={(value) => onDraftChange("platform", value)}
              placeholder="cursor"
            />
          </div>
          <div>
            <label>{l("Global Config 目录（绝对路径）", "Global Config Directory (Absolute Path)")}</label>
            <div className="flex items-center gap-2">
              <Input
                value={draft.rootDir}
                onChange={(value) => onDraftChange("rootDir", value)}
                placeholder="/Users/you/.cursor"
                disabled={saving}
              />
              <Button type="tertiary" onClick={onPickRootDir} disabled={saving}>
                {l("从 Finder 选择文件夹", "Choose Folder in Finder")}
              </Button>
            </div>
          </div>
          <div>
            <label>{l("规则文件（相对路径）", "Rule File (Relative Path)")}</label>
            <Input
              value={draft.ruleFile}
              onChange={(value) => onDraftChange("ruleFile", value)}
              placeholder="AGENTS.md"
            />
          </div>
        </div>
        <div>
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
