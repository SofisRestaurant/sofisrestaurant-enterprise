// src/domain/pricing/pricing.engine.ts
// ============================================================================
// PRICING ENGINE — Deterministic, auditable, pure functional
// ============================================================================
// All calculations are pure: same inputs → same outputs, always.
// pricing_hash enables server-side tamper detection at checkout.
//
// Hash: djb2 (sync, no async overhead). Suitable for cart integrity checks.
// For cryptographic storage use computePricingHashAsync (SHA-256).
// ============================================================================

import type {
  MenuItem,
  ModifierGroup,
  SelectedModifier,
  CartItemModifier,
  PricingBreakdown,
  ConfigurationValidation,
  ModifierValidationResult,
} from '@/domain/menu/menu.types'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TAX_RATE = 0.0875 // 8.75% — update per jurisdiction

// ─────────────────────────────────────────────────────────────────────────────
// Rounding — integer cents arithmetic to avoid float drift
// ─────────────────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ─────────────────────────────────────────────────────────────────────────────
// Hash
// ─────────────────────────────────────────────────────────────────────────────

function djb2(input: string): string {
  let h = 5381
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i)
    h = h >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

function canonicalInput(
  itemId:    string,
  basePrice: number,
  modifiers: CartItemModifier[],
  quantity:  number,
): string {
  // Sort groups + selections for determinism regardless of selection order
  const mods = [...modifiers]
    .sort((a, b) => a.group_id.localeCompare(b.group_id))
    .map((m) => ({
      g: m.group_id,
      s: [...m.selections]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((sel) => `${sel.id}:${sel.price_adjustment}`),
    }))
  return JSON.stringify({ itemId, basePrice, mods, quantity })
}

export function computePricingHashSync(
  itemId:    string,
  basePrice: number,
  modifiers: CartItemModifier[],
  quantity:  number,
): string {
  return djb2(canonicalInput(itemId, basePrice, modifiers, quantity))
}

/** Async SHA-256 version for server-side or audit logging */
export async function computePricingHashAsync(
  itemId:    string,
  basePrice: number,
  modifiers: CartItemModifier[],
  quantity:  number,
): Promise<string> {
  const input = canonicalInput(itemId, basePrice, modifiers, quantity)
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  return djb2(input)
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────────────────────

export class PricingEngine {

  // ── Core calculation ───────────────────────────────────────────────────────

  static calculate(
    itemId:    string,
    basePrice: number,
    modifiers: CartItemModifier[],
    quantity:  number,
  ): PricingBreakdown {
    const qty = Math.max(1, Math.floor(quantity))

    const modifierTotal = round2(
      modifiers.reduce(
        (sum, mod) => sum + mod.selections.reduce((s, sel) => s + (sel.price_adjustment ?? 0), 0),
        0,
      ),
    )

    const unitPrice = round2(basePrice + modifierTotal)
    const subtotal  = round2(unitPrice * qty)
    const tax       = round2(subtotal * TAX_RATE)
    const total     = round2(subtotal + tax)

    return {
      base_price:      round2(basePrice),
      modifier_total:  modifierTotal,
      unit_price:      unitPrice,
      quantity:        qty,
      subtotal,
      tax,
      total,
      pricing_hash:    computePricingHashSync(itemId, basePrice, modifiers, qty),
    }
  }

  // ── Cart-level totals ──────────────────────────────────────────────────────

  static cartTotals(subtotals: number[]): { subtotal: number; tax: number; total: number } {
    const subtotal = round2(subtotals.reduce((s, n) => s + n, 0))
    const tax      = round2(subtotal * TAX_RATE)
    return { subtotal, tax, total: round2(subtotal + tax) }
  }

  // ── Modifier builders ──────────────────────────────────────────────────────

  /**
   * Convert the raw selection map (group_id → SelectedModifier[]) into
   * CartItemModifier[] for storing in the cart.
   * Only includes groups with at least one selection.
   */
  static buildCartModifiers(
    item:              MenuItem,
    selectedModifiers: Record<string, SelectedModifier[]>,
  ): CartItemModifier[] {
    return (item.modifier_groups ?? [])
      .map((group) => ({
        group_id:   group.id,
        group_name: group.name,
        selections: selectedModifiers[group.id] ?? [],
      }))
      .filter((m) => m.selections.length > 0)
  }

  // ── Validation ─────────────────────────────────────────────────────────────

  static validateGroup(
    group:      ModifierGroup,
    selections: SelectedModifier[],
  ): ModifierValidationResult {
    if (group.required && selections.length === 0) {
      return { valid: false, error: 'This selection is required', code: 'REQUIRED_MISSING' }
    }
    if (!selections.length) return { valid: true }

    if (group.min_selections && selections.length < group.min_selections) {
      return {
        valid: false,
        error: `Please select at least ${group.min_selections} option${group.min_selections > 1 ? 's' : ''}`,
        code: 'MIN_NOT_MET',
      }
    }
    if (group.max_selections && selections.length > group.max_selections) {
      return {
        valid: false,
        error: `Maximum ${group.max_selections} selection${group.max_selections > 1 ? 's' : ''} allowed`,
        code: 'MAX_EXCEEDED',
      }
    }
    return { valid: true }
  }

  static validateConfiguration(
    item:              MenuItem,
    selectedModifiers: Record<string, SelectedModifier[]>,
  ): ConfigurationValidation {
    const errors: Record<string, string> = {}

    for (const group of (item.modifier_groups ?? [])) {
      const result = PricingEngine.validateGroup(group, selectedModifiers[group.id] ?? [])
      if (!result.valid && result.error) errors[group.id] = result.error
    }

    return { valid: Object.keys(errors).length === 0, errors }
  }

  // ── Inventory helpers ──────────────────────────────────────────────────────

  static isLowStock(item: MenuItem): boolean {
    return (
      typeof item.inventory_count === 'number' &&
      item.inventory_count > 0 &&
      item.inventory_count <= item.low_stock_threshold
    )
  }

  static isOutOfStock(item: MenuItem): boolean {
    return typeof item.inventory_count === 'number' && item.inventory_count === 0
  }

  static getStockStatus(item: MenuItem): 'available' | 'low' | 'out' {
    if (PricingEngine.isOutOfStock(item)) return 'out'
    if (PricingEngine.isLowStock(item))   return 'low'
    return 'available'
  }

  static getStockMessage(item: MenuItem): string | null {
    if (typeof item.inventory_count !== 'number') return null
    if (item.inventory_count === 0) return 'Out of Stock'
    if (item.inventory_count === 1) return 'Only 1 left!'
    if (PricingEngine.isLowStock(item)) return `Only ${item.inventory_count} left!`
    return null
  }

  // ── Display helpers ────────────────────────────────────────────────────────

  static formatPrice(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD',
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(amount)
  }

  static getModifierBreakdown(modifiers: CartItemModifier[]): string {
    return modifiers
      .filter((m) => m.selections.length > 0)
      .map((m) => {
        const sels = m.selections
          .map((s) => `${s.name}${s.price_adjustment > 0 ? ` (+${PricingEngine.formatPrice(s.price_adjustment)})` : ''}`)
          .join(', ')
        return `${m.group_name}: ${sels}`
      })
      .join(' • ')
  }

  static getModifierSummary(modifiers: CartItemModifier[]): string {
    const n = modifiers.reduce((sum, m) => sum + m.selections.length, 0)
    return n ? `${n} customization${n !== 1 ? 's' : ''}` : 'No customizations'
  }
}