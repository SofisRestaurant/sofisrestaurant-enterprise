// =============================================================================
// src/domain/pricing/pricing.engine.ts
// =============================================================================
// PricingEngine — Cents-first, production-grade pricing utilities.
//
// Key principles:
// - All internal math is integer cents.
// - No floating point is used for totals.
// - `formatPrice()` is cents-based (for backward compatibility in UI).
// - `normalizeMoney()` supports future merch needs (explicit dollars vs cents).
// - `pricing_hash` is a *client-side integrity tag* (NOT security). Server must
//   validate prices against DB regardless.
//
// Public API (kept stable):
// - PricingEngine.formatPrice(cents) => "$x.xx"  ✅ cents-based
// - PricingEngine.formatDollars(dollars) => "$x.xx" (explicit dollars)
// - PricingEngine.calculate(itemId, unitPriceCents, compatModifiers, qty)
// - PricingEngine.buildCartModifiers(item, selectedByGroup)
//
// ALSO provides stock helpers used by Admin/Menu UI + inventory engine:
// - PricingEngine.getStockStatus(item) => "unknown" | "in_stock" | "low_stock" | "out_of_stock"
// - PricingEngine.getStockMessage(item) => string | null
// - PricingEngine.isLowStock(item) / isOutOfStock(item)
//
// =============================================================================

export type MoneyUnit = 'cents' | 'dollars'

export type CartItemModifierCompat = {
  id: string
  groupId: string
  name: string
  /** integer cents; may be negative */
  priceAdjustmentCents: number

  // legacy aliases (old code paths)
  modifier_group_id?: string
  group_id?: string
}

export type CartItemModifierGroupCompat = {
  groupId: string
  // legacy aliases
  modifier_group_id?: string
  group_id?: string

  selections: CartItemModifierCompat[]
}

export type CartItemModifiersCompat = Array<CartItemModifierCompat | CartItemModifierGroupCompat>

export type SelectedModLike = {
  id: string
  name: string
  // your domain uses price_adjustment; some drift uses priceAdjustment
  price_adjustment?: number
  priceAdjustment?: number
}

export type SelectedByGroup = Record<string, SelectedModLike[]>

export type StockStatus = 'unknown' | 'in_stock' | 'low_stock' | 'out_of_stock'

// Minimal “menu item” shape we need for modifier extraction.
// We intentionally accept camelCase and snake_case drift.
type ModifierLike = {
  id: string
  name: string
  price_adjustment?: number | null
  priceAdjustment?: number | null
}

type ModifierGroupLike = {
  id: string
  name: string
  modifiers?: ModifierLike[] | null
}

type MenuItemLike = {
  id: string
  modifier_groups?: ModifierGroupLike[] | null
  modifierGroups?: ModifierGroupLike[] | null
}

// -----------------------------------------------------------------------------
// Guards / helpers (no unsafe member access)
// -----------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function asNumber(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : fallback
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

/**
 * IMPORTANT:
 * - Treat anything that is not a finite number as 0 (or fallback).
 * - Always return integer cents.
 */
function toCentsInt(n: number, fallback = 0): number {
  if (!Number.isFinite(n)) return fallback
  return Math.trunc(Math.round(n))
}

/**
 * Detect “dollars-like” floats vs integer cents.
 * Examples:
 * - 3.99 -> dollars-like
 * - 399  -> cents-like
 *
 * This is a heuristic. For merch later, prefer normalizeMoney(value, 'dollars'|'cents')
 * instead of relying on guessing.
 */
function guessMoneyUnit(value: number): MoneyUnit {
  // If it has decimals, it’s almost certainly dollars.
  if (Math.abs(value % 1) > 0) return 'dollars'

  // If it’s small like 2, 3, 13, also likely dollars (but could be cents).
  // We only guess dollars for small integers to catch cases like `price: 3`.
  // If you ever have $0.03 items, use explicit units.
  if (Math.abs(value) > 0 && Math.abs(value) < 50) return 'dollars'

  // Otherwise assume cents.
  return 'cents'
}

/**
 * Normalize money input to integer cents.
 * - If you pass unit explicitly, it will be respected.
 * - If unit omitted, we guess (safe for your current menu case).
 */
export function normalizeMoney(value: unknown, unit?: MoneyUnit): number {
  const raw = asNumber(value, 0)
  const u = unit ?? guessMoneyUnit(raw)

  if (u === 'dollars') {
    // dollars -> cents (integer)
    return toCentsInt(raw * 100, 0)
  }
  // cents already
  return toCentsInt(raw, 0)
}

/**
 * Stable, deterministic, fast hash for client integrity tags.
 * NOT cryptographic security. Server must validate.
 */
function fnv1a32(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = (hash * 0x01000193) >>> 0
  }
  // base36 short tag
  return hash.toString(36)
}

function canonicalizeModifiers(mods: CartItemModifierCompat[]): string {
  // Stable ordering
  const sorted = [...mods].sort((a, b) => {
    if (a.groupId !== b.groupId) return a.groupId.localeCompare(b.groupId)
    if (a.id !== b.id) return a.id.localeCompare(b.id)
    return a.priceAdjustmentCents - b.priceAdjustmentCents
  })

  return sorted.map((m) => `${m.groupId}:${m.id}:${m.priceAdjustmentCents}`).join('|')
}

// -----------------------------------------------------------------------------
// PricingEngine
// -----------------------------------------------------------------------------

export class PricingEngine {
  /**
   * ✅ BACKWARD-COMPAT:
   * This expects cents and returns a USD string.
   */
  static formatPrice(cents: number): string {
    const c = clampInt(toCentsInt(cents, 0), -50_000_000, 50_000_000)
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(c / 100)
  }

  /** Explicit dollars formatting */
  static formatDollars(dollars: number): string {
    return PricingEngine.formatPrice(normalizeMoney(dollars, 'dollars'))
  }

  /** Explicit cents formatting (alias; clearer intent in new code) */
  static formatCents(cents: number): string {
    return PricingEngine.formatPrice(cents)
  }

  // ===========================================================================
  // Stock helpers — Admin/UI compatibility
  // Returns: "unknown" | "in_stock" | "low_stock" | "out_of_stock"
  // Fail-open by design when inventory is not tracked.
  // ===========================================================================

  static getStockCount(item: unknown): number | null {
    if (!isRecord(item)) return null

    const raw =
      item.inventory_count ??
      item.inventoryCount ??
      item.stock_count ??
      item.stockCount ??
      item.stock_qty ??
      item.stockQty ??
      item.stock ??
      item.inventory ??
      null

    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
    if (!Number.isFinite(n)) return null
    return Math.trunc(n)
  }

  static getLowStockThreshold(item: unknown): number {
    if (!isRecord(item)) return 5
    const raw = item.low_stock_threshold ?? item.lowStockThreshold ?? null
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
    if (!Number.isFinite(n)) return 5
    return Math.max(1, Math.trunc(n))
  }

  static getStockStatus(item: unknown): StockStatus {
    if (!isRecord(item)) return 'unknown'

    const available = asBool(item.available, true)
    if (!available) return 'out_of_stock'

    const count = PricingEngine.getStockCount(item)
    if (count === null) return 'unknown' // not tracked -> unknown
    if (count <= 0) return 'out_of_stock'
    if (count <= PricingEngine.getLowStockThreshold(item)) return 'low_stock'
    return 'in_stock'
  }

  static isOutOfStock(item: unknown): boolean {
    return PricingEngine.getStockStatus(item) === 'out_of_stock'
  }

  static isLowStock(item: unknown): boolean {
    return PricingEngine.getStockStatus(item) === 'low_stock'
  }

  static getStockMessage(item: unknown): string | null {
    const s = PricingEngine.getStockStatus(item)
    if (s === 'out_of_stock') return 'Out of stock'
    if (s === 'low_stock') return 'Low stock'
    return null // in_stock/unknown => don’t spam UI unless you want to
  }

  /**
   * Build compat modifiers array from:
   * - MenuItem (with modifier groups)
   * - SelectedByGroup (groupId -> SelectedModLike[])
   *
   * This is used ONLY for display math + pricing_hash input.
   * Server must re-price from DB.
   */
  static buildCartModifiers(item: unknown, selected: unknown): CartItemModifierCompat[] {
    const out: CartItemModifierCompat[] = []
    if (!isRecord(selected)) return out

    // Extract group list from item (snake/camel drift)
    const it = item as MenuItemLike
    const groups = (it.modifier_groups ?? it.modifierGroups ?? []) ?? []

    // Build a quick lookup for known modifiers -> canonical adjustment
    const lookup = new Map<string, { name: string; groupId: string; adjCents: number }>()

    for (const g of groups) {
      if (!g || typeof g.id !== 'string') continue
      const mods = (g.modifiers ?? []) ?? []
      for (const m of mods) {
        if (!m || typeof m.id !== 'string') continue
        const adj =
          typeof m.price_adjustment === 'number'
            ? m.price_adjustment
            : typeof m.priceAdjustment === 'number'
              ? m.priceAdjustment
              : 0

        lookup.set(`${g.id}:${m.id}`, {
          name: typeof m.name === 'string' ? m.name : '',
          groupId: g.id,
          adjCents: normalizeMoney(adj, guessMoneyUnit(adj)), // handles accidental dollars
        })
      }
    }

    // Walk selected groups
    for (const [groupId, arr] of Object.entries(selected as SelectedByGroup)) {
      if (!Array.isArray(arr)) continue

      for (const raw of arr) {
        const id = asString((raw as SelectedModLike | undefined)?.id).trim()
        const name = asString((raw as SelectedModLike | undefined)?.name).trim()
        if (!groupId || !id) continue

        // Prefer canonical lookup adjustment when available (safer)
        const hit = lookup.get(`${groupId}:${id}`)

        const adjRaw =
          typeof raw?.price_adjustment === 'number'
            ? raw.price_adjustment
            : typeof raw?.priceAdjustment === 'number'
              ? raw.priceAdjustment
              : 0

        const priceAdjustmentCents = hit
          ? clampInt(hit.adjCents, -50_000_000, 50_000_000)
          : clampInt(normalizeMoney(adjRaw, guessMoneyUnit(adjRaw)), -50_000_000, 50_000_000)

        out.push({
          id,
          groupId,
          name: hit?.name?.trim() || name || id,
          priceAdjustmentCents,
          // keep legacy aliases for older code paths
          modifier_group_id: groupId,
          group_id: groupId,
        })
      }
    }

    return out
  }

  /**
   * Core pricing math (CLIENT DISPLAY ONLY)
   * - itemId: string identifier
   * - basePriceCents: integer cents (use normalizeMoney before calling if needed)
   * - modifiers: CartItemModifierCompat[] (priceAdjustmentCents included)
   * - quantity: integer
   *
   * Returns:
   * - subtotal: integer cents
   * - pricing_hash: deterministic integrity tag
   */
  static calculate(
    itemId: string,
    basePriceCents: number,
    modifiers: CartItemModifierCompat[],
    quantity: number,
  ): { subtotal: number; pricing_hash: string } {
    const id = asString(itemId).trim()
    const qty = clampInt(toCentsInt(quantity, 1), 1, 99)

    // Base must be cents. Clamp to protect UI.
    const base = clampInt(toCentsInt(basePriceCents, 0), 0, 50_000_000)

    const modSum = clampInt(
      modifiers.reduce(
        (sum, m) =>
          sum + clampInt(toCentsInt(m.priceAdjustmentCents, 0), -50_000_000, 50_000_000),
        0,
      ),
      -50_000_000,
      50_000_000,
    )

    const unit = clampInt(base + modSum, 0, 50_000_000)
    const subtotal = clampInt(unit * qty, 0, 2_000_000_000) // $20,000,000 cap for sanity

    // pricing_hash (client integrity tag)
    const payload = `${id}|${base}|${qty}|${canonicalizeModifiers(modifiers)}`
    const pricing_hash = fnv1a32(payload)

    return { subtotal, pricing_hash }
  }
}