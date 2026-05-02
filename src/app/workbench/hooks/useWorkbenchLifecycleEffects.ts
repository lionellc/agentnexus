import { useEffect } from "react";

import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";

export function useWorkbenchLifecycleEffects(args: any) {
  const {
    loadAllSettings,
    setAppVersion,
    AUTO_CHECK_APP_UPDATES,
    appUpdateAutoCheckedRef,
    checkAppUpdates,
    appUpdateRef,
    APP_LANGUAGE_STORAGE_KEY,
    language,
    APP_THEME_STORAGE_KEY,
    theme,
    TRANSLATION_TARGET_LANGUAGE_STORAGE_KEY,
    translationTargetLanguage,
    activeWorkspaceId,
    clearUsageDetail,
    fetchPrompts,
    fetchSkills,
    loadManagerState,
    refreshUsageStats,
    loadAgentModuleData,
    loadModelWorkbenchData,
    selectedModelProfile,
    setModelProfileName,
    setModelExecutable,
    setModelArgsTemplateText,
    SKILL_OPEN_MODE_STORAGE_KEY,
    skillOpenMode,
    skillOpenMenuOpen,
    skillOpenMenuRef,
    setSkillOpenMenuOpen,
    activeModule,
    setPromptDetailView,
    selectPrompt,
    totalPromptPages,
    setPromptPage,
    promptAllCategoryFilter,
    promptBrowseCategory,
    promptBrowseScope,
    promptQuery,
    readPromptBrowseContext,
    PROMPT_CATEGORY_ALL_KEY,
    setPromptAllCategoryFilter,
    setPromptBrowseScope,
    setPromptBrowseCategory,
    writePromptBrowseContext,
    promptCategoryKeySet,
    settingCategories,
    settingsCategory,
    setSettingsCategory,
    selectedPrompt,
    setDetailName,
    setDetailCategory,
    setDetailTagsInput,
    setDetailContent,
    setDetailFavorite,
    versionModalOpen,
    promptVersionCompareMode,
    selectedPromptVersions,
    promptVersionPreview,
    setPromptVersionPreview,
  } = args;

  useEffect(() => {
    void loadAllSettings();
  }, [loadAllSettings]);

  useEffect(() => {
    void (async () => {
      try {
        const version = await getVersion();
        setAppVersion(version);
      } catch {
        setAppVersion("-");
      }
    })();
  }, [setAppVersion]);

  useEffect(() => {
    if (!AUTO_CHECK_APP_UPDATES || appUpdateAutoCheckedRef.current || !isTauri()) {
      return;
    }
    appUpdateAutoCheckedRef.current = true;
    void checkAppUpdates(false);
  }, [AUTO_CHECK_APP_UPDATES, appUpdateAutoCheckedRef, checkAppUpdates]);

  useEffect(() => {
    return () => {
      const update = appUpdateRef.current;
      appUpdateRef.current = null;
      if (update) {
        void update.close();
      }
    };
  }, [appUpdateRef]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [APP_LANGUAGE_STORAGE_KEY, language]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, theme);
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.dataset.theme = theme;
    if (theme === "dark") {
      document.body.setAttribute("theme-mode", "dark");
    } else {
      document.body.removeAttribute("theme-mode");
    }
  }, [APP_THEME_STORAGE_KEY, theme]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const normalized = translationTargetLanguage.trim() || "English";
    window.localStorage.setItem(TRANSLATION_TARGET_LANGUAGE_STORAGE_KEY, normalized);
  }, [TRANSLATION_TARGET_LANGUAGE_STORAGE_KEY, translationTargetLanguage]);

  useEffect(() => {
    if (!activeWorkspaceId) {
      return;
    }
    clearUsageDetail();
    void fetchPrompts(activeWorkspaceId);
    void fetchSkills();
    void loadManagerState(activeWorkspaceId);
    void refreshUsageStats(activeWorkspaceId).catch(() => undefined);
    void loadAgentModuleData(activeWorkspaceId);
    void loadModelWorkbenchData(activeWorkspaceId);
  }, [
    activeWorkspaceId,
    clearUsageDetail,
    fetchPrompts,
    fetchSkills,
    loadAgentModuleData,
    loadManagerState,
    loadModelWorkbenchData,
    refreshUsageStats,
  ]);

  useEffect(() => {
    if (!selectedModelProfile) {
      setModelProfileName("");
      setModelExecutable("");
      setModelArgsTemplateText("[]");
      return;
    }
    setModelProfileName(selectedModelProfile.name);
    setModelExecutable(selectedModelProfile.executable);
    setModelArgsTemplateText(JSON.stringify(selectedModelProfile.argsTemplate, null, 2));
  }, [selectedModelProfile, setModelProfileName, setModelExecutable, setModelArgsTemplateText]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(SKILL_OPEN_MODE_STORAGE_KEY, skillOpenMode);
  }, [SKILL_OPEN_MODE_STORAGE_KEY, skillOpenMode]);

  useEffect(() => {
    if (!skillOpenMenuOpen || typeof document === "undefined") {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (skillOpenMenuRef.current?.contains(target)) {
        return;
      }
      setSkillOpenMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSkillOpenMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [skillOpenMenuOpen, skillOpenMenuRef, setSkillOpenMenuOpen]);

  useEffect(() => {
    if (activeModule !== "prompts") {
      setPromptDetailView("list");
      selectPrompt(null);
    }
  }, [activeModule, selectPrompt, setPromptDetailView]);

  useEffect(() => {
    setPromptPage((prev: number) => Math.min(prev, totalPromptPages));
  }, [setPromptPage, totalPromptPages]);

  useEffect(() => {
    setPromptPage(1);
  }, [setPromptPage, promptAllCategoryFilter, promptBrowseCategory, promptBrowseScope, promptQuery]);

  useEffect(() => {
    if (!activeWorkspaceId) {
      return;
    }
    const context = readPromptBrowseContext(activeWorkspaceId);
    setPromptAllCategoryFilter(PROMPT_CATEGORY_ALL_KEY);
    if (context) {
      setPromptBrowseScope(context.scope);
      setPromptBrowseCategory(context.categoryKey || PROMPT_CATEGORY_ALL_KEY);
      return;
    }
    setPromptBrowseScope("all");
    setPromptBrowseCategory(PROMPT_CATEGORY_ALL_KEY);
  }, [
    activeWorkspaceId,
    readPromptBrowseContext,
    PROMPT_CATEGORY_ALL_KEY,
    setPromptAllCategoryFilter,
    setPromptBrowseScope,
    setPromptBrowseCategory,
  ]);

  useEffect(() => {
    if (!activeWorkspaceId) {
      return;
    }
    writePromptBrowseContext(activeWorkspaceId, {
      scope: promptBrowseScope,
      categoryKey: promptBrowseCategory || PROMPT_CATEGORY_ALL_KEY,
    });
  }, [
    activeWorkspaceId,
    writePromptBrowseContext,
    promptBrowseCategory,
    promptBrowseScope,
    PROMPT_CATEGORY_ALL_KEY,
  ]);

  useEffect(() => {
    if (promptBrowseScope !== "categories") {
      return;
    }
    if (promptCategoryKeySet.has(promptBrowseCategory)) {
      return;
    }
    setPromptBrowseCategory(PROMPT_CATEGORY_ALL_KEY);
  }, [
    promptBrowseCategory,
    promptBrowseScope,
    promptCategoryKeySet,
    setPromptBrowseCategory,
    PROMPT_CATEGORY_ALL_KEY,
  ]);

  useEffect(() => {
    if (!settingCategories.some((item: { key: string }) => item.key === settingsCategory)) {
      setSettingsCategory("general");
    }
  }, [settingCategories, settingsCategory, setSettingsCategory]);

  useEffect(() => {
    if (!selectedPrompt) {
      setDetailName("");
      setDetailCategory("");
      setDetailTagsInput("");
      setDetailContent("");
      setDetailFavorite(false);
      return;
    }

    setDetailName(selectedPrompt.name);
    setDetailCategory(selectedPrompt.category);
    setDetailTagsInput(selectedPrompt.tags.join(", "));
    setDetailContent(selectedPrompt.content);
    setDetailFavorite(selectedPrompt.favorite);
  }, [
    selectedPrompt,
    setDetailName,
    setDetailCategory,
    setDetailTagsInput,
    setDetailContent,
    setDetailFavorite,
  ]);

  useEffect(() => {
    if (!versionModalOpen || promptVersionCompareMode) {
      return;
    }
    if (selectedPromptVersions.length === 0) {
      if (promptVersionPreview !== null) {
        setPromptVersionPreview(null);
      }
      return;
    }
    const exists =
      promptVersionPreview !== null && selectedPromptVersions.some((item: { version: number }) => item.version === promptVersionPreview);
    if (!exists) {
      setPromptVersionPreview(selectedPromptVersions[0]?.version ?? null);
    }
  }, [
    versionModalOpen,
    promptVersionCompareMode,
    selectedPromptVersions,
    promptVersionPreview,
    setPromptVersionPreview,
  ]);
}
