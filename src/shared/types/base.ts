export type Primitive = string | number | boolean | null;

export type JsonValue = Primitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
}

export interface TauriErrorLike {
  code?: unknown;
  message?: unknown;
  error?: unknown;
  cause?: unknown;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
