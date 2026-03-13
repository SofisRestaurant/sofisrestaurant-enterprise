// =============================================================================
// PATH: supabase/functions/admin-gateway/lib/parsers/modifiers.ts
// =============================================================================
// Request parsers for all modifier-group and modifier gateway actions.
// =============================================================================

import type {
  ModifierGroupType,
  ModifierGroupListPayload,
  ModifierGroupCreatePayload,
  ModifierGroupUpdatePayload,
  ModifierGroupAttachPayload,
  ModifierGroupDetachPayload,
  ModifierGroupReorderPayload,
  ModifierGroupReorderForItemPayload,
  ModifierGroupSetItemGroupsPayload,
  ModifierCreatePayload,
  ModifierBatchEntry,
  ModifierCreateBatchPayload,
  ModifierUpdatePayload,
  ModifierTogglePayload,
  ModifierGroupToggleAvailabilityPayload,
  ModifierReorderPayload,
} from '../../types.ts';

import {
  isRecord,
  safeStr,
  safeBool,
  safeNum,
  parseId,
  parseReorderItems,
  parseToggleActivePayload,
} from './shared.ts';

export { parseToggleActivePayload };

/* -------------------------------------------------------------------------- */
/* Modifier group parsers                                                     */
/* -------------------------------------------------------------------------- */

function parseModifierGroupType(v: unknown): ModifierGroupType | null {
  if (v === 'radio' || v === 'checkbox' || v === 'quantity') return v;
  return null;
}

export function parseModifierGroupListPayload(v: unknown): ModifierGroupListPayload {
  const p = isRecord(v) ? v : {};
  const activeOnly = safeBool(p.activeOnly) ?? false;
  return { activeOnly };
}

export function parseModifierGroupCreatePayload(v: unknown): ModifierGroupCreatePayload | null {
  if (!isRecord(v)) return null;

  const name = safeStr(v.name, 200);
  const type = parseModifierGroupType(v.type);
  if (!name || !type) return null;

  const description = 'description' in v ? safeStr(v.description, 500) : undefined;
  const required = 'required' in v ? safeBool(v.required) ?? undefined : undefined;
  const min = 'min_selections' in v ? safeNum(v.min_selections) : null;
  const max =
    'max_selections' in v
      ? v.max_selections === null
        ? null
        : safeNum(v.max_selections)
      : undefined;
  const sort_order = 'sort_order' in v ? safeNum(v.sort_order) : null;
  const active = 'active' in v ? safeBool(v.active) ?? undefined : undefined;

  return {
    name,
    type,
    description: description ?? null,
    required,
    min_selections: min !== null && min !== undefined ? Math.trunc(min) : undefined,
    max_selections:
      max !== undefined ? (max !== null ? Math.trunc(max) : null) : undefined,
    sort_order: sort_order !== null && sort_order !== undefined ? Math.trunc(sort_order) : undefined,
    active,
  };
}

export function parseModifierGroupUpdatePayload(v: unknown): ModifierGroupUpdatePayload | null {
  if (!isRecord(v)) return null;

  const id = parseId(v.id);
  if (!id) return null;

  const payload: ModifierGroupUpdatePayload = { id };

  if ('name' in v) {
    const name = safeStr(v.name, 200);
    if (!name) return null;
    payload.name = name;
  }

  if ('type' in v) {
    const type = parseModifierGroupType(v.type);
    if (!type) return null;
    payload.type = type;
  }

  if ('description' in v) {
    payload.description = v.description === null ? null : safeStr(v.description, 500);
  }

  if ('required' in v) {
    const required = safeBool(v.required);
    if (required === null) return null;
    payload.required = required;
  }

  if ('min_selections' in v) {
    const n = safeNum(v.min_selections);
    if (n === null) return null;
    payload.min_selections = Math.max(0, Math.trunc(n));
  }

  if ('max_selections' in v) {
    if (v.max_selections === null) {
      payload.max_selections = null;
    } else {
      const n = safeNum(v.max_selections);
      if (n === null) return null;
      payload.max_selections = Math.max(0, Math.trunc(n));
    }
  }

  if ('sort_order' in v) {
    const n = safeNum(v.sort_order);
    if (n === null) return null;
    payload.sort_order = Math.trunc(n);
  }

  if ('active' in v) {
    const active = safeBool(v.active);
    if (active === null) return null;
    payload.active = active;
  }

  return payload;
}

export function parseModifierGroupAttachPayload(v: unknown): ModifierGroupAttachPayload | null {
  if (!isRecord(v)) return null;

  const menu_item_id = parseId(v.menu_item_id);
  const modifier_group_id = parseId(v.modifier_group_id);
  if (!menu_item_id || !modifier_group_id) return null;

  const sort_order = safeNum(v.sort_order);
  return {
    menu_item_id,
    modifier_group_id,
    sort_order: sort_order !== null ? Math.trunc(sort_order) : undefined,
  };
}

export function parseModifierGroupDetachPayload(v: unknown): ModifierGroupDetachPayload | null {
  if (!isRecord(v)) return null;

  const menu_item_id = parseId(v.menu_item_id);
  const modifier_group_id = parseId(v.modifier_group_id);
  if (!menu_item_id || !modifier_group_id) return null;

  return { menu_item_id, modifier_group_id };
}

export function parseModifierGroupReorderPayload(v: unknown): ModifierGroupReorderPayload | null {
  if (!isRecord(v)) return null;

  const items = parseReorderItems(v.items);
  if (!items) return null;

  return { items };
}

export function parseModifierGroupReorderForItemPayload(
  v: unknown,
): ModifierGroupReorderForItemPayload | null {
  if (!isRecord(v)) return null;

  const menu_item_id = parseId(v.menu_item_id);
  if (!menu_item_id) return null;

  const items = parseReorderItems(v.items);
  if (!items) return null;

  return { menu_item_id, items };
}

export function parseModifierGroupSetItemGroupsPayload(
  v: unknown,
): ModifierGroupSetItemGroupsPayload | null {
  if (!isRecord(v)) return null;

  const menu_item_id = parseId(v.menu_item_id);
  if (!menu_item_id) return null;
  if (!Array.isArray(v.group_ids)) return null;

  const group_ids: string[] = [];
  for (const entry of v.group_ids) {
    const id = parseId(entry);
    if (!id) return null;
    group_ids.push(id);
  }

  return { menu_item_id, group_ids };
}

/* -------------------------------------------------------------------------- */
/* Modifier parsers                                                           */
/* -------------------------------------------------------------------------- */

export function parseModifierCreatePayload(v: unknown): ModifierCreatePayload | null {
  if (!isRecord(v)) return null;

  const modifier_group_id = parseId(v.modifier_group_id);
  const name = safeStr(v.name, 200);
  if (!modifier_group_id || !name) return null;

  const price_adjustment = safeNum(v.price_adjustment);
  const available = safeBool(v.available);
  const sort_order = safeNum(v.sort_order);

  return {
    modifier_group_id,
    name,
    price_adjustment: price_adjustment ?? undefined,
    available: available ?? undefined,
    sort_order: sort_order !== null ? Math.trunc(sort_order) : undefined,
  };
}

function parseModifierBatchEntry(v: unknown): ModifierBatchEntry | null {
  if (!isRecord(v)) return null;

  const name = safeStr(v.name, 200);
  if (!name) return null;

  const price_adjustment = safeNum(v.price_adjustment);
  const available = safeBool(v.available);
  const sort_order = safeNum(v.sort_order);

  return {
    name,
    price_adjustment: price_adjustment ?? undefined,
    available: available ?? undefined,
    sort_order: sort_order !== null ? Math.trunc(sort_order) : undefined,
  };
}

export function parseModifierCreateBatchPayload(v: unknown): ModifierCreateBatchPayload | null {
  if (!isRecord(v)) return null;

  const group_id = parseId(v.group_id);
  if (!group_id) return null;
  if (!Array.isArray(v.modifiers) || v.modifiers.length === 0) return null;

  const modifiers: ModifierBatchEntry[] = [];
  for (const entry of v.modifiers) {
    const parsed = parseModifierBatchEntry(entry);
    if (!parsed) return null;
    modifiers.push(parsed);
  }

  return { group_id, modifiers };
}

export function parseModifierUpdatePayload(v: unknown): ModifierUpdatePayload | null {
  if (!isRecord(v)) return null;

  const id = parseId(v.id);
  if (!id) return null;

  const patch: Omit<ModifierUpdatePayload, 'id'> = {};

  if ('name' in v) {
    const name = safeStr(v.name, 200);
    if (!name) return null;
    patch.name = name;
  }

  if ('price_adjustment' in v) {
    const n = safeNum(v.price_adjustment);
    if (n !== null) patch.price_adjustment = n;
  }

  if ('available' in v) {
    const a = safeBool(v.available);
    if (a !== null) patch.available = a;
  }

  if ('sort_order' in v) {
    const n = safeNum(v.sort_order);
    if (n !== null) patch.sort_order = Math.trunc(n);
  }

  return { id, ...patch };
}

export function parseModifierTogglePayload(v: unknown): ModifierTogglePayload | null {
  if (!isRecord(v)) return null;

  const id = parseId(v.id);
  const available = safeBool(v.available);
  if (!id || available === null) return null;

  return { id, available };
}

export function parseModifierGroupToggleAvailabilityPayload(
  v: unknown,
): ModifierGroupToggleAvailabilityPayload | null {
  if (!isRecord(v)) return null;

  const group_id = parseId(v.group_id);
  const available = safeBool(v.available);
  if (!group_id || available === null) return null;

  return { group_id, available };
}

export function parseModifierReorderPayload(v: unknown): ModifierReorderPayload | null {
  if (!isRecord(v)) return null;

  const items = parseReorderItems(v.items);
  if (!items || items.length === 0) return null;

  return { items };
}