export interface CartItem {
  id: string;
  quantity: number;
  unitPriceCents: number;
  modifiers: {
    priceAdjustment: number;
  }[];
}

export interface CartPromotion {
  id: string;
  discountCents: number;
}

export interface CartCredit {
  amountCents: number;
}export type SanitizedCartItem = {
  quantity: number;
  unitPriceCents: number;
  unit_price_cents: number;
  modifiers: {
    priceAdjustment: number;
    priceAdjustmentCents: number;
  }[];
} & Record<string, unknown>;