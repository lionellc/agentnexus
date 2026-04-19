import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../shared/ui";
import type { SkillsManagerLinkPreviewResult } from "../../../shared/types";

type ManagerLinkConfirmDecision = "cancel" | "force-link" | "update-then-link";

type SkillsLinkConfirmDialogProps = {
  l: (zh: string, en: string) => string;
  preview: SkillsManagerLinkPreviewResult | null;
  onDecision: (decision: ManagerLinkConfirmDecision) => void;
};

export function SkillsLinkConfirmDialog({ l, preview, onDecision }: SkillsLinkConfirmDialogProps) {
  const summary = preview
    ? l(
      `差异文件 ${preview.diffFiles} / 比较文件 ${preview.totalFiles}`,
      `${preview.diffFiles} diff files / ${preview.totalFiles} compared files`,
    )
    : "";

  return (
    <Dialog
      open={preview !== null}
      onOpenChange={(open) => {
        if (!open) {
          onDecision("cancel");
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{l("确认覆盖链接", "Confirm Link Replacement")}</DialogTitle>
          <DialogDescription>
            {preview
              ? `${preview.tool} / ${preview.skillName}`
              : ""}
          </DialogDescription>
        </DialogHeader>
        {preview ? (
          <div className="space-y-3">
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {preview.message}
            </div>
            <div className="text-xs text-slate-500">{summary}</div>
            <div className="max-h-56 space-y-1 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-2">
              {preview.entries.length > 0 ? (
                preview.entries.slice(0, 12).map((entry) => (
                  <div key={`${entry.relativePath}:${entry.status}`} className="font-mono text-[11px] text-slate-700">
                    {entry.relativePath} ({entry.status})
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-500">{l("无可展示差异明细。", "No diff entries to display.")}</div>
              )}
              {preview.entriesTruncated ? (
                <div className="text-xs text-slate-500">{l("仅展示部分差异文件。", "Showing partial diff entries.")}</div>
              ) : null}
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onDecision("cancel")}>
            {l("取消", "Cancel")}
          </Button>
          <Button variant="outline" onClick={() => onDecision("force-link")}>
            {l("直接覆盖链接", "Overwrite & Link")}
          </Button>
          <Button onClick={() => onDecision("update-then-link")}>{l("更新后链接", "Update Then Link")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
