// @ts-nocheck

export function createWorkbenchDistributionStorageActions(args: any) {
  const {
    activeWorkspaceId,
    activeWorkspace,
    settingsTargets,
    projectBootingMessage,
    l,
    toast,
    unknownToMessage,
    normalizeDirectoryInput,
    isAbsolutePathInput,
    normalizeAgentTypeInput,
    defaultAgentConfigDir,
    homePath,
    pickDialog,
    openPath,
    loadAllSettings,
    upsertTarget,
    deleteTarget,
    setDirty,
    setStorageDirDraft,
    storageDirDraft,
    distributionTargetDrafts,
    setDistributionTargetDrafts,
    setDistributionTargetEditingIds,
    setDistributionTargetSavingId,
    newDistributionTargetDraft,
    setNewDistributionTargetDraft,
  } = args;

  async function handleSaveStorageDirectory() {
    if (!isAbsolutePathInput(storageDirDraft)) {
      toast({ title: l("存储目录必须是绝对路径", "Storage directory must be an absolute path"), variant: "destructive" });
      return;
    }
    try {
      setDirty("data", false);
      toast({ title: l("存储目录已保存", "Storage directory saved") });
    } catch (error) {
      toast({
        title: l("保存存储目录失败", "Failed to save storage directory"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  async function handleOpenStorageDirectoryInFinder() {
    const targetPath = normalizeDirectoryInput(storageDirDraft || activeWorkspace?.rootPath || "");
    if (!isAbsolutePathInput(targetPath)) {
      toast({ title: l("存储目录不是有效绝对路径", "Storage directory is not a valid absolute path"), variant: "destructive" });
      return;
    }
    try {
      await openPath(targetPath);
    } catch (error) {
      toast({
        title: l("打开目录失败", "Failed to open directory"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    }
  }

  async function handlePickStorageDirectory() {
    const fallbackPath =
      normalizeDirectoryInput(storageDirDraft) ||
      normalizeDirectoryInput(activeWorkspace?.rootPath ?? "");
    const picked = await pickDirectoryInFinder(
      fallbackPath,
      "选择目录失败",
      "Failed to choose directory",
    );
    if (!picked) {
      return;
    }
    setStorageDirDraft(picked);
    setDirty("data", true);
  }

  async function handleUseDefaultStorageDirectory() {
    try {
      const defaultDir = await appDataDir();
      setStorageDirDraft(defaultDir);
    } catch {
      // 忽略读取默认路径失败
    }
  }

  async function pickDirectoryInFinder(
    basePath: string,
    errorTitleZh: string,
    errorTitleEn: string,
  ): Promise<string | null> {
    try {
      const selected = await pickDialog({
        directory: true,
        multiple: false,
        defaultPath: normalizeDirectoryInput(basePath) || undefined,
      });
      if (!selected || Array.isArray(selected)) {
        return null;
      }
      const normalized = normalizeDirectoryInput(selected);
      return isAbsolutePathInput(normalized) ? normalized : null;
    } catch (error) {
      toast({
        title: l(errorTitleZh, errorTitleEn),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
      return null;
    }
  }

  async function handlePickNewDistributionTargetDirectory() {
    const fallbackPath =
      normalizeDirectoryInput(newDistributionTargetDraft.targetPath) ||
      normalizeDirectoryInput(activeWorkspace?.rootPath ?? "") ||
      normalizeDirectoryInput(defaultAgentConfigDir(homePath, newDistributionTargetDraft.platform));
    const picked = await pickDirectoryInFinder(
      fallbackPath,
      "选择目录失败",
      "Failed to choose directory",
    );
    if (!picked) {
      return;
    }
    handleNewDistributionTargetFieldChange("targetPath", picked);
  }

  async function handlePickDistributionTargetDirectory(targetId: string) {
    const existingTarget = settingsTargets.find((item) => item.id === targetId);
    const currentDraft = distributionTargetDrafts[targetId];
    const fallbackPath =
      normalizeDirectoryInput(currentDraft?.targetPath ?? "") ||
      normalizeDirectoryInput(existingTarget?.targetPath ?? "") ||
      normalizeDirectoryInput(activeWorkspace?.rootPath ?? "");
    const picked = await pickDirectoryInFinder(
      fallbackPath,
      "选择目录失败",
      "Failed to choose directory",
    );
    if (!picked) {
      return;
    }
    handleDistributionTargetFieldChange(targetId, "targetPath", picked);
  }

  function normalizeDistributionTargetDraft(draft: DistributionTargetDraft): DistributionTargetDraft {
    return {
      platform: normalizeAgentTypeInput(draft.platform),
      targetPath: normalizeDirectoryInput(draft.targetPath),
      installMode: draft.installMode === "symlink" ? "symlink" : "copy",
    };
  }

  function deriveDistributionSkillsPath(targetPath: string): string {
    const normalizedTargetPath = normalizeDirectoryInput(targetPath);
    if (!normalizedTargetPath) {
      return "";
    }
    return `${normalizedTargetPath}/skills`;
  }

  function validateDistributionTargetDraft(draft: DistributionTargetDraft): string | null {
    if (!draft.platform) {
      return l("平台不能为空", "Platform cannot be empty");
    }
    if (!isAbsolutePathInput(draft.targetPath)) {
      return l("目标目录必须是绝对路径", "Target directory must be an absolute path");
    }
    if (draft.installMode !== "copy" && draft.installMode !== "symlink") {
      return l("安装模式仅支持 copy / symlink", "Install mode only supports copy / symlink");
    }
    return null;
  }

  function handleDistributionTargetFieldChange(
    targetId: string,
    field: DistributionTargetDraftField,
    value: string,
  ) {
    setDistributionTargetDrafts((prev) => {
      const current = prev[targetId] ?? {
        platform: "",
        targetPath: "",
        installMode: "copy",
      };
      if (field === "installMode") {
        return {
          ...prev,
          [targetId]: {
            ...current,
            installMode: value === "symlink" ? "symlink" : "copy",
          },
        };
      }
      return {
        ...prev,
        [targetId]: {
          ...current,
          [field]: value,
        },
      };
    });
    setDirty("data", true);
  }

  function handleStartDistributionTargetEdit(targetId: string) {
    setDistributionTargetEditingIds((prev) => (prev.includes(targetId) ? prev : [...prev, targetId]));
  }

  function handleCancelDistributionTargetEdit(targetId: string) {
    const existing = settingsTargets.find((item) => item.id === targetId);
    if (existing) {
      setDistributionTargetDrafts((prev) => ({
        ...prev,
        [targetId]: {
          platform: existing.platform,
          targetPath: existing.targetPath,
          installMode: existing.installMode === "symlink" ? "symlink" : "copy",
        },
      }));
    }
    setDistributionTargetEditingIds((prev) => prev.filter((item) => item !== targetId));
  }

  async function handleDeleteDistributionTarget(targetId: string) {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    const existing = settingsTargets.find((item) => item.id === targetId);
    if (!existing) {
      toast({ title: l("目标不存在", "Target not found"), variant: "destructive" });
      return;
    }
    if (
      !window.confirm(
        l(
          `确认删除目录「${existing.platform}」吗？`,
          `Delete directory "${existing.platform}"?`,
        ),
      )
    ) {
      return;
    }

    setDistributionTargetSavingId(`delete:${targetId}`);
    try {
      const result = await deleteTarget({
        workspaceId: activeWorkspaceId,
        id: targetId,
      });
      if (!result.ok) {
        toast({ title: result.message, variant: "destructive" });
        return;
      }
      setDistributionTargetDrafts((prev) => {
        const next = { ...prev };
        delete next[targetId];
        return next;
      });
      setDistributionTargetEditingIds((prev) => prev.filter((item) => item !== targetId));
      setDirty("data", false);
      toast({ title: l("目标目录已删除", "Target directory deleted") });
    } catch (error) {
      toast({
        title: l("删除目标目录失败", "Failed to delete target directory"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    } finally {
      setDistributionTargetSavingId(null);
    }
  }

  async function handleSaveDistributionTarget(targetId: string) {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    const existing = settingsTargets.find((item) => item.id === targetId);
    if (!existing) {
      toast({ title: l("目标不存在", "Target not found"), variant: "destructive" });
      return;
    }
    const draft =
      distributionTargetDrafts[targetId] ??
      ({
        platform: existing.platform,
        targetPath: existing.targetPath,
        installMode: existing.installMode === "symlink" ? "symlink" : "copy",
      } satisfies DistributionTargetDraft);
    const normalized = normalizeDistributionTargetDraft(draft);
    const validationError = validateDistributionTargetDraft(normalized);
    if (validationError) {
      toast({ title: validationError, variant: "destructive" });
      return;
    }

    setDistributionTargetSavingId(targetId);
    try {
      const result = await upsertTarget({
        workspaceId: activeWorkspaceId,
        id: targetId,
        platform: normalized.platform,
        targetPath: normalized.targetPath,
        skillsPath: deriveDistributionSkillsPath(normalized.targetPath),
        installMode: normalized.installMode,
      });
      if (!result.ok) {
        toast({ title: result.message, variant: "destructive" });
        return;
      }
      setDistributionTargetDrafts((prev) => ({ ...prev, [targetId]: normalized }));
      setDistributionTargetEditingIds((prev) => prev.filter((item) => item !== targetId));
      setDirty("data", false);
      toast({ title: l("目标目录已保存", "Target directory saved") });
    } catch (error) {
      toast({
        title: l("保存目标目录失败", "Failed to save target directory"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    } finally {
      setDistributionTargetSavingId(null);
    }
  }

  function handleNewDistributionTargetFieldChange(field: DistributionTargetDraftField, value: string) {
    setNewDistributionTargetDraft((prev) => {
      if (field === "installMode") {
        return { ...prev, installMode: value === "symlink" ? "symlink" : "copy" };
      }
      return { ...prev, [field]: value };
    });
    setDirty("data", true);
  }

  async function handleCreateDistributionTarget() {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    const normalized = normalizeDistributionTargetDraft(newDistributionTargetDraft);
    const validationError = validateDistributionTargetDraft(normalized);
    if (validationError) {
      toast({ title: validationError, variant: "destructive" });
      return;
    }

    setDistributionTargetSavingId("__new__");
    try {
      const result = await upsertTarget({
        workspaceId: activeWorkspaceId,
        platform: normalized.platform,
        targetPath: normalized.targetPath,
        skillsPath: deriveDistributionSkillsPath(normalized.targetPath),
        installMode: normalized.installMode,
      });
      if (!result.ok) {
        toast({ title: result.message, variant: "destructive" });
        return;
      }
      setNewDistributionTargetDraft({
        ...normalized,
        targetPath: "",
      });
      setDirty("data", false);
      toast({ title: l("目标目录已新增", "Target directory created") });
    } catch (error) {
      toast({
        title: l("新增目标目录失败", "Failed to create target directory"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    } finally {
      setDistributionTargetSavingId(null);
    }
  }

  return {
    handleSaveStorageDirectory,
    handleOpenStorageDirectoryInFinder,
    handlePickStorageDirectory,
    handleUseDefaultStorageDirectory,
    handlePickNewDistributionTargetDirectory,
    handlePickDistributionTargetDirectory,
    handleDistributionTargetFieldChange,
    handleStartDistributionTargetEdit,
    handleCancelDistributionTargetEdit,
    handleDeleteDistributionTarget,
    handleSaveDistributionTarget,
    handleNewDistributionTargetFieldChange,
    handleCreateDistributionTarget,
  };
}
