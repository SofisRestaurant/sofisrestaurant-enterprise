// =============================================================================
// PATH: supabase/functions/admin-gateway/lib/guards.ts
// =============================================================================
// Primitive coercers, DB utilities, and logging.
// No imports — safe to import from anywhere in the gateway.
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type UnknownRecord = Record<string, unknown>;

// ─────────────────────────────────────────────────────────────────────────────
// Type guards
// ─────────────────────────────────────────────────────────────────────────────

export function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ─────────────────────────────────────────────────────────────────────────────
// Safe coercers
// ─────────────────────────────────────────────────────────────────────────────

export function safeStr(v: unknown, max = 4000): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

export function safeBool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

export function safeNum(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function toInt(v: unknown, fallback: number): number {
  const n = safeNum(v);
  return n === null ? fallback : Math.trunc(n);
}

/** Parse an opaque id string. Max 128 chars, rejects empty. */
export function parseId(v: unknown): string | null {
  return safeStr(v, 128);
}

// ─────────────────────────────────────────────────────────────────────────────
// DB utilities
// ─────────────────────────────────────────────────────────────────────────────

export function nowIso(): string {
  return new Date().toISOString();
}

/** Throw a plain Error with a structured `code` property. */
export function dbError(msg: string, code: string): never {
  throw Object.assign(new Error(msg), { code });
}

// ─────────────────────────────────────────────────────────────────────────────
// TypeScript utilities
// ─────────────────────────────────────────────────────────────────────────────

export function assertNever(x: never): never {
  throw new Error(`Unhandled action: ${String(x)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────────────────────

export function log(
  level: 'info' | 'warn' | 'error',
  event: string,
  meta: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      level,
      event,
      service: 'admin-gateway',
      ...meta,
      ts: new Date().toISOString(),
    }),
  );
}