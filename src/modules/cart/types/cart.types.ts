// =============================================================================
// src/features/cart/cart.types.ts
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
  /** modifiers.price_adjustment (in cents) */
  priceAdjustment: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cart Line Item
// Matches shape stored in orders.cart_items JSON and pending_carts.items JSON
// ─────────────────────────────────────────────────────────────────────────────

export interface CartItem {
  menuItemId: string;
  name: string;
  unitPriceCents: number;
  imageUrl: string | null;
  category: Database['public']['Enums']['menu_category'];
  modifiers: CartModifier[];
  quantity: number;
  notes: string | null;
  lineTotalCents: number;
  pricingHash: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Applied Promotion
// Derived from promotions row + promo_redemptions lookup
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

// (2) CartStore — public interface for your Zustand store (useCartStore)
//     Keep this aligned with src/features/cart/cart.store.ts
export interface CartStore {
  // state
  items: CartItem[];
  promotion: CartPromotion | null;
  credit: CartCredit | null;
  totals: CartTotals;

  // actions
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
// Derived from user_credits row
// ─────────────────────────────────────────────────────────────────────────────

export interface CartCredit {
  /** user_credits.id */
  id: string;
  /** user_credits.amount_cents */
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
  /** Sum of all lineTotalCents, pre-discount */
  subtotalCents: number;
  /** Discount from promotion */
  discountCents: number;
  /** Discount from store credit */
  creditCents: number;
  /** Tax applied after discounts (matches orders.amount_tax) */
  taxCents: number;
  /** Final amount the customer pays (matches orders.amount_total) */
  totalCents: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cart State (in-memory, managed by cart store / context)
// ─────────────────────────────────────────────────────────────────────────────

export interface CartState {
  /** Keyed by menuItemId + serialized modifier IDs for deduplication */
  items: CartItem[];
  /** Applied promotion, or null */
  promotion: CartPromotion | null;
  /** Applied store credit, or null */
  credit: CartCredit | null;
  /** Computed totals — always derived from items + promotion + credit */
  totals: CartTotals;
}

// ─────────────────────────────────────────────────────────────────────────────
// Persisted Cart Session (maps to pending_carts table)
// ─────────────────────────────────────────────────────────────────────────────

export interface CartSession {
  /** pending_carts.id (= checkout session ID from Stripe) */
  id: string;
  /** pending_carts.user_id */
  userId: string;
  /** pending_carts.items — JSON array of CartItem[] */
  items: CartItem[];
  /** pending_carts.subtotal_cents */
  subtotalCents: number;
  /** pending_carts.discount_cents */
  discountCents: number;
  /** pending_carts.tax_cents */
  taxCents: number;
  /** pending_carts.total_cents */
  totalCents: number;
  /** pending_carts.promo_id */
  promoId: string | null;
  /** pending_carts.credit_id */
  creditId: string | null;
  /** pending_carts.expires_at */
  expiresAt: string | null;
  /** pending_carts.created_at */
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Checkout Payload
// Sent to Stripe / checkout Edge Function
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
// Cart Action Types (for reducer / store)
// ─────────────────────────────────────────────────────────────────────────────

export type CartAction =
  | { type: 'ADD_ITEM'; payload: CartItem }
  | { type: 'REMOVE_ITEM'; payload: { menuItemId: string; modifierKey: string } }
  | {
      type: 'UPDATE_QUANTITY';
      payload: { menuItemId: string; modifierKey: string; quantity: number };
    }
  | { type: 'UPDATE_NOTES'; payload: { menuItemId: string; modifierKey: string; notes: string } }
  | { type: 'APPLY_PROMO'; payload: CartPromotion }
  | { type: 'REMOVE_PROMO' }
  | { type: 'APPLY_CREDIT'; payload: CartCredit }
  | { type: 'REMOVE_CREDIT' }
  | { type: 'CLEAR_CART' }
  | { type: 'HYDRATE'; payload: CartState };

// ─────────────────────────────────────────────────────────────────────────────
// Promo Validation Result
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
 * Compute line total for a single cart item in cents.
 */
export function computeLineTotalCents(
  item: Pick<CartItem, 'unitPriceCents' | 'modifiers' | 'quantity'>,
): number {
  const modifierSum = item.modifiers.reduce((sum, m) => sum + m.priceAdjustment, 0);
  return (item.unitPriceCents + modifierSum) * item.quantity;
}

/**
 * Compute full cart totals from items + optional promotion + optional credit.
 * Tax rate matches Stripe tax calculation convention (8.25% example — override as needed).
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
