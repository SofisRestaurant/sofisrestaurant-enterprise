// =============================================================================
// PATH: supabase/functions/admin-gateway/lib/parsers/shared.ts
// =============================================================================
// Shared parser utilities re-used across domain-specific parser modules.
// All helpers follow the same contract as the top-level parsers.ts rules:
//   - Return null / undefined on invalid input — never throw
//   - Use key-presence checks ('key' in v) for nullable optional fields
// =============================================================================

import { isRecord, safeStr, safeBool, safeNum, parseId } from '../guards.ts';

export { isRecord, safeStr, safeBool, safeNum, parseId };

export type ReorderItem = { id: string; sort_order: number };

export function parseReorderItems(v: unknown): ReorderItem[] | null {
  if (!Array.isArray(v)) return null;

  const items: ReorderItem[] = [];
  for (const entry of v) {
    if (!isRecord(entry)) return null;

    const id = parseId(entry.id);
    const sort_order = safeNum(entry.sort_order);
    if (!id || sort_order === null) return null;

    items.push({ id, sort_order: Math.trunc(sort_order) });
  }

  return items;
}

export function parseNullableTimestampField(
  v: Record<string, unknown>,
  key: string,
  maxLen = 80,
): string | null | undefined {
  if (!(key in v)) return undefined;
  if (v[key] === null) return null;

  const parsed = safeStr(v[key], maxLen);
  return parsed ?? undefined;
}

export function parseOptionalNonNegativeIntField(
  v: Record<string, unknown>,
  key: string,
): number | null | undefined {
  if (!(key in v)) return undefined;
  if (v[key] === null) return null;

  const parsed = safeNum(v[key]);
  if (parsed === null) return undefined;

  return Math.max(0, Math.trunc(parsed));
}

export function parseToggleActivePayload(v: unknown): { id: string; active: boolean } | null {
  if (!isRecord(v)) return null;
  const id = parseId(v.id);
  const active = safeBool(v.active);
  if (!id || active === null) return null;
  return { id, active };
}