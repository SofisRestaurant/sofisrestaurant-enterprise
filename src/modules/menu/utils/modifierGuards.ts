// =============================================================================
// PATH: src/modules/menu/utils/modifierGuards.ts
// =============================================================================
import { isRecord, safeBool, safeStr, clampInt } from './menuItemGuards';
import type { PreflightOk } from '@/domain/menu/menu-modal.types';
import type {
  ModifierGroupType,
  ModifierGroup,
  Modifier,
  SelectedModifier,
} from '@/domain/menu/menu.types';

// Re-export so existing imports of SelectedModifier from this file continue
// to resolve to the single canonical domain type.
export type { SelectedModifier };

export type PreflightErr = { ok: false; error: string };
export type PreflightResponse = PreflightOk | PreflightErr;

// ─── Private normalization intermediates ─────────────────────────────────────
// NOT exported. Used only inside this module during raw DB → domain conversion.

type ModifierRaw = {
  id: string;
  name: string;
  price_adjustment: number; // integer cents after dollar→cents conversion
  available: boolean;
  sort_order: number;
};

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
 * Parse a raw modifier row into a private intermediate.
 *
 * price_adjustment MUST already be integer cents by the time it reaches
 * this function. The dollar→cents conversion is performed exclusively in
 * parseModifierGroups.ts (parseModifierGroupsFromJson). This function
 * enforces that contract by asserting, never converting.
 *
 * Throws if price_adjustment is missing, non-numeric, non-finite, or not
 * an integer. A modifier with corrupt pricing must never enter the domain.
 */
function parseModifierRaw(v: unknown): ModifierRaw | null {
  if (!isRecord(v)) return null;
  const id   = safeStr(v.id, '', 128);
  const name = safeStr(v.name, '', 120);
  if (!id || !name) return null;

  const rawAdj = v.price_adjustment;

  if (rawAdj === null || rawAdj === undefined) {
    throw new Error(
      `modifierGuards.parseModifierRaw: modifier(id=${id}) price_adjustment is missing. ` +
      `All data through this path must have been normalised by parseModifierGroupsFromJson first.`,
    );
  }
  if (typeof rawAdj !== 'number' || !Number.isFinite(rawAdj)) {
    throw new Error(
      `modifierGuards.parseModifierRaw: modifier(id=${id}) price_adjustment is not a ` +
      `finite number: ${String(rawAdj)}. Expected integer cents.`,
    );
  }
  if (!Number.isInteger(rawAdj)) {
    throw new Error(
      `modifierGuards.parseModifierRaw: modifier(id=${id}) price_adjustment is not an ` +
      `integer: ${rawAdj}. Dollar float detected — convert in parseModifierGroups.ts, not here.`,
    );
  }

  const sort_order =
    typeof v.sort_order === 'number' && Number.isFinite(v.sort_order) ? v.sort_order : 0;

  return {
    id,
    name,
    price_adjustment: rawAdj,
    available: safeBool(v.available, true),
    sort_order,
  };
}

/**
 * Lift a private ModifierRaw + its groupId into the canonical domain Modifier.
 * modifier_group_id is stamped here — the single place it is assigned.
 */
function toDomainModifier(m: ModifierRaw, groupId: string): Modifier {
  return {
    id:                m.id,
    modifier_group_id: groupId,
    name:              m.name,
    price_adjustment:  m.price_adjustment,
    available:         m.available,
    sort_order:        m.sort_order,
  };
}

/**
 * Normalize a raw DB record into a domain ModifierGroup.
 *
 * Handles DB views that may return `selections` or `options` instead of
 * `modifiers` — all are unified into `modifiers` on the returned object.
 *
 * min_selections null → 0 (domain type is non-nullable number).
 */
export function normalizeGroupLike(v: unknown): ModifierGroup | null {
  if (!isRecord(v)) return null;

  const id   = safeStr(v.id, '', 128);
  const name = safeStr(v.name, '', 120);
  const type = normalizeGroupType(v.type);
  if (!id || !name) return null;

  const modsSrc: unknown[] = Array.isArray(v.modifiers)
    ? v.modifiers
    : Array.isArray(v.options)
    ? v.options
    : Array.isArray(v.selections)
    ? v.selections
    : [];

  const rawMods: ModifierRaw[] = [];
  for (const m of modsSrc) {
    const mm = parseModifierRaw(m);
    if (mm) rawMods.push(mm);
  }

  rawMods.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

  const modifiers: Modifier[] = rawMods.map((m) => toDomainModifier(m, id));

  const sort_order =
    typeof v.sort_order === 'number' && Number.isFinite(v.sort_order) ? v.sort_order : 0;

  return {
    id,
    name,
    description:    v.description == null ? null : safeStr(v.description, '', 240) || null,
    type,
    required:       safeBool(v.required, false),
    min_selections: v.min_selections == null ? 0 : clampInt(v.min_selections, 0, 999),
    max_selections: v.max_selections == null ? null : clampInt(v.max_selections, 0, 999),
    sort_order,
    active:         safeBool(v.active, true),
    modifiers,
  };
}

export function normalizeGroups(v: unknown): ModifierGroup[] {
  const out: ModifierGroup[] = [];
  const raw = Array.isArray(v) ? v : [];
  for (const item of raw) {
    const g = normalizeGroupLike(item);
    if (g !== null) out.push(g);
  }
  out.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  return out;
}

// ─── Selection business logic ─────────────────────────────────────────────────

export function groupSelectionRangeLabel(group: ModifierGroup): string {
  const min = group.min_selections;
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
  group: ModifierGroup,
  selected: readonly SelectedModifier[],
): boolean {
  const sels  = Array.isArray(selected) ? selected : [];
  const count = sels.length;
  const min   = group.min_selections;
  const max   = group.max_selections ?? (group.type === 'radio' ? 1 : null);

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
      const adj = s.price_adjustment;

      if (adj === null || adj === undefined) {
        throw new Error(
          `computeSelectedModifierCents: modifier(id=${s.id}) price_adjustment is missing. ` +
          `Normalization in parseModifierGroups.ts must have been bypassed.`,
        );
      }
      if (typeof adj !== 'number' || !Number.isFinite(adj)) {
        throw new Error(
          `computeSelectedModifierCents: modifier(id=${s.id}) price_adjustment is not a ` +
          `finite number: ${String(adj)}. Expected integer cents from the normalization boundary.`,
        );
      }
      if (!Number.isInteger(adj)) {
        throw new Error(
          `computeSelectedModifierCents: modifier(id=${s.id}) price_adjustment is not an ` +
          `integer: ${adj}. Dollar float reached this function — ` +
          `conversion must happen in parseModifierGroups.ts, not here.`,
        );
      }

      sum += adj;
    }
  }
  return sum;
}

export function canonicalizeSelectionsForHash(
  selected: Record<string, SelectedModifier[]>,
): string {
  const parts: string[] = [];
  const groupIds = Object.keys(selected).sort((a, b) => a.localeCompare(b));
  for (const gid of groupIds) {
    const sels = selected[gid] ?? [];
    const ids  = sels
      .map((s) => safeStr(s.id, '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    parts.push(`${gid}:${ids.join('.')}`);
  }
  return parts.join('|');
}