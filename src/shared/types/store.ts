import type {
  AgentConnection,
  AgentConnectionToggleInput,
  AgentConnectionUpsertInput,
  InstallMode,
  RuntimeFlags,
  TargetUpsertInput,
  Workspace,
} from "./workspace";

export type AppModule = "workspace" | "skills" | "prompts" | "usage" | "agents" | "settings";

export type MobilePaneState = "list" | "detail" | "split";

export interface FormState<T> {
  values: T;
  dirty: boolean;
  submitting: boolean;
  errors: Record<string, string>;
}

export interface WorkspaceFormValues {
  id?: string;
  name: string;
  rootPath: string;
  installMode: InstallMode;
  platformOverrides: Record<string, string>;
}

export interface RuntimeFlagsFormValues extends RuntimeFlags {}

export interface TargetFormValues extends TargetUpsertInput {}

export interface AgentConnectionFormValues extends AgentConnectionUpsertInput {}

export interface AgentConnectionToggleFormValues extends AgentConnectionToggleInput {}

export interface WebDavFormValues {
  endpoint: string;
  username: string;
  password: string;
  basePath: string;
  enabled: boolean;
}

export interface SettingsSnapshot {
  workspace?: Workspace;
  runtimeFlags?: RuntimeFlags;
  connections?: AgentConnection[];
}
