import { Button, Card, Select, Modal } from "@douyinfe/semi-ui-19";
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@douyinfe/semi-ui-19";

import { AgentConnectionsSection } from "./data-settings/AgentConnectionsSection";
import { CreateTargetDialog } from "./data-settings/CreateTargetDialog";
import { TargetsSection } from "./data-settings/TargetsSection";
import type {
  AgentConnectionRow,
  AgentPresetRow,
  DistributionTarget,
  DistributionTargetDraft,
  Translator,
} from "./data-settings/types";

export type DataSettingsPanelProps = {
  l: Translator;
  storageDirDraft: string;
  distributionTargets: DistributionTarget[];
  distributionTargetDrafts: Record<string, DistributionTargetDraft>;
  distributionTargetEditingIds: string[];
  newDistributionTargetDraft: DistributionTargetDraft;
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
  enabledAgentRows: AgentConnectionRow[];
  availableAgentPresetRows: AgentPresetRow[];
  agentConnectionEditingPlatforms: string[];
  agentConnectionSavingId: string | null;
  onEnableAgentPreset: (platform: string) => void;
  onReorderEnabledAgentRows: (orderedPlatforms: string[]) => void;
  onPickAgentConnectionRootDir: (platform: string) => void;
  onAgentConnectionFieldChange: (
    platform: string,
    field: "rootDir" | "ruleFile",
    value: string,
  ) => void;
  onStartAgentConnectionEdit: (platform: string) => void;
  onCancelAgentConnectionEdit: (platform: string) => void;
  onSaveAgentConnection: (platform: string) => void;
  onDisableAgentConnection: (platform: string) => void;
  onRedetectAgentConnection: (platform: string) => void;
  onRestoreAgentConnectionDefaults: (platform: string) => void;
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
  enabledAgentRows,
  availableAgentPresetRows,
  agentConnectionEditingPlatforms,
  agentConnectionSavingId,
  onEnableAgentPreset,
  onReorderEnabledAgentRows,
  onPickAgentConnectionRootDir,
  onAgentConnectionFieldChange,
  onStartAgentConnectionEdit,
  onCancelAgentConnectionEdit,
  onSaveAgentConnection,
  onDisableAgentConnection,
  onRedetectAgentConnection,
  onRestoreAgentConnectionDefaults,
}: DataSettingsPanelProps) {
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createSubmitted, setCreateSubmitted] = useState(false);
  const createSavingObservedRef = useRef(false);
  const [editingAgentPlatform, setEditingAgentPlatform] = useState<string | null>(null);

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
    () => enabledAgentRows.find((item) => item.platform === editingAgentPlatform) ?? null,
    [enabledAgentRows, editingAgentPlatform],
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
    if (!enabledAgentRows.some((item) => item.platform === editingAgentPlatform)) {
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
    enabledAgentRows,
    agentConnectionSavingId,
    editingAgentPlatform,
  ]);

  function handleCreateTargetOpenChange(open: boolean) {
    setCreateDialogOpen(open);
    if (!open) {
      setCreateSubmitted(false);
      createSavingObservedRef.current = false;
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div>
          <h3>{l("存储位置", "Storage")}</h3>
        </div>
        <div className="space-y-3 text-sm">
          <div className="text-xs text-slate-500">
            {l(
              "应用首次启动会自动初始化默认目录；你也可以手动改为其它绝对路径。",
              "The app initializes a default directory on first launch. You can also set another absolute path.",
            )}
          </div>
          <div>
                <label>{l("目录路径（绝对路径）", "Directory Path (Absolute)")}</label>
                <div className="flex items-center gap-2">
                  <Input
                    value={storageDirDraft}
                    onChange={onStorageDirDraftChange}
                    placeholder="/Users/you/Library/Application Support/agentnexus"
                  />
                  <Button type="tertiary" onClick={onPickStorageDirectory}>
                    {l("选择文件夹", "Choose Folder")}
                  </Button>
                </div>
              </div>
          <div className="flex flex-wrap gap-2">
            <Button theme="solid" type="primary" onClick={onSaveStorageDirectory}>{l("保存目录", "Save")}</Button>
            <Button type="tertiary" onClick={onUseDefaultStorageDirectory}>
              {l("使用默认目录", "Use Default")}
            </Button>
            <Button type="tertiary" onClick={onOpenStorageDirectoryInFinder}>
              {l("在 Finder 中打开", "Open in Finder")}
            </Button>
          </div>
        </div>
      </Card>

      <TargetsSection
        l={l}
        distributionTargets={distributionTargets}
        distributionTargetSavingId={distributionTargetSavingId}
        onOpenCreate={() => {
          setCreateDialogOpen(true);
          setCreateSubmitted(false);
          createSavingObservedRef.current = false;
        }}
        onStartEdit={(targetId) => {
          onStartDistributionTargetEdit(targetId);
          setEditingTargetId(targetId);
        }}
        onDeleteDistributionTarget={onDeleteDistributionTarget}
      />

      <AgentConnectionsSection
        l={l}
        enabledAgentRows={enabledAgentRows}
        availableAgentPresetRows={availableAgentPresetRows}
        agentConnectionSavingId={agentConnectionSavingId}
        onEnableAgentPreset={onEnableAgentPreset}
        onStartEdit={(platform) => {
          onStartAgentConnectionEdit(platform);
          setEditingAgentPlatform(platform);
        }}
        onDisableAgentConnection={onDisableAgentConnection}
        onReorderEnabledAgentRows={onReorderEnabledAgentRows}
      />

      <CreateTargetDialog
        l={l}
        open={createDialogOpen}
        draft={newDistributionTargetDraft}
        saving={distributionTargetSavingId === "__new__"}
        onOpenChange={handleCreateTargetOpenChange}
        onDraftChange={onNewDistributionTargetFieldChange}
        onPickDirectory={onPickNewDistributionTargetDirectory}
        onSubmit={() => {
          setCreateSubmitted(true);
          onCreateDistributionTarget();
        }}
      />

      <Modal visible={Boolean(editingTargetId && editDraft)} onCancel={() => { if (!editingTargetId) return; onCancelDistributionTargetEdit(editingTargetId); setEditingTargetId(null); }} footer={null} title={null} width={680}>
        <div className="space-y-6 px-1 pb-1 pt-1">
          <div className="pr-10">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{l("编辑目标", "Edit Target")}</h2>
          </div>
          {editingTargetId && editDraft ? (
            <div className="grid gap-5 text-sm">
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{l("名称", "Name")}</label>
                <Input
                  value={editDraft.platform}
                  onChange={(value) => onDistributionTargetFieldChange(editingTargetId, "platform", value)}
                  placeholder=".codex"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{l("安装模式", "Install Mode")}</label>
                <Select
                  className="w-44"
                  value={editDraft.installMode}
                  onChange={(value) => onDistributionTargetFieldChange(editingTargetId, "installMode", String(value ?? ""))}
                  optionList={[
                    { value: "copy", label: "copy" },
                    { value: "symlink", label: "symlink" },
                  ]}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">{l("目标目录", "Target Directory")}</label>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                  <Input
                    value={editDraft.targetPath}
                    onChange={(value) => onDistributionTargetFieldChange(editingTargetId, "targetPath", value)}
                    placeholder="/Users/you/.codex"
                    disabled={distributionTargetSavingId === editingTargetId}
                  />
                  <Button className="whitespace-nowrap" type="tertiary" onClick={() => onPickDistributionTargetDirectory(editingTargetId)} disabled={distributionTargetSavingId === editingTargetId}>
                    {l("从 Finder 选择文件夹", "Choose Folder in Finder")}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <Button
              type="tertiary"
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
              theme="solid"
              type="primary"
              onClick={() => {
                if (!editingTargetId) {
                  return;
                }
                onSaveDistributionTarget(editingTargetId);
              }}
              disabled={distributionTargetSavingId === editingTargetId}
            >
              {distributionTargetSavingId === editingTargetId ? l("保存中...", "Saving...") : l("保存", "Save")}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal visible={Boolean(editingAgentPlatform && editingAgent)} onCancel={() => { if (!editingAgentPlatform) return; onCancelAgentConnectionEdit(editingAgentPlatform); setEditingAgentPlatform(null); }} footer={null} title={null}>
        <div>
          <div>
            <h2>{l("编辑 Agent", "Edit Agent")}</h2>
          </div>
          {editingAgentPlatform && editingAgent ? (
            <div className="space-y-3 text-sm">
              <div>
                <label>{l("平台", "Platform")}</label>
                <Input value={editingAgent.displayName} disabled />
              </div>
              <div>
                <label>{l("Global Config 目录（绝对路径）", "Global Config Directory (Absolute Path)")}</label>
                <div className="flex items-center gap-2">
                  <Input
                    value={editingAgent.rootDir}
                    onChange={(value) => onAgentConnectionFieldChange(editingAgentPlatform, "rootDir", value)}
                    placeholder="/Users/you/.codex"
                disabled={agentConnectionSavingId === editingAgentPlatform}
                  />
                  <Button type="tertiary" onClick={() => onPickAgentConnectionRootDir(editingAgentPlatform)} disabled={agentConnectionSavingId === editingAgentPlatform}>
                    {l("选择", "Choose")}
                  </Button>
                </div>
              </div>
              <div>
                <label>{l("规则文件（相对路径）", "Rule File (Relative Path)")}</label>
                <Input
                  value={editingAgent.ruleFile}
                  onChange={(value) => onAgentConnectionFieldChange(editingAgentPlatform, "ruleFile", value)}
                  placeholder="AGENTS.md"
                  disabled={agentConnectionSavingId === editingAgentPlatform}
                />
              </div>
              <div className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-600 dark:border-slate-800">
                <div>{l("检测状态", "Detection")}: {editingAgent.detectionStatus}</div>
                <div>{l("目录来源", "Root Source")}: {editingAgent.rootDirSource}</div>
                <div>{l("规则来源", "Rule Source")}: {editingAgent.ruleFileSource}</div>
              </div>
            </div>
          ) : null}
          <div>
            {editingAgentPlatform ? (
              <>
                <Button
                  type="tertiary"
                  onClick={() => onRedetectAgentConnection(editingAgentPlatform)}
                  disabled={agentConnectionSavingId === editingAgentPlatform}
                >
                  {l("重新检测", "Redetect")}
                </Button>
                <Button
                  type="tertiary"
                  onClick={() => onRestoreAgentConnectionDefaults(editingAgentPlatform)}
                  disabled={agentConnectionSavingId === editingAgentPlatform}
                >
                  {l("恢复默认", "Restore Defaults")}
                </Button>
              </>
            ) : null}
            <Button
              type="tertiary"
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
              theme="solid"
              type="primary"
              onClick={() => {
                if (!editingAgentPlatform) {
                  return;
                }
                onSaveAgentConnection(editingAgentPlatform);
              }}
              disabled={agentConnectionSavingId === editingAgentPlatform}
            >
              {agentConnectionSavingId === editingAgentPlatform ? l("保存中...", "Saving...") : l("保存", "Save")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
