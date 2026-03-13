export function nowIso(): string {
  return new Date().toISOString();
}

export function prefix(
  value: string | null | undefined,
  len = 8,
): string | null {
  return value ? value.slice(0, len) : null;
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
  level: "info" | "warn" | "error",
  event: string,
  meta: Record<string, unknown>,
): void {
  console.log(JSON.stringify({
    level,
    event,
    service: "create-checkout",
    ts: nowIso(),
    ...meta,
  }));
}

export function sanitizeRequestId(value: string | null): string {
  const candidate = (value ?? crypto.randomUUID()).slice(0, 128);
  const safe = candidate.replace(/[^a-zA-Z0-9._:-]/g, "");
  return safe || crypto.randomUUID();
}
