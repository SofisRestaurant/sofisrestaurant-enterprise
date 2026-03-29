// =============================================================================
// PATH: supabase/functions/admin-gateway/actions/menu.ts
// =============================================================================
// Menu item CRUD — server-side, runs under the service role.
// =============================================================================
//
// All three operations use the same two-step pattern inherited from the
// original menu.service.write.ts:
//
//   1. Write to the menu_items TABLE (non-nullable schema, no aggregations)
//   2. Re-fetch the full row from menu_items_admin_full VIEW (nullable fields,
//      modifier_groups JSON blob included) and return it.
//
// Why the two-step pattern?
//   menu_items TABLE rows have:
//     available: boolean       (non-nullable — DB default true)
//     category:  menu_category (non-nullable enum)
//     modifier_groups:         absent
//
//   menu_items_admin_full VIEW rows (MenuItemAdminRow) have:
//     available: boolean | null
//     category:  menu_category | null
//     modifier_groups: Json | null   ← aggregated from the view
//
//   The downstream mapper (MenuAdminMapper on the client) expects the view
//   shape. Returning a table row directly would cause shape mismatches.
//   Write → re-fetch from view is the only correct pattern.
//
// Why service role?
//   menu_items has RLS policies that block writes by non-admin users.
//   The gateway (index.ts) authenticates the caller and verifies admin status
//   BEFORE this module is invoked. This module runs after that check has
//   already passed — using the service role here is intentional and correct.
//
// Null vs undefined in update payloads:
//   undefined → Supabase SDK omits the field from SET clause (no-op)
//   null      → Supabase SDK emits "field = NULL" (explicit clear)
//   This module normalizes non-finite numbers to undefined so the DB
//   receives a clean payload. Callers set null to clear; undefined to skip.
// =============================================================================

import { service } from '../lib/service.ts';
import { dbError } from '../lib/guards.ts';
import type { MenuItemInsert, MenuItemUpdate, MenuItemAdminRow, MenuItemCreatePayload, MenuItemUpdatePayload } from '../types.ts';

// ── Timestamp ─────────────────────────────────────────────────────────────────
// Stamped server-side so the value is always in sync with the DB clock,
// not the client clock (which can drift or be spoofed).

function nowIso(): string {
  return new Date().toISOString();
}

// ── Null-safe number normalizer ───────────────────────────────────────────────
// Non-finite values (NaN, Infinity) must never reach the DB.
// undefined signals "skip this column" to the Supabase SDK.

function normalizeNum(v: number | null | undefined): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

// ── Payload normalizers ───────────────────────────────────────────────────────

type InsertSafe = Omit<MenuItemInsert,
  'spicy_level' | 'sort_order' | 'inventory_count' | 'low_stock_threshold' | 'popularity_score'
> & {
  spicy_level?: number;
  sort_order?: number;
  inventory_count?: number;
  low_stock_threshold?: number;
  popularity_score?: number;
};

type UpdateSafe = Omit<MenuItemUpdate,
  'spicy_level' | 'sort_order' | 'inventory_count' | 'low_stock_threshold' | 'popularity_score'
> & {
  spicy_level?: number;
  sort_order?: number;
  inventory_count?: number;
  low_stock_threshold?: number;
  popularity_score?: number;
};

function buildInsert(payload: MenuItemInsert): InsertSafe {
  return {
    ...payload,
    spicy_level:         normalizeNum(payload.spicy_level),
    sort_order:          normalizeNum(payload.sort_order),
    inventory_count:     normalizeNum(payload.inventory_count),
    low_stock_threshold: normalizeNum(payload.low_stock_threshold),
    popularity_score:    normalizeNum(payload.popularity_score),
    // Always stamp updated_at from the server clock.
    updated_at:          nowIso(),
  };
}

function buildUpdate(payload: MenuItemUpdate): UpdateSafe {
  return {
    ...payload,
    spicy_level:         normalizeNum(payload.spicy_level),
    sort_order:          normalizeNum(payload.sort_order),
    inventory_count:     normalizeNum(payload.inventory_count),
    low_stock_threshold: normalizeNum(payload.low_stock_threshold),
    popularity_score:    normalizeNum(payload.popularity_score),
    // Always overwrite updated_at on every save.
    updated_at:          nowIso(),
  };
}

// ── View re-fetch ─────────────────────────────────────────────────────────────
// After every successful write, re-fetch the full admin row from the view.
// maybeSingle() avoids the PGRST116 error if the row isn't visible yet
// (same-connection writes are always visible, but this is a cleaner error path).

async function refetchAdminRow(
  id: string,
  op: 'create' | 'update',
): Promise<MenuItemAdminRow> {
  const { data, error } = await service
    .from('menu_items_admin_full')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) dbError(error.message, 'DB_MENU_REFETCH');

  if (data === null) {
    // Write succeeded but view didn't return the row.
    // This should never happen on the same connection but is handled explicitly.
    dbError(
      `Menu item '${id}' was written successfully but could not be re-fetched from the admin view. ` +
        `Operation: ${op}.`,
      'DB_MENU_REFETCH_MISS',
    );
  }

  // data is MenuItemAdminRow — dbError throws if null so this cast is safe.
  return data as MenuItemAdminRow;
}

// ── Public actions ────────────────────────────────────────────────────────────
// These are called by dispatch.ts. They receive already-validated payloads
// (the gateway parser and auth layer run before dispatch).
//
// Return type is MenuItemAdminRow because this is the raw DB shape.
// The client's MenuAdminMapper converts it to MenuItemAdmin.

/**
 * Create a new menu item.
 * Inserts into menu_items, then re-fetches the full row from the admin view.
 */
export async function createMenuItem(
  payload: MenuItemCreatePayload,
): Promise<MenuItemAdminRow>  {
  const insert = buildInsert(payload);

  const { data, error } = await service
    .from('menu_items')
    .insert(insert)
    .select('id')
    .single();

  if (error) dbError(error.message, 'DB_MENU_CREATE');

  return refetchAdminRow(data.id, 'create');
}

/**
 * Update an existing menu item.
 * Patches menu_items (no select on write), then re-fetches the full row.
 *
 * Fields set to null in the payload are explicitly cleared (SET col = NULL).
 * Fields set to undefined are omitted from the SET clause (no-op for that column).
 */

export async function updateMenuItem(
  id: string,
  payload: MenuItemUpdatePayload,
): Promise<MenuItemAdminRow> {
  const patch = buildUpdate(payload);

  const { error } = await service
    .from('menu_items')
    .update(patch)
    .eq('id', id);

  if (error) dbError(error.message, 'DB_MENU_UPDATE');

  return refetchAdminRow(id, 'update');
}

/**
 * Hard-delete a menu item.
 * FK cascades to modifier_group_items if configured.
 * Returns null — callers remove the item from local state on success.
 */
export async function deleteMenuItem(id: string): Promise<null> {
  const { error } = await service
    .from('menu_items')
    .delete()
    .eq('id', id);

  if (error) dbError(error.message, 'DB_MENU_DELETE');

  return null;
}