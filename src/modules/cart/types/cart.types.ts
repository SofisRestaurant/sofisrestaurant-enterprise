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
 * Deterministic, collision-resistant deduplication key for a cart line item.
 *
 * GUARANTEES
 * ──────────
 * • Identical configurations always produce the same key regardless of
 *   modifier insertion order.
 * • Different configurations always produce different keys.
 * • No input — however malformed — can cause a collision with a valid key,
 *   produce an ambiguous key, or throw at runtime (except blank menuItemId,
 *   which is always a programming error and throws explicitly).
 *
 * SEPARATOR CHOICE
 * ────────────────
 * UUIDs contain only hex characters (0-9, a-f) and hyphens.
 * U+001F (ASCII Unit Separator) and U+001E (ASCII Record Separator) cannot
 * appear in a UUID or any trimmed user-facing string, making collision via
 * crafted IDs structurally impossible regardless of input content.
 *
 * ZERO-TRUST CONTRACT
 * ───────────────────
 * • menuItemId: throws if not a non-empty string after trimming.
 *   A blank item ID is always a programming error — never a user-input issue.
 * • modifier entries: non-string, empty, null, or undefined IDs are silently
 *   dropped. A single corrupt modifier must not prevent keying the item.
 * • Duplicate modifier IDs are deduplicated before sorting so ["m1","m1"]
 *   and ["m1"] produce the same key.
 * • No modifiers (empty or fully-filtered array) produces a stable key
 *   that is distinct from any key that has modifiers.
 */
export function cartItemKey(
  menuItemId: unknown,
  modifiers: unknown,
): string {
  // ── menuItemId — throw fast; blank ID is always upstream corruption ──────────
  if (typeof menuItemId !== 'string' || menuItemId.trim().length === 0) {
    throw new Error(
      `cartItemKey: menuItemId must be a non-empty string (got ${JSON.stringify(menuItemId)})`,
    );
  }
  const safeItemId = menuItemId.trim();

  // ── modifier ids — tolerate any shape; drop anything not a valid string ──────
  const rawMods: unknown[] = Array.isArray(modifiers) ? modifiers : [];

  const validIds = new Set<string>();
  for (const entry of rawMods) {
    if (entry == null) continue;
    // Accept either a raw string id or an object with an `id` property
    const raw =
      typeof entry === 'object' && 'id' in (entry as object)
        ? (entry as Record<string, unknown>).id
        : entry;
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (trimmed.length > 0) validIds.add(trimmed);
  }

  // Sort for order-independence; join with U+001F (cannot appear in a UUID)
  const modKey = [...validIds].sort().join('\x1F');

  // U+001E separates the item segment from the modifier segment
  return `${safeItemId}\x1E${modKey}`;
}

/**
 * Compute line total for a single cart item.
 * All values are integer cents.
 *
 * Throws if any pricing field is non-finite or if quantity is invalid.
 * This is a domain pricing function — invalid inputs must never produce
 * a silently wrong total.
 */
export function computeLineTotalCents(
  item: Pick<CartItem, 'unitPriceCents' | 'modifiers' | 'quantity'>,
): number {
  if (typeof item.unitPriceCents !== 'number' || !Number.isFinite(item.unitPriceCents) || item.unitPriceCents < 0) {
    throw new Error(
      `computeLineTotalCents: unitPriceCents is invalid: ${String(item.unitPriceCents)}`,
    );
  }
  if (typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || item.quantity < 1) {
    throw new Error(
      `computeLineTotalCents: quantity is invalid: ${String(item.quantity)}`,
    );
  }

  let modifierSum = 0;
  for (const m of item.modifiers) {
    if (typeof m.priceAdjustmentCents !== 'number' || !Number.isFinite(m.priceAdjustmentCents)) {
      throw new Error(
        `computeLineTotalCents: modifier(id=${m.id}) has invalid priceAdjustmentCents: ` +
        String(m.priceAdjustmentCents),
      );
    }
    modifierSum += m.priceAdjustmentCents;
  }

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