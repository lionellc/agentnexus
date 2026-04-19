import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { flushSync } from "react-dom";

import { translationApi } from "../../../shared/services/api";
import type { LocalAgentTranslationTestResult } from "../../../shared/types";

export function createWorkbenchModelActions(args: any) {
  const {
    activeWorkspaceId,
    projectBootingMessage,
    newModelProfileName,
    localAgentProfiles,
    setModelSaving,
    setSelectedModelProfileKey,
    setNewModelProfileName,
    setDirty,
    l,
    toast,
    unknownToMessage,
    selectedModelProfileKey,
    modelProfileName,
    modelExecutable,
    modelArgsTemplateText,
    parseArgsTemplateInput,
    setModelScenarioSettingsOpen,
    translationDefaultProfileKey,
    translationPromptTemplate,
    setTranslationDefaultProfileKey,
    setTranslationPromptTemplate,
    DEFAULT_TRANSLATION_PROFILE_KEY,
    DEFAULT_TRANSLATION_PROMPT_TEMPLATE,
    modelTestSourceText,
    translationTargetLanguage,
    setModelTestSourceText,
    setTranslationTargetLanguage,
    createRequestId,
    modelTestOutputSheet,
    waitForUiPaint,
    LOCAL_AGENT_TRANSLATION_STREAM_EVENT,
    extractStdoutPreviewFromErrorMessage,
    loadModelWorkbenchData,
  } = args;

  function normalizeModelProfileName(value: string): string {
    return value.trim();
  }

  function generateProfileKeyFromName(name: string): string {
    const normalized = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (normalized) {
      return normalized;
    }
    return `profile-${Date.now().toString(36)}`;
  }

  function ensureUniqueProfileKey(baseKey: string, existingKeys: string[]): string {
    const taken = new Set(existingKeys.map((item) => item.trim().toLowerCase()).filter(Boolean));
    if (!taken.has(baseKey)) {
      return baseKey;
    }
    let counter = 2;
    while (taken.has(`${baseKey}-${counter}`)) {
      counter += 1;
    }
    return `${baseKey}-${counter}`;
  }

  async function handleAddModelProfile(sourceType: "localAgent" | "api"): Promise<boolean> {
    if (sourceType === "api") {
      toast({
        title: l("API 模型暂未支持", "API model is not supported yet"),
        variant: "destructive",
      });
      return false;
    }
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return false;
    }

    const name = normalizeModelProfileName(newModelProfileName);
    if (!name) {
      toast({
        title: l("请输入名称", "Please input name"),
        variant: "destructive",
      });
      return false;
    }
    if (
      localAgentProfiles.some(
        (item: any) => normalizeModelProfileName(item.name).toLowerCase() === name.toLowerCase(),
      )
    ) {
      toast({
        title: l("名称已存在", "Name already exists"),
        variant: "destructive",
      });
      return false;
    }
    const baseKey = generateProfileKeyFromName(name);
    const key = ensureUniqueProfileKey(
      baseKey,
      localAgentProfiles.map((item: any) => item.profileKey),
    );

    setModelSaving(true);
    try {
      const profile = await translationApi.upsertProfile({
        workspaceId: activeWorkspaceId,
        profileKey: key,
        name,
        executable: key,
        argsTemplate: [],
        enabled: true,
      });
      await loadModelWorkbenchData(activeWorkspaceId);
      setSelectedModelProfileKey(profile.profileKey);
      setNewModelProfileName("");
      setDirty("model", false);
      toast({ title: l("Profile 已新增", "Profile created") });
      return true;
    } catch (error) {
      toast({
        title: l("新增 Profile 失败", "Failed to create profile"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
      return false;
    } finally {
      setModelSaving(false);
    }
  }

  async function handleSaveModelProfile() {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    const profileKey = selectedModelProfileKey.trim();
    const name = modelProfileName.trim();
    const executable = modelExecutable.trim();
    if (!profileKey || !name || !executable) {
      toast({
        title: l("请先补全 profile 信息", "Please complete profile fields"),
        variant: "destructive",
      });
      return;
    }

    let argsTemplate: string[] = [];
    try {
      argsTemplate = parseArgsTemplateInput(modelArgsTemplateText);
    } catch (error) {
      toast({
        title: l("参数模板格式错误", "Invalid args template"),
        description: unknownToMessage(error, l("参数模板必须是 JSON 字符串数组", "Args template must be a JSON string array")),
        variant: "destructive",
      });
      return;
    }

    setModelSaving(true);
    try {
      const profile = await translationApi.upsertProfile({
        workspaceId: activeWorkspaceId,
        profileKey,
        name,
        executable,
        argsTemplate,
        enabled: true,
      });
      await loadModelWorkbenchData(activeWorkspaceId);
      setSelectedModelProfileKey(profile.profileKey);
      setDirty("model", false);
      toast({ title: l("Profile 已保存", "Profile saved") });
    } catch (error) {
      toast({
        title: l("保存 Profile 失败", "Failed to save profile"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    } finally {
      setModelSaving(false);
    }
  }

  async function handleDeleteModelProfile(profileKey: string) {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    if (!window.confirm(l(`确认删除 profile "${profileKey}"？`, `Delete profile "${profileKey}"?`))) {
      return;
    }
    try {
      const rows = await translationApi.deleteProfile({
        workspaceId: activeWorkspaceId,
        profileKey,
      });
      args.setLocalAgentProfiles(rows);
      const nextKey = rows[0]?.profileKey ?? "codex";
      setSelectedModelProfileKey(nextKey);
      setDirty("model", false);
      toast({ title: l("Profile 已删除", "Profile deleted") });
    } catch (error) {
      toast({
        title: l("删除 Profile 失败", "Failed to delete profile"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    }
  }

  async function handleSaveTranslationConfig(): Promise<boolean> {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return false;
    }
    const defaultProfileKey = translationDefaultProfileKey.trim().toLowerCase();
    const promptTemplate = translationPromptTemplate.trim();
    if (!defaultProfileKey || !promptTemplate) {
      toast({
        title: l("请先补全翻译配置", "Please complete translation config"),
        variant: "destructive",
      });
      return false;
    }
    try {
      await translationApi.updateConfig({
        workspaceId: activeWorkspaceId,
        defaultProfileKey,
        promptTemplate,
      });
      setDirty("model", false);
      toast({ title: l("翻译配置已保存", "Translation config saved") });
      return true;
    } catch (error) {
      toast({
        title: l("保存翻译配置失败", "Failed to save translation config"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
      return false;
    }
  }

  function handleRestoreDefaultTranslationConfig() {
    setTranslationDefaultProfileKey(DEFAULT_TRANSLATION_PROFILE_KEY);
    setTranslationPromptTemplate(DEFAULT_TRANSLATION_PROMPT_TEMPLATE);
    setDirty("model", true);
  }

  async function handleSaveTranslationConfigFromDialog() {
    const saved = await handleSaveTranslationConfig();
    if (saved) {
      setModelScenarioSettingsOpen(false);
    }
  }

  async function handleRunModelTranslationTest(input?: {
    profileKey?: string;
    sourceText?: string;
    targetLanguage?: string;
    syncModelTestForm?: boolean;
  }): Promise<LocalAgentTranslationTestResult | null> {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return null;
    }
    const syncModelTestForm = input?.syncModelTestForm ?? true;
    const profileKey = (input?.profileKey ?? selectedModelProfileKey).trim();
    const sourceTextRaw = input?.sourceText ?? modelTestSourceText;
    const targetLanguageRaw = input?.targetLanguage ?? translationTargetLanguage;
    const sourceText = sourceTextRaw.trim();
    const targetLanguage = targetLanguageRaw.trim();
    if (!profileKey || !sourceText || !targetLanguage) {
      toast({
        title: l("请先填写测试参数", "Please fill test parameters"),
        variant: "destructive",
      });
      return null;
    }
    if (syncModelTestForm && input?.sourceText !== undefined) {
      setModelTestSourceText(input.sourceText);
    }
    if (syncModelTestForm && input?.targetLanguage !== undefined) {
      setTranslationTargetLanguage(input.targetLanguage);
    }

    const requestId = createRequestId();
    let unlistenStream: UnlistenFn | null = null;

    flushSync(() => {
      modelTestOutputSheet.setOpen(true);
      modelTestOutputSheet.setRunning(true);
      modelTestOutputSheet.setResult(null);
      modelTestOutputSheet.setLifecycleText(l("准备运行...", "Preparing..."));
      modelTestOutputSheet.clearFlushTimer();
      modelTestOutputSheet.bufferRef.current = { stdout: "", stderr: "" };
      modelTestOutputSheet.setOutput({ stdout: "", stderr: "" });
    });

    await waitForUiPaint();

    try {
      if (isTauri()) {
        unlistenStream = await listen(LOCAL_AGENT_TRANSLATION_STREAM_EVENT, (event: any) => {
          const payload = event.payload;
          if (!payload || payload.requestId !== requestId) {
            return;
          }
          if (payload.stream === "stdout") {
            modelTestOutputSheet.appendChunk("stdout", payload.chunk ?? "");
            return;
          }
          if (payload.stream === "stderr") {
            modelTestOutputSheet.appendChunk("stderr", payload.chunk ?? "");
            return;
          }
          if (payload.stream === "lifecycle") {
            const lifecycleText = (payload.chunk ?? "").trim();
            modelTestOutputSheet.setLifecycleFromRaw(lifecycleText);
          }
        });
      }

      const result = await translationApi.testTranslation({
        workspaceId: activeWorkspaceId,
        profileKey,
        sourceText,
        targetLanguage,
        requestId,
      });
      modelTestOutputSheet.setResult({
        ok: true,
        text: result.translatedText,
      });
      modelTestOutputSheet.setLifecycleText(l("已完成", "Completed"));
      if (!modelTestOutputSheet.bufferRef.current.stdout && result.stdoutPreview) {
        modelTestOutputSheet.bufferRef.current.stdout = result.stdoutPreview;
      }
      if (!modelTestOutputSheet.bufferRef.current.stderr && result.stderrPreview) {
        modelTestOutputSheet.bufferRef.current.stderr = result.stderrPreview;
      }
      modelTestOutputSheet.flushBuffer();
      return result;
    } catch (error) {
      const message = unknownToMessage(error, l("未知错误", "Unknown error"));
      modelTestOutputSheet.setResult({
        ok: false,
        text: message,
      });
      modelTestOutputSheet.setLifecycleText(l("执行失败", "Execution failed"));
      const stdout = extractStdoutPreviewFromErrorMessage(message);
      if (!modelTestOutputSheet.bufferRef.current.stdout && stdout) {
        modelTestOutputSheet.bufferRef.current.stdout = stdout;
      }
      if (!modelTestOutputSheet.bufferRef.current.stderr) {
        modelTestOutputSheet.bufferRef.current.stderr = message;
      }
      modelTestOutputSheet.flushBuffer();
      return null;
    } finally {
      if (unlistenStream) {
        unlistenStream();
      }
      modelTestOutputSheet.flushBuffer();
      modelTestOutputSheet.setRunning(false);
    }
  }

  return {
    handleAddModelProfile,
    handleSaveModelProfile,
    handleDeleteModelProfile,
    handleRestoreDefaultTranslationConfig,
    handleSaveTranslationConfigFromDialog,
    handleRunModelTranslationTest,
  };
}
