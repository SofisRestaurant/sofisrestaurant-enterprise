// ============================================================================
// src/domain/menu/menu.types.ts
// MENU DOMAIN TYPES — canonical, strict, app-safe
// ============================================================================

/* ─────────────────────────────────────────────────────────────
   Primitives
──────────────────────────────────────────────────────────── */

export type MenuCategory =
  | 'appetizers'
  | 'entrees'
  | 'desserts'
  | 'drinks'
  | 'lunch'
  | 'breakfast'
  | 'specials';

export type ModifierGroupType = 'radio' | 'checkbox' | 'quantity';

/* ─────────────────────────────────────────────────────────────
   Modifier Layer
──────────────────────────────────────────────────────────── */

export interface Modifier {
  /** Non-empty UUID. */
  readonly id: string;
  /** Non-empty UUID — must match the parent ModifierGroup.id. */
  readonly modifier_group_id: string;
  readonly name: string;
  /** Cents. Integer. May be negative. */
  readonly price_adjustment: number;
  readonly available: boolean;
  readonly sort_order: number;
}

export interface ModifierGroup {
  /** Non-empty UUID. */
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly type: ModifierGroupType;
  /** Authoritative. Never inferred from min_selections. */
  readonly required: boolean;
  /** Non-negative integer. 0 = no minimum. */
  readonly min_selections: number;
  /** Positive integer or null (unlimited). */
  readonly max_selections: number | null;
  readonly sort_order: number;
  readonly active: boolean;
  /** Always an array. Never null/undefined. */
  readonly modifiers: readonly Modifier[];
}

/* ─────────────────────────────────────────────────────────────
   UI Modifier Layer
──────────────────────────────────────────────────────────── */

export interface ModifierOptionUI {
  readonly id: string;
  readonly name: string;
  readonly priceDelta: number;
  readonly isDefault: boolean;
}

export interface ModifierGroupUI {
  readonly id: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly options: readonly ModifierOptionUI[];
}

/* ─────────────────────────────────────────────────────────────
   Base Menu Model
──────────────────────────────────────────────────────────── */

export interface MenuItemBase {
  readonly id: string;
  readonly name: string;
  readonly inventory_count: number | null;
  readonly price: number;
  readonly category: MenuCategory;
  readonly featured: boolean;
  readonly available: boolean;
  readonly sort_order: number;

  readonly description: string | null;
  /** Always string | null — never undefined or {}. */
  readonly image_url: string | null;

  readonly spicy_level: number | null;
  readonly is_vegetarian: boolean;
  readonly is_vegan: boolean;
  readonly is_gluten_free: boolean;
  readonly allergens: readonly string[];
  readonly pairs_with: readonly string[];

  /** DB structure. Always an array — never null/undefined. */
  readonly modifier_groups: readonly ModifierGroup[];

  /** UI structure. Optional — present only when explicitly hydrated. */
  readonly modifierGroups?: readonly ModifierGroupUI[];

  readonly created_at: string;
  readonly updated_at: string | null;
}

/* ─────────────────────────────────────────────────────────────
   Public + Admin Models
──────────────────────────────────────────────────────────── */

export type MenuItemPublic = MenuItemBase;

export interface InventoryFields {
  readonly low_stock_threshold: number;
  readonly inventory_count: number | null;
}

export interface MenuItemAdmin extends MenuItemBase, InventoryFields {
  readonly popularity_score: number | null;
}

/** Back-compat alias. */
export type MenuItem = MenuItemPublic;

/* ─────────────────────────────────────────────────────────────
   Selection types — used by PricingEngine and checkout
──────────────────────────────────────────────────────────── */

/**
 * A single modifier the customer has selected.
 * modifier_group_id is required — it must match the parent group.id.
 * Carried explicitly so downstream consumers never need to re-look it up.
 */
export interface SelectedModifier {
  readonly id: string;
  /** Must match the ModifierGroup.id this modifier belongs to. */
  readonly modifier_group_id: string;
  readonly name: string;
  /** Cents. Integer. */
  readonly price_adjustment: number;
}

/** What a modifier group looks like inside a cart item. */
export interface CartItemModifier {
  readonly modifier_group_id: string;
  readonly selections: readonly SelectedModifier[];
}

/* ─────────────────────────────────────────────────────────────
   Pricing & Validation Types
──────────────────────────────────────────────────────────── */

export interface PricingBreakdown {
  readonly base_price: number;
  readonly modifier_total: number;
  readonly unit_price: number;
  readonly quantity: number;
  readonly subtotal: number;
  readonly tax: number;
  readonly total: number;
  readonly pricing_hash: string;
}

export interface ConfigurationValidation {
  readonly valid: boolean;
  readonly errors: Record<string, string>;
}

export interface ModifierValidationResult {
  readonly ok: boolean;
  readonly code?: string;
  readonly message?: string;
}