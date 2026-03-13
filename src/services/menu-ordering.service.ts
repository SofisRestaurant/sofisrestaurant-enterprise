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

import type { AddToCartPayload, CartModifier } from '@/modules/cart/types/cart.types';
import { supabase } from '@/lib/supabase/supabaseClient';
import { PricingEngine } from '@/domain/pricing/pricing.engine';
import { validateItemConfiguration } from '@/domain/menu/modifier.validation';
import { checkSelectionInventory } from '@/domain/menu/modifier-inventory.engine';
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

type MenuModifierGroup = MenuItemPublic['modifier_groups'][number];
type MenuModifierOption = MenuModifierGroup['modifiers'][number];

type CompatSelection = {
  id: string;
  name?: string;
  price_adjustment?: number | null;
  priceAdjustment?: number | null;
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

const MENU_CATEGORIES = new Set([
  'appetizers',
  'entrees',
  'sides',
  'desserts',
  'drinks',
  'specials',
  'kids',
  'combos',
  'breakfast',
  'lunch',
  'dinner',
]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toCents(dollars: unknown): number {
  const amount = asNumber(dollars, 0);
  return Math.max(0, Math.round(amount * 100));
}

function isMenuCategory(value: unknown): value is MenuItemPublic['category'] {
  return typeof value === 'string' && MENU_CATEGORIES.has(value);
}

function isMenuModifierOption(value: unknown): value is MenuModifierOption {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.id === 'string' && value.id.trim().length > 0;
}

function isMenuModifierGroup(value: unknown): value is MenuModifierGroup {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    value.id.trim().length > 0 &&
    Array.isArray(value.modifiers) &&
    value.modifiers.every(isMenuModifierOption)
  );
}

function parseModifierGroups(value: unknown): MenuItemPublic['modifier_groups'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isMenuModifierGroup);
}

function getGroupId(value: unknown): string {
  if (!isRecord(value)) {
    return '';
  }

  const groupId =
    asTrimmedString(value.groupId) ??
    asTrimmedString(value.modifier_group_id) ??
    asTrimmedString(value.group_id);

  return groupId ?? '';
}

function isCompatSelection(value: unknown): value is CompatSelection {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.id === 'string' && value.id.trim().length > 0;
}

function isCompatSelectionGroup(value: unknown): value is CompatSelectionGroup {
  if (!isRecord(value) || !Array.isArray(value.selections)) {
    return false;
  }

  return value.selections.every(isCompatSelection);
}

/**
 * Normalize ANY incoming "mods" shape into:
 *   [{ modifier_group_id, selections: [{id,name,price_adjustment}] }]
 *
 * Accepts:
 *  A) Flat:   compat selection array with group ids on each selection
 *  B) Group:  Array<{ groupId, selections: CompatSelection[] }>
 */
function normalizeCartItemModifiers(mods: unknown): CartItemModifier[] {
  const grouped = new Map<string, CartItemModifier['selections']>();
  const input = Array.isArray(mods) ? mods : [];

  const addSelection = (groupId: string, selection: CompatSelection): void => {
    const normalizedGroupId = groupId.trim();
    const normalizedSelectionId = selection.id.trim();

    if (normalizedGroupId.length === 0 || normalizedSelectionId.length === 0) {
      return;
    }

    const rawPrice =
      typeof selection.price_adjustment === 'number'
        ? selection.price_adjustment
        : typeof selection.priceAdjustment === 'number'
          ? selection.priceAdjustment
          : 0;

    const priceAdjustment = Number.isFinite(rawPrice) ? rawPrice : 0;
    const currentSelections = grouped.get(normalizedGroupId) ?? [];

    currentSelections.push({
      id: normalizedSelectionId,
      name: typeof selection.name === 'string' ? selection.name : '',
      price_adjustment: priceAdjustment,
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
    if (selections.length === 0) {
      continue;
    }

    normalized.push({
      modifier_group_id,
      selections,
    });
  }

  return normalized;
}

function parseMenuItem(data: unknown): MenuItemPublic {
  if (!isRecord(data)) {
    throw new MenuOrderingError('Item not found', 'ITEM_NOT_FOUND');
  }

  const id = asTrimmedString(data.id);
  const name = asTrimmedString(data.name);

  if (id === null || name === null) {
    throw new MenuOrderingError('Item not found', 'ITEM_NOT_FOUND');
  }

  const rawCategory = data.category;
  const category: MenuItemPublic['category'] = isMenuCategory(rawCategory) ? rawCategory : 'entrees';

  return {
    id,
    name,
    price: asNumber(data.price, 0),
    category,
    featured: asBoolean(data.featured, false),
    available: asBoolean(data.available, true),
    sort_order: Math.trunc(asNumber(data.sort_order, 0)),
    description: asOptionalString(data.description),
    image_url: asOptionalString(data.image_url),
    spicy_level: asNullableNumber(data.spicy_level),
    is_vegetarian: asBoolean(data.is_vegetarian, false),
    is_vegan: asBoolean(data.is_vegan, false),
    is_gluten_free: asBoolean(data.is_gluten_free, false),
    allergens: isStringArray(data.allergens) ? data.allergens : [],
    pairs_with: isStringArray(data.pairs_with) ? data.pairs_with : [],
    modifier_groups: parseModifierGroups(data.modifier_groups),
    created_at: asTrimmedString(data.created_at) ?? '',
    updated_at: asOptionalString(data.updated_at),
  };
}

// ─────────────────────────────────────────────────────────────
// Result Types
// ─────────────────────────────────────────────────────────────

export interface OrderingReadyState {
  item: MenuItemPublic;
  payload: AddToCartPayload;
  pricing: ReturnType<typeof PricingEngine.calculate>;
  warnings: string[];
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
      .single();

    if (error !== null || data === null) {
      throw new MenuOrderingError(`Item not found: ${itemId}`, 'ITEM_NOT_FOUND');
    }

    const item = parseMenuItem(data);

    if (!item.available) {
      throw new MenuOrderingError(`"${item.name}" is not currently available`, 'UNAVAILABLE');
    }

    return item;
  }

  static buildCartPayload(
    item: MenuItemPublic,
    selectedModifiers: Record<string, SelectedModifier[]>,
    quantity: number,
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

    const compatModifiers = PricingEngine.buildCartModifiers(item, selectedModifiers);
    const cartItemModifiers = normalizeCartItemModifiers(compatModifiers);
    const unitPriceCents = toCents(item.price);

    const pricing = PricingEngine.calculate(item.id, unitPriceCents, compatModifiers, quantity);

    const modifiers: CartModifier[] = cartItemModifiers.flatMap((group) =>
      group.selections.map((selection) => ({
        id: selection.id,
        groupId: group.modifier_group_id,
        name: selection.name ?? '',
        priceAdjustment:
          typeof selection.price_adjustment === 'number' && Number.isFinite(selection.price_adjustment)
            ? selection.price_adjustment
            : 0,
      })),
    );

    const payload: AddToCartPayload = {
      menuItemId: item.id,
      name: item.name,
      unitPriceCents,
      imageUrl: item.image_url ?? null,
      category: item.category,
      modifiers,
      quantity,
      notes: specialInstructions?.trim() ? specialInstructions.trim() : null,
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
    itemId: string,
    selectedModifiers: Record<string, SelectedModifier[]>,
    quantity: number,
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