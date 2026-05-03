import { invoke } from "@tauri-apps/api/core";

import type { ApiErrorPayload } from "../types";

import { isRecord as isUnknownRecord } from "../types";

import type { CommandMap } from "./tauriCommandTypes";

export type TauriCommandName = keyof CommandMap;
export type CommandArgs<K extends TauriCommandName> = CommandMap[K]["args"];
export type CommandResult<K extends TauriCommandName> = CommandMap[K]["result"];

export class TauriClientError extends Error implements ApiErrorPayload {
  code: string;
  raw?: unknown;

  constructor(payload: ApiErrorPayload, raw?: unknown) {
    super(payload.message);
    this.name = "TauriClientError";
    this.code = payload.code;
    this.raw = raw;
  }
}

function asApiErrorPayload(value: unknown): ApiErrorPayload | null {
  if (!isUnknownRecord(value)) {
    return null;
  }

  const code = value.code;
  const message = value.message;
  if (typeof code === "string" && typeof message === "string") {
    return { code, message };
  }

  return null;
}

function extractApiError(error: unknown): ApiErrorPayload {
  if (typeof error === "string") {
    return { code: "TAURI_INVOKE_ERROR", message: error };
  }

  if (error instanceof Error) {
    const nestedFromCause = asApiErrorPayload(
      (error as Error & { cause?: unknown }).cause,
    );
    if (nestedFromCause) {
      return nestedFromCause;
    }

    const nestedFromMessage = asApiErrorPayload(error.message);
    if (nestedFromMessage) {
      return nestedFromMessage;
    }

    const direct = asApiErrorPayload(error);
    if (direct) {
      return direct;
    }

    return {
      code: "TAURI_INVOKE_ERROR",
      message: error.message || "Tauri invoke failed",
    };
  }

  const payload = asApiErrorPayload(error);
  if (payload) {
    return payload;
  }

  if (isUnknownRecord(error)) {
    const nestedError = asApiErrorPayload(error.error);
    if (nestedError) {
      return nestedError;
    }
  }

  return {
    code: "TAURI_INVOKE_ERROR",
    message: "Tauri invoke failed",
  };
}

export function toTauriClientError(error: unknown): TauriClientError {
  const payload = extractApiError(error);
  return new TauriClientError(payload, error);
}

export async function invokeRaw<TResult = unknown>(
  command: string,
  args?: Record<string, unknown>,
): Promise<TResult> {
  try {
    return await invoke<TResult>(command, args);
  } catch (error) {
    throw toTauriClientError(error);
  }
}

export async function invokeCommand<K extends TauriCommandName>(
  command: K,
  args: Record<string, unknown>,
): Promise<CommandResult<K>>;

export async function invokeCommand<K extends TauriCommandName>(
  command: K,
): Promise<CommandResult<K>>;

export async function invokeCommand<K extends TauriCommandName>(
  command: K,
  args?: Record<string, unknown>,
): Promise<CommandResult<K>> {
  const payload = args as Record<string, unknown> | undefined;
  return invokeRaw<CommandResult<K>>(command, payload);
}
