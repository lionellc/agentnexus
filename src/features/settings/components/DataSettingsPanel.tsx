import { useEffect, useMemo, useRef, useState } from "react";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DeleteIconButton,
  DirectoryPathField,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  FormFieldset,
  FormLabel,
  Input,
  Select,
} from "../../../shared/ui";

export type DataSettingsPanelProps = {
  l: (zh: string, en: string) => string;
  storageDirDraft: string;
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
  onPickStorageDirectory: () => void;
  onPickNewDistributionTargetDirectory: () => void;
  onPickDistributionTargetDirectory: (targetId: string) => void;
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
  agentConnectionRows: Array<{
    platform: string;
    rootDir: string;
    ruleFile: string;
  }>;
  agentConnectionEditingPlatforms: string[];
  newAgentConnectionDraft: {
    platform: string;
    rootDir: string;
    ruleFile: string;
  };
  agentConnectionSavingId: string | null;
  onPickNewAgentConnectionRootDir: () => void;
  onPickAgentConnectionRootDir: (platform: string) => void;
  onAgentConnectionFieldChange: (
    platform: string,
    field: "rootDir" | "ruleFile",
    value: string,
  ) => void;
  onStartAgentConnectionEdit: (platform: string) => void;
  onCancelAgentConnectionEdit: (platform: string) => void;
  onSaveAgentConnection: (platform: string) => void;
  onDeleteAgentConnection: (platform: string) => void;
  onNewAgentConnectionFieldChange: (
    field: "platform" | "rootDir" | "ruleFile",
    value: string,
  ) => void;
  onCreateAgentConnection: () => void;
};

export function DataSettingsPanel({
  l,
  storageDirDraft,
  distributionTargets,
  distributionTargetDrafts,
  distributionTargetEditingIds,
  newDistributionTargetDraft,
  distributionTargetSavingId,
  onStorageDirDraftChange,
  onSaveStorageDirectory,
  onUseDefaultStorageDirectory,
  onOpenStorageDirectoryInFinder,
  onPickStorageDirectory,
  onPickNewDistributionTargetDirectory,
  onPickDistributionTargetDirectory,
  onDistributionTargetFieldChange,
  onStartDistributionTargetEdit,
  onCancelDistributionTargetEdit,
  onSaveDistributionTarget,
  onDeleteDistributionTarget,
  onNewDistributionTargetFieldChange,
  onCreateDistributionTarget,
  agentConnectionRows,
  agentConnectionEditingPlatforms,
  newAgentConnectionDraft,
  agentConnectionSavingId,
  onPickNewAgentConnectionRootDir,
  onPickAgentConnectionRootDir,
  onAgentConnectionFieldChange,
  onStartAgentConnectionEdit,
  onCancelAgentConnectionEdit,
  onSaveAgentConnection,
  onDeleteAgentConnection,
  onNewAgentConnectionFieldChange,
  onCreateAgentConnection,
}: DataSettingsPanelProps) {
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createSubmitted, setCreateSubmitted] = useState(false);
  const createSavingObservedRef = useRef(false);
  const [editingAgentPlatform, setEditingAgentPlatform] = useState<string | null>(null);
  const [createAgentDialogOpen, setCreateAgentDialogOpen] = useState(false);
  const [createAgentSubmitted, setCreateAgentSubmitted] = useState(false);
  const createAgentSavingObservedRef = useRef(false);

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

  const editingAgent = useMemo(
    () => agentConnectionRows.find((item) => item.platform === editingAgentPlatform) ?? null,
    [agentConnectionRows, editingAgentPlatform],
  );

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

  useEffect(() => {
    if (!editingAgentPlatform) {
      return;
    }
    if (!agentConnectionRows.some((item) => item.platform === editingAgentPlatform)) {
      setEditingAgentPlatform(null);
      return;
    }
    if (agentConnectionSavingId === editingAgentPlatform) {
      return;
    }
    if (!agentConnectionEditingPlatforms.includes(editingAgentPlatform)) {
      setEditingAgentPlatform(null);
    }
  }, [
    agentConnectionEditingPlatforms,
    agentConnectionRows,
    agentConnectionSavingId,
    editingAgentPlatform,
  ]);

  useEffect(() => {
    if (agentConnectionSavingId === "__new_agent__") {
      createAgentSavingObservedRef.current = true;
      return;
    }
    if (
      createAgentDialogOpen &&
      createAgentSubmitted &&
      createAgentSavingObservedRef.current &&
      agentConnectionSavingId === null &&
      !newAgentConnectionDraft.platform &&
      !newAgentConnectionDraft.rootDir &&
      !newAgentConnectionDraft.ruleFile
    ) {
      setCreateAgentDialogOpen(false);
      setCreateAgentSubmitted(false);
      createAgentSavingObservedRef.current = false;
    }
  }, [
    agentConnectionSavingId,
    createAgentDialogOpen,
    createAgentSubmitted,
    newAgentConnectionDraft.platform,
    newAgentConnectionDraft.rootDir,
    newAgentConnectionDraft.ruleFile,
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
          <DirectoryPathField
            label={l("目录路径（绝对路径）", "Directory Path (Absolute)")}
            value={storageDirDraft}
            onChange={onStorageDirDraftChange}
            placeholder="/Users/you/Library/Application Support/agentnexus"
            onPickDirectory={onPickStorageDirectory}
            pickButtonLabel={l("选择文件夹", "Choose Folder")}
          />
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
          <CardTitle>{l("Skills 目录配置", "Skills Directory Settings")}</CardTitle>
          <Button
            size="sm"
            onClick={() => {
              setCreateDialogOpen(true);
              setCreateSubmitted(false);
              createSavingObservedRef.current = false;
            }}
          >
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>{l("Agents 配置", "Agents Settings")}</CardTitle>
          <Button
            size="sm"
            onClick={() => {
              setCreateAgentDialogOpen(true);
              setCreateAgentSubmitted(false);
              createAgentSavingObservedRef.current = false;
            }}
          >
            {l("新增 Agent", "Add Agent")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {agentConnectionRows.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 px-3 py-3 text-xs text-slate-500">
              {l("暂无 Agent 配置，请先新增一条。", "No agent settings yet. Add one.")}
            </div>
          ) : (
            <div className="space-y-2">
              {agentConnectionRows.map((row) => {
                const isDeleting = agentConnectionSavingId === `delete:${row.platform}`;
                return (
                  <div key={row.platform} className="rounded-md border border-slate-200 px-3 py-3">
                    <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                      <div className="grid gap-2 md:grid-cols-3">
                        <div className="text-xs text-slate-500">
                          <div>{l("名称", "Name")}</div>
                          <div className="font-medium text-slate-800">{row.platform}</div>
                        </div>
                        <div className="min-w-0 text-xs text-slate-500">
                          <div>{l("Global Config 目录", "Global Config Directory")}</div>
                          <div className="truncate font-mono text-slate-700">{row.rootDir || "-"}</div>
                        </div>
                        <div className="min-w-0 text-xs text-slate-500">
                          <div>{l("规则文件（相对路径）", "Rule File (Relative Path)")}</div>
                          <div className="truncate font-mono text-slate-700">{row.ruleFile || "-"}</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            onStartAgentConnectionEdit(row.platform);
                            setEditingAgentPlatform(row.platform);
                          }}
                          disabled={isDeleting}
                        >
                          {l("编辑", "Edit")}
                        </Button>
                        <DeleteIconButton
                          size="sm"
                          variant="outline"
                          label={l("删除 Agent 配置", "Delete agent settings")}
                          onClick={() => onDeleteAgentConnection(row.platform)}
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
            <DialogTitle>{l("新增目录", "Add Directory")}</DialogTitle>
          </DialogHeader>
          <FormFieldset className="space-y-3 text-sm">
            <FormField>
              <FormLabel>{l("名称", "Name")}</FormLabel>
              <Input
                value={newDistributionTargetDraft.platform}
                onChange={(event) =>
                  onNewDistributionTargetFieldChange("platform", event.currentTarget.value)
                }
                placeholder=".codex"
              />
            </FormField>
            <FormField>
              <FormLabel>{l("安装模式", "Install Mode")}</FormLabel>
              <Select
                value={newDistributionTargetDraft.installMode}
                onChange={(value) => onNewDistributionTargetFieldChange("installMode", value)}
                options={[
                  { value: "copy", label: "copy" },
                  { value: "symlink", label: "symlink" },
                ]}
              />
            </FormField>
            <DirectoryPathField
              label={l("目标目录", "Target Directory")}
              value={newDistributionTargetDraft.targetPath}
              onChange={(value) => onNewDistributionTargetFieldChange("targetPath", value)}
              placeholder="/Users/you/.codex"
              onPickDirectory={onPickNewDistributionTargetDirectory}
              pickButtonLabel={l("从 Finder 选择文件夹", "Choose Folder in Finder")}
              disabled={distributionTargetSavingId === "__new__"}
            />
          </FormFieldset>
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
            <FormFieldset className="space-y-3 text-sm">
              <FormField>
                <FormLabel>{l("名称", "Name")}</FormLabel>
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
              </FormField>
              <FormField>
                <FormLabel>{l("安装模式", "Install Mode")}</FormLabel>
                <Select
                  value={editDraft.installMode}
                  onChange={(value) =>
                    onDistributionTargetFieldChange(
                      editingTargetId,
                      "installMode",
                      value,
                    )
                  }
                  options={[
                    { value: "copy", label: "copy" },
                    { value: "symlink", label: "symlink" },
                  ]}
                />
              </FormField>
              <DirectoryPathField
                label={l("目标目录", "Target Directory")}
                value={editDraft.targetPath}
                onChange={(value) =>
                  onDistributionTargetFieldChange(
                    editingTargetId,
                    "targetPath",
                    value,
                  )
                }
                placeholder="/Users/you/.codex"
                onPickDirectory={() => onPickDistributionTargetDirectory(editingTargetId)}
                pickButtonLabel={l("从 Finder 选择文件夹", "Choose Folder in Finder")}
                disabled={distributionTargetSavingId === editingTargetId}
              />
            </FormFieldset>
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

      <Dialog
        open={createAgentDialogOpen}
        onOpenChange={(open) => {
          setCreateAgentDialogOpen(open);
          if (!open) {
            setCreateAgentSubmitted(false);
            createAgentSavingObservedRef.current = false;
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{l("新增 Agent", "Add Agent")}</DialogTitle>
          </DialogHeader>
          <FormFieldset className="space-y-3 text-sm">
            <FormField>
              <FormLabel>{l("名称", "Name")}</FormLabel>
              <Input
                value={newAgentConnectionDraft.platform}
                onChange={(event) =>
                  onNewAgentConnectionFieldChange("platform", event.currentTarget.value)
                }
                placeholder="cursor"
              />
            </FormField>
            <DirectoryPathField
              label={l("Global Config 目录（绝对路径）", "Global Config Directory (Absolute Path)")}
              value={newAgentConnectionDraft.rootDir}
              onChange={(value) => onNewAgentConnectionFieldChange("rootDir", value)}
              placeholder="/Users/you/.cursor"
              onPickDirectory={onPickNewAgentConnectionRootDir}
              pickButtonLabel={l("从 Finder 选择文件夹", "Choose Folder in Finder")}
              disabled={agentConnectionSavingId === "__new_agent__"}
            />
            <FormField>
              <FormLabel>{l("规则文件（相对路径）", "Rule File (Relative Path)")}</FormLabel>
              <Input
                value={newAgentConnectionDraft.ruleFile}
                onChange={(event) =>
                  onNewAgentConnectionFieldChange("ruleFile", event.currentTarget.value)
                }
                placeholder="AGENTS.md"
              />
            </FormField>
          </FormFieldset>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateAgentDialogOpen(false);
                setCreateAgentSubmitted(false);
                createAgentSavingObservedRef.current = false;
              }}
            >
              {l("取消", "Cancel")}
            </Button>
            <Button
              onClick={() => {
                setCreateAgentSubmitted(true);
                onCreateAgentConnection();
              }}
              disabled={agentConnectionSavingId === "__new_agent__"}
            >
              {agentConnectionSavingId === "__new_agent__" ? l("保存中...", "Saving...") : l("保存", "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingAgentPlatform && editingAgent)}
        onOpenChange={(open) => {
          if (open || !editingAgentPlatform) {
            return;
          }
          onCancelAgentConnectionEdit(editingAgentPlatform);
          setEditingAgentPlatform(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{l("编辑 Agent", "Edit Agent")}</DialogTitle>
          </DialogHeader>
          {editingAgentPlatform && editingAgent ? (
            <FormFieldset className="space-y-3 text-sm">
              <FormField>
                <FormLabel>{l("名称", "Name")}</FormLabel>
                <Input value={editingAgent.platform} disabled />
              </FormField>
              <DirectoryPathField
                label={l("Global Config 目录（绝对路径）", "Global Config Directory (Absolute Path)")}
                value={editingAgent.rootDir}
                onChange={(value) =>
                  onAgentConnectionFieldChange(
                    editingAgentPlatform,
                    "rootDir",
                    value,
                  )
                }
                placeholder="/Users/you/.codex"
                onPickDirectory={() => onPickAgentConnectionRootDir(editingAgentPlatform)}
                pickButtonLabel={l("选择", "Choose")}
                disabled={agentConnectionSavingId === editingAgentPlatform}
              />
              <FormField>
                <FormLabel>{l("规则文件（相对路径）", "Rule File (Relative Path)")}</FormLabel>
                <Input
                  value={editingAgent.ruleFile}
                  onChange={(event) =>
                    onAgentConnectionFieldChange(
                      editingAgentPlatform,
                      "ruleFile",
                      event.currentTarget.value,
                    )
                  }
                  placeholder="AGENTS.md"
                  disabled={agentConnectionSavingId === editingAgentPlatform}
                />
              </FormField>
            </FormFieldset>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (!editingAgentPlatform) {
                  return;
                }
                onCancelAgentConnectionEdit(editingAgentPlatform);
                setEditingAgentPlatform(null);
              }}
              disabled={agentConnectionSavingId === editingAgentPlatform}
            >
              {l("取消", "Cancel")}
            </Button>
            <Button
              onClick={() => {
                if (!editingAgentPlatform) {
                  return;
                }
                onSaveAgentConnection(editingAgentPlatform);
              }}
              disabled={agentConnectionSavingId === editingAgentPlatform}
            >
              {agentConnectionSavingId === editingAgentPlatform
                ? l("保存中...", "Saving...")
                : l("保存", "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
