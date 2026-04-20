import { create } from "zustand";
import { appDataDir } from "@tauri-apps/api/path";

import {
  agentConnectionApi,
  loadWebDavConfig,
  runtimeApi,
  saveWebDavConfig,
  securityApi,
  targetApi,
  workspaceApi,
  type WebDavConfig,
} from "../services/api";
import type {
  AgentConnection,
  AgentConnectionDeleteInput,
  AgentConnectionPresetActionInput,
  AgentConnectionToggleInput,
  AgentConnectionUpsertInput,
  DistributionTarget,
  FormState,
  RuntimeFlags,
  RuntimeFlagsFormValues,
  TargetFormValues,
  TargetDeleteInput,
  TargetUpsertInput,
  WebDavFormValues,
  Workspace,
  WorkspaceCreateInput,
  WorkspaceFormValues,
} from "../types";

export type SettingsSaveResult = {
  ok: boolean;
  message: string;
};

const LANGUAGE_STORAGE_KEY = "agentnexus.app.language";

function isEnglishLanguage(): boolean {
  try {
    const language = globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY)?.trim()?.toLowerCase() ?? "";
    return language === "en" || language.startsWith("en-");
  } catch {
    return false;
  }
}

function message(zh: string, en: string): string {
  return isEnglishLanguage() ? en : zh;
}

type SettingsState = {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  runtimeFlags: RuntimeFlags | null;
  targets: DistributionTarget[];
  connections: AgentConnection[];
  webdav: WebDavConfig;
  workspaceForm: FormState<WorkspaceFormValues>;
  targetForm: FormState<TargetFormValues>;
  runtimeFlagsForm: FormState<RuntimeFlagsFormValues>;
  webdavForm: FormState<WebDavFormValues>;
  dirty: Record<string, boolean>;
  loading: boolean;
  loadAll: () => Promise<void>;
  createWorkspace: (input: WorkspaceCreateInput) => Promise<Workspace>;
  activateWorkspace: (id: string) => Promise<void>;
  loadConnections: (workspaceId?: string) => Promise<AgentConnection[]>;
  upsertConnection: (input: AgentConnectionUpsertInput) => Promise<SettingsSaveResult>;
  toggleConnection: (input: AgentConnectionToggleInput) => Promise<SettingsSaveResult>;
  deleteConnection: (input: AgentConnectionDeleteInput) => Promise<SettingsSaveResult>;
  redetectConnection: (input: AgentConnectionPresetActionInput) => Promise<SettingsSaveResult>;
  restoreConnectionDefaults: (input: AgentConnectionPresetActionInput) => Promise<SettingsSaveResult>;
  upsertTarget: (input: TargetUpsertInput) => Promise<SettingsSaveResult>;
  deleteTarget: (input: TargetDeleteInput) => Promise<SettingsSaveResult>;
  updateRuntimeFlags: (next: RuntimeFlags) => Promise<SettingsSaveResult>;
  setWebDav: (next: WebDavConfig) => void;
  testWebDav: () => Promise<SettingsSaveResult>;
  uploadWebDav: () => Promise<SettingsSaveResult>;
  downloadWebDav: () => Promise<SettingsSaveResult>;
  setDirty: (section: string, dirty: boolean) => void;
  patchWorkspaceForm: (patch: Partial<WorkspaceFormValues>) => void;
  patchTargetForm: (patch: Partial<TargetFormValues>) => void;
  patchRuntimeFlagsForm: (patch: Partial<RuntimeFlagsFormValues>) => void;
  patchWebdavForm: (patch: Partial<WebDavFormValues>) => void;
};

function validateTargetPath(path: string): boolean {
  return path.trim().length > 1;
}

function isAbsolutePath(path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith("/")) {
    return true;
  }
  return /^[A-Za-z]:[\\/]/.test(trimmed);
}

function isValidRuleFilePath(path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith("/") || /^[A-Za-z]:[\\/]/.test(trimmed)) {
    return false;
  }
  return !trimmed.split(/[\\/]+/).some((segment) => segment === "..");
}

function createFormState<T>(values: T): FormState<T> {
  return { values, dirty: false, submitting: false, errors: {} };
}

function toWorkspaceForm(workspace?: Workspace): WorkspaceFormValues {
  if (!workspace) {
    return {
      name: "",
      rootPath: "",
      installMode: "copy",
      platformOverrides: {},
    };
  }

  return {
    id: workspace.id,
    name: workspace.name,
    rootPath: workspace.rootPath,
    installMode: workspace.installMode,
    platformOverrides: { ...workspace.platformOverrides },
  };
}

function toTargetForm(target?: DistributionTarget): TargetFormValues {
  if (!target) {
    return {
      workspaceId: "",
      platform: "",
      targetPath: "",
    };
  }

  return {
    id: target.id,
    workspaceId: target.workspaceId,
    platform: target.platform,
    targetPath: target.targetPath,
    skillsPath: target.skillsPath,
    installMode: target.installMode,
  };
}

function toRuntimeFlagsForm(runtimeFlags?: RuntimeFlags): RuntimeFlagsFormValues {
  if (!runtimeFlags) {
    return {
      localMode: true,
      externalSourcesEnabled: false,
      experimentalEnabled: false,
      updatedAt: "",
    };
  }

  return { ...runtimeFlags };
}

async function resolveSingleProjectWorkspace(): Promise<Workspace[]> {
  let workspaces = await workspaceApi.list();
  if (workspaces.length === 0) {
    const defaultDir = await appDataDir();
    const created = await workspaceApi.create({
      name: message("默认项目", "Default Project"),
      rootPath: defaultDir,
    });
    const activated = await workspaceApi.activate(created.id);
    return [{ ...activated, active: true }];
  }

  const currentActive = workspaces.find((item) => item.active);
  if (currentActive) {
    return [{ ...currentActive, active: true }];
  }

  const activated = await workspaceApi.activate(workspaces[0].id);
  return [{ ...activated, active: true }];
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  runtimeFlags: null,
  targets: [],
  connections: [],
  webdav: loadWebDavConfig(),
  workspaceForm: createFormState(toWorkspaceForm()),
  targetForm: createFormState(toTargetForm()),
  runtimeFlagsForm: createFormState(toRuntimeFlagsForm()),
  webdavForm: createFormState({
    endpoint: "",
    username: "",
    password: "",
    basePath: "",
    enabled: false,
  }),
  dirty: {},
  loading: false,
  loadAll: async () => {
    set({ loading: true });
    try {
      const [workspaces, runtimeFlags] = await Promise.all([
        resolveSingleProjectWorkspace(),
        runtimeApi.getFlags(),
      ]);
      const activeWorkspace = workspaces[0] ?? null;
      const [targets, connections] = activeWorkspace
        ? await Promise.all([targetApi.list(activeWorkspace.id), agentConnectionApi.list(activeWorkspace.id)])
        : [[], []];
      set({
        workspaces,
        activeWorkspaceId: activeWorkspace?.id ?? null,
        runtimeFlags,
        targets,
        connections,
        workspaceForm: createFormState(toWorkspaceForm(activeWorkspace ?? undefined)),
        targetForm: createFormState(toTargetForm(targets[0])),
        runtimeFlagsForm: createFormState(toRuntimeFlagsForm(runtimeFlags)),
        webdavForm: createFormState({
          endpoint: get().webdav.endpoint,
          username: get().webdav.username,
          password: get().webdav.password,
          basePath: "",
          enabled: get().webdav.enabled,
        }),
      });
    } finally {
      set({ loading: false });
    }
  },
  createWorkspace: async (input) => {
    const created = await workspaceApi.create(input);
    set((state) => ({
      workspaces: [created, ...state.workspaces],
      activeWorkspaceId: created.id,
      workspaceForm: createFormState(toWorkspaceForm(created)),
    }));
    return created;
  },
  activateWorkspace: async (id) => {
    const activated = await workspaceApi.activate(id);
    const [targets, connections] = await Promise.all([
      targetApi.list(activated.id),
      agentConnectionApi.list(activated.id),
    ]);
    set((state) => ({
      activeWorkspaceId: activated.id,
      workspaces: state.workspaces.map((item) => ({ ...item, active: item.id === activated.id })),
      targets,
      connections,
      workspaceForm: createFormState(toWorkspaceForm(activated)),
      targetForm: createFormState(toTargetForm(targets[0])),
    }));
  },
  loadConnections: async (workspaceId) => {
    const activeWorkspaceId = workspaceId ?? get().activeWorkspaceId;
    if (!activeWorkspaceId) {
      set({ connections: [] });
      return [];
    }
    const connections = await agentConnectionApi.list(activeWorkspaceId);
    set({ connections });
    return connections;
  },
  upsertConnection: async (input) => {
    const rootDir = input.rootDir.trim();
    const enabled = input.enabled ?? true;
    if (enabled) {
      if (!isAbsolutePath(rootDir)) {
        return { ok: false, message: message("启用 Agent 时根目录必须是绝对路径", "Root directory must be an absolute path when enabling agent") };
      }
    } else if (rootDir && !isAbsolutePath(rootDir)) {
      return { ok: false, message: message("根目录必须是绝对路径", "Root directory must be an absolute path") };
    }
    const ruleFile = (input.ruleFile ?? "").trim();
    if (!isValidRuleFilePath(ruleFile)) {
      return { ok: false, message: message("规则文件必须是相对路径，且不能包含 ..", "Rule file must be a relative path and cannot contain ..") };
    }

    const connection = await agentConnectionApi.upsert({
      ...input,
      rootDir,
      ruleFile,
      enabled,
    });
    set((state) => {
      const nextConnections = state.connections.filter(
        (item) => !(item.workspaceId === connection.workspaceId && item.platform === connection.platform),
      );
      nextConnections.push(connection);
      return { connections: nextConnections };
    });
    return { ok: true, message: message("连接配置已保存", "Connection settings saved") };
  },
  toggleConnection: async (input) => {
    const connection = await agentConnectionApi.toggle(input);
    set((state) => ({
      connections: state.connections.map((item) =>
        item.workspaceId === connection.workspaceId && item.platform === connection.platform ? connection : item,
      ),
    }));
    return {
      ok: true,
      message: input.enabled ? message("连接已启用", "Connection enabled") : message("连接已禁用", "Connection disabled"),
    };
  },
  deleteConnection: async (input) => {
    const connections = await agentConnectionApi.delete(input);
    set({ connections });
    return { ok: true, message: message("连接已删除", "Connection deleted") };
  },
  redetectConnection: async (input) => {
    const connection = await agentConnectionApi.redetect(input);
    set((state) => ({
      connections: state.connections.map((item) =>
        item.workspaceId === connection.workspaceId && item.platform === connection.platform
          ? connection
          : item,
      ),
    }));
    return { ok: true, message: message("已完成重新检测", "Redetection completed") };
  },
  restoreConnectionDefaults: async (input) => {
    const connection = await agentConnectionApi.restoreDefaults(input);
    set((state) => ({
      connections: state.connections.map((item) =>
        item.workspaceId === connection.workspaceId && item.platform === connection.platform
          ? connection
          : item,
      ),
    }));
    return { ok: true, message: message("已恢复默认配置", "Defaults restored") };
  },
  upsertTarget: async (input) => {
    if (!validateTargetPath(input.targetPath)) {
      return { ok: false, message: message("目标路径不合法", "Invalid target path") };
    }
    if (input.skillsPath && !validateTargetPath(input.skillsPath)) {
      return { ok: false, message: message("Skills 路径不合法", "Invalid skills path") };
    }

    await targetApi.upsert(input);
    const targets = await targetApi.list(input.workspaceId);
    set({ targets, targetForm: createFormState(toTargetForm(targets[0])) });
    return { ok: true, message: message("保存成功", "Saved successfully") };
  },
  deleteTarget: async (input) => {
    if (!input.id.trim()) {
      return { ok: false, message: message("目标 ID 不合法", "Invalid target ID") };
    }
    await targetApi.delete(input);
    const targets = await targetApi.list(input.workspaceId);
    set({ targets, targetForm: createFormState(toTargetForm(targets[0])) });
    return { ok: true, message: message("目标已删除", "Target deleted") };
  },
  updateRuntimeFlags: async (next) => {
    const updated = await runtimeApi.updateFlags({
      localMode: next.localMode,
      externalSourcesEnabled: next.externalSourcesEnabled,
      experimentalEnabled: next.experimentalEnabled,
    });
    set({ runtimeFlags: updated });
    set({ runtimeFlagsForm: createFormState(toRuntimeFlagsForm(updated)) });
    return { ok: true, message: message("已更新", "Updated") };
  },
  setWebDav: (webdav) => {
    saveWebDavConfig(webdav);
    set({
      webdav,
      webdavForm: createFormState({
        endpoint: webdav.endpoint,
        username: webdav.username,
        password: webdav.password,
        basePath: "",
        enabled: webdav.enabled,
      }),
    });
  },
  testWebDav: async () => {
    const { webdav } = get();
    if (!webdav.enabled) {
      return { ok: false, message: message("请先启用 WebDAV", "Please enable WebDAV first") };
    }
    if (!webdav.endpoint.trim()) {
      return { ok: false, message: message("请输入服务器地址", "Please enter the server URL") };
    }

    await securityApi.checkExternalSource(webdav.endpoint);
    return { ok: true, message: message("连接测试成功", "Connection test passed") };
  },
  uploadWebDav: async () => {
    const state = get();
    const tested = await state.testWebDav();
    if (!tested.ok) {
      return tested;
    }

    const updated: WebDavConfig = { ...state.webdav, lastSyncAt: new Date().toISOString() };
    saveWebDavConfig(updated);
    set({ webdav: updated });
    return { ok: true, message: message("上传完成（本地模拟）", "Upload completed (local simulation)") };
  },
  downloadWebDav: async () => {
    const state = get();
    const tested = await state.testWebDav();
    if (!tested.ok) {
      return tested;
    }

    const updated: WebDavConfig = { ...state.webdav, lastSyncAt: new Date().toISOString() };
    saveWebDavConfig(updated);
    set({ webdav: updated });
    return { ok: true, message: message("下载完成（本地模拟）", "Download completed (local simulation)") };
  },
  setDirty: (section, isDirty) =>
    set((state) => ({
      dirty: {
        ...state.dirty,
        [section]: isDirty,
      },
    })),
  patchWorkspaceForm: (patch) =>
    set((state) => ({
      workspaceForm: {
        ...state.workspaceForm,
        values: { ...state.workspaceForm.values, ...patch },
        dirty: true,
      },
    })),
  patchTargetForm: (patch) =>
    set((state) => ({
      targetForm: {
        ...state.targetForm,
        values: { ...state.targetForm.values, ...patch },
        dirty: true,
      },
    })),
  patchRuntimeFlagsForm: (patch) =>
    set((state) => ({
      runtimeFlagsForm: {
        ...state.runtimeFlagsForm,
        values: { ...state.runtimeFlagsForm.values, ...patch },
        dirty: true,
      },
    })),
  patchWebdavForm: (patch) =>
    set((state) => ({
      webdavForm: {
        ...state.webdavForm,
        values: { ...state.webdavForm.values, ...patch },
        dirty: true,
      },
    })),
}));
