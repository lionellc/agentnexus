// @ts-nocheck

export function createWorkbenchPromptViewActions(args: any) {
  const {
    activeWorkspaceId,
    dirty,
    settingsCategory,
    l,
    setSettingsCategory,
    setPromptDetailView,
    selectPrompt,
    fetchPrompts,
    promptBatchJumpSuggestion,
    setPromptBatchJumpSuggestion,
    setPromptBrowseScope,
    setPromptBrowseCategory,
    setPromptAllCategoryFilter,
    PROMPT_CATEGORY_ALL_KEY,
    setPromptPage,
  } = args;

  function handleChangeSettingsCategory(next: SettingsCategory) {
    if (dirty[settingsCategory]) {
      const confirmed = window.confirm(l("当前分类有未保存改动，是否继续切换？", "Unsaved changes exist in this category. Continue switching?"));
      if (!confirmed) {
        return;
      }
    }
    setSettingsCategory(next);
  }

  function openPromptDetailById(promptId: string) {
    selectPrompt(promptId);
    setPromptDetailView("detail");
    if (activeWorkspaceId) {
      void fetchPrompts(activeWorkspaceId);
    }
  }

  function leavePromptDetail() {
    setPromptDetailView("list");
    selectPrompt(null);
    if (activeWorkspaceId) {
      void fetchPrompts(activeWorkspaceId);
    }
  }

  function handleChangePromptBrowseScope(nextScope: PromptBrowseScope) {
    setPromptBrowseScope(nextScope);
    setPromptPage(1);
  }

  function handleResetPromptBrowseContext() {
    setPromptBrowseScope("all");
    setPromptBrowseCategory(PROMPT_CATEGORY_ALL_KEY);
    setPromptAllCategoryFilter(PROMPT_CATEGORY_ALL_KEY);
    setPromptPage(1);
  }

  function handleRunPromptBatchJumpSuggestion() {
    if (!promptBatchJumpSuggestion) {
      return;
    }
    if (promptBatchJumpSuggestion.type === "favorites") {
      setPromptBrowseScope("favorites");
      setPromptPage(1);
      setPromptBatchJumpSuggestion(null);
      return;
    }
    setPromptBrowseScope("categories");
    setPromptBrowseCategory(promptBatchJumpSuggestion.categoryKey);
    setPromptPage(1);
    setPromptBatchJumpSuggestion(null);
  }

  return {
    handleChangeSettingsCategory,
    openPromptDetailById,
    leavePromptDetail,
    handleChangePromptBrowseScope,
    handleResetPromptBrowseContext,
    handleRunPromptBatchJumpSuggestion,
  };
}
