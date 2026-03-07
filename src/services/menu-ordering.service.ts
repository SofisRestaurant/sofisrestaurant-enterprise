// src/services/menu-ordering.service.ts
// ============================================================================
// MENU ORDERING SERVICE — Production Hardened (2026)
// ============================================================================
// Orchestrates the complete ordering flow for a single menu item:
//   1. Fetch item with full modifier graph
//   2. Validate customer configuration
//   3. Inventory gate
//   4. Run pricing engine (CENT-FIRST)
//   5. Build AddToCartPayload for cart store
// ============================================================================

import type { AddToCartPayload, CartModifier } from '@/modules/cart/types/cart.types'
import { supabase } from '@/lib/supabase/supabaseClient'
import { PricingEngine } from '@/domain/pricing/pricing.engine'
import { validateItemConfiguration } from '@/domain/menu/modifier.validation'
import { checkSelectionInventory } from '@/domain/menu/modifier-inventory.engine'
import type { CartItemModifierCompat } from '@/domain/pricing/pricing.engine'
import type { MenuItemPublic, SelectedModifier, CartItemModifier } from '@/domain/menu/menu.types'

// ─────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────

export class MenuOrderingError extends Error {
  constructor(
    message: string,
    public code: 'ITEM_NOT_FOUND' | 'VALIDATION_FAILED' | 'INVENTORY_BLOCKED' | 'UNAVAILABLE',
    public details?: unknown,
  ) {
    super(message)
    this.name = 'MenuOrderingError'
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

type UnknownRecord = Record<string, unknown>
const isRecord = (v: unknown): v is UnknownRecord => typeof v === 'object' && v !== null && !Array.isArray(v)

type CompatSelection = {
  id: string
  name?: string
  price_adjustment?: number | null
  priceAdjustment?: number | null
  groupId?: string
  modifier_group_id?: string
  group_id?: string
}

function isCompatSelection(v: unknown): v is CompatSelection {
  if (!isRecord(v)) return false
  return typeof v.id === 'string' && v.id.trim().length > 0
}

function getGroupId(m: unknown): string {
  if (!isRecord(m)) return ''
  const raw =
    (typeof m.groupId === 'string' && m.groupId) ||
    (typeof m.modifier_group_id === 'string' && m.modifier_group_id) ||
    (typeof m.group_id === 'string' && m.group_id) ||
    ''
  return String(raw).trim()
}

function toCents(dollars: unknown): number {
  const n = typeof dollars === 'number' ? dollars : typeof dollars === 'string' ? Number(dollars) : NaN
  if (!Number.isFinite(n)) return 0
  // cents-first (integer)
  return Math.max(0, Math.round(n * 100))
}

/**
 * Normalize ANY incoming "mods" shape into:
 *   [{ modifier_group_id, selections: [{id,name,price_adjustment}] }]
 *
 * Accepts:
 *  A) Flat:   CartItemModifierCompat[]  (each item has groupId/modifier_group_id/group_id)
 *  B) Group:  Array<{ groupId, selections: CompatSelection[] }>
 */
function normalizeCartItemModifiers(mods: unknown): CartItemModifier[] {
  const grouped = new Map<string, CartItemModifier['selections']>()

  const addSelection = (groupId: string, sel: CompatSelection) => {
    const gid = groupId.trim()
    if (!gid) return
    if (!isCompatSelection(sel)) return

    const rawPrice =
      typeof sel.price_adjustment === 'number'
        ? sel.price_adjustment
        : typeof sel.priceAdjustment === 'number'
          ? sel.priceAdjustment
          : 0

    const price = Number.isFinite(rawPrice) ? rawPrice : 0

    const entry = grouped.get(gid) ?? []
    entry.push({
      id: sel.id.trim(),
      name: typeof sel.name === 'string' ? sel.name : '',
      price_adjustment: price,
    })
    grouped.set(gid, entry)
  }

  const arr = Array.isArray(mods) ? mods : []

  for (const mod of arr) {
    const groupId = getGroupId(mod)

    // Grouped object: { groupId, selections: [...] }
    if (isRecord(mod) && Array.isArray(mod.selections)) {
      for (const s of mod.selections) addSelection(groupId, s as CompatSelection)
      continue
    }

    // Flat selection object
    addSelection(groupId, mod as CompatSelection)
  }

  const out: CartItemModifier[] = []
  for (const [modifier_group_id, selections] of grouped.entries()) {
    const cleaned = selections.filter((s) => typeof s.id === 'string' && s.id.trim().length > 0)
    if (!cleaned.length) continue
    out.push({ modifier_group_id, selections: cleaned })
  }

  return out
}

// ─────────────────────────────────────────────────────────────
// Result Types
// ─────────────────────────────────────────────────────────────

export interface OrderingReadyState {
  item: MenuItemPublic
  payload: AddToCartPayload
  pricing: ReturnType<typeof PricingEngine.calculate>
  warnings: string[]
}

// ─────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────

export class MenuOrderingService {
  static async fetchItemForOrdering(itemId: string): Promise<MenuItemPublic> {
    const { data, error } = await supabase.from('menu_items_public').select('*').eq('id', itemId).single()

    if (error || !data) {
      throw new MenuOrderingError(`Item not found: ${itemId}`, 'ITEM_NOT_FOUND')
    }

    const rec = isRecord(data) ? data : ({} as UnknownRecord)

    // Ensure modifiers graph is always an array (never {} / null)
    const modifier_groups = Array.isArray(rec.modifier_groups) ? (rec.modifier_groups as unknown[]) : []

    const item: MenuItemPublic = {
      id: String(rec.id ?? ''),
      name: String(rec.name ?? ''),
      price: Number(rec.price ?? 0), // dollars in view
      category: String(rec.category ?? 'entrees') as MenuItemPublic['category'],
      featured: Boolean(rec.featured ?? false),
      available: Boolean(rec.available ?? true),
      sort_order: Number(rec.sort_order ?? 0),

      description: typeof rec.description === 'string' ? (rec.description as string) : null,
      image_url: typeof rec.image_url === 'string' ? (rec.image_url as string) : null,

      spicy_level: typeof rec.spicy_level === 'number' ? (rec.spicy_level as number) : null,
      is_vegetarian: Boolean(rec.is_vegetarian ?? false),
      is_vegan: Boolean(rec.is_vegan ?? false),
      is_gluten_free: Boolean(rec.is_gluten_free ?? false),
      allergens: Array.isArray(rec.allergens)
        ? (rec.allergens as unknown[]).filter((x): x is string => typeof x === 'string')
        : [],
      pairs_with: Array.isArray(rec.pairs_with)
        ? (rec.pairs_with as unknown[]).filter((x): x is string => typeof x === 'string')
        : [],

      modifier_groups: modifier_groups as MenuItemPublic['modifier_groups'],

      created_at: String(rec.created_at ?? ''),
      updated_at: typeof rec.updated_at === 'string' ? (rec.updated_at as string) : null,
    }

    if (!item.available) {
      throw new MenuOrderingError(`"${item.name}" is not currently available`, 'UNAVAILABLE')
    }

    return item
  }

  static buildCartPayload(
    item: MenuItemPublic,
    selectedModifiers: Record<string, SelectedModifier[]>,
    quantity: number,
    specialInstructions?: string,
  ): OrderingReadyState {
    const groups = item.modifier_groups

    const validation = validateItemConfiguration(groups, selectedModifiers)
    if (!validation.valid) {
      throw new MenuOrderingError(
        'Configuration invalid — please check your selections',
        'VALIDATION_FAILED',
        validation.errors,
      )
    }

    const inventoryCheck = checkSelectionInventory(groups, selectedModifiers)
    if (!inventoryCheck.can_proceed) {
      throw new MenuOrderingError(
        'Some selected options are no longer available',
        'INVENTORY_BLOCKED',
        inventoryCheck.blocked_modifiers,
      )
    }

    // compat modifiers from your pricing engine helper
    const compat = PricingEngine.buildCartModifiers(item, selectedModifiers) as CartItemModifierCompat[]
    const cartModifiers = normalizeCartItemModifiers(compat)

    // ✅ PRICE MUST BE CENTS HERE (view returns dollars)
    const unitPriceCents = toCents(item.price)

    const pricing = PricingEngine.calculate(item.id, unitPriceCents, compat, quantity)

    // Build CartModifier[] (flat, correct shape)
    const modifiers: CartModifier[] = cartModifiers.flatMap((g) =>
      g.selections.map((s) => ({
        id: s.id,
        groupId: g.modifier_group_id,
        name: s.name ?? '',
        priceAdjustment: typeof s.price_adjustment === 'number' && Number.isFinite(s.price_adjustment) ? s.price_adjustment : 0,
      })),
    )

    // ✅ Final AddToCartPayload (pricingHash belongs HERE, not inside modifiers)
    const payload: AddToCartPayload = {
      menuItemId: item.id,
      name: item.name,
      unitPriceCents, // ✅ cents
      imageUrl: item.image_url ?? null,
      category: item.category,
      modifiers,
      quantity,
      notes: specialInstructions?.trim() ? specialInstructions.trim() : null,
      pricingHash: pricing.pricing_hash,
    }

    return {
      item,
      payload,
      pricing,
      warnings: inventoryCheck.warnings ?? [],
    }
  }

  static async prepareOrder(
    itemId: string,
    selectedModifiers: Record<string, SelectedModifier[]>,
    quantity: number,
    specialInstructions?: string,
  ): Promise<OrderingReadyState> {
    const item = await MenuOrderingService.fetchItemForOrdering(itemId)
    return MenuOrderingService.buildCartPayload(item, selectedModifiers, quantity, specialInstructions)
  }
}