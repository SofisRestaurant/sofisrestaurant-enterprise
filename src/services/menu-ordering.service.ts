// src/services/menu-ordering.service.ts
// ============================================================================
// MENU ORDERING SERVICE
// ============================================================================
// Orchestrates the complete ordering flow for a single menu item:
//   1. Fetch item with full modifier graph
//   2. Validate customer configuration
//   3. Run pricing engine
//   4. Build cart payload
//   5. Optionally verify against server (anti-tamper)
//
// This is the authoritative entry point that MenuItemModal calls.
// ============================================================================

import { MenuService }            from './menu.service'
import { PricingEngine }          from '@/domain/pricing/pricing.engine'
import { validateItemConfiguration } from '@/domain/menu/modifier.validation'
import { checkSelectionInventory }   from '@/domain/menu/modifier-inventory.engine'
import type {
  MenuItem,
  SelectedModifier,
  CartItemModifier,
}                                 from '@/domain/menu/menu.types'
import type { AddToCartPayload }  from '@/features/cart/cart.types'

// ─────────────────────────────────────────────────────────────────────────────
// Error
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Result types
// ─────────────────────────────────────────────────────────────────────────────

export interface OrderingReadyState {
  item:     MenuItem
  payload:  AddToCartPayload
  pricing:  ReturnType<typeof PricingEngine.calculate>
  warnings: string[]
}

export interface OrderingValidationError {
  errors:   Record<string, string>   // group_id → message
  warnings: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class MenuOrderingService {

  /**
   * Fetch an item ready for ordering.
   * Throws MenuOrderingError if item not found or unavailable.
   */
  static async fetchItemForOrdering(itemId: string): Promise<MenuItem> {
    const item = await MenuService.getMenuItemWithModifiers(itemId)
    if (!item) {
      throw new MenuOrderingError(`Item not found: ${itemId}`, 'ITEM_NOT_FOUND')
    }
    if (!item.available) {
      throw new MenuOrderingError(`"${item.name}" is not currently available`, 'UNAVAILABLE')
    }
    if (PricingEngine.isOutOfStock(item)) {
      throw new MenuOrderingError(`"${item.name}" is out of stock`, 'UNAVAILABLE')
    }
    return item
  }

  /**
   * Validate and build a cart payload from a customer's configuration.
   * Throws MenuOrderingError if validation fails.
   */
  static buildCartPayload(
    item:              MenuItem,
    selectedModifiers: Record<string, SelectedModifier[]>,
    quantity:          number,
    specialInstructions?: string,
  ): OrderingReadyState {
    // 1. Validate configuration rules
    const validation = validateItemConfiguration(item.modifier_groups, selectedModifiers)
    if (!validation.valid) {
      throw new MenuOrderingError(
        'Configuration invalid — please check your selections',
        'VALIDATION_FAILED',
        validation.errors,
      )
    }

    // 2. Check modifier availability (inventory engine)
    const inventoryCheck = checkSelectionInventory(item.modifier_groups, selectedModifiers)
    if (!inventoryCheck.can_proceed) {
      throw new MenuOrderingError(
        'Some selected options are no longer available',
        'INVENTORY_BLOCKED',
        inventoryCheck.blocked_modifiers,
      )
    }

    // 3. Build cart modifiers
    const cartModifiers: CartItemModifier[] = PricingEngine.buildCartModifiers(item, selectedModifiers)

    // 4. Calculate pricing
    const pricing = PricingEngine.calculate(item.id, item.price, cartModifiers, quantity)

    // 5. Assemble payload
    const payload: AddToCartPayload = {
      item_id:               item.id,
      name:                  item.name,
      image_url:             item.image_url,
      base_price:            item.price,
      modifiers:             cartModifiers,
      quantity,
      special_instructions:  specialInstructions?.trim() || undefined,
    }

    return {
      item,
      payload,
      pricing,
      warnings: inventoryCheck.warnings,
    }
  }

  /**
   * Full ordering flow: fetch + validate + build payload.
   * Convenience method that combines the two above.
   */
  static async prepareOrder(
    itemId:            string,
    selectedModifiers: Record<string, SelectedModifier[]>,
    quantity:          number,
    specialInstructions?: string,
  ): Promise<OrderingReadyState> {
    const item = await MenuOrderingService.fetchItemForOrdering(itemId)
    return MenuOrderingService.buildCartPayload(item, selectedModifiers, quantity, specialInstructions)
  }
}