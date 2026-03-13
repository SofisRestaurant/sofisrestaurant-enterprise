// =============================================================================
// PATH: supabase/functions/admin-gateway/actions/dispatch.ts
// =============================================================================
// Single exhaustive switch over all GatewayRequest variants.
// Each case delegates to the appropriate action module.
// Core actions (metrics, layout, orders, menu:full) are handled inline
// because they are single-query reads with no shared logic to extract.
// =============================================================================

import { service } from '../lib/service.ts';
import { dbError, assertNever } from '../lib/guards.ts';

import type { GatewayRequest, AdminAction } from '../types.ts';

import * as ModifierGroups from './modifier-groups.ts';
import * as Modifiers from './modifiers.ts';

import {
  listCampaigns,
  toggleCampaign,
  runCampaignRotation,
  createCampaign,
  updateCampaign,
  pinFeatured,
} from './campaigns.ts';

import { listPromos, togglePromo, createPromo } from './promos.ts';

/* -------------------------------------------------------------------------- */
/* Dispatch                                                                   */
/* -------------------------------------------------------------------------- */

export async function dispatch(
  req: GatewayRequest,
): Promise<{ action: AdminAction; result: unknown }> {
  switch (req.action) {
    // ── Core ────────────────────────────────────────────────────────────────

    case 'metrics': {
      const { data, error } = await service
        .from('admin_executive_snapshot')
        .select('*')
        .maybeSingle();

      if (error) dbError(error.message, 'DB_METRICS');

      return { action: 'metrics', result: data };
    }

    case 'layout': {
      const { data, error } = await service
        .from('admin_layout_snapshot')
        .select('*')
        .maybeSingle();

      if (error) dbError(error.message, 'DB_LAYOUT');

      return { action: 'layout', result: data };
    }

    case 'orders:list': {
      const page = Math.max(0, req.payload?.page ?? 0);
      const from = page * 25;
      const to = from + 24;

      const { data, error } = await service
        .from('orders')
        .select('*')
        .range(from, to)
        .order('created_at', { ascending: false });

      if (error) dbError(error.message, 'DB_ORDERS');

      return { action: 'orders:list', result: data ?? [] };
    }

    case 'menu:full': {
      const page = Math.max(0, req.payload?.page ?? 0);
      const pageSize = Math.min(500, Math.max(1, req.payload?.pageSize ?? 200));
      const from = page * pageSize;
      const to = from + pageSize - 1;

      const { data, error } = await service
        .from('menu_items_admin_full')
        .select('*')
        .order('sort_order', { ascending: true })
        .range(from, to);

      if (error) dbError(error.message, 'DB_MENU_FULL');

      return { action: 'menu:full', result: data ?? [] };
    }

    // ── Modifier groups ──────────────────────────────────────────────────────

    case 'menu:modifier-groups:list':
      return {
        action: req.action,
        result: await ModifierGroups.list(req.payload?.activeOnly ?? false),
      };

    case 'menu:modifier-groups:list-for-item':
      return {
        action: req.action,
        result: await ModifierGroups.listForItem(req.payload.menu_item_id),
      };

    case 'menu:modifier-groups:get':
      return {
        action: req.action,
        result: await ModifierGroups.getById(req.payload.id),
      };

    case 'menu:modifier-groups:item-count':
      return {
        action: req.action,
        result: await ModifierGroups.getItemCount(req.payload.id),
      };

    case 'menu:modifier-groups:create':
      return {
        action: req.action,
        result: await ModifierGroups.create(req.payload),
      };

    case 'menu:modifier-groups:update': {
      const { id, ...patch } = req.payload;
      return {
        action: req.action,
        result: await ModifierGroups.update(id, patch),
      };
    }

    case 'menu:modifier-groups:attach':
      await ModifierGroups.attachToItem(req.payload);
      return { action: req.action, result: null };

    case 'menu:modifier-groups:detach':
      await ModifierGroups.detachFromItem(req.payload);
      return { action: req.action, result: null };

    case 'menu:modifier-groups:toggle-active':
      await ModifierGroups.toggleActive(req.payload.id, req.payload.active);
      return { action: req.action, result: null };

    case 'menu:modifier-groups:reorder':
      await ModifierGroups.reorder(req.payload.items);
      return { action: req.action, result: null };

    case 'menu:modifier-groups:reorder-for-item':
      await ModifierGroups.reorderForItem(req.payload.menu_item_id, req.payload.items);
      return { action: req.action, result: null };

    case 'menu:modifier-groups:set-item-groups':
      await ModifierGroups.setItemGroups(req.payload);
      return { action: req.action, result: null };

    case 'menu:modifier-groups:delete':
      await ModifierGroups.deleteGroup(req.payload.id);
      return { action: req.action, result: null };

    // ── Modifiers ────────────────────────────────────────────────────────────

    case 'menu:modifiers:list-for-group':
      return {
        action: req.action,
        result: await Modifiers.listForGroup(req.payload.group_id),
      };

    case 'menu:modifiers:list-available-for-group':
      return {
        action: req.action,
        result: await Modifiers.listAvailableForGroup(req.payload.group_id),
      };

    case 'menu:modifiers:get':
      return {
        action: req.action,
        result: await Modifiers.getById(req.payload.id),
      };

    case 'menu:modifiers:create':
      return {
        action: req.action,
        result: await Modifiers.create(req.payload),
      };

    case 'menu:modifiers:create-batch':
      return {
        action: req.action,
        result: await Modifiers.createBatch(req.payload.group_id, req.payload.modifiers),
      };

    case 'menu:modifiers:update':
      return {
        action: req.action,
        result: await Modifiers.update(req.payload),
      };

    case 'menu:modifiers:toggle-availability':
      await Modifiers.toggleAvailability(req.payload.id, req.payload.available);
      return { action: req.action, result: null };

    case 'menu:modifiers:toggle-group-availability':
      await Modifiers.toggleGroupAvailability(req.payload.group_id, req.payload.available);
      return { action: req.action, result: null };

    case 'menu:modifiers:delete':
      await Modifiers.deleteModifier(req.payload.id);
      return { action: req.action, result: null };

    case 'menu:modifiers:delete-all-in-group':
      await Modifiers.deleteAllInGroup(req.payload.group_id);
      return { action: req.action, result: null };

    case 'menu:modifiers:reorder':
      await Modifiers.reorder(req.payload.items);
      return { action: req.action, result: null };

    // ── Campaigns ────────────────────────────────────────────────────────────

    case 'campaigns:list':
      return { action: req.action, result: await listCampaigns() };

    case 'campaigns:create':
      return { action: req.action, result: await createCampaign(req.payload) };

    case 'campaigns:update':
      return { action: req.action, result: await updateCampaign(req.payload) };

    case 'campaigns:pin-featured':
      return { action: req.action, result: await pinFeatured(req.payload) };

    case 'campaigns:toggle':
      return { action: req.action, result: await toggleCampaign(req.payload) };

    case 'campaigns:run-rotation':
      return { action: req.action, result: await runCampaignRotation() };

    // ── Promos ───────────────────────────────────────────────────────────────

    case 'promos:list':
      return { action: req.action, result: await listPromos() };

    case 'promos:toggle':
      return { action: req.action, result: await togglePromo(req.payload) };

    case 'promos:create':
      return { action: req.action, result: await createPromo(req.payload) };
  }

  return assertNever(req);
}