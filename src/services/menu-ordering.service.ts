// src/services/menu-ordering.service.ts
// ============================================================================
// MENU ORDERING SERVICE
// ============================================================================
// Orchestrates the complete ordering flow for a single menu item:
//   1. Fetch item with full modifier graph
//   2. Validate customer configuration
//   3. Inventory gate
//   4. Run pricing engine
//   5. Build AddToCartPayload for cart store
// ============================================================================
import type { AddToCartPayload, CartModifier } from '@/features/cart/cart.types'
import { supabase } from '@/lib/supabase/supabaseClient'
import { PricingEngine } from '@/domain/pricing/pricing.engine'
import { validateItemConfiguration } from '@/domain/menu/modifier.validation'
import { checkSelectionInventory } from '@/domain/menu/modifier-inventory.engine'

import type { MenuItemPublic, SelectedModifier, CartItemModifier } from '@/domain/menu/menu.types'
import type { CartItemModifierCompat } from '@/domain/pricing/pricing.engine'

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
const isRecord = (v: unknown): v is UnknownRecord => typeof v === 'object' && v !== null

function normalizeCartItemModifiers(mods: CartItemModifierCompat[]): CartItemModifier[] {
  const out: CartItemModifier[] = []

  for (const m of mods) {
    const modifier_group_id =
      typeof m.modifier_group_id === 'string'
        ? m.modifier_group_id
        : typeof m.group_id === 'string'
          ? m.group_id
          : null
type CompatSelection = {
  id: string
  name?: string
  price_adjustment?: number | null
}

function isCompatSelection(v: unknown): v is CompatSelection {
  if (!v || typeof v !== 'object') return false
  return typeof (v as { id?: unknown }).id === 'string'
}
    if (!modifier_group_id) continue

    const selectionsRaw = Array.isArray(m.selections) ? m.selections : []
   const selections = selectionsRaw
  .filter(isCompatSelection)
  .map((s) => ({
    id: s.id,
    name: typeof s.name === 'string' ? s.name : '',
    price_adjustment: typeof s.price_adjustment === 'number' ? s.price_adjustment : 0,
  }))

    out.push({ modifier_group_id, selections })
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
    const { data, error } = await supabase
      .from('menu_items_public')
      .select('*')
      .eq('id', itemId)
      .single()

    if (error || !data) {
      throw new MenuOrderingError(`Item not found: ${itemId}`, 'ITEM_NOT_FOUND')
    }

    // IMPORTANT:
    // Your DB view likely returns modifier_groups as JSON already.
    // We must normalize + default the array so downstream validators never receive {}.
    const modifier_groups = Array.isArray((data as UnknownRecord).modifier_groups)
      ? ((data as UnknownRecord).modifier_groups as unknown[])
      : []

    const item: MenuItemPublic = {
      id: String((data as UnknownRecord).id ?? ''),
      name: String((data as UnknownRecord).name ?? ''),
      price: Number((data as UnknownRecord).price ?? 0),
      category: String((data as UnknownRecord).category ?? 'entrees') as MenuItemPublic['category'],
      featured: Boolean((data as UnknownRecord).featured ?? false),
      available: Boolean((data as UnknownRecord).available ?? true),
      sort_order: Number((data as UnknownRecord).sort_order ?? 0),

      description:
        typeof (data as UnknownRecord).description === 'string'
          ? ((data as UnknownRecord).description as string)
          : null,
      image_url:
        typeof (data as UnknownRecord).image_url === 'string'
          ? ((data as UnknownRecord).image_url as string)
          : null,

      spicy_level:
        typeof (data as UnknownRecord).spicy_level === 'number'
          ? ((data as UnknownRecord).spicy_level as number)
          : null,
      is_vegetarian: Boolean((data as UnknownRecord).is_vegetarian ?? false),
      is_vegan: Boolean((data as UnknownRecord).is_vegan ?? false),
      is_gluten_free: Boolean((data as UnknownRecord).is_gluten_free ?? false),
      allergens: Array.isArray((data as UnknownRecord).allergens)
        ? ((data as UnknownRecord).allergens as unknown[]).filter((x): x is string => typeof x === 'string')
        : [],
      pairs_with: Array.isArray((data as UnknownRecord).pairs_with)
        ? ((data as UnknownRecord).pairs_with as unknown[]).filter((x): x is string => typeof x === 'string')
        : [],

      // minimal safe normalize: ensure it's an array for validators
      modifier_groups: modifier_groups as MenuItemPublic['modifier_groups'],

      created_at: String((data as UnknownRecord).created_at ?? ''),
      updated_at:
        typeof (data as UnknownRecord).updated_at === 'string'
          ? ((data as UnknownRecord).updated_at as string)
          : null,
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
    // FIX 1: define groups (your error: Cannot find name 'groups')
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

    const compat = PricingEngine.buildCartModifiers(item, selectedModifiers) as CartItemModifierCompat[]
    const cartModifiers = normalizeCartItemModifiers(compat)

    const pricing = PricingEngine.calculate(item.id, item.price, compat, quantity)

    // FIX 2: AddToCartPayload expects imageUrl: string | null (NOT {} | null)
    // We source from item.image_url which is normalized to string|null in menu.types.ts
    
// Build CartModifier[] (flat, correct shape)
const modifiers: CartModifier[] = cartModifiers.flatMap((g) =>
  g.selections.map((s) => ({
    id: s.id,
    groupId: g.modifier_group_id,
    name: s.name ?? '',
    priceAdjustment: s.price_adjustment ?? 0,
  })),
)

// ✅ Final AddToCartPayload (pricingHash belongs HERE, not inside modifiers)
const payload: AddToCartPayload = {
  menuItemId: item.id,
  name: item.name,
  unitPriceCents: item.price,
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