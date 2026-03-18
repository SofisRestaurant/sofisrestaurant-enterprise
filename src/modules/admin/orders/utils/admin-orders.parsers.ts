// =============================================================================
// PATH: src/modules/admin/orders/admin-orders.parsers.ts
// =============================================================================
// Input sanitization and safe parsing of unknown data from Supabase responses.
// Pure functions only — no React, no side effects.
//
// These handle two sources of unknown data:
//   1. DB rows  (typed via Supabase generated types, but still need coercion)
//   2. Realtime payloads  (completely untyped — payload.new / payload.old)
// =============================================================================

// ─── Primitive guards ─────────────────────────────────────────────────────────

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function textFromUnknown(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

export function numberFromUnknown(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (normalized.length === 0) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

// ─── Multi-key readers ────────────────────────────────────────────────────────

/**
 * Reads the first truthy string value found at any of the given keys.
 * Handles camelCase / snake_case drift between DB and realtime payloads.
 */
export function readText(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    if (key in record) {
      const value = textFromUnknown(record[key]);
      if (value) return value;
    }
  }
  return null;
}

/**
 * Reads the first non-null finite number found at any of the given keys.
 */
export function readNumber(
  record: Record<string, unknown>,
  keys: readonly string[],
): number | null {
  for (const key of keys) {
    if (key in record) {
      const value = numberFromUnknown(record[key]);
      if (value !== null) return value;
    }
  }
  return null;
}

// ─── Money normalization ──────────────────────────────────────────────────────

/**
 * Converts a raw price value to integer cents.
 * Heuristic: values ≥ 1000 or integers > 80 are assumed to already be cents.
 * Otherwise the value is assumed to be dollars and multiplied by 100.
 */
export function normalizeMoneyToCents(value: number): number {
  const absolute = Math.abs(value);
  if (absolute >= 1000 || (Number.isInteger(value) && absolute > 80)) {
    return Math.round(value);
  }
  return Math.round(value * 100);
}