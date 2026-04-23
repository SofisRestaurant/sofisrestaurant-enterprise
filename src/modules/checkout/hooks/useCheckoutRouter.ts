// src/modules/checkout/hooks/useCheckoutRouter.ts
// =============================================================================
// CHECKOUT ROUTER — the single routing layer (auth vs guest)
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
//      at the router layer — guest hook also rejects them, and the server
//      rejects them with 422. Three layers deep.
//   4. `isAuthenticated` is derived from Supabase session state via useAuth(),
//      not from any user-controlled input.
//   5. Stripe success_url / cancel_url are SERVER-CONTROLLED. The frontend
//      does NOT send or influence them — the Edge Function reads SITE_URL
//      from its env and builds the URLs itself. This is why CheckoutRouterArgs
//      no longer has successUrl / cancelUrl fields.
//   6. pickup_time is forwarded as-is from args to both pipelines.
//      request-validation.ts on the server is the single normalization point —
//      the router does not re-normalize.
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
  pickupTime?: string;
  orderType?: OrderType;
  notes?: string | null;
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
  // NOTE: successUrl / cancelUrl intentionally absent. Server controls URLs.
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

  const authHook  = useAuthCheckout();
  const guestHook = useGuestCheckout();

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

  const reset = useCallback(() => {
    setRouterError(null);
    clearAuthError();
    clearGuestError();
  }, [clearAuthError, clearGuestError]);

  const checkout = useCallback(
    async (args: CheckoutRouterArgs): Promise<CheckoutResult> => {
      setRouterError(null);

      // pickup_time is forwarded as the raw string the caller provides.
      // request-validation.ts on the server normalizes and validates it —
      // the router has no normalization responsibility.
      const pickupTime: string | undefined = trimOrUndefined(args.pickupTime);

      // ─── AUTH PATH ─────────────────────────────────────────────────────
      if (isAuthenticated) {
        const input: AuthCheckoutInput = {
          orderType:   normOrderType(args.orderType),
          notes:       trimOrUndefined(args.notes),
          promoCode:   trimOrUndefined(args.promoCode),
          promoId:     trimOrUndefined(args.promoId),
          creditId:    trimOrUndefined(args.creditId),
          pickup_time: pickupTime,

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
        guestEmail:  args.guestEmail!.trim().toLowerCase(),
        orderType:   normOrderType(args.orderType),
        notes:       trimOrUndefined(args.notes),
        pickup_time: pickupTime,
      };

      return initiateGuestCheckout(input);
    },
    [isAuthenticated, initiateAuthCheckout, initiateGuestCheckout],
  );

  const redirectToCheckout = useCallback(
    async (args: CheckoutRouterArgs): Promise<void> => {
      const result = await checkout(args);
      if (!result.ok) throw new Error(result.error ?? 'Checkout failed');
      if (!result.url) throw new Error('Checkout failed: missing session URL.');
      window.location.assign(result.url);
    },
    [checkout],
  );

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