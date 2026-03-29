// =============================================================================
// PATH: src/modules/menu/utils/modifierGuards.ts
// =============================================================================
// Runtime normalization + pure business-logic helpers for modifier groups and
// selections. No React or Supabase imports — pure functions only.
// =============================================================================

import { isRecord, safeBool, safeStr, clampInt } from './menuItemGuards';
import type { PreflightOk } from '@/domain/menu/menu-modal.types';
import type { ModifierGroupType } from "@/domain/menu/menu.types";

export type ModifierLike = {
  id: string;
  name: string;
  /** integer cents — converted from DB dollar float at normalization time */
  price_adjustment: number;
  available: boolean;
  sort_order?: number | null;
};

export type ModifierGroupLike = {
  id: string;
  name: string;
  description: string | null;
  type: ModifierGroupType;
  required: boolean;
  min_selections: number | null;
  max_selections: number | null;
  sort_order?: number | null;
  active: boolean;
  modifiers: ModifierLike[];
  selections?: ModifierLike[];
};

export type SelectedModifier = {
  id: string;
  name: string;
  priceAdjustment: number; // cents
  groupId: string;
};

export type PreflightErr = { ok: false; error: string };

export type PreflightResponse = PreflightOk | PreflightErr;

// ─── Tag parsing ─────────────────────────────────────────────────────────────

export function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((x) => (typeof x === 'string' ? x.trim() : ''))
      .filter((s) => s.length > 0)
      .slice(0, 24);
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((x) => x.trim())
      .filter((s) => s.length > 0)
      .slice(0, 24);
  }
  return [];
}

// ─── Normalization ────────────────────────────────────────────────────────────

export function normalizeGroupType(v: unknown): ModifierGroupType {
  const t = safeStr(v, '').toLowerCase();
  if (t === 'checkbox' || t === 'multi') return 'checkbox';
  return 'radio'; // covers "radio", "single", null, undefined, anything else
}

/**
 * Normalize a raw modifier row from the DB / public view.
 *
 * The DB `price_adjustment` column is a dollar float (0.5 = $0.50, 1 = $1.00).
 * ModifierLike.price_adjustment is typed as integer cents throughout the app
 * (see menu.types.ts /** cents *\/).
 * We convert here: dollars × 100 → cents, then truncate to integer.
 *
 * Previously this called safeCents() which did NOT multiply by 100,
 * so 0.5 → 0 cents and 1 → 1 cent, producing wrong display prices.
 */
export function normalizeModifierLike(v: unknown): ModifierLike | null {
  if (!isRecord(v)) return null;
  const id = safeStr(v.id, '', 128);
  const name = safeStr(v.name, '', 120);
  if (!id || !name) return null;

  const rawAdj = v.price_adjustment;
  const dollarFloat =
    typeof rawAdj === 'number' && Number.isFinite(rawAdj) ? rawAdj : 0;

  // Convert dollars → integer cents
  const priceAdjustmentCents = Math.trunc(Math.round(dollarFloat * 100));

  return {
    id,
    name,
    price_adjustment: priceAdjustmentCents,
    available: safeBool(v.available, true),
    sort_order: typeof v.sort_order === 'number' ? v.sort_order : null,
  };
}

/**
 * Normalizes a raw DB record into a ModifierGroupLike.
 *
 * DB view may return `selections` instead of `modifiers` — we unify both into
 * `modifiers` so the UI only ever needs to read `g.modifiers`.
 */
export function normalizeGroupLike(v: unknown): ModifierGroupLike | null {
  if (!isRecord(v)) return null;

  const id = safeStr(v.id, '', 128);
  const name = safeStr(v.name, '', 120);
  const type = normalizeGroupType(v.type);
  if (!id || !name) return null;

  // ── Pick the raw modifiers from whichever property exists
  const modsSrc: unknown[] = Array.isArray(v.modifiers)
    ? v.modifiers
    : Array.isArray(v.options)
      ? v.options
      : Array.isArray(v.selections)
        ? v.selections
        : [];

  const mods: ModifierLike[] = [];
  for (const m of modsSrc) {
    const mm = normalizeModifierLike(m);
    if (mm) mods.push(mm);
  }

  // Sort modifiers consistently
  mods.sort((a, b) => {
    const ao = typeof a.sort_order === 'number' ? a.sort_order : 0;
    const bo = typeof b.sort_order === 'number' ? b.sort_order : 0;
    return ao - bo || a.name.localeCompare(b.name);
  });

  const selections: ModifierLike[] | undefined = Array.isArray(v.selections)
    ? v.selections
        .map((x: unknown) => normalizeModifierLike(x))
        .filter((x): x is ModifierLike => x !== null)
    : undefined;

  return {
    id,
    name,
    description: v.description == null ? null : safeStr(v.description, '', 240) || null,
    type,
    required: safeBool(v.required, false),
    min_selections: v.min_selections == null ? null : clampInt(v.min_selections, 0, 999),
    max_selections: v.max_selections == null ? null : clampInt(v.max_selections, 0, 999),
    sort_order: typeof v.sort_order === 'number' ? v.sort_order : null,
    active: safeBool(v.active, true),
    modifiers: mods,
    selections: selections && selections.length ? selections : undefined,
  };
}

export function normalizeGroups(v: unknown): ModifierGroupLike[] {
  const out: ModifierGroupLike[] = [];
  const raw = Array.isArray(v) ? v : [];
  for (const item of raw) {
    const g = normalizeGroupLike(item);
    if (g !== null) out.push(g);
  }
  out.sort((a, b) => {
    const ao = typeof a.sort_order === 'number' ? a.sort_order : 0;
    const bo = typeof b.sort_order === 'number' ? b.sort_order : 0;
    return ao - bo || a.name.localeCompare(b.name);
  });
  return out;
}

// ─── Selection business logic ─────────────────────────────────────────────────

export function groupSelectionRangeLabel(group: ModifierGroupLike): string {
  const min = group.min_selections ?? (group.required ? 1 : 0);
  const max = group.max_selections ?? (group.type === 'radio' ? 1 : null);

  if (group.type === 'radio') {
    if (group.required || min >= 1) return 'Choose 1';
    return 'Optional';
  }

  if (max != null && max > 0) {
    if (min > 0) return `Choose ${min}–${max}`;
    return `Choose up to ${max}`;
  }

  if (min > 0) return `Choose at least ${min}`;
  return 'Optional';
}

export function isSelectionValidForGroup(
  group: ModifierGroupLike,
  selected: SelectedModifier[],
): boolean {
  const sels = Array.isArray(selected) ? selected : [];
  const count = sels.length;

  const min = group.min_selections ?? (group.required ? 1 : 0);
  const max = group.max_selections ?? (group.type === 'radio' ? 1 : null);

  if (count < min) return false;
  if (max != null && count > max) return false;
  if (group.type === 'radio' && count > 1) return false;
  return true;
}

export function computeSelectedModifierCents(
  selected: Record<string, SelectedModifier[]>,
): number {
  let sum = 0;
  for (const sels of Object.values(selected)) {
    if (!Array.isArray(sels)) continue;
    for (const s of sels) {
      const val =
        typeof s.priceAdjustment === 'number' && Number.isFinite(s.priceAdjustment)
          ? s.priceAdjustment
          : 0;
      sum += val;
    }
  }
  return Math.max(0, sum);
}

export function canonicalizeSelectionsForHash(
  selected: Record<string, SelectedModifier[]>,
): string {
  const parts: string[] = [];
  const groupIds = Object.keys(selected).sort((a, b) => a.localeCompare(b));
  for (const gid of groupIds) {
    const sels = selected[gid] ?? [];
    const ids = sels
      .map((s) => safeStr(s.id, '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    parts.push(`${gid}:${ids.join('.')}`);
  }
  return parts.join('|');
}