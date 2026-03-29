// =============================================================================
// PATH: supabase/functions/admin-gateway/lib/parsers/index.ts
// =============================================================================
// Main entry point for all request parsing logic.
// Re-exports domain parsers and owns the top-level parseGatewayRequest switch.
// =============================================================================

import { isRecord, parseId, safeNum } from './shared.ts';

import {
  parseModifierGroupListPayload,
  parseModifierGroupCreatePayload,
  parseModifierGroupUpdatePayload,
  parseModifierGroupAttachPayload,
  parseModifierGroupDetachPayload,
  parseModifierGroupReorderPayload,
  parseModifierGroupReorderForItemPayload,
  parseModifierGroupSetItemGroupsPayload,
  parseToggleActivePayload,
  parseModifierCreatePayload,
  parseModifierCreateBatchPayload,
  parseModifierUpdatePayload,
  parseModifierTogglePayload,
  parseModifierGroupToggleAvailabilityPayload,
  parseModifierReorderPayload,
} from './modifiers.ts';

import {
  parsePinFeaturedPayload,
  parseCreateCampaignPayload,
  parseUpdateCampaignPayload,
  parseToggleCampaignPayload,
} from './campaigns.ts';

import {
  parseTogglePromoPayload,
  parseCreatePromoPayload,
} from './promos.ts';

import type { GatewayRequest } from '../../types.ts';

function toInt(v: unknown, fallback: number): number {
  const n = safeNum(v);
  return n !== null ? Math.trunc(n) : fallback;
}

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

  // ── Menu CRUD ─────────────────────────────────────────────────────────────
  // FIX: These three actions were missing — parseGatewayRequest returned null
  // for menu:create, menu:update, menu:delete → gateway returned 400.

  if (action === 'menu:create') {
    if (!isRecord(v.payload)) return null;
    return { action, payload: v.payload };
  }

  if (action === 'menu:update') {
    if (!isRecord(v.payload)) return null;
    const id = parseId(v.payload.id);
    if (!id) return null;
    if (!isRecord(v.payload.data)) return null;
    return { action, payload: { id, data: v.payload.data } };
  }

  if (action === 'menu:delete') {
    const id = parseId(isRecord(v.payload) ? v.payload.id : null);
    if (!id) return null;
    return { action, payload: { id } };
  }

  if (action === 'menu:duplicate') {
    if (!isRecord(v.payload)) return null;
    const source_id = parseId(v.payload.source_id);
    if (!source_id) return null;
    return {
      action,
      payload: {
        source_id,
        overrides: isRecord(v.payload.overrides) ? v.payload.overrides : {},
      },
    };
  }

  // ── Modifier groups ───────────────────────────────────────────────────────
  if (action === 'menu:modifier-groups:list') {
    return { action, payload: parseModifierGroupListPayload(v.payload) };
  }

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

  if (action === 'menu:modifier-groups:item-count') {
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

  if (action === 'menu:modifier-groups:reorder') {
    const payload = parseModifierGroupReorderPayload(v.payload);
    if (!payload) return null;
    return { action, payload };
  }

  if (action === 'menu:modifier-groups:reorder-for-item') {
    const payload = parseModifierGroupReorderForItemPayload(v.payload);
    if (!payload) return null;
    return { action, payload };
  }

  if (action === 'menu:modifier-groups:set-item-groups') {
    const payload = parseModifierGroupSetItemGroupsPayload(v.payload);
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

  if (action === 'promos:create') {
    const payload = parseCreatePromoPayload(v.payload);
    if (!payload) return null;
    return { action, payload };
  }

  return null;
}