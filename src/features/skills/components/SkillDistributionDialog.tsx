import { Button, Modal } from "@douyinfe/semi-ui-19";
import { useEffect, useMemo, useState } from "react";
import { Checkbox } from "@douyinfe/semi-ui-19";

type SkillDistributionTarget = {
  id: string;
  label: string;
  defaultSelected?: boolean;
};

type SkillDistributionPreviewItem = {
  id: string;
  label: string;
  kind: "safe" | "conflict" | "error";
  retryable?: boolean;
  message?: string;
};

export type SkillDistributionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  l: (zh: string, en: string) => string;
  skillName: string;
  targets: SkillDistributionTarget[];
  selectedTargetIds: string[];
  onSelectedTargetIdsChange: (ids: string[]) => void;
  previewItems: SkillDistributionPreviewItem[];
  onRequestPreview: () => void | Promise<void>;
  previewLoading: boolean;
  submitLoading: boolean;
  onSubmit: () => void | Promise<void>;
};

type Step = "select" | "preview";

function kindLabel(kind: SkillDistributionPreviewItem["kind"], l: (zh: string, en: string) => string): string {
  if (kind === "safe") {
    return l("可链接", "Safe");
  }
  if (kind === "conflict") {
    return l("冲突", "Conflict");
  }
  return l("错误", "Error");
}

export function SkillDistributionDialog({
  open,
  onOpenChange,
  l,
  skillName,
  targets,
  selectedTargetIds,
  onSelectedTargetIdsChange,
  previewItems,
  onRequestPreview,
  previewLoading,
  submitLoading,
  onSubmit,
}: SkillDistributionDialogProps) {
  const [step, setStep] = useState<Step>("select");

  useEffect(() => {
    if (open) {
      setStep("select");
    }
  }, [open]);

  const selectedSet = useMemo(() => new Set(selectedTargetIds), [selectedTargetIds]);
  const hasSelection = selectedTargetIds.length > 0;
  const retryableCount = previewItems.filter((item) => item.retryable).length;

  function toggleTarget(targetId: string, checked: boolean) {
    if (checked) {
      if (selectedSet.has(targetId)) {
        return;
      }
      onSelectedTargetIdsChange([...selectedTargetIds, targetId]);
      return;
    }
    onSelectedTargetIdsChange(selectedTargetIds.filter((id) => id !== targetId));
  }

  async function handleNext() {
    if (!hasSelection) {
      return;
    }
    await onRequestPreview();
    setStep("preview");
  }

  return (
    <Modal visible={open} onCancel={() => onOpenChange(false)} footer={null} title={null}>
      <div className="max-w-2xl">
        <div>
          <h2>{l("链接技能", "Link Skill")}</h2>
          <p>
            {step === "select"
              ? l(`为 ${skillName} 选择目标目录。`, `Select target directories for ${skillName}.`)
              : l(`确认 ${skillName} 链接预览。`, `Confirm link preview for ${skillName}.`)}
          </p>
        </div>

        {step === "select" ? (
          <div className="space-y-3 text-sm">
            <legend className="text-xs text-slate-500">
              {l("目标目录", "Target Directories")}
            </legend>
            <div className="grid gap-2">
              {targets.map((target) => {
                const checked = selectedSet.has(target.id);
                return (
                  <div key={target.id} className="space-y-0">
                    <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2">
                      <Checkbox
                        checked={checked}
                        onChange={(event) => toggleTarget(target.id, Boolean(event.target.checked))}
                      />
                      <span>{target.label}</span>
                    </label>
                  </div>
                );
              })}
            </div>
            {!hasSelection ? (
              <div>
                <p className="text-amber-600">
                  {l("请至少选择一个目标目录后继续。", "Select at least one target directory to continue.")}
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              {l(
                `可重试 ${retryableCount} 项，共 ${previewItems.length} 项。`,
                `${retryableCount} retryable out of ${previewItems.length} items.`,
              )}
            </div>
            <div className="max-h-72 space-y-2 overflow-auto">
              {previewItems.length === 0 ? (
                <div className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-500">
                  {l("暂无预览结果。", "No preview items.")}
                </div>
              ) : (
                previewItems.map((item) => (
                  <div key={item.id} className="rounded-md border border-slate-200 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-slate-900">{item.label}</span>
                      <span>
                        {kindLabel(item.kind, l)}
                      </span>
                    </div>
                    {item.message ? <div className="mt-1 text-xs text-slate-600">{item.message}</div> : null}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div>
          {step === "select" ? (
            <>
              <Button onClick={() => onOpenChange(false)}>
                {l("取消", "Cancel")}
              </Button>
              <Button onClick={() => void handleNext()} disabled={!hasSelection || previewLoading}>
                {previewLoading ? l("预览中...", "Loading...") : l("下一步", "Next")}
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => onOpenChange(false)} disabled={submitLoading}>
                {l("取消", "Cancel")}
              </Button>
              <Button onClick={() => setStep("select")} disabled={submitLoading}>
                {l("上一步", "Back")}
              </Button>
              <Button onClick={() => void onSubmit()} disabled={submitLoading}>
                {submitLoading ? l("确认中...", "Submitting...") : l("确认链接", "Confirm")}
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
