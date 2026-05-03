import { Tag } from "@douyinfe/semi-ui-19";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../shared/ui";
import type {
  SkillsUsageCallItem,
  SkillsUsageEvidenceSource,
  SkillsUsageResultStatus,
  SkillsUsageSyncJobSnapshot,
} from "../../../shared/types";

export type SkillUsageTimelineDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skillName: string;
  total: number;
  items: SkillsUsageCallItem[];
  loading: boolean;
  errorMessage: string;
  syncJob: SkillsUsageSyncJobSnapshot | null;
  onRefresh: () => void | Promise<void>;
  l: (zh: string, en: string) => string;
};

function resultColor(status: SkillsUsageResultStatus): "green" | "red" | "grey" {
  if (status === "success") {
    return "green";
  }
  if (status === "failed") {
    return "red";
  }
  return "grey";
}

function evidenceColor(source: SkillsUsageEvidenceSource): "green" | "grey" {
  return source === "observed" ? "green" : "grey";
}

function progressPercent(job: SkillsUsageSyncJobSnapshot | null): number {
  if (!job || job.totalFiles <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((job.processedFiles / job.totalFiles) * 100)));
}

function formatTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

export function SkillUsageTimelineDialog({
  open,
  onOpenChange,
  skillName,
  total,
  items,
  loading,
  errorMessage,
  syncJob,
  onRefresh,
  l,
}: SkillUsageTimelineDialogProps) {
  const safeItems = items ?? [];
  const syncRunning = syncJob?.status === "running";
  const percent = progressPercent(syncJob);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{l("调用记录", "Call History")}</DialogTitle>
          <DialogDescription>
            {l("Skill", "Skill")}：{skillName} · {l("总计", "Total")} {total}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-end">
            <Button size="sm" variant="outline" onClick={() => void onRefresh()} disabled={syncRunning}>
              {syncRunning ? l("分析中...", "Analyzing...") : l("刷新分析", "Refresh Analysis")}
            </Button>
          </div>

          {syncJob ? (
            <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>
                  {l("状态", "Status")}：{syncJob.status}
                </span>
                <span>
                  {syncJob.processedFiles}/{syncJob.totalFiles} ({percent}%)
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded bg-slate-200">
                <div className="h-full bg-blue-500 transition-all" style={{ width: `${percent}%` }} />
              </div>
              {syncJob.currentSource ? (
                <div className="truncate text-[11px] text-slate-500" title={syncJob.currentSource}>
                  {syncJob.currentSource}
                </div>
              ) : null}
              {syncJob.errorMessage ? (
                <div className="text-[11px] text-rose-600">{syncJob.errorMessage}</div>
              ) : null}
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
              {errorMessage}
            </div>
          ) : null}

          {loading ? (
            <div className="rounded-md border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
              {l("读取调用记录中...", "Loading call history...")}
            </div>
          ) : safeItems.length === 0 ? (
            <div className="rounded-md border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
              {l("暂无调用记录", "No call history")}
            </div>
          ) : (
            <ol className="max-h-[420px] space-y-3 overflow-auto pr-1">
              {safeItems.map((item) => (
                <li
                  key={`${item.sessionId}:${item.eventRef}`}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-800">{formatTime(item.calledAt)}</span>
                    <div className="flex flex-wrap items-center gap-1">
                      <Tag color="grey" type="light">{item.agent}</Tag>
                      <Tag color="grey" type="light">{item.source}</Tag>
                      <Tag color={resultColor(item.resultStatus)} type="light">{item.resultStatus}</Tag>
                      <Tag color={evidenceColor(item.evidenceSource)} type="light">{item.evidenceSource}</Tag>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    session: {item.sessionId} · event: {item.eventRef} · confidence:{" "}
                    {item.confidence.toFixed(2)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    evidence: {item.evidenceKind}
                  </div>
                </li>
              ))}
            </ol>
          )}
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
