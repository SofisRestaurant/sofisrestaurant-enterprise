// =============================================================================
// PATH: supabase/functions/admin-gateway/lib/parsers.ts
// =============================================================================
// All request parsing logic.
// Input: raw unknown value from JSON.parse
// Output: typed GatewayRequest | null
//
// Rules:
//   - Return null on any invalid field — caller sends 400
//   - Never throw — all errors are surfaced via null return
//   - key-presence checks ('field' in v) used for nullable fields so callers
//     can distinguish "not provided" from "explicitly set to null"
// =============================================================================

import {
  isRecord,
  safeStr,
  safeBool,
  safeNum,
  toInt,
  parseId,
} from './guards.ts';

import type {
  GatewayRequest,
  ModifierGroupType,
  ModifierGroupCreatePayload,
  ModifierGroupUpdatePayload,
  ModifierGroupAttachPayload,
  ModifierGroupDetachPayload,
  ModifierGroupTogglePayload,
  ModifierGroupReorderPayload,
  ModifierCreatePayload,
  ModifierBatchEntry,
  ModifierCreateBatchPayload,
  ModifierUpdatePayload,
  ModifierTogglePayload,
  ModifierGroupToggleAvailabilityPayload,
  ModifierReorderPayload,
  ReorderItem,
  ToggleCampaignPayload,
  CreateCampaignPayload,
  UpdateCampaignPayload,
  PinFeaturedPayload,
  TogglePromoPayload,
} from '../types.ts';

/* -------------------------------------------------------------------------- */
/* Shared parsers                                                             */
/* -------------------------------------------------------------------------- */

function parseToggleActivePayload(v: unknown): ModifierGroupTogglePayload | null {
  if (!isRecord(v)) return null;
  const id = parseId(v.id);
  const active = safeBool(v.active);
  if (!id || active === null) return null;
  return { id, active };
}

function parseReorderItems(v: unknown): ReorderItem[] | null {
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

/* -------------------------------------------------------------------------- */
/* Modifier group parsers                                                     */
/* -------------------------------------------------------------------------- */

function parseModifierGroupType(v: unknown): ModifierGroupType | null {
  if (v === 'radio' || v === 'checkbox' || v === 'quantity') return v;
  return null;
}

function parseModifierGroupCreatePayload(v: unknown): ModifierGroupCreatePayload | null {
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

function parseModifierGroupUpdatePayload(v: unknown): ModifierGroupUpdatePayload | null {
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

function parseModifierGroupAttachPayload(v: unknown): ModifierGroupAttachPayload | null {
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

function parseModifierGroupDetachPayload(v: unknown): ModifierGroupDetachPayload | null {
  if (!isRecord(v)) return null;
  const menu_item_id = parseId(v.menu_item_id);
  const modifier_group_id = parseId(v.modifier_group_id);
  if (!menu_item_id || !modifier_group_id) return null;
  return { menu_item_id, modifier_group_id };
}

function parseModifierGroupReorderPayload(v: unknown): ModifierGroupReorderPayload | null {
  if (!isRecord(v)) return null;
  const menu_item_id = parseId(v.menu_item_id);
  if (!menu_item_id) return null;
  const items = parseReorderItems(v.items);
  if (!items) return null;
  return { menu_item_id, items };
}

/* -------------------------------------------------------------------------- */
/* Modifier parsers                                                           */
/* -------------------------------------------------------------------------- */

function parseModifierCreatePayload(v: unknown): ModifierCreatePayload | null {
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

function parseModifierCreateBatchPayload(v: unknown): ModifierCreateBatchPayload | null {
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

function parseModifierUpdatePayload(v: unknown): ModifierUpdatePayload | null {
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

function parseModifierTogglePayload(v: unknown): ModifierTogglePayload | null {
  if (!isRecord(v)) return null;
  const id = parseId(v.id);
  const available = safeBool(v.available);
  if (!id || available === null) return null;
  return { id, available };
}

function parseModifierGroupToggleAvailabilityPayload(
  v: unknown,
): ModifierGroupToggleAvailabilityPayload | null {
  if (!isRecord(v)) return null;
  const group_id = parseId(v.group_id);
  const available = safeBool(v.available);
  if (!group_id || available === null) return null;
  return { group_id, available };
}

function parseModifierReorderPayload(v: unknown): ModifierReorderPayload | null {
  if (!isRecord(v)) return null;
  const items = parseReorderItems(v.items);
  if (!items || items.length === 0) return null;
  return { items };
}

/* -------------------------------------------------------------------------- */
/* Campaign parsers                                                           */
/* -------------------------------------------------------------------------- */

function parsePinFeaturedPayload(v: unknown): PinFeaturedPayload | null {
  if (!isRecord(v)) return null;
  const id = parseId(v.id);
  const placement = safeStr(v.placement, 120);
  if (!id || !placement) return null;
  return { id, placement };
}

function parseCreateCampaignPayload(v: unknown): CreateCampaignPayload | null {
  if (!isRecord(v)) return null;

  const campaign_name = safeStr(v.campaign_name, 200);
  const placement = safeStr(v.placement, 120);
  const menu_item_id = safeStr(v.menu_item_id, 128);
  const badge = safeStr(v.badge, 64);
  const hero_title = safeStr(v.hero_title, 180);
  const hero_subtitle = safeStr(v.hero_subtitle, 400);
  const cta_label = safeStr(v.cta_label, 120);
  const deep_link = safeStr(v.deep_link, 600);
  const starts_at = safeStr(v.starts_at, 80);
  const ends_at = safeStr(v.ends_at, 80);
  const active = safeBool(v.active);
  const is_featured = safeBool(v.is_featured);
  const eligible_for_rotation = safeBool(v.eligible_for_rotation);
  const priorityRaw = safeNum(v.priority);
  const weightRaw = safeNum(v.weight);

  if (!campaign_name || !placement) return null;
  if (active === null || is_featured === null || eligible_for_rotation === null) return null;
  if (priorityRaw === null || weightRaw === null) return null;

  return {
    campaign_name,
    placement,
    menu_item_id: menu_item_id ?? null,
    badge: badge ?? null,
    hero_title: hero_title ?? null,
    hero_subtitle: hero_subtitle ?? null,
    cta_label: cta_label ?? null,
    deep_link: deep_link ?? null,
    starts_at: starts_at ?? null,
    ends_at: ends_at ?? null,
    active,
    is_featured,
    eligible_for_rotation,
    priority: Math.trunc(priorityRaw),
    weight: Math.trunc(weightRaw),
  };
}

function parseUpdateCampaignPayload(v: unknown): UpdateCampaignPayload | null {
  if (!isRecord(v)) return null;
  const id = parseId(v.id);
  if (!id) return null;

  const base = parseCreateCampaignPayload(v);
  if (!base) return null;

  return { ...base, id };
}

function parseToggleCampaignPayload(v: unknown): ToggleCampaignPayload | null {
  if (!isRecord(v)) return null;
  const id = parseId(v.id);
  const active = safeBool(v.active);
  if (!id || active === null) return null;
  return { id, active };
}

function parseTogglePromoPayload(v: unknown): TogglePromoPayload | null {
  if (!isRecord(v)) return null;
  const id = parseId(v.id);
  const active = safeBool(v.active);
  if (!id || active === null) return null;
  return { id, active };
}

/* -------------------------------------------------------------------------- */
/* Main request parser                                                        */
/* -------------------------------------------------------------------------- */

export function parseGatewayRequest(v: unknown): GatewayRequest | null {
  if (!isRecord(v)) return null;

  const action = v.action;
  if (typeof action !== 'string') return null;

  // ── Core ──────────────────────────────────────────────────────────────────
  if (action === 'metrics') return { action };
  if (action === 'layout') return { action };

  if (action === 'orders:list') {
    const p = isRecord(v.payload) ? v.payload : {};
    return { action, payload: { page: toInt(p.page, 0) } };
  }

  if (action === 'menu:full') {
    const p = isRecord(v.payload) ? v.payload : {};
    return { action, payload: { page: toInt(p.page, 0), pageSize: toInt(p.pageSize, 200) } };
  }

  // ── Modifier groups ───────────────────────────────────────────────────────
  if (action === 'menu:modifier-groups:list-for-item') {
    const menu_item_id = parseId(isRecord(v.payload) ? v.payload.menu_item_id : null);
    if (!menu_item_id) return null;
    return { action, payload: { menu_item_id } };
  }

  if (action === 'menu:modifier-groups:get') {
    const id = parseId(isRecord(v.payload) ? v.payload.id : null);
    if (!id) return null;
    return { action, payload: { id } };
  }

  if (action === 'menu:modifier-groups:create') {
    const payload = parseModifierGroupCreatePayload(v.payload);
    if (!payload) return null;
    return { action, payload };
  }

  if (action === 'menu:modifier-groups:update') {
    const payload = parseModifierGroupUpdatePayload(v.payload);
    if (!payload) return null;
    return { action, payload };
  }

  if (action === 'menu:modifier-groups:attach') {
    const payload = parseModifierGroupAttachPayload(v.payload);
    if (!payload) return null;
    return { action, payload };
  }

  if (action === 'menu:modifier-groups:detach') {
    const payload = parseModifierGroupDetachPayload(v.payload);
    if (!payload) return null;
    return { action, payload };
  }

  if (action === 'menu:modifier-groups:toggle-active') {
    const payload = parseToggleActivePayload(v.payload);
    if (!payload) return null;
    return { action, payload };
  }

  if (action === 'menu:modifier-groups:reorder-for-item') {
    const payload = parseModifierGroupReorderPayload(v.payload);
    if (!payload) return null;
    return { action, payload };
  }

  if (action === 'menu:modifier-groups:delete') {
    const id = parseId(isRecord(v.payload) ? v.payload.id : null);
    if (!id) return null;
    return { action, payload: { id } };
  }

  // ── Modifiers ─────────────────────────────────────────────────────────────
  if (action === 'menu:modifiers:list-for-group') {
    const group_id = parseId(isRecord(v.payload) ? v.payload.group_id : null);
    if (!group_id) return null;
    return { action, payload: { group_id } };
  }

  if (action === 'menu:modifiers:list-available-for-group') {
    const group_id = parseId(isRecord(v.payload) ? v.payload.group_id : null);
    if (!group_id) return null;
    return { action, payload: { group_id } };
  }

  if (action === 'menu:modifiers:get') {
    const id = parseId(isRecord(v.payload) ? v.payload.id : null);
    if (!id) return null;
    return { action, payload: { id } };
  }

  if (action === 'menu:modifiers:create') {
    const payload = parseModifierCreatePayload(v.payload);
    if (!payload) return null;
    return { action, payload };
  }

  if (action === 'menu:modifiers:create-batch') {
    const payload = parseModifierCreateBatchPayload(v.payload);
    if (!payload) return null;
    return { action, payload };
  }

  if (action === 'menu:modifiers:update') {
    const payload = parseModifierUpdatePayload(v.payload);
    if (!payload) return null;
    return { action, payload };
  }

  if (action === 'menu:modifiers:toggle-availability') {
    const payload = parseModifierTogglePayload(v.payload);
    if (!payload) return null;
    return { action, payload };
  }

  if (action === 'menu:modifiers:toggle-group-availability') {
    const payload = parseModifierGroupToggleAvailabilityPayload(v.payload);
    if (!payload) return null;
    return { action, payload };
  }

  if (action === 'menu:modifiers:delete') {
    const id = parseId(isRecord(v.payload) ? v.payload.id : null);
    if (!id) return null;
    return { action, payload: { id } };
  }

  if (action === 'menu:modifiers:delete-all-in-group') {
    const group_id = parseId(isRecord(v.payload) ? v.payload.group_id : null);
    if (!group_id) return null;
    return { action, payload: { group_id } };
  }

  if (action === 'menu:modifiers:reorder') {
    const payload = parseModifierReorderPayload(v.payload);
    if (!payload) return null;
    return { action, payload };
  }

  // ── Campaigns ─────────────────────────────────────────────────────────────
  if (action === 'campaigns:list') return { action };
  if (action === 'campaigns:run-rotation') return { action };

  if (action === 'campaigns:pin-featured') {
    const payload = parsePinFeaturedPayload(v.payload);
    if (!payload) return null;
    return { action, payload };
  }

  if (action === 'campaigns:create') {
    const payload = parseCreateCampaignPayload(v.payload);
    if (!payload) return null;
    return { action, payload };
  }

  if (action === 'campaigns:update') {
    const payload = parseUpdateCampaignPayload(v.payload);
    if (!payload) return null;
    return { action, payload };
  }

  if (action === 'campaigns:toggle') {
    const payload = parseToggleCampaignPayload(v.payload);
    if (!payload) return null;
    return { action, payload };
  }

  // ── Promos ────────────────────────────────────────────────────────────────
  if (action === 'promos:list') return { action };

  if (action === 'promos:toggle') {
    const payload = parseTogglePromoPayload(v.payload);
    if (!payload) return null;
    return { action, payload };
  }

  return null;
}