// src/modules/checkout/utils/checkoutPageStorage.ts
//
// Page-persistence helpers for CheckoutPage.
// All localStorage access is isolated here so components never touch
// window.localStorage directly and so storage keys live in one place.

export const CHECKOUT_STORAGE = {
  ORDER_TYPE: 'sofis.checkout.orderType.v1',
  NOTES: 'sofis.checkout.notes.v1',
  PROMO: 'sofis.checkout.promo.v1',
  CREDIT: 'sofis.checkout.credit.v1',
} as const;

export const CHECKOUT_LIMITS = {
  NOTES_MAX: 600,
  PROMO_MAX: 50,
} as const;

export function safeLocalGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeLocalSet(key: string, val: string): void {
  try {
    localStorage.setItem(key, val);
  } catch {
    /* storage unavailable — silent */
  }
}

export function safeLocalRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage unavailable — silent */
  }
}