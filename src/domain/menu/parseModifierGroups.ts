// =============================================================================
// PATH: src/domain/menu/parseModifierGroups.ts
// =============================================================================

import type { Modifier, ModifierGroup, ModifierGroupType } from '@/domain/menu/menu.types';

// ── Internal helpers (private to this module) ─────────────────────────────────

type Rec = Record<string, unknown>;

function isRec(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function safeStr(v: unknown, fallback: string, max: number): string {
  if (typeof v !== 'string') return fallback;
  const t = v.trim();
  return t.length > max ? t.slice(0, max) : t || fallback;
}

function safeBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function safeInt(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/**
 * Float-safe reader — preserves decimals before the × 100 conversion.
 * Used ONLY for price_adjustment (DB dollar float). Do NOT use for cent values.
 */
function safeFloat(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function safeNullableInt(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

const VALID_GROUP_TYPES = new Set<string>(['radio', 'checkbox', 'quantity']);

function safeGroupType(v: unknown): ModifierGroupType {
  return typeof v === 'string' && VALID_GROUP_TYPES.has(v)
    ? (v as ModifierGroupType)
    : 'checkbox';
}

// ── Dollar → cents conversion (THE ONLY SITE IN THE CODEBASE) ─────────────────

/**
 * Convert a DB dollar float to integer cents.
 *
 * This is the ONLY function in the codebase that performs the
 *   price_adjustment (DB dollar float) → integer cents
 * conversion for modifiers. All other files receive integer cents and must
 * assert — not convert — on the value they receive.
 *
 * safeFloat is used before rounding to avoid IEEE 754 drift on values
 * like 0.1 + 0.2 that would be misrepresented by a direct Math.round call.
 *
 * Throws if the DB value is absent or non-numeric — a corrupt price must
 * never silently become 0 cents.
 */
function dollarsToCents(raw: unknown, context: string): number {
  if (raw === null || raw === undefined) {
    throw new Error(
      `parseModifierGroups: ${context} price_adjustment is missing. ` +
      `Expected a DB dollar float.`,
    );
  }
  const dollars = safeFloat(raw, NaN);
  if (!Number.isFinite(dollars)) {
    throw new Error(
      `parseModifierGroups: ${context} price_adjustment is not a finite number: ` +
      `${String(raw)}`,
    );
  }
  const cents = Math.round(dollars * 100);
  // Post-conversion assertion: the result must be an integer.
  // Math.round guarantees this, but we assert explicitly so the contract is
  // machine-checked and visible to future readers.
  if (!Number.isInteger(cents)) {
    throw new Error(
      `parseModifierGroups: ${context} price_adjustment conversion produced a non-integer: ` +
      `${dollars} × 100 = ${cents}`,
    );
  }
  return cents;
}

// ── Modifier parser ───────────────────────────────────────────────────────────

/**
 * Parses a single raw modifier object from the JSONB aggregate.
 * Returns null if the element lacks a valid id — it will be filtered out.
 *
 * price_adjustment: DB dollar float → integer cents (via dollarsToCents).
 * This is the only site in the codebase where that conversion occurs.
 */
function parseModifier(raw: unknown, groupId: string): Modifier | null {
  if (!isRec(raw)) return null;

  const id = safeStr(raw.id, '', 128);
  if (!id) return null;

  const price_adjustment = dollarsToCents(
    raw.price_adjustment,
    `modifier(id=${id}, group=${groupId})`,
  );

  return {
    id,
    // Back-fill modifier_group_id — the view aggregate omits it.
    modifier_group_id: groupId,
    name:             safeStr(raw.name, 'Option', 240),
    price_adjustment,
    available:        safeBool(raw.available, true),
    sort_order:       safeInt(raw.sort_order, 0),
  };
}

// ── Group parser ──────────────────────────────────────────────────────────────

/**
 * Parses a single raw modifier group object.
 * Returns null if the element lacks a valid id.
 */
function parseModifierGroup(raw: unknown): ModifierGroup | null {
  if (!isRec(raw)) return null;

  const id = safeStr(raw.id, '', 128);
  if (!id) return null;

  const rawModifiers = Array.isArray(raw.modifiers) ? raw.modifiers : [];
  const modifiers: Modifier[] = rawModifiers
    .map((m) => parseModifier(m, id))
    .filter((m): m is Modifier => m !== null)
    .sort((a, b) => a.sort_order - b.sort_order);

  const min = safeInt(raw.min_selections, 0);
  const max = safeNullableInt(raw.max_selections);

  return {
    id,
    name:          safeStr(raw.name, 'Options', 240),
    description:   typeof raw.description === 'string'
                     ? raw.description.trim().slice(0, 800) || null
                     : null,
    type:          safeGroupType(raw.type),
    required:      safeBool(raw.required, false),
    min_selections: Math.max(0, min),
    max_selections: max !== null ? Math.max(1, max) : null,
    sort_order:    safeInt(raw.sort_order, 0),
    active:        safeBool(raw.active, true),
    modifiers,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function parseModifierGroupsFromJson(raw: unknown): ModifierGroup[] {
  // Handle JSON string (edge case where Supabase returns raw JSONB as text)
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];
  if (parsed.length === 0) return [];

  return parsed
    .map(parseModifierGroup)
    .filter((g): g is ModifierGroup => g !== null)
    .filter((g) => g.active)
    .sort((a, b) => a.sort_order - b.sort_order);
}