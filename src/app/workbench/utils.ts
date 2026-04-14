import type { AppLanguage } from "../../features/shell/types";
import type { SkillOpenMode } from "../../shared/types";
import {
  APP_LANGUAGE_STORAGE_KEY,
  APP_THEME_STORAGE_KEY,
  DEFAULT_SKILL_SCAN_SUFFIXES,
  SKILL_OPEN_MODE_OPTIONS,
  SKILL_OPEN_MODE_STORAGE_KEY,
  TRANSLATION_TARGET_LANGUAGE_STORAGE_KEY,
} from "./constants";
import type { AppTheme, SkillScanDirectory } from "./types";

export function toLocalTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function resolveInitialSkillOpenMode(): SkillOpenMode {
  if (typeof window === "undefined") {
    return "vscode";
  }
  const raw = window.localStorage.getItem(SKILL_OPEN_MODE_STORAGE_KEY);
  const found = SKILL_OPEN_MODE_OPTIONS.find((item) => item.value === raw);
  return found?.value ?? "vscode";
}

export function resolveInitialLanguage(): AppLanguage {
  if (typeof window === "undefined") {
    return "zh-CN";
  }
  const raw = window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
  return raw === "en-US" ? "en-US" : "zh-CN";
}

export function resolveInitialTheme(): AppTheme {
  if (typeof window === "undefined") {
    return "light";
  }
  const raw = window.localStorage.getItem(APP_THEME_STORAGE_KEY);
  if (raw === "dark") {
    return "dark";
  }
  if (raw === "light") {
    return "light";
  }
  if (typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveInitialTranslationTargetLanguage(): string {
  if (typeof window === "undefined") {
    return "English";
  }
  const raw = window.localStorage.getItem(TRANSLATION_TARGET_LANGUAGE_STORAGE_KEY)?.trim();
  return raw || "English";
}

export async function waitForUiPaint(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
      return;
    }
    window.setTimeout(resolve, 0);
  });
}

export function shouldUseMarkdownPreview(language: string): boolean {
  return language === "markdown";
}

export function normalizeDirectoryInput(value: string): string {
  return value.trim().replace(/[\\/]+$/, "");
}

export function buildDefaultSkillScanDirectories(home: string): SkillScanDirectory[] {
  const normalizedHome = normalizeDirectoryInput(home);
  if (!normalizedHome) {
    return [];
  }
  return DEFAULT_SKILL_SCAN_SUFFIXES.map((suffix) => ({
    path: `${normalizedHome}/${suffix}`,
    selected: true,
    source: "default" as const,
  }));
}

export function migrateLegacySkillScanDirectory(path: string, home: string): string {
  const normalizedPath = normalizeDirectoryInput(path);
  const normalizedHome = normalizeDirectoryInput(home);
  if (!normalizedPath || !normalizedHome) {
    return normalizedPath;
  }
  const legacy = `${normalizedHome}/.agent`;
  if (normalizedPath !== legacy) {
    return normalizedPath;
  }
  return `${normalizedHome}/.agents`;
}

export function mergeSkillScanDirectories(
  defaults: SkillScanDirectory[],
  persisted: SkillScanDirectory[],
): SkillScanDirectory[] {
  const defaultMap = new Map(
    defaults.map((item) => [normalizeDirectoryInput(item.path), item]),
  );
  const merged = defaults.map((item) => ({ ...item }));
  const mergedMap = new Map(
    merged.map((item) => [normalizeDirectoryInput(item.path), item]),
  );

  for (const item of persisted) {
    const normalized = normalizeDirectoryInput(item.path);
    if (!normalized) {
      continue;
    }
    const existing = mergedMap.get(normalized);
    if (existing) {
      existing.selected = Boolean(item.selected);
      continue;
    }
    const defaultItem = defaultMap.get(normalized);
    if (defaultItem) {
      merged.push({
        ...defaultItem,
        selected: Boolean(item.selected),
      });
      mergedMap.set(normalized, merged[merged.length - 1]);
      continue;
    }
    merged.push({
      path: normalized,
      selected: Boolean(item.selected),
      source: "custom",
    });
    mergedMap.set(normalized, merged[merged.length - 1]);
  }

  return merged;
}

export function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeAgentTypeInput(value: string): string {
  return value.trim().toLowerCase();
}

export function defaultAgentConfigDir(home: string, agentType: string): string {
  const normalized = normalizeAgentTypeInput(agentType);
  const homeTrimmed = home.trim().replace(/[\\/]+$/, "");
  if (!homeTrimmed) {
    return "";
  }
  if (normalized === "codex") {
    return `${homeTrimmed}/.codex`;
  }
  if (normalized === "claude") {
    return `${homeTrimmed}/.claude`;
  }
  return "";
}

export function defaultAgentRuleFile(agentType: string): string {
  const normalized = normalizeAgentTypeInput(agentType);
  if (normalized === "claude") {
    return "CLAUDE.md";
  }
  return "AGENTS.md";
}

export function joinRuleFilePath(rootDir: string, ruleFile: string): string {
  const root = rootDir.trim().replace(/[\\/]+$/, "");
  const file = ruleFile.trim().replace(/^[\\/]+/, "");
  if (!root) {
    return file;
  }
  return `${root}/${file}`;
}

export function isValidRuleFileInput(ruleFile: string): boolean {
  const trimmed = ruleFile.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith("/") || /^[A-Za-z]:[\\/]/.test(trimmed)) {
    return false;
  }
  return !trimmed.split(/[\\/]+/).some((segment) => segment === "..");
}

export function toAgentSortWeight(agentType: string): number {
  const normalized = normalizeAgentTypeInput(agentType);
  if (normalized === "codex") {
    return 0;
  }
  if (normalized === "claude") {
    return 1;
  }
  return 2;
}

export function isAbsolutePathInput(path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith("/")) {
    return true;
  }
  return /^[A-Za-z]:[\\/]/.test(trimmed);
}

export function unknownToMessage(error: unknown, fallback = "Unknown error"): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  if (typeof error === "object" && error !== null) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return maybeMessage;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export function unknownToCode(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.trim()) {
      return code.trim();
    }
    const nested = (error as { error?: { code?: unknown } }).error?.code;
    if (typeof nested === "string" && nested.trim()) {
      return nested.trim();
    }
  }
  return "";
}

export function parseArgsTemplateInput(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }
  const parsed = JSON.parse(trimmed);
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    throw new Error("参数模板必须是字符串数组");
  }
  return parsed.map((item) => item.trim()).filter(Boolean);
}

export function extractStdoutPreviewFromErrorMessage(message: string): string {
  const marker = "stdout 预览:\n";
  const idx = message.indexOf(marker);
  if (idx < 0) {
    return "";
  }
  return message.slice(idx + marker.length).trim();
}

export function createRequestId(): string {
  const nativeCrypto = globalThis.crypto as Crypto | undefined;
  if (nativeCrypto?.randomUUID) {
    return nativeCrypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
