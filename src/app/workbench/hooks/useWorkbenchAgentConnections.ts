import type { WorkbenchToastOptions as ToastOptions } from "../types";
import { useEffect, useMemo, useState } from "react";

import { open as pickDialog } from "@tauri-apps/plugin-dialog";

import {
  defaultAgentConfigDir,
  defaultAgentRuleFile,
  isAbsolutePathInput,
  isValidRuleFileInput,
  normalizeAgentTypeInput,
  normalizeDirectoryInput,
} from "../utils";
import {
  AGENT_PRESETS,
  getAgentPresetById,
  isBuiltInAgentPreset,
  resolveAgentPresetRootDir,
  resolveAgentPresetRuleFile,
  toAgentPresetSortWeight,
} from "../../../features/settings/components/data-settings/agentPresets";
import type {
  AgentConnectionRow,
  AgentPresetRow,
  AgentSkillSearchDirRow,
} from "../../../features/settings/components/data-settings/types";

type SettingsConnection = {
  platform: string;
  rootDir: string;
  ruleFile: string;
  rootDirSource: string;
  ruleFileSource: string;
  detectionStatus: string;
  detectedAt: string | null;
  skillSearchDirs: AgentSkillSearchDirRow[];
  enabled: boolean;
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
  savedAgentPlatformOrder: string[];
  saveAgentPlatformOrder: (orderedPlatforms: string[]) => void;
  loadSettingsConnections: (workspaceId: string) => Promise<void>;
  loadAgentConnections: (workspaceId: string) => Promise<void>;
  loadManagerState?: (workspaceId: string) => Promise<void>;
  loadAgentModuleData?: (workspaceId: string) => Promise<void>;
  upsertConnection: (input: {
    workspaceId: string;
    platform: string;
    rootDir: string;
    ruleFile: string;
    rootDirSource?: string;
    ruleFileSource?: string;
    detectionStatus?: string;
    skillSearchDirs?: AgentSkillSearchDirRow[];
    enabled: boolean;
  }) => Promise<{ ok: boolean; message: string }>;
  toggleConnection: (input: {
    workspaceId: string;
    platform: string;
    enabled: boolean;
  }) => Promise<{ ok: boolean; message: string }>;
  redetectConnection: (input: {
    workspaceId: string;
    platform: string;
  }) => Promise<{ ok: boolean; message: string }>;
  restoreConnectionDefaults: (input: {
    workspaceId: string;
    platform: string;
  }) => Promise<{ ok: boolean; message: string }>;
  setDirty: (category: "data" | "model" | "general" | "about", value: boolean) => void;
};

type AgentConnectionDraft = {
  platform: string;
  rootDir: string;
  ruleFile: string;
  enabled: boolean;
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
  savedAgentPlatformOrder,
  saveAgentPlatformOrder,
  loadSettingsConnections,
  loadAgentConnections,
  loadManagerState,
  loadAgentModuleData,
  upsertConnection,
  toggleConnection,
  redetectConnection,
  restoreConnectionDefaults,
  setDirty,
}: UseWorkbenchAgentConnectionsInput) {
  const [agentConnectionEditingPlatforms, setAgentConnectionEditingPlatforms] = useState<string[]>([]);
  const [agentConnectionSavingId, setAgentConnectionSavingId] = useState<string | null>(null);
  const [connectionDrafts, setConnectionDrafts] = useState<Record<string, string>>({});
  const [connectionRuleFileDrafts, setConnectionRuleFileDrafts] = useState<Record<string, string>>({});

  const settingsConnectionMap = useMemo(() => {
    const map = new Map<string, SettingsConnection>();
    settingsConnections.forEach((connection) => {
      map.set(normalizeAgentTypeInput(connection.platform), connection);
    });
    return map;
  }, [settingsConnections]);

  const builtInRows = useMemo<AgentConnectionRow[]>(
    () =>
      AGENT_PRESETS.map((preset) => {
        const key = normalizeAgentTypeInput(preset.id);
        const persisted = settingsConnectionMap.get(key);
        const defaultRootDir = resolveAgentPresetRootDir(homePath, key) || defaultAgentConfigDir(homePath, key);
        const defaultRuleFile = resolveAgentPresetRuleFile(key) || defaultAgentRuleFile(key);
        const rootDir = (connectionDrafts[key] ?? persisted?.rootDir ?? defaultRootDir).trim();
        const ruleFile = (connectionRuleFileDrafts[key] ?? persisted?.ruleFile ?? defaultRuleFile).trim();
        return {
          platform: key,
          displayName: preset.name,
          rootDir,
          ruleFile,
          rootDirSource: persisted?.rootDirSource ?? "inferred",
          ruleFileSource: persisted?.ruleFileSource ?? "inferred",
          detectionStatus: persisted?.detectionStatus ?? "undetected",
          detectedAt: persisted?.detectedAt ?? null,
          skillSearchDirs: persisted?.skillSearchDirs ?? [],
          enabled: Boolean(persisted?.enabled),
        };
      }),
    [
      connectionDrafts,
      connectionRuleFileDrafts,
      homePath,
      settingsConnectionMap,
    ],
  );

  const customRows = useMemo<AgentConnectionRow[]>(
    () =>
      settingsConnections
        .filter((connection) => !isBuiltInAgentPreset(connection.platform))
        .map((connection) => {
          const key = normalizeAgentTypeInput(connection.platform);
          const rootDir = (connectionDrafts[key] ?? connection.rootDir ?? "").trim();
          const ruleFile = (
            connectionRuleFileDrafts[key] ??
            connection.ruleFile ??
            defaultAgentRuleFile(key)
          ).trim();
          return {
            platform: key,
            displayName: connection.platform,
            rootDir,
            ruleFile,
            rootDirSource: connection.rootDirSource ?? "manual",
            ruleFileSource: connection.ruleFileSource ?? "manual",
            detectionStatus: connection.detectionStatus ?? "undetected",
            detectedAt: connection.detectedAt ?? null,
            skillSearchDirs: connection.skillSearchDirs ?? [],
            enabled: Boolean(connection.enabled),
          };
        }),
    [connectionDrafts, connectionRuleFileDrafts, settingsConnections],
  );

  const enabledAgentRowsUnordered = useMemo(
    () =>
      [...builtInRows, ...customRows]
        .filter((row) => row.enabled)
        .sort((left, right) => {
          const weightDiff = toAgentPresetSortWeight(left.platform) - toAgentPresetSortWeight(right.platform);
          if (weightDiff !== 0) {
            return weightDiff;
          }
          return left.platform.localeCompare(right.platform);
        }),
    [builtInRows, customRows],
  );

  const resolvedEnabledPlatformOrder = useMemo(() => {
    const enabledPlatforms = enabledAgentRowsUnordered.map((row) => row.platform);
    const enabledSet = new Set(enabledPlatforms);
    const fromSaved = savedAgentPlatformOrder
      .map((item) => normalizeAgentTypeInput(item))
      .filter((item) => enabledSet.has(item))
      .filter((item, index, list) => list.indexOf(item) === index);
    const missing = enabledPlatforms.filter((item) => !fromSaved.includes(item));
    return [...fromSaved, ...missing];
  }, [enabledAgentRowsUnordered, savedAgentPlatformOrder]);

  const enabledAgentRows = useMemo(() => {
    const rowByPlatform = new Map(enabledAgentRowsUnordered.map((row) => [row.platform, row]));
    return resolvedEnabledPlatformOrder
      .map((platform) => rowByPlatform.get(platform))
      .filter((row): row is AgentConnectionRow => Boolean(row));
  }, [enabledAgentRowsUnordered, resolvedEnabledPlatformOrder]);

  const availableAgentPresetRows = useMemo<AgentPresetRow[]>(
    () =>
      builtInRows
        .filter((row) => !row.enabled)
        .map((row) => ({
          platform: row.platform,
          displayName: row.displayName,
          enabled: false,
        })),
    [builtInRows],
  );

  useEffect(() => {
    const nextRoots: Record<string, string> = {};
    const nextRules: Record<string, string> = {};

    AGENT_PRESETS.forEach((preset) => {
      const key = normalizeAgentTypeInput(preset.id);
      const persisted = settingsConnectionMap.get(key);
      const fallbackRoot = resolveAgentPresetRootDir(homePath, key) || defaultAgentConfigDir(homePath, key);
      const fallbackRule = resolveAgentPresetRuleFile(key) || defaultAgentRuleFile(key);
      const rootDir = persisted?.rootDir || fallbackRoot;
      nextRoots[key] = rootDir;
      nextRules[key] = persisted?.ruleFile || fallbackRule;
    });

    settingsConnections
      .filter((connection) => !isBuiltInAgentPreset(connection.platform))
      .forEach((connection) => {
        const key = normalizeAgentTypeInput(connection.platform);
        nextRoots[key] = connection.rootDir || "";
        nextRules[key] = connection.ruleFile || defaultAgentRuleFile(key);
      });

    setConnectionDrafts(nextRoots);
    setConnectionRuleFileDrafts(nextRules);
  }, [homePath, settingsConnectionMap, settingsConnections]);

  useEffect(() => {
    const enabledSet = new Set(enabledAgentRows.map((row) => row.platform));
    setAgentConnectionEditingPlatforms((prev) => prev.filter((platform) => enabledSet.has(platform)));
  }, [enabledAgentRows]);

  useEffect(() => {
    const normalizedSaved = savedAgentPlatformOrder
      .map((item) => normalizeAgentTypeInput(item))
      .filter(Boolean);
    const same =
      normalizedSaved.length === resolvedEnabledPlatformOrder.length &&
      normalizedSaved.every((item, index) => item === resolvedEnabledPlatformOrder[index]);
    if (!same) {
      saveAgentPlatformOrder(resolvedEnabledPlatformOrder);
    }
  }, [resolvedEnabledPlatformOrder, saveAgentPlatformOrder, savedAgentPlatformOrder]);

  function normalizeAgentConnectionDraft(draft: AgentConnectionDraft): AgentConnectionDraft {
    const platform = normalizeAgentTypeInput(draft.platform);
    const rootDir = normalizeDirectoryInput(draft.rootDir);
    const normalizedRule = draft.ruleFile.trim();
    return {
      platform,
      rootDir,
      ruleFile: normalizedRule || defaultAgentRuleFile(platform || "codex"),
      enabled: draft.enabled,
    };
  }

  function validateAgentConnectionDraft(draft: AgentConnectionDraft): string | null {
    if (!draft.platform) {
      return l("Agent 名称不能为空", "Agent name cannot be empty");
    }
    if (!/^[a-z0-9_-]+$/.test(draft.platform)) {
      return l("Agent 名称仅允许字母/数字/-/_", "Agent name only allows letters/numbers/-/_");
    }
    if (draft.enabled && !isAbsolutePathInput(draft.rootDir)) {
      return l(
        `${draft.platform} Global Config file 必须是绝对路径`,
        `${draft.platform} Global Config file must be an absolute path`,
      );
    }
    if (!draft.enabled && draft.rootDir && !isAbsolutePathInput(draft.rootDir)) {
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
    const persisted = settingsConnectionMap.get(normalizedType);
    const preset = getAgentPresetById(normalizedType);
    const rootDir =
      persisted?.rootDir ||
      (preset ? resolveAgentPresetRootDir(homePath, normalizedType) : defaultAgentConfigDir(homePath, normalizedType));
    const ruleFile =
      persisted?.ruleFile ||
      (preset ? resolveAgentPresetRuleFile(normalizedType) : defaultAgentRuleFile(normalizedType));
    return { rootDir, ruleFile };
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

  async function reloadLinkedStates(workspaceId: string): Promise<void> {
    await Promise.all([
      loadSettingsConnections(workspaceId),
      loadAgentConnections(workspaceId),
      loadManagerState ? loadManagerState(workspaceId) : Promise.resolve(),
      loadAgentModuleData ? loadAgentModuleData(workspaceId) : Promise.resolve(),
    ]);
  }

  function handleAgentConnectionFieldChange(
    platform: string,
    field: "rootDir" | "ruleFile",
    value: string,
  ) {
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

  function handleReorderEnabledAgentRows(orderedPlatforms: string[]) {
    const currentSet = new Set(enabledAgentRows.map((row) => row.platform));
    const next = orderedPlatforms
      .map((item) => normalizeAgentTypeInput(item))
      .filter((item) => currentSet.has(item))
      .filter((item, index, list) => list.indexOf(item) === index);
    const missing = enabledAgentRows
      .map((row) => row.platform)
      .filter((item) => !next.includes(item));
    saveAgentPlatformOrder([...next, ...missing]);
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
      enabled: true,
    });
    const validationError = validateAgentConnectionDraft(normalized);
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
        rootDirSource: "manual",
        ruleFileSource: "manual",
        enabled: true,
      });
      if (!result.ok) {
        toast({ title: result.message, variant: "destructive" });
        return;
      }
      await reloadLinkedStates(activeWorkspaceId);
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

  async function handleEnableAgentPreset(platform: string) {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    const normalizedPlatform = normalizeAgentTypeInput(platform);
    if (!normalizedPlatform) {
      return;
    }
    const defaults = getAgentConnectionDefaults(normalizedPlatform);
    const normalized = normalizeAgentConnectionDraft({
      platform: normalizedPlatform,
      rootDir: connectionDrafts[normalizedPlatform] ?? defaults.rootDir,
      ruleFile: connectionRuleFileDrafts[normalizedPlatform] ?? defaults.ruleFile,
      enabled: true,
    });
    const validationError = validateAgentConnectionDraft(normalized);
    if (validationError) {
      toast({ title: validationError, variant: "destructive" });
      return;
    }

    setAgentConnectionSavingId(`enable:${normalizedPlatform}`);
    try {
      const result = await upsertConnection({
        workspaceId: activeWorkspaceId,
        platform: normalized.platform,
        rootDir: normalized.rootDir,
        ruleFile: normalized.ruleFile,
        rootDirSource: "manual",
        ruleFileSource: "manual",
        enabled: true,
      });
      if (!result.ok) {
        toast({ title: result.message, variant: "destructive" });
        return;
      }
      await reloadLinkedStates(activeWorkspaceId);
      setDirty("data", false);
      const displayName = getAgentPresetById(normalizedPlatform)?.name ?? normalizedPlatform;
      toast({ title: l(`${displayName} 已添加`, `${displayName} added`) });
    } catch (error) {
      toast({
        title: l("添加 Agent 失败", "Failed to add agent"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    } finally {
      setAgentConnectionSavingId(null);
    }
  }

  async function handleDisableAgentConnection(platform: string) {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    const normalized = normalizeAgentTypeInput(platform);
    if (!normalized) {
      return;
    }
    const existing = settingsConnectionMap.get(normalized);
    if (!existing || !existing.enabled) {
      return;
    }

    const displayName = getAgentPresetById(normalized)?.name ?? normalized;
    if (!window.confirm(l(`确认停用「${displayName}」吗？`, `Disable "${displayName}"?`))) {
      return;
    }

    setAgentConnectionSavingId(`disable:${normalized}`);
    try {
      const result = await toggleConnection({
        workspaceId: activeWorkspaceId,
        platform: normalized,
        enabled: false,
      });
      if (!result.ok) {
        toast({ title: result.message, variant: "destructive" });
        return;
      }
      await reloadLinkedStates(activeWorkspaceId);
      setAgentConnectionEditingPlatforms((prev) => prev.filter((item) => item !== normalized));
      setDirty("data", false);
      toast({ title: l(`${displayName} 已停用`, `${displayName} disabled`) });
    } catch (error) {
      toast({
        title: l("停用 Agent 失败", "Failed to disable agent"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    } finally {
      setAgentConnectionSavingId(null);
    }
  }

  async function handleRedetectAgentConnection(platform: string) {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    const normalized = normalizeAgentTypeInput(platform);
    if (!normalized) {
      return;
    }
    setAgentConnectionSavingId(`redetect:${normalized}`);
    try {
      const result = await redetectConnection({
        workspaceId: activeWorkspaceId,
        platform: normalized,
      });
      if (!result.ok) {
        toast({ title: result.message, variant: "destructive" });
        return;
      }
      await reloadLinkedStates(activeWorkspaceId);
      setDirty("data", false);
      toast({ title: l("重新检测完成", "Redetection completed") });
    } catch (error) {
      toast({
        title: l("重新检测失败", "Failed to redetect"),
        description: unknownToMessage(error, l("未知错误", "Unknown error")),
        variant: "destructive",
      });
    } finally {
      setAgentConnectionSavingId(null);
    }
  }

  async function handleRestoreAgentConnectionDefaults(platform: string) {
    if (!activeWorkspaceId) {
      toast({ title: projectBootingMessage, variant: "destructive" });
      return;
    }
    const normalized = normalizeAgentTypeInput(platform);
    if (!normalized) {
      return;
    }
    setAgentConnectionSavingId(`restore:${normalized}`);
    try {
      const result = await restoreConnectionDefaults({
        workspaceId: activeWorkspaceId,
        platform: normalized,
      });
      if (!result.ok) {
        toast({ title: result.message, variant: "destructive" });
        return;
      }
      await reloadLinkedStates(activeWorkspaceId);
      setDirty("data", false);
      toast({ title: l("已恢复默认配置", "Defaults restored") });
    } catch (error) {
      toast({
        title: l("恢复默认失败", "Failed to restore defaults"),
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
    const defaults = getAgentConnectionDefaults(normalized);
    const fallbackPath =
      normalizeDirectoryInput(connectionDrafts[normalized] ?? "") ||
      normalizeDirectoryInput(defaults.rootDir) ||
      normalizeDirectoryInput(activeWorkspaceRootPath || "");
    const picked = await pickDirectoryInFinder(fallbackPath, "选择目录失败", "Failed to choose directory");
    if (!picked) {
      return;
    }
    setConnectionDrafts((prev) => ({
      ...prev,
      [normalized]: picked,
    }));
    setDirty("data", true);
  }

  return {
    enabledAgentRows,
    availableAgentPresetRows,
    agentConnectionEditingPlatforms,
    agentConnectionSavingId,
    handleAgentConnectionFieldChange,
    handleStartAgentConnectionEdit,
    handleCancelAgentConnectionEdit,
    handleSaveAgentConnection,
    handleEnableAgentPreset,
    handleDisableAgentConnection,
    handleReorderEnabledAgentRows,
    handleRedetectAgentConnection,
    handleRestoreAgentConnectionDefaults,
    handlePickAgentConnectionRootDir,
  };
}
