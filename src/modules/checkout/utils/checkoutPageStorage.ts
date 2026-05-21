// src/modules/checkout/utils/checkoutPageStorage.ts
//
// Page-persistence helpers for CheckoutPage.
// All localStorage access is isolated here so components never touch
// window.localStorage directly and so storage keys live in one place.
//
// [FIX 2026-05-20] Added pending checkout lock (sessionStorage) to prevent
// duplicate payment when a guest reloads or navigates back after Stripe
// redirect. The lock stores the Stripe session ID and hosted URL so the
// checkout page can show a recovery UI instead of allowing a second charge.

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

// =============================================================================
// Pending Checkout Lock (sessionStorage)
// =============================================================================
// Prevents duplicate Stripe sessions for the same cart. Written immediately
// before redirect to Stripe; cleared only on confirmed order success, TTL
// expiry, or explicit user cancellation.
//
// Uses sessionStorage so the lock is scoped to the browser tab and cleared
// automatically when the tab closes — matching the guest_token lifecycle.
// =============================================================================

const PENDING_CHECKOUT_KEY = 'sofis.checkout.pendingSession.v1';

/**
 * Stripe hosted sessions expire after 30 minutes by default.
 * We use 35 minutes to give a small buffer before auto-expiring the lock.
 */
const PENDING_CHECKOUT_TTL_MS = 35 * 60 * 1000;

export type PendingCheckoutLock = {
  sessionId: string;
  sessionUrl: string;
  createdAt: number;
};

function safeSessionGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, val: string): void {
  try {
    sessionStorage.setItem(key, val);
  } catch {
    /* Private browsing / storage full — silent */
  }
}

function safeSessionRemove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* silent */
  }
}

/**
 * Returns the active pending checkout lock, or null if none exists or it has
 * expired. Expired locks are automatically cleaned up.
 */
export function getPendingCheckoutLock(): PendingCheckoutLock | null {
  const raw = safeSessionGet(PENDING_CHECKOUT_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PendingCheckoutLock;

    if (
      typeof parsed.sessionId !== 'string' ||
      !parsed.sessionId ||
      typeof parsed.sessionUrl !== 'string' ||
      !parsed.sessionUrl ||
      typeof parsed.createdAt !== 'number'
    ) {
      clearPendingCheckoutLock();
      return null;
    }

    // Auto-expire stale locks (Stripe session is certainly dead by now)
    if (Date.now() - parsed.createdAt > PENDING_CHECKOUT_TTL_MS) {
      clearPendingCheckoutLock();
      return null;
    }

    return parsed;
  } catch {
    clearPendingCheckoutLock();
    return null;
  }
}

/**
 * Records a pending Stripe checkout session. Must be called immediately
 * before redirecting to Stripe so that any return to the checkout page
 * sees the lock.
 */
export function setPendingCheckoutLock(sessionId: string, sessionUrl: string): void {
  const lock: PendingCheckoutLock = {
    sessionId,
    sessionUrl,
    createdAt: Date.now(),
  };
  safeSessionSet(PENDING_CHECKOUT_KEY, JSON.stringify(lock));
}

/**
 * Removes the pending checkout lock. Call when:
 * - Order success is confirmed (OrderSuccess page)
 * - User explicitly cancels and starts over
 */
export function clearPendingCheckoutLock(): void {
  safeSessionRemove(PENDING_CHECKOUT_KEY);
}