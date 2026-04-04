// =============================================================================
// src/modules/cart/types/cart.types.ts
// Cart domain types — aligned 1:1 with database.types.ts
// =============================================================================
//
// Sources:
//   pending_carts       → CartSession (persisted server-side)
//   menu_items          → CartMenuItem
//   modifiers           → CartModifier
//   modifier_groups     → CartModifierGroup
//   promotions          → CartPromotion
//   user_credits        → CartCredit
//   orders (cart_items) → CartOrderItem (shape stored in orders.cart_items JSON)
// =============================================================================

import type { Database } from '@/types/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Raw DB row aliases (for service layer use)
// ─────────────────────────────────────────────────────────────────────────────

export type PendingCartRow = Database['public']['Tables']['pending_carts']['Row'];
export type PromotionRow = Database['public']['Tables']['promotions']['Row'];
export type UserCreditRow = Database['public']['Tables']['user_credits']['Row'];
export type MenuItemRow = Database['public']['Tables']['menu_items']['Row'];
export type ModifierRow = Database['public']['Tables']['modifiers']['Row'];
export type ModifierGroupRow = Database['public']['Tables']['modifier_groups']['Row'];

// ─────────────────────────────────────────────────────────────────────────────
// Cart Item Modifier (selected modifier on a line item)
// ─────────────────────────────────────────────────────────────────────────────

export interface CartModifier {
  /** modifiers.id */
  id: string;
  /** modifiers.modifier_group_id */
  groupId: string;
  /** modifiers.name */
  name: string;
  /** modifiers.price_adjustment — integer cents, may be negative. */
  priceAdjustmentCents: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cart Line Item
// Matches shape stored in orders.cart_items JSON and pending_carts.items JSON
// ─────────────────────────────────────────────────────────────────────────────

export interface CartItem {
  menuItemId: string;
  name: string;
  /** Integer cents. */
  unitPriceCents: number;
  imageUrl: string | null;
  category: Database['public']['Enums']['menu_category'];
  modifiers: CartModifier[];
  quantity: number;
  notes: string | null;
  /** Integer cents. Always derived — never trust stored value. */
  lineTotalCents: number;
  pricingHash: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Applied Promotion
// ─────────────────────────────────────────────────────────────────────────────

export interface CartPromotion {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  minOrderCents: number;
  expiresAt: string | null;
  discountCents: number;
}

export type AddToCartPayload = Omit<CartItem, 'lineTotalCents'>;

export interface CartStore {
  items: CartItem[];
  promotion: CartPromotion | null;
  credit: CartCredit | null;
  totals: CartTotals;

  addItem: (payload: AddToCartPayload) => void;
  removeItem: (menuItemId: string, modifierKey: string) => void;
  updateQuantity: (menuItemId: string, modifierKey: string, quantity: number) => void;
  updateNotes: (menuItemId: string, modifierKey: string, notes: string) => void;

  applyPromo: (promo: CartPromotion) => void;
  removePromo: () => void;

  applyCredit: (credit: CartCredit) => void;
  removeCredit: () => void;

  clearCart: () => void;
  hydrate: (state: CartState) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Applied Store Credit
// ─────────────────────────────────────────────────────────────────────────────

export interface CartCredit {
  /** user_credits.id */
  id: string;
  /** user_credits.amount_cents — integer cents. */
  amountCents: number;
  /** user_credits.source */
  source: string;
  /** user_credits.expires_at */
  expiresAt: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cart Totals (computed, never stored directly)
// ─────────────────────────────────────────────────────────────────────────────

export interface CartTotals {
  /** Sum of all lineTotalCents, pre-discount. Integer cents. */
  subtotalCents: number;
  /** Discount from promotion. Integer cents. */
  discountCents: number;
  /** Discount from store credit. Integer cents. */
  creditCents: number;
  /** Tax applied after discounts. Integer cents. */
  taxCents: number;
  /** Final amount the customer pays. Integer cents. */
  totalCents: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cart State
// ─────────────────────────────────────────────────────────────────────────────

export interface CartState {
  items: CartItem[];
  promotion: CartPromotion | null;
  credit: CartCredit | null;
  totals: CartTotals;
}

// ─────────────────────────────────────────────────────────────────────────────
// Persisted Cart Session (maps to pending_carts table)
// ─────────────────────────────────────────────────────────────────────────────

export interface CartSession {
  id: string;
  userId: string;
  items: CartItem[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  promoId: string | null;
  creditId: string | null;
  expiresAt: string | null;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Checkout Payload
// ─────────────────────────────────────────────────────────────────────────────

export interface CheckoutPayload {
  items: CartItem[];
  promoId: string | null;
  creditId: string | null;
  totals: CartTotals;
  orderType: 'pickup' | 'delivery' | 'dine_in';
  notes: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cart Action Types
// ─────────────────────────────────────────────────────────────────────────────

export type CartAction =
  | { type: 'ADD_ITEM'; payload: CartItem }
  | { type: 'REMOVE_ITEM'; payload: { menuItemId: string; modifierKey: string } }
  | { type: 'UPDATE_QUANTITY'; payload: { menuItemId: string; modifierKey: string; quantity: number } }
  | { type: 'UPDATE_NOTES'; payload: { menuItemId: string; modifierKey: string; notes: string } }
  | { type: 'APPLY_PROMO'; payload: CartPromotion }
  | { type: 'REMOVE_PROMO' }
  | { type: 'APPLY_CREDIT'; payload: CartCredit }
  | { type: 'REMOVE_CREDIT' }
  | { type: 'CLEAR_CART' }
  | { type: 'HYDRATE'; payload: CartState };

// ─────────────────────────────────────────────────────────────────────────────
// Promo Validation
// ─────────────────────────────────────────────────────────────────────────────

export type PromoValidationError =
  | 'NOT_FOUND'
  | 'INACTIVE'
  | 'EXPIRED'
  | 'LIMIT_REACHED'
  | 'USER_LIMIT_REACHED'
  | 'MIN_ORDER_NOT_MET'
  | 'ALREADY_APPLIED';

export type PromoValidationResult =
  | { valid: true; promo: CartPromotion }
  | { valid: false; error: PromoValidationError };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deterministic deduplication key for a cart line item.
 * Combines menuItemId + sorted modifier IDs so two items with
 * identical configuration are treated as the same line.
 */
export function cartItemKey(menuItemId: string, modifiers: Pick<CartModifier, 'id'>[]): string {
  const modKey = modifiers
    .map((m) => m.id)
    .sort()
    .join('|');
  return `${menuItemId}::${modKey}`;
}

/**
 * Compute line total for a single cart item.
 * All values are integer cents.
 */
export function computeLineTotalCents(
  item: Pick<CartItem, 'unitPriceCents' | 'modifiers' | 'quantity'>,
): number {
  const modifierSum = item.modifiers.reduce((sum, m) => sum + m.priceAdjustmentCents, 0);
  return (item.unitPriceCents + modifierSum) * item.quantity;
}

/**
 * Compute full cart totals from items + optional promotion + optional credit.
 * All values are integer cents.
 */
export function computeCartTotals(
  items: CartItem[],
  promotion: CartPromotion | null,
  credit: CartCredit | null,
  taxRate = 0.095,
): CartTotals {
  const subtotalCents = items.reduce((sum, i) => sum + i.lineTotalCents, 0);

  const discountCents = promotion
    ? Math.min(
        subtotalCents,
        promotion.type === 'percent'
          ? Math.round(subtotalCents * (promotion.value / 100))
          : promotion.value,
      )
    : 0;

  const afterDiscount = Math.max(0, subtotalCents - discountCents);
  const creditCents = credit ? Math.min(afterDiscount, credit.amountCents) : 0;
  const taxable = Math.max(0, afterDiscount - creditCents);
  const taxCents = Math.round(taxable * taxRate);
  const totalCents = taxable + taxCents;

  return { subtotalCents, discountCents, creditCents, taxCents, totalCents };
}