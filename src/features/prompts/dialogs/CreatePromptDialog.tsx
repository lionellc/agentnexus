import { MarkdownEditor, type MarkdownMode } from "../../common/components/MarkdownEditor";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  FormFieldset,
  FormLabel,
  Input,
} from "../../../shared/ui";

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isZh ? "新建 Prompt" : "New Prompt"}</DialogTitle>
          <DialogDescription>
            {isZh ? "创建并立即加入列表。" : "Create and add it to the list immediately."}
          </DialogDescription>
        </DialogHeader>
        <FormFieldset>
          <FormField>
            <FormLabel>{isZh ? "名称" : "Name"}</FormLabel>
            <Input value={name} onChange={(event) => onNameChange(event.currentTarget.value)} />
          </FormField>
          <FormField>
            <FormLabel>{isZh ? "内容（Markdown）" : "Content (Markdown)"}</FormLabel>
            <MarkdownEditor
              value={content}
              onChange={onContentChange}
              minHeight={editorMinHeight}
              placeholder={isZh ? "使用 Markdown 编写 Prompt 内容..." : "Write prompt content with Markdown..."}
              language={language}
              modeLabels={markdownModeLabels}
            />
          </FormField>
        </FormFieldset>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>{isZh ? "取消" : "Cancel"}</Button>
          <Button disabled={createDisabled} onClick={onCreate}>{isZh ? "创建" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
