import type { SkillManagerStatus } from "../../types";

export const EMPTY_BATCH_SUMMARY = {
  total: 0,
  success: 0,
  failed: 0,
  unknown: 0,
} as const;

export const EMPTY_MANAGER_BATCH_SUMMARY = {
  total: 0,
  success: 0,
  failed: 0,
} as const;

export const MANAGER_STATUS_LIST: SkillManagerStatus[] = [
  "linked",
  "missing",
  "blocked",
  "wrong",
  "directory",
  "manual",
];

export const USAGE_SYNC_TERMINAL_STATUS = new Set([
  "completed",
  "completed_with_errors",
  "failed",
]);

export const USAGE_SYNC_POLL_INTERVAL_MS = 650;
