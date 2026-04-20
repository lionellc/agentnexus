export type InstallMode = "copy" | "symlink" | "hardlink" | "mirror" | string;

export interface Workspace {
  id: string;
  name: string;
  rootPath: string;
  installMode: InstallMode;
  platformOverrides: Record<string, string>;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceCreateInput {
  name: string;
  rootPath: string;
}

export interface WorkspaceActivateInput {
  id: string;
}

export interface WorkspaceUpdateInput {
  id: string;
  name?: string;
  rootPath?: string;
  installMode?: InstallMode;
  platformOverrides?: Record<string, string>;
}

export interface RuntimeFlags {
  localMode: boolean;
  externalSourcesEnabled: boolean;
  experimentalEnabled: boolean;
  updatedAt: string;
}

export interface RuntimeFlagsInput {
  localMode: boolean;
  externalSourcesEnabled: boolean;
  experimentalEnabled: boolean;
}

export interface DistributionTarget {
  id: string;
  workspaceId: string;
  platform: string;
  targetPath: string;
  skillsPath: string;
  installMode: InstallMode;
  createdAt: string;
  updatedAt: string;
}

export interface TargetUpsertInput {
  workspaceId: string;
  id?: string;
  platform: string;
  targetPath: string;
  skillsPath?: string;
  installMode?: InstallMode;
}

export interface TargetDeleteInput {
  workspaceId: string;
  id: string;
}

export type AgentPlatform = "codex" | "claude" | string;
export type AgentPathSource = "manual" | "inferred" | string;
export type AgentDetectionStatus = "detected" | "undetected" | "permission_denied" | string;

export interface AgentConnectionSearchDir {
  path: string;
  enabled: boolean;
  priority: number;
  source: AgentPathSource;
}

export interface AgentConnection {
  id: string;
  workspaceId: string;
  platform: AgentPlatform;
  rootDir: string;
  ruleFile: string;
  rootDirSource: AgentPathSource;
  ruleFileSource: AgentPathSource;
  detectionStatus: AgentDetectionStatus;
  detectedAt: string | null;
  skillSearchDirs: AgentConnectionSearchDir[];
  enabled: boolean;
  resolvedPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentConnectionUpsertInput {
  workspaceId: string;
  platform: AgentPlatform;
  rootDir: string;
  ruleFile?: string;
  rootDirSource?: AgentPathSource;
  ruleFileSource?: AgentPathSource;
  detectionStatus?: AgentDetectionStatus;
  skillSearchDirs?: AgentConnectionSearchDir[];
  enabled?: boolean;
}

export interface AgentConnectionToggleInput {
  workspaceId: string;
  platform: AgentPlatform;
  enabled: boolean;
}

export interface AgentConnectionDeleteInput {
  workspaceId: string;
  platform: AgentPlatform;
}

export interface AgentConnectionPresetActionInput {
  workspaceId: string;
  platform: AgentPlatform;
}
