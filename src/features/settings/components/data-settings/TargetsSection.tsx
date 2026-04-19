import { Button, Card, CardContent, CardHeader, CardTitle, DeleteIconButton } from "../../../../shared/ui";

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
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>{l("Skills 目录配置", "Skills Directory Settings")}</CardTitle>
        <Button size="sm" onClick={onOpenCreate}>
          {l("新增目录", "Add Directory")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {distributionTargets.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 px-3 py-3 text-xs text-slate-500">
            {l("暂无分发目录，请先新增一条。", "No distribution directories yet. Add one.")}
          </div>
        ) : (
          <div className="space-y-2">
            {distributionTargets.map((target) => {
              const isDeleting = distributionTargetSavingId === `delete:${target.id}`;
              return (
                <div key={target.id} className="rounded-md border border-slate-200 px-3 py-3">
                  <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                    <div className="grid gap-2 md:grid-cols-3">
                      <div className="text-xs text-slate-500">
                        <div>{l("名称", "Name")}</div>
                        <div className="font-medium text-slate-800">{target.platform}</div>
                      </div>
                      <div className="text-xs text-slate-500">
                        <div>{l("安装模式", "Install Mode")}</div>
                        <div className="font-medium text-slate-800">{target.installMode}</div>
                      </div>
                      <div className="min-w-0 text-xs text-slate-500">
                        <div>{l("目标目录", "Target Directory")}</div>
                        <div className="truncate font-mono text-slate-700">{target.targetPath}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => onStartEdit(target.id)} disabled={isDeleting}>
                        {l("编辑", "Edit")}
                      </Button>
                      <DeleteIconButton
                        size="sm"
                        variant="outline"
                        label={l("删除目录", "Delete directory")}
                        onClick={() => onDeleteDistributionTarget(target.id)}
                        disabled={isDeleting}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
