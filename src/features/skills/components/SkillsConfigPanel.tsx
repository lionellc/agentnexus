import { useEffect, useMemo, useState } from "react";
import { Tag } from "@douyinfe/semi-ui-19";
import { ChevronRight } from "lucide-react";

import {
  Button,
  Card,
  CardContent,
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

export function SkillsConfigPanel({
  scanPhase,
  scanMessage,
  scanGroups,
  onScanSkills,
  l,
}: {
  scanPhase: "idle" | "loading" | "success" | "error";
  scanMessage: string;
  scanGroups: SkillsConfigGroup[];
  onScanSkills: () => void;
  l: (zh: string, en: string) => string;
}) {
  const [scanGroupPage, setScanGroupPage] = useState(1);
  const [scanGroupItemPageByKey, setScanGroupItemPageByKey] = useState<Record<string, number>>({});
  const totalScanGroupPages = useMemo(
    () => Math.max(1, Math.ceil(scanGroups.length / SCAN_GROUP_PAGE_SIZE)),
    [scanGroups.length],
  );
  const pagedScanGroups = useMemo(() => {
    const start = (scanGroupPage - 1) * SCAN_GROUP_PAGE_SIZE;
    return scanGroups.slice(start, start + SCAN_GROUP_PAGE_SIZE);
  }, [scanGroupPage, scanGroups]);
  useEffect(() => {
    setScanGroupPage((previous) => Math.min(previous, totalScanGroupPages));
  }, [totalScanGroupPages]);

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
                      <Tag color="grey" type="light" className="whitespace-nowrap">
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
                            <Tag color="blue" type="light" size="small">
                              {l("软链", "Symlink")}
                            </Tag>
                          ) : null}
                          {item.conflict ? (
                            <Tag color="orange" type="light" size="small">
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
    </div>
  );
}
