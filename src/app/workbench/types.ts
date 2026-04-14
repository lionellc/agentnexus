export type LocalAgentTranslationStreamEvent = {
  requestId: string;
  stream: "stdout" | "stderr" | "lifecycle" | string;
  chunk: string;
  done: boolean;
  ts: string;
};

export type SkillScanDirectory = {
  path: string;
  selected: boolean;
  source: "default" | "custom";
};

export type AppTheme = "light" | "dark";

export type AppUpdateStage =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "restarting"
  | "latest"
  | "error";

export type AppUpdateProgress = {
  downloadedBytes: number;
  totalBytes?: number;
};

export type PromptBatchJumpSuggestion =
  | { type: "favorites" }
  | { type: "category"; categoryKey: string };
