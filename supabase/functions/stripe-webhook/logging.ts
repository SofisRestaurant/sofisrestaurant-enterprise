import type { LogLevel } from "./types.ts";

export function nowIso(): string {
  return new Date().toISOString();
}

export function prefix(
  value: string | null | undefined,
  length = 8,
): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  return value.slice(0, length);
}

export function asErr(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function log(
  level: LogLevel,
  event: string,
  meta: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      level,
      event,
      service: "stripe-webhook",
      ...meta,
      ts: nowIso(),
    }),
  );
}
