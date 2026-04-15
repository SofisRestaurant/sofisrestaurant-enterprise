// src/services/menu-ordering.service.ts
// ============================================================================
// MENU ORDERING SERVICE — Production Hardened (2026)
// ============================================================================
// Orchestrates the complete ordering flow for a single menu item:
//   1. Fetch item with full modifier graph via get_menu_item_public RPC
//   2. Validate customer configuration
//   3. Inventory gate
//   4. Run pricing engine (CENT-FIRST)
//   5. Build AddToCartPayload for cart store
// ============================================================================

import type { AddToCartPayload, CartModifier } from '@/modules/cart/types/cart.types';
import { supabase } from '@/lib/supabase/supabaseClient';
import { PricingEngine } from '@/domain/pricing/pricing.engine';
import { validateItemConfiguration } from '@/domain/menu/modifier.validation';
import { checkSelectionInventory } from '@/domain/menu/modifier-inventory.engine';
import { toMenuItemBase } from '@/domain/menu/menu.gateway';
import type { MenuItemPublic, SelectedModifier, CartItemModifier } from '@/domain/menu/menu.types';

// ─────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────

export class MenuOrderingError extends Error {
  public readonly code: 'ITEM_NOT_FOUND' | 'VALIDATION_FAILED' | 'INVENTORY_BLOCKED' | 'UNAVAILABLE';
  public readonly details?: unknown;

  constructor(
    message: string,
    code: 'ITEM_NOT_FOUND' | 'VALIDATION_FAILED' | 'INVENTORY_BLOCKED' | 'UNAVAILABLE',
    details?: unknown,
  ) {
    super(message);
    this.name = 'MenuOrderingError';
    this.code = code;
    this.details = details;
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

type UnknownRecord = Record<string, unknown>;

type MenuModifierGroup  = MenuItemPublic['modifier_groups'][number];
type MenuModifierOption = MenuModifierGroup['modifiers'][number];

type CompatSelection = {
  id: string;
  name?: string;
  // price_adjustment is the single canonical field. priceAdjustment (camelCase)
  // intentionally removed — post-gateway data must never carry the old shape.
  price_adjustment?: number | null;
  groupId?: string;
  modifier_group_id?: string;
  group_id?: string;
};

type CompatSelectionGroup = {
  groupId?: string;
  modifier_group_id?: string;
  group_id?: string;
  selections: CompatSelection[];
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isMenuModifierOption(value: unknown): value is MenuModifierOption {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && value.id.trim().length > 0;
}

function isMenuModifierGroup(value: unknown): value is MenuModifierGroup {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    value.id.trim().length > 0 &&
    Array.isArray(value.modifiers) &&
    value.modifiers.every(isMenuModifierOption)
  );
}

function getGroupId(value: unknown): string {
  if (!isRecord(value)) return '';
  const groupId =
    asTrimmedString(value.groupId) ??
    asTrimmedString(value.modifier_group_id) ??
    asTrimmedString(value.group_id);
  return groupId ?? '';
}

function isCompatSelection(value: unknown): value is CompatSelection {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && value.id.trim().length > 0;
}

function isCompatSelectionGroup(value: unknown): value is CompatSelectionGroup {
  if (!isRecord(value) || !Array.isArray(value.selections)) return false;
  return value.selections.every(isCompatSelection);
}

function normalizeCartItemModifiers(mods: unknown): CartItemModifier[] {
  // Use a mutable working array in the Map; CartItemModifier.selections is readonly
  // so we cannot push onto a CartItemModifier['selections'] typed value directly.
  const grouped = new Map<string, SelectedModifier[]>();
  const input   = Array.isArray(mods) ? mods : [];

  const addSelection = (groupId: string, selection: CompatSelection): void => {
    const normalizedGroupId     = groupId.trim();
    const normalizedSelectionId = selection.id.trim();
    if (normalizedGroupId.length === 0 || normalizedSelectionId.length === 0) return;

    // price_adjustment is the single canonical field on post-gateway data.
    // priceAdjustment (camelCase) has been removed — it should not exist here.
    // If price_adjustment is absent or non-finite, reject the selection rather
    // than silently pricing it at $0.
    if (
      typeof selection.price_adjustment !== 'number' ||
      !Number.isFinite(selection.price_adjustment)
    ) {
      throw new Error(
        `normalizeCartItemModifiers: selection(id=${normalizedSelectionId}) in ` +
        `group(id=${normalizedGroupId}) has invalid price_adjustment: ` +
        String(selection.price_adjustment),
      );
    }
    const priceAdjustment = selection.price_adjustment;
    const currentSelections = grouped.get(normalizedGroupId) ?? [];
    currentSelections.push({
      id:                normalizedSelectionId,
      modifier_group_id: normalizedGroupId,
      name:              typeof selection.name === 'string' ? selection.name : '',
      price_adjustment:  priceAdjustment,
    });
    grouped.set(normalizedGroupId, currentSelections);
  };

  for (const item of input) {
    if (isCompatSelectionGroup(item)) {
      const groupId = getGroupId(item);
      for (const selection of item.selections) {
        addSelection(groupId, selection);
      }
      continue;
    }
    if (isCompatSelection(item)) {
      addSelection(getGroupId(item), item);
    }
  }

  const normalized: CartItemModifier[] = [];
  for (const [modifier_group_id, selections] of grouped.entries()) {
    if (selections.length === 0) continue;
    normalized.push({ modifier_group_id, selections });
  }
  return normalized;
}

function toCents(dollars: number): number {
  return Math.max(0, Math.round(dollars * 100));
}

// ─────────────────────────────────────────────────────────────
// RPC item parser
// ─────────────────────────────────────────────────────────────
// Delegates all field validation and normalization to menu.gateway.ts.
// menu.gateway.toMenuItemBase throws a generic Error on invalid data.
// This wrapper re-throws those errors as MenuOrderingError so that callers
// in this service receive the domain-specific error type they expect.

function parseRpcItem(data: unknown): MenuItemPublic {
  try {
    return toMenuItemBase(data);
  } catch (err) {
    throw new MenuOrderingError(
      err instanceof Error ? err.message : 'Item not found',
      'ITEM_NOT_FOUND',
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Result Types
// ─────────────────────────────────────────────────────────────

export interface OrderingReadyState {
  item:     MenuItemPublic;
  payload:  AddToCartPayload;
  pricing:  ReturnType<typeof PricingEngine.calculate>;
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────

export class MenuOrderingService {
  static async fetchItemForOrdering(itemId: string): Promise<MenuItemPublic> {
    const { data, error } = await supabase.rpc('get_menu_item_public', {
      p_item_id: itemId,
    });

    if (error !== null || data === null) {
      throw new MenuOrderingError(`Item not found: ${itemId}`, 'ITEM_NOT_FOUND');
    }

    const item = parseRpcItem(data);

    if (!item.available) {
      throw new MenuOrderingError(
        `"${item.name}" is not currently available`,
        'UNAVAILABLE',
      );
    }

    return item;
  }

  static buildCartPayload(
    item:                 MenuItemPublic,
    selectedModifiers:    Record<string, SelectedModifier[]>,
    quantity:             number,
    specialInstructions?: string,
  ): OrderingReadyState {
    const groups = item.modifier_groups;

    const validation = validateItemConfiguration(groups, selectedModifiers);
    if (!validation.valid) {
      throw new MenuOrderingError(
        'Configuration invalid — please check your selections',
        'VALIDATION_FAILED',
        validation.errors,
      );
    }

    const inventoryCheck = checkSelectionInventory(groups, selectedModifiers);
    if (!inventoryCheck.can_proceed) {
      throw new MenuOrderingError(
        'Some selected options are no longer available',
        'INVENTORY_BLOCKED',
        inventoryCheck.blocked_modifiers,
      );
    }

    const compatModifiers   = PricingEngine.buildCartModifiers(item, selectedModifiers);
    const cartItemModifiers = normalizeCartItemModifiers(compatModifiers);
    const unitPriceCents    = toCents(item.price);

    const pricing = PricingEngine.calculate(item.id, unitPriceCents, compatModifiers, quantity);

    const modifiers: CartModifier[] = cartItemModifiers.flatMap((group) =>
      group.selections.map((selection) => ({
        id:    selection.id,
        groupId: group.modifier_group_id,
        name:  selection.name ?? '',
        priceAdjustmentCents:
          typeof selection.price_adjustment === 'number' &&
          Number.isFinite(selection.price_adjustment)
            ? selection.price_adjustment
            : 0,
      })),
    );

    const payload: AddToCartPayload = {
      menuItemId:  item.id,
      name:        item.name,
      unitPriceCents,
      imageUrl:    item.image_url ?? null,
      category:    item.category,
      modifiers,
      quantity,
      notes:       specialInstructions?.trim() ? specialInstructions.trim() : null,
      pricingHash: pricing.pricing_hash,
    };

    return {
      item,
      payload,
      pricing,
      warnings: inventoryCheck.warnings ?? [],
    };
  }

  static async prepareOrder(
    itemId:               string,
    selectedModifiers:    Record<string, SelectedModifier[]>,
    quantity:             number,
    specialInstructions?: string,
  ): Promise<OrderingReadyState> {
    const item = await MenuOrderingService.fetchItemForOrdering(itemId);
    return MenuOrderingService.buildCartPayload(
      item,
      selectedModifiers,
      quantity,
      specialInstructions,
    );
  }
}