import { useEffect, useMemo, useState } from "react";

import { open as pickDialog } from "@tauri-apps/plugin-dialog";

import { defaultAgentConfigDir, defaultAgentRuleFile, isAbsolutePathInput, isValidRuleFileInput, normalizeAgentTypeInput, normalizeDirectoryInput, toAgentSortWeight } from "../utils";
import type { ToastOptions } from "../../../shared/ui";

type AgentConnectionDraftField = "platform" | "rootDir" | "ruleFile";

type AgentConnectionDraft = {
  platform: string;
  rootDir: string;
  ruleFile: string;
};

const DEFAULT_NEW_AGENT_CONNECTION_DRAFT: AgentConnectionDraft = {
  platform: "",
  rootDir: "",
  ruleFile: "",
};

type SettingsConnection = {
  platform: string;
  rootDir: string;
  ruleFile: string;
};

type UseWorkbenchAgentConnectionsInput = {
  l: (zh: string, en: string) => string;
  toast: (options: ToastOptions) => string;
  unknownToMessage: (error: unknown, fallback: string) => string;
  activeWorkspaceId: string | null;
  activeWorkspaceRootPath: string;
  homePath: string;
  projectBootingMessage: string;
  settingsConnections: SettingsConnection[];
  loadSettingsConnections: (workspaceId: string) => Promise<void>;
  loadAgentConnections: (workspaceId: string) => Promise<void>;
  upsertConnection: (input: {
    workspaceId: string;
    platform: string;
    rootDir: string;
    ruleFile: string;
    enabled: boolean;
  }) => Promise<{ ok: boolean; message: string }>;
  deleteConnection: (input: { workspaceId: string; platform: string }) => Promise<{ ok: boolean; message: string }>;
  setDirty: (category: "data" | "model" | "general" | "about", value: boolean) => void;
};

export function useWorkbenchAgentConnections({
  l,
  toast,
  unknownToMessage,
  activeWorkspaceId,
  activeWorkspaceRootPath,
  homePath,
  projectBootingMessage,
  settingsConnections,
  loadSettingsConnections,
  loadAgentConnections,
  upsertConnection,
  deleteConnection,
  setDirty,
}: UseWorkbenchAgentConnectionsInput) {
  const [newAgentConnectionDraft, setNewAgentConnectionDraft] = useState<AgentConnectionDraft>(
    () => DEFAULT_NEW_AGENT_CONNECTION_DRAFT,
  );
  const [agentConnectionEditingPlatforms, setAgentConnectionEditingPlatforms] = useState<string[]>([]);
  const [agentConnectionSavingId, setAgentConnectionSavingId] = useState<string | null>(null);
  const [connectionDrafts, setConnectionDrafts] = useState<Record<string, string>>({});
  const [connectionRuleFileDrafts, setConnectionRuleFileDrafts] = useState<Record<string, string>>({});

  const settingsAgentTypes = useMemo(() => {
    const keys = Object.keys(connectionDrafts);
    keys.sort((left, right) => {
      const weightDiff = toAgentSortWeight(left) - toAgentSortWeight(right);
      if (weightDiff !== 0) {
        return weightDiff;
      }
      return left.localeCompare(right);
    });
    return keys;
  }, [connectionDrafts]);

  const settingsAgentRows = useMemo(
    () =>
      settingsAgentTypes.map((agentType) => {
        const rootDir = (connectionDrafts[agentType] ?? "").trim();
        const ruleFile = (connectionRuleFileDrafts[agentType] ?? defaultAgentRuleFile(agentType)).trim();
        return {
          platform: agentType,
          rootDir,
          ruleFile,
        };
      }),
    [connectionDrafts, connectionRuleFileDrafts, settingsAgentTypes],
  );

  useEffect(() => {
    const nextRoots: Record<string, string> = {};
    const nextRules: Record<string, string> = {};
    settingsConnections.forEach((connection) => {
      const key = normalizeAgentTypeInput(connection.platform);
      nextRoots[key] = connection.rootDir || defaultAgentConfigDir(homePath, key);
      nextRules[key] = connection.ruleFile || defaultAgentRuleFile(key);
    });
    setConnectionDrafts(nextRoots);
    setConnectionRuleFileDrafts(nextRules);
  }, [settingsConnections, homePath]);

  useEffect(() => {
    setAgentConnectionEditingPlatforms((prev) =>
      prev.filter((platform) => settingsAgentTypes.includes(platform)),
    );
  }, [settingsAgentTypes]);

  function normalizeAgentConnectionDraft(draft: AgentConnectionDraft): AgentConnectionDraft {
    const platform = normalizeAgentTypeInput(draft.platform);
    const rootDir = normalizeDirectoryInput(draft.rootDir);
    const normalizedRule = draft.ruleFile.trim();
    return {
      platform,
      rootDir,
      ruleFile: normalizedRule || defaultAgentRuleFile(platform || "codex"),
    };
  }

  function validateAgentConnectionDraft(draft: AgentConnectionDraft, mode: "create" | "edit"): string | null {
    if (!draft.platform) {
      return l("Agent 名称不能为空", "Agent name cannot be empty");
    }
    if (!/^[a-z0-9_-]+$/.test(draft.platform)) {
      return l("Agent 名称仅允许字母/数字/-/_", "Agent name only allows letters/numbers/-/_");
    }
    if (mode === "create" && settingsAgentTypes.includes(draft.platform)) {
      return l("Agent 已存在", "Agent already exists");
    }
    if (!isAbsolutePathInput(draft.rootDir)) {
      return l(
        `${draft.platform} Global Config file 必须是绝对路径`,
        `${draft.platform} Global Config file must be an absolute path`,
      );
    }
    if (!isValidRuleFileInput(draft.ruleFile)) {
      return l(
        `${draft.platform} 规则文件必须是相对路径，且不能包含 ..`,
        `${draft.platform} rule file must be a relative path and cannot include ..`,
      );
    }
    return null;
  }

  function getAgentConnectionDefaults(agentType: string): { rootDir: string; ruleFile: string } {
    const normalizedType = normalizeAgentTypeInput(agentType);
    const persisted = settingsConnections.find(
      (item) => normalizeAgentTypeInput(item.platform) === normalizedType,
    );
    return {
      rootDir: persisted?.rootDir || defaultAgentConfigDir(homePath, normalizedType),
      ruleFile: persisted?.ruleFile || defaultAgentRuleFile(normalizedType),
    };
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

  function handleAgentConnectionFieldChange(platform: string, field: "rootDir" | "ruleFile", value: string) {
    const normalized = normalizeAgentTypeInput(platform);
    if (!normalized) {
      return;
    }
    if (field === "rootDir") {
      setConnectionDrafts((prev) => ({
        ...prev,
        [normalized]: value,
      }));
    } else {
      setConnectionRuleFileDrafts((prev) => ({
        ...prev,
        [normalized]: value,
      }));
    }
    setDirty("data", true);
  }

  function handleStartAgentConnectionEdit(platform: string) {
    const normalized = normalizeAgentTypeInput(platform);
    if (!normalized) {
      return;
    }
    setAgentConnectionEditingPlatforms((prev) =>
      prev.includes(normalized) ? prev : [...prev, normalized],
    );
  }

  function handleCancelAgentConnectionEdit(platform: string) {
    const normalized = normalizeAgentTypeInput(platform);
    if (!normalized) {
      return;
    }
    const defaults = getAgentConnectionDefaults(normalized);
    setConnectionDrafts((prev) => ({
      ...prev,
      [normalized]: defaults.rootDir,
    }));
    setConnectionRuleFileDrafts((prev) => ({
      ...prev,
      [normalized]: defaults.ruleFile,
    }));
    setAgentConnectionEditingPlatforms((prev) => prev.filter((item) => item !== normalized));
    setDirty("data", false);
  }

  async function handleSaveAgentConnection(platform: string) {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    const normalizedPlatform = normalizeAgentTypeInput(platform);
    if (!normalizedPlatform) {
      toast({ title: l("Agent 名称不能为空", "Agent name cannot be empty"), variant: "destructive" });
      return;
    }
    const normalized = normalizeAgentConnectionDraft({
      platform: normalizedPlatform,
      rootDir: connectionDrafts[normalizedPlatform] ?? "",
      ruleFile: connectionRuleFileDrafts[normalizedPlatform] ?? defaultAgentRuleFile(normalizedPlatform),
    });
    const validationError = validateAgentConnectionDraft(normalized, "edit");
    if (validationError) {
      toast({ title: validationError, variant: "destructive" });
      return;
    }

    setAgentConnectionSavingId(normalizedPlatform);
    try {
      const result = await upsertConnection({
        workspaceId: activeWorkspaceId,
        platform: normalized.platform,
        rootDir: normalized.rootDir,
        ruleFile: normalized.ruleFile,
        enabled: true,
      });
      if (!result.ok) {
        toast({ title: result.message, variant: "destructive" });
        return;
      }
      await Promise.all([
        loadSettingsConnections(activeWorkspaceId),
        loadAgentConnections(activeWorkspaceId),
      ]);
      setAgentConnectionEditingPlatforms((prev) => prev.filter((item) => item !== normalizedPlatform));
      setDirty("data", false);
      toast({ title: l("Agent 配置已保存", "Agent settings saved") });
    } catch (error) {
      toast({
        title: l("保存 Agent 配置失败", "Failed to save agent settings"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    } finally {
      setAgentConnectionSavingId(null);
    }
  }

  function handleNewAgentConnectionFieldChange(field: AgentConnectionDraftField, value: string) {
    setNewAgentConnectionDraft((prev) => ({
      ...prev,
      [field]: value,
    }));
    setDirty("data", true);
  }

  async function handleCreateAgentConnection() {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    const normalized = normalizeAgentConnectionDraft(newAgentConnectionDraft);
    const validationError = validateAgentConnectionDraft(normalized, "create");
    if (validationError) {
      toast({ title: validationError, variant: "destructive" });
      return;
    }

    setAgentConnectionSavingId("__new_agent__");
    try {
      const result = await upsertConnection({
        workspaceId: activeWorkspaceId,
        platform: normalized.platform,
        rootDir: normalized.rootDir,
        ruleFile: normalized.ruleFile,
        enabled: true,
      });
      if (!result.ok) {
        toast({ title: result.message, variant: "destructive" });
        return;
      }
      await Promise.all([
        loadSettingsConnections(activeWorkspaceId),
        loadAgentConnections(activeWorkspaceId),
      ]);
      setNewAgentConnectionDraft(DEFAULT_NEW_AGENT_CONNECTION_DRAFT);
      setDirty("data", false);
      toast({ title: l("Agent 已新增", "Agent created") });
    } catch (error) {
      toast({
        title: l("新增 Agent 失败", "Failed to create agent"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    } finally {
      setAgentConnectionSavingId(null);
    }
  }

  async function handleDeleteAgentConnection(platform: string) {
    const normalized = normalizeAgentTypeInput(platform);
    if (!normalized) {
      return;
    }
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    if (!window.confirm(l(`确认删除 Agent 配置「${normalized}」吗？`, `Delete agent settings "${normalized}"?`))) {
      return;
    }

    setAgentConnectionSavingId(`delete:${normalized}`);
    try {
      const result = await deleteConnection({
        workspaceId: activeWorkspaceId,
        platform: normalized,
      });
      if (!result.ok) {
        toast({ title: result.message, variant: "destructive" });
        return;
      }
      await Promise.all([
        loadSettingsConnections(activeWorkspaceId),
        loadAgentConnections(activeWorkspaceId),
      ]);
      setAgentConnectionEditingPlatforms((prev) => prev.filter((item) => item !== normalized));
      setDirty("data", false);
      toast({ title: l(`${normalized} 已移除`, `${normalized} removed`) });
    } catch (error) {
      toast({
        title: l("移除 Agent 失败", "Failed to remove agent"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    } finally {
      setAgentConnectionSavingId(null);
    }
  }

  async function handlePickAgentConnectionRootDir(agentType: string) {
    const normalized = normalizeAgentTypeInput(agentType);
    if (!normalized) {
      return;
    }
    const fallbackPath =
      normalizeDirectoryInput(connectionDrafts[normalized] ?? "") ||
      normalizeDirectoryInput(defaultAgentConfigDir(homePath, normalized)) ||
      normalizeDirectoryInput(activeWorkspaceRootPath || "");
    const picked = await pickDirectoryInFinder(
      fallbackPath,
      "选择目录失败",
      "Failed to choose directory",
    );
    if (!picked) {
      return;
    }
    setConnectionDrafts((prev) => ({
      ...prev,
      [normalized]: picked,
    }));
    setDirty("data", true);
  }

  async function handlePickNewAgentConnectionRootDir() {
    const normalizedPlatform = normalizeAgentTypeInput(newAgentConnectionDraft.platform);
    const fallbackPath =
      normalizeDirectoryInput(newAgentConnectionDraft.rootDir) ||
      normalizeDirectoryInput(defaultAgentConfigDir(homePath, normalizedPlatform || "codex")) ||
      normalizeDirectoryInput(activeWorkspaceRootPath || "");
    const picked = await pickDirectoryInFinder(
      fallbackPath,
      "选择目录失败",
      "Failed to choose directory",
    );
    if (!picked) {
      return;
    }
    setNewAgentConnectionDraft((prev) => ({
      ...prev,
      rootDir: picked,
    }));
    setDirty("data", true);
  }

  return {
    newAgentConnectionDraft,
    agentConnectionEditingPlatforms,
    agentConnectionSavingId,
    settingsAgentRows,
    settingsAgentTypes,
    handleAgentConnectionFieldChange,
    handleStartAgentConnectionEdit,
    handleCancelAgentConnectionEdit,
    handleSaveAgentConnection,
    handleNewAgentConnectionFieldChange,
    handleCreateAgentConnection,
    handleDeleteAgentConnection,
    handlePickAgentConnectionRootDir,
    handlePickNewAgentConnectionRootDir,
  };
}
