import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tag,
} from "../../../shared/ui";
import type { SkillsManagerDiffEntry, SkillsManagerDiffStatus } from "../../../shared/types";

export type SkillsConfigGroupItem = {
  id: string;
  name: string;
  localPath: string;
  conflict: boolean;
  isSymlink: boolean;
};

export type SkillsConfigGroup = {
  key: string;
  label: string;
  total: number;
  pendingCount: number;
  items: SkillsConfigGroupItem[];
};

export type SkillsConfigConflictPair = {
  key: string;
  name: string;
  left: {
    id: string;
    localPath: string;
  };
  right: {
    id: string;
    localPath: string;
  };
};

export type SkillsConfigDiffView = {
  open: boolean;
  status: SkillsManagerDiffStatus;
  running: boolean;
  jobId: string;
  leftSkillName: string;
  rightSkillName: string;
  processedFiles: number;
  totalFiles: number;
  currentFile: string;
  diffFiles: number;
  sameSkill: boolean | null;
  errorMessage: string;
  entries: SkillsManagerDiffEntry[];
};

const SCAN_GROUP_PAGE_SIZE = 6;
const SCAN_GROUP_ITEM_PAGE_SIZE = 8;
const CONFLICT_PAGE_SIZE = 8;
const DIFF_ENTRY_PAGE_SIZE = 40;

export function SkillsConfigPanel({
  scanPhase,
  scanMessage,
  scanGroups,
  conflictPairs,
  diffView,
  onScanSkills,
  onStartConflictDiff,
  onCancelDiff,
  onCloseDiff,
  l,
}: {
  scanPhase: "idle" | "loading" | "success" | "error";
  scanMessage: string;
  scanGroups: SkillsConfigGroup[];
  conflictPairs: SkillsConfigConflictPair[];
  diffView: SkillsConfigDiffView;
  onScanSkills: () => void;
  onStartConflictDiff: (leftSkillId: string, rightSkillId: string) => void;
  onCancelDiff: () => void;
  onCloseDiff: () => void;
  l: (zh: string, en: string) => string;
}) {
  const [scanGroupPage, setScanGroupPage] = useState(1);
  const [conflictPage, setConflictPage] = useState(1);
  const [diffEntryPage, setDiffEntryPage] = useState(1);
  const [scanGroupItemPageByKey, setScanGroupItemPageByKey] = useState<Record<string, number>>({});
  const totalScanGroupPages = useMemo(
    () => Math.max(1, Math.ceil(scanGroups.length / SCAN_GROUP_PAGE_SIZE)),
    [scanGroups.length],
  );
  const pagedScanGroups = useMemo(() => {
    const start = (scanGroupPage - 1) * SCAN_GROUP_PAGE_SIZE;
    return scanGroups.slice(start, start + SCAN_GROUP_PAGE_SIZE);
  }, [scanGroupPage, scanGroups]);
  const totalConflictPages = useMemo(
    () => Math.max(1, Math.ceil(conflictPairs.length / CONFLICT_PAGE_SIZE)),
    [conflictPairs.length],
  );
  const pagedConflictPairs = useMemo(() => {
    const start = (conflictPage - 1) * CONFLICT_PAGE_SIZE;
    return conflictPairs.slice(start, start + CONFLICT_PAGE_SIZE);
  }, [conflictPage, conflictPairs]);
  const totalDiffEntryPages = useMemo(
    () => Math.max(1, Math.ceil(diffView.entries.length / DIFF_ENTRY_PAGE_SIZE)),
    [diffView.entries.length],
  );
  const pagedDiffEntries = useMemo(() => {
    const start = (diffEntryPage - 1) * DIFF_ENTRY_PAGE_SIZE;
    return diffView.entries.slice(start, start + DIFF_ENTRY_PAGE_SIZE);
  }, [diffEntryPage, diffView.entries]);

  useEffect(() => {
    setScanGroupPage((previous) => Math.min(previous, totalScanGroupPages));
  }, [totalScanGroupPages]);

  useEffect(() => {
    setConflictPage((previous) => Math.min(previous, totalConflictPages));
  }, [totalConflictPages]);

  useEffect(() => {
    setDiffEntryPage((previous) => Math.min(previous, totalDiffEntryPages));
  }, [totalDiffEntryPages]);

  const progressPercent =
    diffView.totalFiles > 0
      ? Math.min(100, Math.round((diffView.processedFiles / diffView.totalFiles) * 100))
      : 0;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-3 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-600">
              {scanPhase === "loading"
                ? l("扫描进行中...", "Scanning...")
                : scanMessage || l("扫描后的 skills 会自动导入本项目。", "Scanned skills will be automatically imported into this project.")}
            </div>
            <Button size="sm" variant="outline" onClick={onScanSkills} disabled={scanPhase === "loading"}>
              {scanPhase === "loading" ? l("扫描中...", "Scanning...") : l("重新扫描", "Rescan")}
            </Button>
          </div>

          {scanPhase === "error" ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/60 dark:bg-rose-500/15 dark:text-rose-200">
              {scanMessage || l("扫描失败，请检查目录权限后重试。", "Scan failed. Check permissions and retry.")}
            </div>
          ) : null}

          {scanGroups.length === 0 ? (
            <div className="rounded-md border border-slate-200 px-3 py-3 text-xs text-slate-500">
              {scanPhase === "loading"
                ? l("正在读取扫描结果...", "Loading scan result...")
                : l("暂无扫描结果。", "No scan results.")}
            </div>
          ) : (
            <div className="space-y-2">
              {pagedScanGroups.map((group) => {
                const currentPage = scanGroupItemPageByKey[group.key] ?? 1;
                const totalItemPages = Math.max(1, Math.ceil(group.items.length / SCAN_GROUP_ITEM_PAGE_SIZE));
                const pagedItems = group.items.slice(
                  (currentPage - 1) * SCAN_GROUP_ITEM_PAGE_SIZE,
                  currentPage * SCAN_GROUP_ITEM_PAGE_SIZE,
                );

                return (
                <details
                  key={group.key}
                  className="group rounded-md border border-slate-200 bg-white"
                  open={scanGroups.length <= 3}
                >
                  <summary className="list-none cursor-pointer px-3 py-2 text-sm font-medium text-slate-800 marker:content-none [&::-webkit-details-marker]:hidden">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 truncate">{group.label}</span>
                      <Tag tone="neutral" className="whitespace-nowrap rounded-sm">
                        {group.total} {l("项", "items")} · {group.pendingCount} {l("待处理", "pending")}
                      </Tag>
                      <ChevronRight
                        aria-hidden="true"
                        className="ml-auto h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-90"
                      />
                    </div>
                  </summary>
                  <div className="space-y-2 border-t border-slate-100 px-3 py-2">
                    {pagedItems.map((item) => (
                      <div key={item.id} className="rounded border border-slate-200 px-2 py-1.5 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-800">{item.name}</span>
                          {item.isSymlink ? (
                            <Tag tone="info" size="sm">
                              {l("软链", "Symlink")}
                            </Tag>
                          ) : null}
                          {item.conflict ? (
                            <Tag tone="warning" size="sm">
                              {l("冲突", "Conflict")}
                            </Tag>
                          ) : null}
                        </div>
                        <div className="mt-1 truncate text-slate-500" title={item.localPath}>
                          {item.localPath}
                        </div>
                      </div>
                    ))}
                    {group.items.length > SCAN_GROUP_ITEM_PAGE_SIZE ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
                        <span className="text-[11px] text-slate-500">
                          {l(
                            `共 ${group.items.length} 项 · 每页 ${SCAN_GROUP_ITEM_PAGE_SIZE} 条`,
                            `${group.items.length} items · ${SCAN_GROUP_ITEM_PAGE_SIZE} / page`,
                          )}
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={currentPage <= 1}
                            onClick={() =>
                              setScanGroupItemPageByKey((previous) => ({
                                ...previous,
                                [group.key]: Math.max(1, currentPage - 1),
                              }))
                            }
                          >
                            {l("上一页", "Prev")}
                          </Button>
                          <span className="text-[11px] text-slate-500">
                            {currentPage} / {totalItemPages}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={currentPage >= totalItemPages}
                            onClick={() =>
                              setScanGroupItemPageByKey((previous) => ({
                                ...previous,
                                [group.key]: Math.min(totalItemPages, currentPage + 1),
                              }))
                            }
                          >
                            {l("下一页", "Next")}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </details>
                );
              })}
              {scanGroups.length > SCAN_GROUP_PAGE_SIZE ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-500">
                    {l(
                      `共 ${scanGroups.length} 个分组 · 每页 ${SCAN_GROUP_PAGE_SIZE} 组`,
                      `${scanGroups.length} groups · ${SCAN_GROUP_PAGE_SIZE} / page`,
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={scanGroupPage <= 1}
                      onClick={() => setScanGroupPage((previous) => Math.max(1, previous - 1))}
                    >
                      {l("上一页", "Prev")}
                    </Button>
                    <span className="text-xs text-slate-500">
                      {scanGroupPage} / {totalScanGroupPages}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={scanGroupPage >= totalScanGroupPages}
                      onClick={() => setScanGroupPage((previous) => Math.min(totalScanGroupPages, previous + 1))}
                    >
                      {l("下一页", "Next")}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{l("同名冲突全量 Diff", "Name Conflict Full Diff")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {conflictPairs.length === 0 ? (
            <div className="text-xs text-slate-500">{l("暂无同名冲突。", "No name conflicts.")}</div>
          ) : (
            pagedConflictPairs.map((pair) => (
              <div key={pair.key} className="rounded border border-slate-200 bg-white px-3 py-2">
                <div className="text-sm font-medium text-slate-900">{pair.name}</div>
                <div className="mt-1 space-y-1 text-xs text-slate-600">
                  <div className="truncate" title={pair.left.localPath}>{pair.left.localPath}</div>
                  <div className="truncate" title={pair.right.localPath}>{pair.right.localPath}</div>
                </div>
                <div className="mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onStartConflictDiff(pair.left.id, pair.right.id)}
                  >
                    {l("开始全量 Diff", "Start Full Diff")}
                  </Button>
                </div>
              </div>
            ))
          )}
          {conflictPairs.length > CONFLICT_PAGE_SIZE ? (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-xs text-slate-500">
                {l(
                  `共 ${conflictPairs.length} 条冲突 · 每页 ${CONFLICT_PAGE_SIZE} 条`,
                  `${conflictPairs.length} conflicts · ${CONFLICT_PAGE_SIZE} / page`,
                )}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={conflictPage <= 1}
                  onClick={() => setConflictPage((previous) => Math.max(1, previous - 1))}
                >
                  {l("上一页", "Prev")}
                </Button>
                <span className="text-xs text-slate-500">
                  {conflictPage} / {totalConflictPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={conflictPage >= totalConflictPages}
                  onClick={() => setConflictPage((previous) => Math.min(totalConflictPages, previous + 1))}
                >
                  {l("下一页", "Next")}
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={diffView.open} onOpenChange={(open) => !open && onCloseDiff()}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{l("同名冲突 Diff 进度", "Conflict Diff Progress")}</DialogTitle>
            <DialogDescription>
              {diffView.leftSkillName && diffView.rightSkillName
                ? `${diffView.leftSkillName} ↔ ${diffView.rightSkillName}`
                : l("正在准备对比任务...", "Preparing diff job...")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {l("状态", "Status")}：{diffView.status} · {l("进度", "Progress")}：{diffView.processedFiles}/{diffView.totalFiles} ({progressPercent}%) · {l("差异文件", "Diff files")}：{diffView.diffFiles}
            </div>
            {diffView.currentFile ? (
              <div className="rounded border border-slate-200 px-3 py-2 text-xs text-slate-600">
                {l("当前文件", "Current file")}：
                <span className="font-mono">{diffView.currentFile}</span>
              </div>
            ) : null}
            {diffView.sameSkill !== null ? (
              <div className={`rounded border px-3 py-2 text-xs ${diffView.sameSkill ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/60 dark:bg-emerald-500/15 dark:text-emerald-200" : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/60 dark:bg-amber-500/15 dark:text-amber-200"}`}>
                {diffView.sameSkill
                  ? l("判定结果：同一个 skill，可直接覆盖。", "Result: same skill, safe to overwrite.")
                  : l("判定结果：非同一个 skill，需要人工决策。", "Result: different skills, manual decision required.")}
              </div>
            ) : null}
            {diffView.errorMessage ? (
              <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/60 dark:bg-rose-500/15 dark:text-rose-200">
                {diffView.errorMessage}
              </div>
            ) : null}
            <div className="max-h-60 space-y-1 overflow-auto rounded border border-slate-200 bg-white p-2">
              {diffView.entries.length === 0 ? (
                <div className="text-xs text-slate-500">{l("暂无差异明细。", "No diff entries yet.")}</div>
              ) : (
                pagedDiffEntries.map((entry) => (
                  <div key={`${entry.relativePath}:${entry.status}`} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-slate-50">
                    <span className="truncate font-mono text-slate-700" title={entry.relativePath}>{entry.relativePath}</span>
                    <span className="shrink-0 text-slate-500">{entry.status} ({entry.leftBytes}/{entry.rightBytes})</span>
                  </div>
                ))
              )}
            </div>
            {diffView.entries.length > DIFF_ENTRY_PAGE_SIZE ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-500">
                  {l(
                    `共 ${diffView.entries.length} 条差异 · 每页 ${DIFF_ENTRY_PAGE_SIZE} 条`,
                    `${diffView.entries.length} entries · ${DIFF_ENTRY_PAGE_SIZE} / page`,
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={diffEntryPage <= 1}
                    onClick={() => setDiffEntryPage((previous) => Math.max(1, previous - 1))}
                  >
                    {l("上一页", "Prev")}
                  </Button>
                  <span className="text-xs text-slate-500">
                    {diffEntryPage} / {totalDiffEntryPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={diffEntryPage >= totalDiffEntryPages}
                    onClick={() => setDiffEntryPage((previous) => Math.min(totalDiffEntryPages, previous + 1))}
                  >
                    {l("下一页", "Next")}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            {diffView.running ? (
              <Button variant="outline" onClick={onCancelDiff}>
                {l("中断 Diff", "Cancel Diff")}
              </Button>
            ) : null}
            <Button variant="outline" onClick={onCloseDiff}>
              {l("关闭", "Close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
