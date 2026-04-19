import {
  PROMPT_CATEGORY_UNCATEGORIZED_KEY,
  normalizePromptCategoryKey,
} from "../../../features/prompts/utils/promptCategory";
import { usePromptsStore } from "../../../shared/stores";

export function createWorkbenchPromptActions(args: any) {
  const {
    activeWorkspaceId,
    projectBootingMessage,
    newPromptName,
    newPromptContent,
    createPrompt,
    setCreatePromptOpen,
    setNewPromptName,
    setNewPromptContent,
    l,
    toast,
    selectedPrompt,
    detailName,
    detailContent,
    detailCategory,
    detailTagsInput,
    detailFavorite,
    updatePrompt,
    parseTags,
    fetchPrompts,
    fetchPromptVersions,
    promptVersions,
    setPromptVersionCompareMode,
    setPromptVersionPreview,
    setCompareLeftVersion,
    setCompareRightVersion,
    setVersionModalOpen,
    restorePromptVersion,
    deletePrompt,
    setPromptDetailView,
    promptSelectedIds,
    promptBatchCategory,
    batchFavorite,
    batchMove,
    batchDelete,
    clearPromptSelection,
    setPromptBatchJumpSuggestion,
    unknownToMessage,
  } = args;

  async function handleCreatePrompt() {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }

    if (!newPromptName.trim() || !newPromptContent.trim()) {
      toast({ title: l("请输入名称和内容", "Please enter name and content"), variant: "destructive" });
      return;
    }

    try {
      await createPrompt({
        workspaceId: activeWorkspaceId,
        name: newPromptName.trim(),
        content: newPromptContent,
      });
      toast({ title: l("Prompt 已创建", "Prompt created") });
      setCreatePromptOpen(false);
      setNewPromptName("");
      setNewPromptContent("");
    } catch (error) {
      toast({
        title: l("创建失败", "Create failed"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  async function handleSavePromptDetail() {
    if (!selectedPrompt) {
      return;
    }
    const trimmedName = detailName.trim();
    if (!trimmedName) {
      toast({ title: l("标题不能为空", "Title cannot be empty"), variant: "destructive" });
      return;
    }

    try {
      await updatePrompt({
        promptId: selectedPrompt.id,
        name: trimmedName,
        content: detailContent,
        category: detailCategory || "default",
        tags: parseTags(detailTagsInput),
        favorite: detailFavorite,
      });
      toast({ title: l("已保存", "Saved") });
      if (activeWorkspaceId) {
        await fetchPrompts(activeWorkspaceId);
      }
    } catch (error) {
      toast({
        title: l("保存失败", "Save failed"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  async function handleOpenPromptVersion() {
    if (!selectedPrompt) {
      return;
    }

    try {
      await fetchPromptVersions(selectedPrompt.id);
      const versions = promptVersions[selectedPrompt.id] ?? [];
      setPromptVersionCompareMode(false);
      setPromptVersionPreview(versions[0]?.version ?? null);
      setCompareLeftVersion(null);
      setCompareRightVersion(null);
      setVersionModalOpen(true);
    } catch (error) {
      toast({
        title: l("读取版本失败", "Failed to load versions"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  function togglePromptCompareCandidate(version: number) {
    const { compareLeftVersion, compareRightVersion } = args;
    if (compareLeftVersion === version) {
      setCompareLeftVersion(null);
      return;
    }
    if (compareRightVersion === version) {
      setCompareRightVersion(null);
      return;
    }
    if (compareLeftVersion === null) {
      setCompareLeftVersion(version);
      return;
    }
    if (compareRightVersion === null) {
      setCompareRightVersion(version);
      return;
    }
    setCompareLeftVersion(compareRightVersion);
    setCompareRightVersion(version);
  }

  async function handleRestorePromptVersion(version: number) {
    if (!selectedPrompt) {
      return;
    }
    try {
      await restorePromptVersion(selectedPrompt.id, version);
      if (activeWorkspaceId) {
        await fetchPrompts(activeWorkspaceId);
      }
      toast({ title: l("已恢复指定版本", "Selected version restored") });
      setVersionModalOpen(false);
    } catch (error) {
      toast({
        title: l("恢复失败", "Restore failed"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  async function handleDeletePrompt(promptId: string, promptName: string) {
    if (!window.confirm(l(`确认删除 Prompt「${promptName}」吗？`, `Delete prompt "${promptName}"?`))) {
      return;
    }
    try {
      await deletePrompt(promptId);
      setPromptDetailView("list");
      toast({ title: l("删除成功", "Deleted") });
    } catch (error) {
      toast({
        title: l("删除失败", "Delete failed"),
        description: error instanceof Error ? error.message : l("未知错误", "Unknown error"),
        variant: "destructive",
      });
    }
  }

  async function handleTogglePromptFavorite(row: {
    id: string;
    content: string;
    tags: string[];
    category: string;
    favorite: boolean;
  }) {
    try {
      await updatePrompt({
        promptId: row.id,
        content: row.content,
        tags: row.tags,
        category: row.category,
        favorite: !row.favorite,
      });
      if (activeWorkspaceId) {
        await fetchPrompts(activeWorkspaceId);
      }
      toast({
        title: !row.favorite ? l("已收藏", "Favorited") : l("已取消收藏", "Unfavorited"),
      });
    } catch (error) {
      toast({
        title: l("操作失败", "Action failed"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    }
  }

  async function runPromptBatchAction(action: "favorite_on" | "favorite_off" | "move" | "delete") {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    if (promptSelectedIds.length === 0) {
      toast({ title: l("请先选择 Prompt", "Please select prompts first"), variant: "destructive" });
      return;
    }
    if (action === "move" && !promptBatchCategory.trim()) {
      toast({ title: l("请输入目标分类", "Please enter target category"), variant: "destructive" });
      return;
    }
    if (action === "delete") {
      const confirmed = window.confirm(
        l(
          `确认删除选中的 ${promptSelectedIds.length} 条 Prompt 吗？`,
          `Delete ${promptSelectedIds.length} selected prompts?`,
        ),
      );
      if (!confirmed) {
        return;
      }
    }

    try {
      let moveTargetCategoryKey = "";
      if (action === "favorite_on") {
        await batchFavorite(true);
      } else if (action === "favorite_off") {
        await batchFavorite(false);
      } else if (action === "move") {
        moveTargetCategoryKey = normalizePromptCategoryKey(promptBatchCategory.trim());
        await batchMove(promptBatchCategory.trim());
      } else {
        await batchDelete();
      }
      await fetchPrompts(activeWorkspaceId);
      clearPromptSelection();
      const result = usePromptsStore.getState().lastBatchResult;
      if (result) {
        if (result.success > 0 && action === "favorite_on") {
          setPromptBatchJumpSuggestion({ type: "favorites" });
        } else if (result.success > 0 && action === "move") {
          setPromptBatchJumpSuggestion({
            type: "category",
            categoryKey: moveTargetCategoryKey || PROMPT_CATEGORY_UNCATEGORIZED_KEY,
          });
        } else {
          setPromptBatchJumpSuggestion(null);
        }
        toast({
          title: l("批量操作完成", "Batch action completed"),
          description: l(
            `成功 ${result.success} 条，失败 ${result.failed} 条`,
            `${result.success} succeeded, ${result.failed} failed`,
          ),
          variant: result.failed > 0 ? "destructive" : "default",
        });
      } else {
        setPromptBatchJumpSuggestion(null);
      }
    } catch (error) {
      toast({
        title: l("批量操作失败", "Batch action failed"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    }
  }

  return {
    handleCreatePrompt,
    handleSavePromptDetail,
    handleOpenPromptVersion,
    togglePromptCompareCandidate,
    handleRestorePromptVersion,
    handleDeletePrompt,
    handleTogglePromptFavorite,
    runPromptBatchAction,
  };
}
