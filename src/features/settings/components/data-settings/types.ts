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
  rootDir: string;
  ruleFile: string;
};

export type AgentConnectionDraft = {
  platform: string;
  rootDir: string;
  ruleFile: string;
};
