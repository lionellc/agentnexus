export type Translator = (zh: string, en: string) => string;

export type DistributionTarget = {
  id: string;
  platform: string;
  targetPath: string;
  skillsPath: string;
  installMode: string;
};

export type DistributionTargetDraft = {
  platform: string;
  targetPath: string;
  installMode: string;
};

export type AgentConnectionRow = {
  platform: string;
  displayName: string;
  rootDir: string;
  ruleFile: string;
  rootDirSource: string;
  ruleFileSource: string;
  detectionStatus: string;
  detectedAt: string | null;
  skillSearchDirs: AgentSkillSearchDirRow[];
  enabled: boolean;
};

export type AgentConnectionDraft = {
  platform: string;
  rootDir: string;
  ruleFile: string;
};

export type AgentSkillSearchDirRow = {
  path: string;
  enabled: boolean;
  priority: number;
  source: string;
};

export type AgentPresetRow = {
  platform: string;
  displayName: string;
  enabled: boolean;
};
