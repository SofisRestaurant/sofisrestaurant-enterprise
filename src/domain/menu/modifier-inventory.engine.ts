// src/domain/menu/modifier-inventory.engine.ts
// ============================================================================
// MODIFIER INVENTORY ENGINE — Enterprise Hardened (2026)
// ============================================================================
// Purpose
// - Inventory awareness for modifier selections + menu items.
// - Safe today (DB has no modifier stock columns yet).
// - Future-ready when modifier inventory lands (no API changes needed).
//
// Current DB reality (Mar 2026)
// - modifiers: has `available` but no inventory_count/threshold columns.
// - menu items: may have some inventory-ish fields depending on view/table.
//
// Design
// - Fail-open for unknown inventory: never block checkout purely due to missing fields.
// - Strictly block only when a modifier/item is explicitly unavailable or known out-of-stock.
// - Handles snake_case + camelCase drift.
//
// Exports (stable contract)
// - getModifierInventoryStatus(modifier)
// - checkSelectionInventory(groups, selectedModifiers)
// - getItemInventoryStatus(item)
// - getStockStatus / isLowStock / isOutOfStock / getStockMessage (used by Admin UI)
// ============================================================================

import type { MenuItem, ModifierGroup, SelectedModifier } from '@/domain/menu/menu.types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type StockStatus = 'out' | 'low' | 'ok' | 'unknown';

export interface ModifierInventoryStatus {
  modifier_id: string;
  available: boolean;
  stock_count: number | null; // null = unlimited / untracked / not implemented yet
  is_low_stock: boolean;
  is_out_of_stock: boolean;
  status: StockStatus;
  message: string | null;
}

export interface ItemInventoryStatus {
  item_id: string;
  available: boolean;
  stock_count: number | null;
  is_low_stock: boolean;
  is_out_of_stock: boolean;
  status: StockStatus;
  message: string | null;
}

export interface SelectionInventoryCheck {
  can_proceed: boolean;
  blocked_modifiers: string[]; // modifier_ids that are blocked
  warnings: string[]; // low-stock warnings (future: surface to UI)
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers (drift-safe)
// ─────────────────────────────────────────────────────────────────────────────

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : String(v ?? '');
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function asFiniteNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Item stock (uses current DB fields if present)
// ─────────────────────────────────────────────────────────────────────────────

// We accept "MenuItem" but also support drift/extended shapes from views.
type StockLike = {
  id?: unknown;
  available?: unknown;

  // common inventory fields
  inventory_count?: unknown;
  inventoryCount?: unknown;
  stock_count?: unknown;
  stockCount?: unknown;
  stock_qty?: unknown;
  stockQty?: unknown;
  stock?: unknown;
  inventory?: unknown;

  // thresholds
  low_stock_threshold?: unknown;
  lowStockThreshold?: unknown;
};

function getStockCount(item: StockLike): number | null {
  const raw =
    item.inventory_count ??
    item.inventoryCount ??
    item.stock_count ??
    item.stockCount ??
    item.stock_qty ??
    item.stockQty ??
    item.stock ??
    item.inventory ??
    null;

  const n = asFiniteNumber(raw);
  if (n === null) return null;
  // inventory should be integer-ish
  return clampInt(n, -1_000_000, 1_000_000);
}

function getLowStockThreshold(item: StockLike): number {
  const raw = item.low_stock_threshold ?? item.lowStockThreshold ?? null;
  const n = asFiniteNumber(raw);
  // sensible default if column not present
  return n === null ? 5 : clampInt(n, 1, 10_000);
}

export function isOutOfStock(item: StockLike): boolean {
  const available = asBool(item.available, true);
  if (!available) return true;

  const count = getStockCount(item);
  // unknown stock => fail-open
  if (count === null) return false;
  return count <= 0;
}

export function isLowStock(item: StockLike): boolean {
  const available = asBool(item.available, true);
  if (!available) return false;

  const count = getStockCount(item);
  if (count === null) return false; // unknown stock => no warning
  if (count <= 0) return false;
  return count <= getLowStockThreshold(item);
}

export function getStockStatus(item: StockLike): StockStatus {
  const available = asBool(item.available, true);
  if (!available) return 'out';

  const count = getStockCount(item);
  if (count === null) return 'unknown';
  if (count <= 0) return 'out';
  if (count <= getLowStockThreshold(item)) return 'low';
  return 'ok';
}

export function getStockMessage(item: StockLike): string {
  const status = getStockStatus(item);
  if (status === 'out') return 'Out of stock';
  if (status === 'low') return 'Low stock';
  if (status === 'ok') return 'In stock';
  return 'Stock unknown';
}

// ─────────────────────────────────────────────────────────────────────────────
// Modifier inventory status (future-ready)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Today: modifiers have only `available` boolean.
 * Future: add modifier inventory_count / threshold columns and plug in here.
 */
export function getModifierInventoryStatus(
  modifier: { id: string; available: boolean } & Partial<StockLike>,
): ModifierInventoryStatus {
  const available = Boolean(modifier.available);

  // Future-ready: if modifier later gains inventory fields, these will start working automatically.
  const stock_count = getStockCount(modifier);
  const status = available ? getStockStatus(modifier) : 'out';
  const out = !available || status === 'out';
  const low = available && status === 'low';

  return {
    modifier_id: modifier.id,
    available,
    stock_count,
    is_low_stock: low,
    is_out_of_stock: out,
    status,
    message: available ? (status === 'unknown' ? null : getStockMessage(modifier)) : 'Unavailable',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Selection inventory gate (MODIFIERS)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks whether a set of selected modifiers can proceed.
 * Current behavior:
 * - Blocks if the selected modifier is missing from its group OR `available === false`
 * - If/when modifier stock exists, it will also block known out-of-stock modifiers.
 */
export function checkSelectionInventory(
  groups: ModifierGroup[],
  selectedModifiers: Record<string, SelectedModifier[]>,
): SelectionInventoryCheck {
  const blocked: string[] = [];
  const warnings: string[] = [];

  for (const group of groups) {
    const selections = selectedModifiers[group.id] ?? [];
    if (!Array.isArray(selections) || !Array.isArray(group.modifiers)) continue;

    for (const selection of selections) {
      const selId = asString(selection?.id).trim();
      if (!selId) continue;

      const mod = group.modifiers.find((m) => m.id === selId);

      // If it's not in this group anymore, block (stale UI selection)
      if (!mod) {
        blocked.push(selId);
        continue;
      }

      // If explicitly unavailable, block
      if (!mod.available) {
        blocked.push(selId);
        continue;
      }

      // Future-ready: if modifier later gains inventory fields, use it
      const st = getModifierInventoryStatus(mod as any);
      if (st.is_out_of_stock) blocked.push(selId);
      else if (st.is_low_stock && st.message) warnings.push(st.message);
    }
  }

  // de-dupe
  const blocked_unique = Array.from(new Set(blocked));
  const warnings_unique = Array.from(new Set(warnings));

  return {
    can_proceed: blocked_unique.length === 0,
    blocked_modifiers: blocked_unique,
    warnings: warnings_unique,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Item-level inventory (MENU ITEMS)
// ─────────────────────────────────────────────────────────────────────────────

export function getItemInventoryStatus(item: MenuItem): ItemInventoryStatus {
  const stock_count = getStockCount(item as unknown as StockLike);
  const status = getStockStatus(item as unknown as StockLike);
  const out = isOutOfStock(item as unknown as StockLike);
  const low = isLowStock(item as unknown as StockLike);

  return {
    item_id: item.id,
    available: Boolean(item.available),
    stock_count,
    is_low_stock: low,
    is_out_of_stock: out,
    status,
    message: status === 'unknown' ? null : getStockMessage(item as unknown as StockLike),
  };
}
