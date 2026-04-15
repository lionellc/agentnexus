import { useEffect, useMemo, useRef, useState } from "react";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "../../../shared/ui";

export type DataSettingsPanelProps = {
  l: (zh: string, en: string) => string;
  storageDirDraft: string;
  activeWorkspaceRootPath: string | null;
  distributionTargets: Array<{
    id: string;
    platform: string;
    targetPath: string;
    skillsPath: string;
    installMode: string;
  }>;
  distributionTargetDrafts: Record<
    string,
    {
      platform: string;
      targetPath: string;
      installMode: string;
    }
  >;
  distributionTargetEditingIds: string[];
  newDistributionTargetDraft: {
    platform: string;
    targetPath: string;
    installMode: string;
  };
  distributionTargetSavingId: string | null;
  onStorageDirDraftChange: (value: string) => void;
  onSaveStorageDirectory: () => void;
  onUseDefaultStorageDirectory: () => void;
  onOpenStorageDirectoryInFinder: () => void;
  onDistributionTargetFieldChange: (
    targetId: string,
    field: "platform" | "targetPath" | "installMode",
    value: string,
  ) => void;
  onStartDistributionTargetEdit: (targetId: string) => void;
  onCancelDistributionTargetEdit: (targetId: string) => void;
  onSaveDistributionTarget: (targetId: string) => void;
  onDeleteDistributionTarget: (targetId: string) => void;
  onNewDistributionTargetFieldChange: (
    field: "platform" | "targetPath" | "installMode",
    value: string,
  ) => void;
  onCreateDistributionTarget: () => void;
};

export function DataSettingsPanel({
  l,
  storageDirDraft,
  activeWorkspaceRootPath,
  distributionTargets,
  distributionTargetDrafts,
  distributionTargetEditingIds,
  newDistributionTargetDraft,
  distributionTargetSavingId,
  onStorageDirDraftChange,
  onSaveStorageDirectory,
  onUseDefaultStorageDirectory,
  onOpenStorageDirectoryInFinder,
  onDistributionTargetFieldChange,
  onStartDistributionTargetEdit,
  onCancelDistributionTargetEdit,
  onSaveDistributionTarget,
  onDeleteDistributionTarget,
  onNewDistributionTargetFieldChange,
  onCreateDistributionTarget,
}: DataSettingsPanelProps) {
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createSubmitted, setCreateSubmitted] = useState(false);
  const createSavingObservedRef = useRef(false);

  const editingTarget = useMemo(
    () => distributionTargets.find((item) => item.id === editingTargetId) ?? null,
    [distributionTargets, editingTargetId],
  );

  const editDraft = useMemo(() => {
    if (!editingTarget) {
      return null;
    }
    return (
      distributionTargetDrafts[editingTarget.id] ?? {
        platform: editingTarget.platform,
        targetPath: editingTarget.targetPath,
        installMode: editingTarget.installMode,
      }
    );
  }, [distributionTargetDrafts, editingTarget]);

  useEffect(() => {
    if (!editingTargetId) {
      return;
    }
    if (!distributionTargets.some((item) => item.id === editingTargetId)) {
      setEditingTargetId(null);
      return;
    }
    if (distributionTargetSavingId === editingTargetId) {
      return;
    }
    if (!distributionTargetEditingIds.includes(editingTargetId)) {
      setEditingTargetId(null);
    }
  }, [distributionTargetEditingIds, distributionTargetSavingId, distributionTargets, editingTargetId]);

  useEffect(() => {
    if (distributionTargetSavingId === "__new__") {
      createSavingObservedRef.current = true;
      return;
    }
    if (
      createDialogOpen &&
      createSubmitted &&
      createSavingObservedRef.current &&
      distributionTargetSavingId === null &&
      !newDistributionTargetDraft.targetPath
    ) {
      setCreateDialogOpen(false);
      setCreateSubmitted(false);
      createSavingObservedRef.current = false;
    }
  }, [
    createDialogOpen,
    createSubmitted,
    distributionTargetSavingId,
    newDistributionTargetDraft.targetPath,
  ]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{l("存储位置", "Storage")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="text-xs text-slate-500">
            {l(
              "应用首次启动会自动初始化默认目录；你也可以手动改为其它绝对路径。",
              "The app initializes a default directory on first launch. You can also set another absolute path.",
            )}
          </div>
          <label className="block text-xs text-slate-500">
            {l("目录路径（绝对路径）", "Directory Path (Absolute)")}
            <Input
              value={storageDirDraft}
              onChange={(event) => onStorageDirDraftChange(event.currentTarget.value)}
              placeholder="/Users/you/Library/Application Support/agentnexus"
            />
          </label>
          <div className="text-xs text-slate-500">
            {l("当前项目目录：", "Current Project Directory: ")}
            {activeWorkspaceRootPath ?? "-"}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onSaveStorageDirectory}>{l("保存目录", "Save")}</Button>
            <Button variant="outline" onClick={onUseDefaultStorageDirectory}>
              {l("使用默认目录", "Use Default")}
            </Button>
            <Button variant="outline" onClick={onOpenStorageDirectoryInFinder}>
              {l("在 Finder 中打开", "Open in Finder")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>{l("Skills 配置", "Skills Settings")}</CardTitle>
          <Button
            size="sm"
            onClick={() => {
              setCreateDialogOpen(true);
              setCreateSubmitted(false);
              createSavingObservedRef.current = false;
            }}
          >
            {l("新增目标", "Add Target")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {activeWorkspaceRootPath ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {l("当前 workspace 根目录：", "Current workspace root: ")}
              <span className="font-mono">{activeWorkspaceRootPath}</span>
            </div>
          ) : null}

          {distributionTargets.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 px-3 py-3 text-xs text-slate-500">
              {l("暂无分发目标，请先新增一条。", "No distribution targets yet. Add one.")}
            </div>
          ) : (
            <div className="space-y-2">
              {distributionTargets.map((target) => {
                const isDeleting = distributionTargetSavingId === `delete:${target.id}`;
                return (
                  <div
                    key={target.id}
                    className="rounded-md border border-slate-200 px-3 py-3"
                  >
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
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            onStartDistributionTargetEdit(target.id);
                            setEditingTargetId(target.id);
                          }}
                          disabled={isDeleting}
                        >
                          {l("编辑", "Edit")}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => onDeleteDistributionTarget(target.id)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? l("删除中...", "Deleting...") : l("删除", "Delete")}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) {
            setCreateSubmitted(false);
            createSavingObservedRef.current = false;
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{l("新增目标", "Add Target")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <label className="block text-xs text-slate-500">
              {l("名称", "Name")}
              <Input
                value={newDistributionTargetDraft.platform}
                onChange={(event) =>
                  onNewDistributionTargetFieldChange("platform", event.currentTarget.value)
                }
                placeholder=".codex"
              />
            </label>
            <label className="block text-xs text-slate-500">
              {l("安装模式", "Install Mode")}
              <select
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                value={newDistributionTargetDraft.installMode}
                onChange={(event) =>
                  onNewDistributionTargetFieldChange("installMode", event.currentTarget.value)
                }
              >
                <option value="copy">copy</option>
                <option value="symlink">symlink</option>
              </select>
            </label>
            <label className="block text-xs text-slate-500">
              {l("目标目录", "Target Directory")}
              <Input
                value={newDistributionTargetDraft.targetPath}
                onChange={(event) =>
                  onNewDistributionTargetFieldChange("targetPath", event.currentTarget.value)
                }
                placeholder="/Users/you/.codex"
              />
            </label>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateDialogOpen(false);
                setCreateSubmitted(false);
                createSavingObservedRef.current = false;
              }}
            >
              {l("取消", "Cancel")}
            </Button>
            <Button
              onClick={() => {
                setCreateSubmitted(true);
                onCreateDistributionTarget();
              }}
              disabled={distributionTargetSavingId === "__new__"}
            >
              {distributionTargetSavingId === "__new__" ? l("保存中...", "Saving...") : l("保存", "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingTargetId && editDraft)}
        onOpenChange={(open) => {
          if (open || !editingTargetId) {
            return;
          }
          onCancelDistributionTargetEdit(editingTargetId);
          setEditingTargetId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{l("编辑目标", "Edit Target")}</DialogTitle>
          </DialogHeader>
          {editingTargetId && editDraft ? (
            <div className="space-y-3 text-sm">
              <label className="block text-xs text-slate-500">
                {l("名称", "Name")}
                <Input
                  value={editDraft.platform}
                  onChange={(event) =>
                    onDistributionTargetFieldChange(
                      editingTargetId,
                      "platform",
                      event.currentTarget.value,
                    )
                  }
                  placeholder=".codex"
                />
              </label>
              <label className="block text-xs text-slate-500">
                {l("安装模式", "Install Mode")}
                <select
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                  value={editDraft.installMode}
                  onChange={(event) =>
                    onDistributionTargetFieldChange(
                      editingTargetId,
                      "installMode",
                      event.currentTarget.value,
                    )
                  }
                >
                  <option value="copy">copy</option>
                  <option value="symlink">symlink</option>
                </select>
              </label>
              <label className="block text-xs text-slate-500">
                {l("目标目录", "Target Directory")}
                <Input
                  value={editDraft.targetPath}
                  onChange={(event) =>
                    onDistributionTargetFieldChange(
                      editingTargetId,
                      "targetPath",
                      event.currentTarget.value,
                    )
                  }
                  placeholder="/Users/you/.codex"
                />
              </label>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (!editingTargetId) {
                  return;
                }
                onCancelDistributionTargetEdit(editingTargetId);
                setEditingTargetId(null);
              }}
              disabled={distributionTargetSavingId === editingTargetId}
            >
              {l("取消", "Cancel")}
            </Button>
            <Button
              onClick={() => {
                if (!editingTargetId) {
                  return;
                }
                onSaveDistributionTarget(editingTargetId);
              }}
              disabled={distributionTargetSavingId === editingTargetId}
            >
              {distributionTargetSavingId === editingTargetId
                ? l("保存中...", "Saving...")
                : l("保存", "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
