import { Button, Input, Modal } from "@douyinfe/semi-ui-19";

import { MarkdownEditor, type MarkdownMode } from "../../common/components/MarkdownEditor";

export type CreatePromptDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isZh: boolean;
  name: string;
  content: string;
  onNameChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onCreate: () => void;
  onCancel?: () => void;
  createDisabled?: boolean;
  language?: "zh" | "en";
  markdownModeLabels?: Partial<Record<MarkdownMode, string>>;
  editorMinHeight?: number;
};

export function CreatePromptDialog({
  open,
  onOpenChange,
  isZh,
  name,
  content,
  onNameChange,
  onContentChange,
  onCreate,
  onCancel,
  createDisabled = false,
  language,
  markdownModeLabels,
  editorMinHeight = 260,
}: CreatePromptDialogProps) {
  const handleCancel = () => {
    if (onCancel) {
      onCancel();
      return;
    }
    onOpenChange(false);
  };

  return (
    <Modal visible={open} onCancel={() => onOpenChange(false)} footer={null} title={null} width={860}>
      <div className="flex max-h-[82vh] flex-col px-1 pb-1 pt-1">
        <div className="shrink-0 pr-10">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{isZh ? "新建 Prompt" : "New Prompt"}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {isZh ? "创建并立即加入列表。" : "Create and add it to the list immediately."}
          </p>
        </div>
        <div className="mt-5 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{isZh ? "名称" : "Name"}</label>
            <Input value={name} onChange={(value) => onNameChange(value)} />
          </div>
          <div className="grid min-h-0 gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{isZh ? "内容（Markdown）" : "Content (Markdown)"}</label>
            <MarkdownEditor
              value={content}
              onChange={onContentChange}
              minHeight={Math.max(editorMinHeight, 360)}
              placeholder={isZh ? "使用 Markdown 编写 Prompt 内容..." : "Write prompt content with Markdown..."}
              language={language}
              modeLabels={markdownModeLabels}
            />
          </div>
        </div>
        <div className="mt-5 flex shrink-0 justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
          <Button type="tertiary" onClick={handleCancel}>{isZh ? "取消" : "Cancel"}</Button>
          <Button theme="solid" type="primary" disabled={createDisabled} onClick={onCreate}>{isZh ? "创建" : "Create"}</Button>
        </div>
      </div>
    </Modal>
  );
}
