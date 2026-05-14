// src/modules/checkout/types/checkout-page.types.ts
//
// Local types owned by CheckoutPage and its sub-components.
// These are deliberately page-scoped. When the product stabilises,
// OrderType can be consolidated with FulfillmentType in checkout.types.ts.

export type PromoState = {
  code: string;
  applied: boolean;
  error: string | null;
};

export type OrderType = 'pickup' | 'delivery' | 'dine_in';

export type OrderDetailsState = {
  orderType: OrderType;
  notes: string;
};