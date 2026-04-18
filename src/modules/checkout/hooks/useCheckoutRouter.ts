// src/modules/checkout/hooks/useCheckoutRouter.ts
// =============================================================================
// CHECKOUT ROUTER — the missing routing layer
// =============================================================================
// This is the ONLY place in the codebase that decides auth vs guest checkout.
//
// Flow:
//   CheckoutButton → useCheckoutRouter()
//                      ├─ isAuthenticated → useAuthCheckout → create-checkout
//                      └─ !isAuthenticated → useGuestCheckout → create-checkout-guest
//
// Security invariants enforced HERE (in addition to server-side enforcement):
//   1. Auth path always sends Authorization header (useAuthCheckout owns this).
//   2. Guest path NEVER sends Authorization header (useGuestCheckout owns this).
//   3. Loyalty/promo/credit/clientIntegrityHash fields are stripped for guests
//      at the router layer — the guest hook also has a hard assertion that
//      rejects them, and the server rejects them with 422. Three layers deep.
//   4. The `isAuthenticated` gate is derived from Supabase session state via
//      useAuth(), not from any user-controlled input.
//
// INFINITE-LOOP FIX:
//   Previous version had `[authHook, guestHook]` in reset's deps. Those are
//   whole hook return objects that get a new identity every render → reset
//   changed identity every render → CheckoutButton's `useEffect(() => reset(),
//   [..., reset])` fired on every render → setRouterError triggered re-render
//   → infinite loop.
//
//   Fix: destructure the stable `clearError` callbacks (each is wrapped in
//   useCallback inside its source hook, so they're identity-stable) and
//   depend on those only.
// =============================================================================

import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useAuthCheckout }  from '@/modules/checkout/hooks/useAuthCheckout';
import { useGuestCheckout } from '@/modules/checkout/hooks/useGuestCheckout';
import type {
  AuthCheckoutInput,
  GuestCheckoutInput,
  CheckoutResult,
} from '@/modules/checkout/types/checkout.types';

// ─── Public types ─────────────────────────────────────────────────────────────

type OrderType = 'pickup' | 'delivery' | 'dine_in';

export type CheckoutRouterArgs = {
  customer_uid?: string;
  guestEmail?: string;
  orderType?: OrderType;
  notes?: string | null;
  successUrl?: string;
  cancelUrl?: string;
  promoCode?: string;
  promoId?: string;
  creditId?: string;
  loyalty?: {
    applyPoints?: boolean;
    pointsToRedeem?: number;
    loyaltyAccountId?: string;
    loyaltyRewardId?: string;
    loyaltyRedemptionId?: string;
  };
  clientIntegrityHash?: string;
};

export type CheckoutRouterReturn = {
  redirectToCheckout: (args: CheckoutRouterArgs) => Promise<void>;
  checkout:           (args: CheckoutRouterArgs) => Promise<CheckoutResult>;
  reset:              () => void;
  isLoading:          boolean;
  error:              string | null;
  errorCode:          string | null;
  canRetry:           boolean;
  retryAfter:         number;
  mode:               'auth' | 'guest' | 'disabled';
  canCheckout:        boolean;
  isAuthenticated:    boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidEmail(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const s = value.trim().toLowerCase();
  return s.length > 0 && s.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function normOrderType(v: unknown): OrderType {
  return v === 'delivery' || v === 'dine_in' || v === 'pickup' ? v : 'pickup';
}

function trimOrUndefined(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCheckoutRouter(): CheckoutRouterReturn {
  const { isAuthenticated } = useAuth();

  // Both hooks must be instantiated every render (React rules of hooks).
  const authHook  = useAuthCheckout();
  const guestHook = useGuestCheckout();

  // ── STABILIZE callback refs ───────────────────────────────────────────────
  // Pull the individual callbacks and state fields OUT of the hook objects.
  // The callbacks are wrapped in useCallback inside each source hook so their
  // identities are stable across renders. The hook return OBJECTS are new
  // on every render, so depending on them directly causes infinite loops.
  const initiateAuthCheckout  = authHook.initiateAuthCheckout;
  const initiateGuestCheckout = guestHook.initiateGuestCheckout;
  const clearAuthError        = authHook.clearError;
  const clearGuestError       = guestHook.clearError;

  const authError        = authHook.error;
  const authIsLoading    = authHook.isLoading;
  const guestError       = guestHook.error;
  const guestIsLoading   = guestHook.isLoading;

  const [routerError, setRouterError] = useState<string | null>(null);

  const mode: CheckoutRouterReturn['mode'] = isAuthenticated ? 'auth' : 'guest';

  // reset() now only depends on the stable clearError callbacks.
  // No whole-hook-object references → reset identity is stable across renders.
  const reset = useCallback(() => {
    setRouterError(null);
    clearAuthError();
    clearGuestError();
  }, [clearAuthError, clearGuestError]);

  const checkout = useCallback(
    async (args: CheckoutRouterArgs): Promise<CheckoutResult> => {
      setRouterError(null);

      // ─── AUTH PATH ─────────────────────────────────────────────────────
      if (isAuthenticated) {
        const input: AuthCheckoutInput = {
          orderType: normOrderType(args.orderType),
          notes:     trimOrUndefined(args.notes),
          promoCode: trimOrUndefined(args.promoCode),
          promoId:   trimOrUndefined(args.promoId),
          creditId:  trimOrUndefined(args.creditId),

          ...(args.loyalty?.applyPoints &&
              args.loyalty.pointsToRedeem &&
              args.loyalty.loyaltyAccountId
            ? {
                loyaltyRedeemPoints:  args.loyalty.pointsToRedeem,
                loyaltyAccountId:     args.loyalty.loyaltyAccountId,
                loyaltyRewardId:      args.loyalty.loyaltyRewardId,
                loyaltyRedemptionId:  args.loyalty.loyaltyRedemptionId,
              }
            : {}),

          clientIntegrityHash: trimOrUndefined(args.clientIntegrityHash),
          successUrl:          trimOrUndefined(args.successUrl),
          cancelUrl:           trimOrUndefined(args.cancelUrl),
        };

        return initiateAuthCheckout(input);
      }

      // ─── GUEST PATH ────────────────────────────────────────────────────
      if (!isValidEmail(args.guestEmail)) {
        const err = 'A valid email is required for guest checkout.';
        setRouterError(err);
        return { ok: false, error: err, code: 'email_invalid' };
      }

      const input: GuestCheckoutInput = {
        guestEmail: args.guestEmail!.trim().toLowerCase(),
        orderType:  normOrderType(args.orderType),
        notes:      trimOrUndefined(args.notes),
        successUrl: trimOrUndefined(args.successUrl),
        cancelUrl:  trimOrUndefined(args.cancelUrl),
      };

      return initiateGuestCheckout(input);
    },
    [isAuthenticated, initiateAuthCheckout, initiateGuestCheckout],
  );

  const redirectToCheckout = useCallback(
    async (args: CheckoutRouterArgs): Promise<void> => {
      const result = await checkout(args);

      if (!result.ok) {
        throw new Error(result.error ?? 'Checkout failed');
      }
      if (!result.url) {
        throw new Error('Checkout failed: missing session URL.');
      }
      window.location.assign(result.url);
    },
    [checkout],
  );

  // ─── Unified state view ───────────────────────────────────────────────────
  const activeError     = isAuthenticated ? authError     : guestError;
  const activeIsLoading = isAuthenticated ? authIsLoading : guestIsLoading;

  const error     = routerError ?? activeError;
  const isLoading = activeIsLoading;

  const errorCode: string | null = null;
  const canRetry  = Boolean(error);
  const retryAfter = 0;

  const canCheckout = useMemo(() => {
    switch (mode) {
      case 'auth':
      case 'guest':
        return true;
      default:
        return false;
    }
  }, [mode]);

  return {
    redirectToCheckout,
    checkout,
    reset,
    isLoading,
    error,
    errorCode,
    canRetry,
    retryAfter,
    mode,
    canCheckout,
    isAuthenticated,
  };
}