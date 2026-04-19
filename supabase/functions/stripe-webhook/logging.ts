// supabase/functions/stripe-webhook/logging.ts
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

// ─── Request ID sanitization ──────────────────────────────────────────────────
// Sanitizes an inbound x-request-id header value before it is embedded in
// structured log entries.
//
// Security properties:
//   - Only printable ASCII (0x20–0x7E) is allowed. Control characters
//     (including \n, \r, \t) and non-ASCII bytes are stripped. This prevents
//     log-injection attacks where a caller crafts a request-id that, when
//     embedded in a JSON log line, closes the JSON object and appends a
//     synthetic log entry with an arbitrary event name or severity level.
//   - Length is capped at 128 characters (generous for UUIDs at 36 chars,
//     tight enough to prevent oversized log lines).
//   - If the result is empty after sanitization, a fresh crypto UUID is
//     generated so every request always has a traceable identifier.
//
// Usage: call once at the top of Deno.serve() and thread the result through
// all log() calls for the lifetime of the request.

export function sanitizeRequestId(value: string | null | undefined): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return crypto.randomUUID();
  }

  // Strip non-printable-ASCII characters (control chars + unicode).
  // Printable ASCII = codepoints 0x20 (space) through 0x7E (~).
  // We also strip space itself from the boundaries via trim() below.
  const sanitized = value
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .slice(0, 128);

  return sanitized.length > 0 ? sanitized : crypto.randomUUID();
}