import { create } from "zustand";

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
  AgentConnectionToggleInput,
  AgentConnectionUpsertInput,
  DistributionTarget,
  FormState,
  RuntimeFlags,
  RuntimeFlagsFormValues,
  TargetFormValues,
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
  upsertTarget: (input: TargetUpsertInput) => Promise<SettingsSaveResult>;
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
      const [workspaces, runtimeFlags] = await Promise.all([workspaceApi.list(), runtimeApi.getFlags()]);
      const activeWorkspace = workspaces.find((item) => item.active) ?? workspaces[0] ?? null;
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
    if (!isAbsolutePath(input.rootDir)) {
      return { ok: false, message: "根目录必须是绝对路径" };
    }

    const connection = await agentConnectionApi.upsert(input);
    set((state) => {
      const nextConnections = state.connections.filter(
        (item) => !(item.workspaceId === connection.workspaceId && item.platform === connection.platform),
      );
      nextConnections.push(connection);
      return { connections: nextConnections };
    });
    return { ok: true, message: "连接配置已保存" };
  },
  toggleConnection: async (input) => {
    const connection = await agentConnectionApi.toggle(input);
    set((state) => ({
      connections: state.connections.map((item) =>
        item.workspaceId === connection.workspaceId && item.platform === connection.platform ? connection : item,
      ),
    }));
    return { ok: true, message: input.enabled ? "连接已启用" : "连接已禁用" };
  },
  upsertTarget: async (input) => {
    if (!validateTargetPath(input.targetPath)) {
      return { ok: false, message: "目标路径不合法" };
    }
    if (input.skillsPath && !validateTargetPath(input.skillsPath)) {
      return { ok: false, message: "Skills 路径不合法" };
    }

    await targetApi.upsert(input);
    const targets = await targetApi.list(input.workspaceId);
    set({ targets, targetForm: createFormState(toTargetForm(targets[0])) });
    return { ok: true, message: "保存成功" };
  },
  updateRuntimeFlags: async (next) => {
    const updated = await runtimeApi.updateFlags({
      localMode: next.localMode,
      externalSourcesEnabled: next.externalSourcesEnabled,
      experimentalEnabled: next.experimentalEnabled,
    });
    set({ runtimeFlags: updated });
    set({ runtimeFlagsForm: createFormState(toRuntimeFlagsForm(updated)) });
    return { ok: true, message: "已更新" };
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
      return { ok: false, message: "请先启用 WebDAV" };
    }
    if (!webdav.endpoint.trim()) {
      return { ok: false, message: "请输入服务器地址" };
    }

    await securityApi.checkExternalSource(webdav.endpoint);
    return { ok: true, message: "连接测试成功" };
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
    return { ok: true, message: "上传完成（本地模拟）" };
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
    return { ok: true, message: "下载完成（本地模拟）" };
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
