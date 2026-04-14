import { MarkdownPreview } from "../../common/components/MarkdownEditor";
import type { AppLanguage } from "../../shell/types";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../shared/ui";

export type AgentMappingPreviewDialogProps = {
  l: (zh: string, en: string) => string;
  uiLanguage: AppLanguage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mappingPreviewPlatform: string;
  mappingPreviewPath: string;
  mappingPreviewExists: boolean;
  mappingPreviewMessage: string;
  mappingPreviewContent: string;
};

export function AgentMappingPreviewDialog({
  l,
  uiLanguage,
  open,
  onOpenChange,
  mappingPreviewPlatform,
  mappingPreviewPath,
  mappingPreviewExists,
  mappingPreviewMessage,
  mappingPreviewContent,
}: AgentMappingPreviewDialogProps) {
  const markdownLanguage = uiLanguage === "zh-CN" ? "zh" : "en";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{l("平台文件预览", "Platform File Preview")}</DialogTitle>
          <DialogDescription>
            {mappingPreviewPlatform}
            {" · "}
            {mappingPreviewPath || "-"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div className={mappingPreviewExists ? "text-green-700" : "text-amber-700"}>
            {mappingPreviewMessage}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <MarkdownPreview
            content={mappingPreviewContent || ""}
            minHeight={260}
            maxHeight={560}
            className="h-full"
            language={markdownLanguage}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {l("关闭", "Close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
