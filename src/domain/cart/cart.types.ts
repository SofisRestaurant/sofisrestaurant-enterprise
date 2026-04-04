export interface CartItem {
  id: string;
  quantity: number;
  /** Integer cents. */
  unitPriceCents: number;
  modifiers: CartItemModifier[];
}

/**
 * A resolved modifier on a cart line item.
 * priceAdjustmentCents is the single source of truth — integer cents, may be negative.
 */
export interface CartItemModifier {
  id: string;
  groupId: string;
  name: string;
  /** Integer cents; may be negative. */
  priceAdjustmentCents: number;
}

// ---------------------------------------------------------------------------
// Promotion / credit
// ---------------------------------------------------------------------------

export interface CartPromotion {
  id: string;
  /** Integer cents. */
  discountCents: number;
}

export interface CartCredit {
  /** Integer cents. */
  amountCents: number;
}

export type SanitizedCartItem = {
  /** Integer cents. */
  unitPriceCents: number;
  /** Snake alias — edge function compat only. Integer cents. */
  unit_price_cents: number;
  quantity: number;
  modifiers: {
    /** Integer cents; may be negative. */
    priceAdjustmentCents: number;
  }[];
} & Record<string, unknown>;