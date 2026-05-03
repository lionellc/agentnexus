import { Button, Card } from "@douyinfe/semi-ui-19";
import { Trash2 } from "lucide-react";
import type { DistributionTarget, Translator } from "./types";

type TargetsSectionProps = {
  l: Translator;
  distributionTargets: DistributionTarget[];
  distributionTargetSavingId: string | null;
  onOpenCreate: () => void;
  onStartEdit: (targetId: string) => void;
  onDeleteDistributionTarget: (targetId: string) => void;
};

export function TargetsSection({
  l,
  distributionTargets,
  distributionTargetSavingId,
  onOpenCreate,
  onStartEdit,
  onDeleteDistributionTarget,
}: TargetsSectionProps) {
  return (
    <Card>
      <div className="mb-4 flex flex-row items-center justify-between gap-4">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{l("Skills 目录配置", "Skills Directory Settings")}</h3>
        <Button theme="solid" type="primary" onClick={onOpenCreate}>
          {l("新增目录", "Add Directory")}
        </Button>
      </div>
      <div className="space-y-4 text-sm">
        {distributionTargets.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 px-3 py-3 text-xs text-slate-500 dark:border-slate-700">
            {l("暂无分发目录，请先新增一条。", "No distribution directories yet. Add one.")}
          </div>
        ) : (
          <div className="space-y-3">
            {distributionTargets.map((target) => {
              const isDeleting = distributionTargetSavingId === `delete:${target.id}`;
              return (
                <div key={target.id} className="rounded-md border border-slate-200 px-4 py-4 dark:border-slate-800">
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                    <div className="grid gap-4 md:grid-cols-[160px_140px_minmax(0,1fr)]">
                      <div className="space-y-1 text-xs text-slate-500">
                        <div>{l("名称", "Name")}</div>
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{target.platform}</div>
                      </div>
                      <div className="space-y-1 text-xs text-slate-500">
                        <div>{l("安装模式", "Install Mode")}</div>
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{target.installMode}</div>
                      </div>
                      <div className="min-w-0 space-y-1 text-xs text-slate-500">
                        <div>{l("目标目录", "Target Directory")}</div>
                        <div className="truncate font-mono text-sm text-slate-700 dark:text-slate-200" title={target.targetPath}>{target.targetPath}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <Button type="tertiary" onClick={() => onStartEdit(target.id)} disabled={isDeleting}>
                        {l("编辑", "Edit")}
                      </Button>
                      <Button
                        type="danger"
                        aria-label={l("删除目录", "Delete directory")}
                        title={l("删除目录", "Delete directory")}
                        onClick={() => onDeleteDistributionTarget(target.id)}
                        disabled={isDeleting}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
