// =============================================================================
// PATH: src/domain/menu/parseModifierGroups.ts
// =============================================================================
// SAFE MODIFIER GROUP PARSER
// =============================================================================
// The `menu_items_public` Supabase view returns `modifier_groups` as
// `Json | null` (a JSONB aggregate column). This module is the SINGLE
// authoritative parser that converts that raw payload into the strictly-typed
// `ModifierGroup[]` shape the rest of the app expects.
//
// Why this file exists
// --------------------
// Before this fix, `normalizeMenuItemPublic()` in MenuPage.tsx did a shallow
// spread `{ ...v }` — which forwarded the raw Json object untouched.
// The modal hooks then received a field that looked like an array but whose
// elements were plain JSON objects, not validated `ModifierGroup` instances.
// The result: modifier groups appeared to exist in memory but every consumer
// that checked `.available`, `.required`, `.modifiers[*].price_adjustment` etc.
// got `undefined` instead of the expected values → no modifiers rendered.
//
// Contract (matches DB view SQL exactly)
// --------------------------------------
// The view's JSONB aggregate builds objects of this shape per group:
//   {
//     id, name, type, active, required,
//     min_selections, max_selections,
//     modifiers: [{ id, name, available, is_default, sort_order, price_adjustment }]
//   }
//
// Security notes
// --------------
// - All string fields are trimmed + length-capped — no raw DB text reaches the UI.
// - All numeric fields go through Number() + isFinite guard — no NaN/Infinity.
// - All boolean fields are strict typeof === 'boolean' checked with safe fallback.
// - Arrays are filtered; non-conformant elements are silently dropped.
// - The modifier_group_id on each Modifier is back-filled from the group's id
//   because the view's inner aggregate does not include that redundant column.
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

/** Float-safe reader — does NOT truncate. Used for price_adjustment (stored as dollars). */
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

// ── Modifier parser ───────────────────────────────────────────────────────────

/**
 * Parses a single raw modifier object from the JSONB aggregate.
 * Returns null if the element lacks a valid id — it will be filtered out.
 */
function parseModifier(raw: unknown, groupId: string): Modifier | null {
  if (!isRec(raw)) return null;

  const id = safeStr(raw.id, '', 128);
  if (!id) return null;

  return {
    id,
    // Back-fill modifier_group_id — the view aggregate omits it.
    modifier_group_id: groupId,
    name: safeStr(raw.name, 'Option', 240),
    // price_adjustment in the DB is stored as numeric (dollars), but
    // our domain type uses CENTS. The view returns it as a float dollar value.
    // We convert here: 0.50 → 50 cents. safeFloat preserves decimals before rounding.
    price_adjustment: Math.round(safeFloat(raw.price_adjustment, 0) * 100),
    available: safeBool(raw.available, true),
    sort_order: safeInt(raw.sort_order, 0),
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
    name: safeStr(raw.name, 'Options', 240),
    description: typeof raw.description === 'string' ? raw.description.trim().slice(0, 800) || null : null,
    type: safeGroupType(raw.type),
    required: safeBool(raw.required, false),
    min_selections: Math.max(0, min),
    max_selections: max !== null ? Math.max(1, max) : null,
    sort_order: safeInt(raw.sort_order, 0),
    active: safeBool(raw.active, true),
    modifiers,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parses the `modifier_groups` field from the `menu_items_public` Supabase view.
 *
 * Accepts:
 *   - A JSON string (Supabase occasionally returns JSONB as a string)
 *   - A pre-parsed array (normal Supabase JS client behaviour)
 *   - null / undefined / any other garbage → returns []
 *
 * Always returns a valid, sorted `ModifierGroup[]`.
 * Never throws — all errors produce an empty array.
 *
 * IMPORTANT: price_adjustment values coming from the DB are in DOLLARS (numeric float).
 * This function converts them to CENTS via safeFloat() + Math.round() once, here,
 * before they touch any other layer. Example: 0.50 → 50 cents.
 */
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
    .filter((g) => g.active) // only surface active groups to the customer
    .sort((a, b) => a.sort_order - b.sort_order);
}