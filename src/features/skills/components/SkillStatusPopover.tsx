import { Button, Card } from "@douyinfe/semi-ui-19";
import { useMemo, useState } from "react";
import type { SkillManagerStatus } from "../../../shared/types";

export type SkillStatusAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

export type SkillStatusSecondaryAction = SkillStatusAction & {
  key: string;
};

export type SkillStatusPopoverProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skillName: string;
  targetLabel: string;
  status: SkillManagerStatus;
  summaryLines: string[];
  primaryAction: SkillStatusAction;
  secondaryActions: SkillStatusSecondaryAction[];
  l: (zh: string, en: string) => string;
};

function isPendingLinkStatus(status: SkillManagerStatus): boolean {
  return status === "wrong" || status === "directory";
}

function statusLabel(status: SkillManagerStatus, l: (zh: string, en: string) => string): string {
  if (status === "linked") {
    return l("已链接", "Linked");
  }
  if (status === "missing") {
    return l("缺失", "Missing");
  }
  if (isPendingLinkStatus(status)) {
    return l("待链接", "Pending Link");
  }
  if (status === "manual") {
    return l("手动断链", "Manual Unlink");
  }
  if (status === "blocked") {
    return l("规则阻断", "Blocked");
  }
  return l("缺失", "Missing");
}

export function SkillStatusPopover({
  open,
  onOpenChange,
  skillName,
  targetLabel,
  status,
  summaryLines,
  primaryAction,
  secondaryActions,
  l,
}: SkillStatusPopoverProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  const detailLines = useMemo(() => {
    const lines = [...summaryLines];
    while (lines.length < 3) {
      lines.push("-");
    }
    return lines.slice(0, 3);
  }, [summaryLines]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 p-4" onClick={() => onOpenChange(false)}>
      <Card className="w-full max-w-md">
        <div className="space-y-3 pb-3" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between gap-3">
            <span>
              {statusLabel(status, l)}
            </span>
            <Button onClick={() => onOpenChange(false)} aria-label={l("关闭", "Close")}>
              {l("关闭", "Close")}
            </Button>
          </div>
          <h3 className="text-sm leading-5">
            <span className="font-semibold text-slate-900">{skillName}</span>
            <span className="mx-1 text-slate-400">@</span>
            <span className="font-normal text-slate-600">{targetLabel}</span>
          </h3>
        </div>

        <div className="space-y-4">
          <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
            {detailLines.map((line, index) => (
              <p key={`${line}-${index}`} className="text-sm leading-5 text-slate-700">
                {line}
              </p>
            ))}
          </div>

          <div className="flex items-start gap-2">
            <Button
              className="flex-1"
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled}
              htmlType="button"
            >
              {primaryAction.label}
            </Button>

            <div className="relative">
              <Button htmlType="button" onClick={() => setMoreOpen((value) => !value)}>
                {l("更多操作", "More")}
              </Button>
              {moreOpen ? (
                <div className="absolute right-0 top-11 z-10 min-w-40 rounded-md border border-slate-200 bg-white p-1 shadow-md">
                  {secondaryActions.length ? (
                    secondaryActions.map((action) => (
                      <Button
                        key={action.key}
                        htmlType="button"
                        className="h-auto w-full justify-start px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => {
                          action.onClick();
                          setMoreOpen(false);
                        }}
                        disabled={action.disabled}
                      >
                        {action.label}
                      </Button>
                    ))
                  ) : (
                    <p className="px-3 py-2 text-sm text-slate-400">{l("暂无操作", "No actions")}</p>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
