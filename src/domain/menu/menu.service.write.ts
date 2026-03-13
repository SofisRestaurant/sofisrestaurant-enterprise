// =============================================================================
// src/domain/menu/menu.service.write.ts
// MENU WRITE SERVICE — Production Grade (2026)
// =============================================================================
//
// Write path for menu item CRUD. All mutations target the menu_items TABLE.
// All reads for return values come from the menu_items_admin_full VIEW.
//
// Why the two-step pattern?
//   menu_items TABLE rows:
//     available: boolean       (non-nullable — DB default true)
//     category:  menu_category (non-nullable enum)
//     modifier_groups:         absent
//
//   menu_items_admin_full VIEW rows (MenuItemAdminRow):
//     available: boolean | null
//     category:  menu_category | null
//     modifier_groups: Json | null   ← aggregated JSON blob from the view
//
//   MenuAdminMapper.map expects MenuItemAdminRow. Passing a table row to it
//   is structurally incorrect — nullability differs and modifier_groups is
//   missing. The correct pattern is: write to table → re-fetch from view.
//   This eliminates every unsafe cast and gives the mapper real data.
//
// Null vs undefined in update payloads:
//   - undefined field  → Supabase SDK omits it from SET clause (no-op)
//   - null field       → Supabase SDK emits "field = NULL" (explicit clear)
//   Callers set null to clear nullable columns; set undefined to skip them.
//   This service does NOT coerce between the two — callers own that contract.
//
// Error strategy:
//   - DB errors (PostgrestError) propagate as-is (callers handle via toast etc.)
//   - Post-write fetch miss throws MenuWriteError with an actionable message
//   - All id inputs are validated before any DB call
// =============================================================================

import { supabase } from '@/lib/supabase/supabaseClient';
import type { MenuItemInsert, MenuItemUpdate, MenuItemAdminRow } from './menu.db.types';
import type { MenuItemAdmin } from './menu.types';
import { MenuAdminMapper } from './menu.admin.mapper';

// ── Internal error class ──────────────────────────────────────────────────────

/**
 * Thrown when a write succeeds but the follow-up view re-fetch fails.
 * Distinct from PostgrestError so callers can handle it separately if needed.
 */
export class MenuWriteError extends Error {
  public readonly id: string;
  public readonly operation: 'create' | 'update' | 'delete';

  constructor(operation: 'create' | 'update' | 'delete', id: string, message: string) {
    super(message);
    this.name = 'MenuWriteError';
    this.operation = operation;
    this.id = id;
  }
}
type MenuItemInsertDbSafe = Omit<
  MenuItemInsert,
  'spicy_level' | 'sort_order' | 'inventory_count' | 'low_stock_threshold' | 'popularity_score'
> & {
  spicy_level?: number | undefined;
  sort_order?: number | undefined;
  inventory_count?: number | undefined;
  low_stock_threshold?: number | undefined;
  popularity_score?: number | undefined;
};

type MenuItemUpdateDbSafe = Omit<
  MenuItemUpdate,
  'spicy_level' | 'sort_order' | 'inventory_count' | 'low_stock_threshold' | 'popularity_score'
> & {
  spicy_level?: number | undefined;
  sort_order?: number | undefined;
  inventory_count?: number | undefined;
  low_stock_threshold?: number | undefined;
  popularity_score?: number | undefined;
};
// ── Timestamp ─────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

// ── ID guard ─────────────────────────────────────────────────────────────────

function assertId(id: string, operation: 'update' | 'delete'): void {
  if (id.trim().length === 0) {
    throw new MenuWriteError(operation, id, `Menu item id is required for ${operation}.`);
  }
}

// ── View re-fetch (write → read from admin view) ──────────────────────────────
//
// After any successful write to menu_items, we re-fetch the full row from
// menu_items_admin_full so MenuAdminMapper receives the correct shape including
// the modifier_groups JSON blob aggregated by the view.
//
// Using .eq('id', id).maybeSingle() instead of .single() avoids the Supabase
// "PGRST116 — JSON object requested, multiple (or no) rows returned" error in
// the narrow window where the write succeeds but the row isn't visible yet.
// In practice this window is zero (same connection), but it avoids a confusing
// error message if something unexpected happens.

async function refetchAdminRow(
  id: string,
  operation: 'create' | 'update',
): Promise<MenuItemAdminRow> {
  const { data, error } = await supabase
    .from('menu_items_admin_full')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;

  if (data === null) {
    throw new MenuWriteError(
      operation,
      id,
      `Menu item '${id}' was written successfully but could not be re-fetched from the admin view.`,
    );
  }

  return data;
}

// ── Payload normalizers ───────────────────────────────────────────────────────
//
// These do NOT coerce null ↔ undefined. They only:
//   create — stamps updated_at if the caller omitted it
//   update — always overwrites updated_at to the current timestamp

function normalizeNullableNumber(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeInsertPayload(payload: MenuItemInsert): MenuItemInsertDbSafe {
  return {
    ...payload,
    spicy_level: normalizeNullableNumber(payload.spicy_level),
    sort_order: normalizeNullableNumber(payload.sort_order),
    inventory_count: normalizeNullableNumber(payload.inventory_count),
    low_stock_threshold: normalizeNullableNumber(payload.low_stock_threshold),
    popularity_score: normalizeNullableNumber(payload.popularity_score),
    updated_at: payload.updated_at ?? nowIso(),
  };
}

function normalizeUpdatePayload(payload: MenuItemUpdate): MenuItemUpdateDbSafe {
  return {
    ...payload,
    spicy_level: normalizeNullableNumber(payload.spicy_level),
    sort_order: normalizeNullableNumber(payload.sort_order),
    inventory_count: normalizeNullableNumber(payload.inventory_count),
    low_stock_threshold: normalizeNullableNumber(payload.low_stock_threshold),
    popularity_score: normalizeNullableNumber(payload.popularity_score),
    updated_at: nowIso(),
  };
}
// ── Public service ────────────────────────────────────────────────────────────

export class MenuWriteService {
  // ───────────────────────────────────────────────────────────────────────────
  // CREATE
  // ───────────────────────────────────────────────────────────────────────────
  //
  // 1. Insert into menu_items — select only `id` back (minimal, type-safe).
  // 2. Re-fetch full row from menu_items_admin_full view by returned id.
  // 3. Pass MenuItemAdminRow to MenuAdminMapper.map — no casts.

  static async create(payload: MenuItemInsert): Promise<MenuItemAdmin> {
    const insert = normalizeInsertPayload(payload);

    const { data, error } = await supabase
      .from('menu_items')
      .insert(insert)
      .select('id')
      .single();

    if (error) throw error;

    // data.id is `string` — guaranteed by the menu_items PK (non-nullable, uuid).
    const row = await refetchAdminRow(data.id, 'create');
    return MenuAdminMapper.map(row);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // UPDATE
  // ───────────────────────────────────────────────────────────────────────────
  //
  // 1. Guard id input.
  // 2. Apply patch to menu_items — no select on the write call (avoids the
  //    table-row → view-row shape mismatch entirely).
  // 3. Re-fetch full row from menu_items_admin_full view.
  // 4. Pass MenuItemAdminRow to MenuAdminMapper.map — no casts.
  //
  // Null fields in `payload` explicitly clear the column (SET col = NULL).
  // Undefined fields are omitted from the SET clause by the Supabase SDK.
  // This service does NOT normalize one to the other — that is caller policy.

  static async update(id: string, payload: MenuItemUpdate): Promise<MenuItemAdmin> {
    assertId(id, 'update');

    const patch = normalizeUpdatePayload(payload);

    const { error } = await supabase
      .from('menu_items')
      .update(patch)
      .eq('id', id);

    if (error) throw error;

    const row = await refetchAdminRow(id, 'update');
    return MenuAdminMapper.map(row);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // DELETE
  // ───────────────────────────────────────────────────────────────────────────
  //
  // Hard delete. Cascades to modifier_group_items via FK if configured.
  // No return value — callers remove the item from local state on success.

  static async delete(id: string): Promise<void> {
    assertId(id, 'delete');

    const { error } = await supabase
      .from('menu_items')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
}