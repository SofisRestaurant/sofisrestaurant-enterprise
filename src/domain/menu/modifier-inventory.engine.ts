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

// Safe string conversion
export function asString(v: unknown): string {
  if (v == null) return ''; // null or undefined
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(asString).join(', ');
  if (typeof v === 'object') return JSON.stringify(v); // safely stringify objects
  return ''; // fallback for functions, symbols, etc.
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

/** Shared cast used anywhere MenuItem must be treated as StockLike. */
type ModifierLike = { id: string; available: boolean } & Partial<StockLike>;

function getStockCount(item: StockLike): number | null {
  const raw =
    item.inventory_count ??
    item.inventoryCount  ??
    item.stock_count     ??
    item.stockCount      ??
    item.stock_qty       ??
    item.stockQty        ??
    item.stock           ??
    item.inventory       ??
    null;

  const n = asFiniteNumber(raw);
  if (n === null) return null;
  return clampInt(n, -1_000_000, 1_000_000);
}

function getLowStockThreshold(item: StockLike): number {
  const raw = item.low_stock_threshold ?? item.lowStockThreshold ?? null;
  const n = asFiniteNumber(raw);
  return n === null ? 5 : clampInt(n, 1, 10_000);
}

export function isOutOfStock(item: StockLike): boolean {
  const available = asBool(item.available, true);
  if (!available) return true;

  const count = getStockCount(item);
  if (count === null) return false; // unknown stock => fail-open
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
  if (status === 'ok')  return 'In stock';
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
  modifier: ModifierLike,
): ModifierInventoryStatus {
  const available = Boolean(modifier.available);

  const stock_count = getStockCount(modifier);
  const status      = available ? getStockStatus(modifier) : 'out';
  const out         = !available || status === 'out';
  const low         = available && status === 'low';

  return {
    modifier_id:    modifier.id,
    available,
    stock_count,
    is_low_stock:   low,
    is_out_of_stock: out,
    status,
    message: available
      ? (status === 'unknown' ? null : getStockMessage(modifier))
      : 'Unavailable',
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
  groups: readonly ModifierGroup[],
  selectedModifiers: Record<string, readonly SelectedModifier[]>,
): SelectionInventoryCheck {
  const blocked:  string[] = [];
  const warnings: string[] = [];

  for (const group of groups) {
    const selections = selectedModifiers[group.id] ?? [];

    // NOTE: No Array.isArray guard here — intentional.
    //
    // Applying Array.isArray() to a variable already typed as a concrete array
    // (readonly SelectedModifier[] or readonly Modifier[]) triggers TypeScript's
    // built-in type predicate `isArray(arg: any): arg is any[]`. The intersection
    // of the existing type with `any[]` collapses to `any[]` (because T & any = any),
    // so `selection` and `m` in the loops below would be inferred as `any`, firing
    // @typescript-eslint/no-unsafe-assignment and @typescript-eslint/no-unsafe-member-access.
    //
    // Both variables are statically guaranteed to be arrays:
    //   - `selections`: Record<string, readonly SelectedModifier[]> value + `?? []`
    //   - `group.modifiers`: declared as `readonly Modifier[]` with the note
    //     "Always an array. Never null/undefined." in the domain type.
    //
    // Per-element integrity (stale id, unavailable flag) is validated below.

    for (const selection of selections) {
      // selection.id is string per SelectedModifier — trim and skip empty.
      const selId = selection.id.trim();
      if (!selId) continue;

      // group.modifiers is readonly Modifier[] — m is Modifier, m.id is string.
      const mod = group.modifiers.find((m) => m.id === selId);

      // Not in this group anymore → stale UI selection, block.
      if (!mod) {
        blocked.push(selId);
        continue;
      }

      // Explicitly unavailable → block.
      if (!mod.available) {
        blocked.push(selId);
        continue;
      }

      // Future-ready: if modifier later gains inventory fields, use it.
      const st = getModifierInventoryStatus(mod as ModifierLike);
      if (st.is_out_of_stock) blocked.push(selId);
      else if (st.is_low_stock && st.message) warnings.push(st.message);
    }
  }

  const blocked_unique  = Array.from(new Set(blocked));
  const warnings_unique = Array.from(new Set(warnings));

  return {
    can_proceed:       blocked_unique.length === 0,
    blocked_modifiers: blocked_unique,
    warnings:          warnings_unique,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Item-level inventory (MENU ITEMS)
// ─────────────────────────────────────────────────────────────────────────────

export function getItemInventoryStatus(item: MenuItem): ItemInventoryStatus {
  // Cast once — MenuItem fields overlap with StockLike by name convention
  // but TypeScript requires an explicit bridge since the types are independent.
  const stockLike = item as unknown as StockLike;

  return {
    item_id:        item.id,
    available:      Boolean(item.available),
    stock_count:    getStockCount(stockLike),
    is_low_stock:   isLowStock(stockLike),
    is_out_of_stock: isOutOfStock(stockLike),
    status:         getStockStatus(stockLike),
    message:        getStockStatus(stockLike) === 'unknown'
                      ? null
                      : getStockMessage(stockLike),
  };
}