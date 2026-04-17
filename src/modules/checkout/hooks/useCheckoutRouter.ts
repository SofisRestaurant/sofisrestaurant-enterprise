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
// Why this file exists:
//   useAuthCheckout and useGuestCheckout were already built and wired to the
//   correct endpoints, but nothing imported them. CheckoutButton was calling
//   the legacy useCheckout() which hardcodes 'create-checkout' for everyone,
//   so guest traffic never reached the guest edge function.
//
// Security invariants enforced HERE (in addition to server-side enforcement):
//   1. Auth path always sends Authorization header (useAuthCheckout owns this).
//   2. Guest path NEVER sends Authorization header (useGuestCheckout owns this).
//   3. Loyalty/promo/credit/clientIntegrityHash fields are stripped for guests
//      at the router layer — the guest hook also has a hard assertion that
//      rejects them, and the server rejects them with 422. Three layers deep.
//   4. The `isAuthenticated` gate is derived from Supabase session state via
//      useAuth(), not from any user-controlled input.
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

/**
 * Unified args shape accepted by the router.
 * The router splits these into AuthCheckoutInput or GuestCheckoutInput
 * depending on which path is active. Guest-incompatible fields
 * (loyalty, promo, credit, integrity hash) are silently dropped for guests.
 */
export type CheckoutRouterArgs = {
  // Identity — at least one must be valid
  /** Present when user is logged in. Used by auth path only. */
  customer_uid?: string;
  /** Present when !isAuthenticated. Used by guest path only. */
  guestEmail?: string;

  // Shared fields
  orderType?: OrderType;
  notes?: string | null;
  successUrl?: string;
  cancelUrl?: string;

  // Auth-only fields (dropped for guests)
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
  /** Calls the correct edge function, then navigates to the Stripe URL. */
  redirectToCheckout: (args: CheckoutRouterArgs) => Promise<void>;
  /** Same as redirectToCheckout but returns the raw CheckoutResult. */
  checkout:           (args: CheckoutRouterArgs) => Promise<CheckoutResult>;
  reset:              () => void;

  // State
  isLoading:     boolean;
  error:         string | null;
  errorCode:     string | null;
  canRetry:      boolean;
  retryAfter:    number;
  /** Which path the router will use for the NEXT call. */
  mode:          'auth' | 'guest' | 'disabled';
  /** True when auth path is ready (logged in) OR guest path is ready (email validator will be checked in caller). */
  canCheckout:   boolean;
  isAuthenticated: boolean;
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

function trimOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function trimOrUndefined(v: unknown): string | undefined {
  const t = trimOrNull(v);
  return t === null ? undefined : t;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCheckoutRouter(): CheckoutRouterReturn {
  const { isAuthenticated } = useAuth();

  // Both hooks must be instantiated every render (React rules of hooks).
  // Only the callback invocation is conditional.
  const authHook  = useAuthCheckout();
  const guestHook = useGuestCheckout();

  // Router-level error state for validation failures that happen before
  // either underlying hook is called (e.g. no email for guest path).
  const [routerError, setRouterError] = useState<string | null>(null);

  const mode: CheckoutRouterReturn['mode'] = isAuthenticated ? 'auth' : 'guest';

  const reset = useCallback(() => {
    setRouterError(null);
    authHook.clearError();
    guestHook.clearError();
  }, [authHook, guestHook]);

  const checkout = useCallback(
    async (args: CheckoutRouterArgs): Promise<CheckoutResult> => {
      setRouterError(null);

      // ─── AUTH PATH ─────────────────────────────────────────────────────
      if (isAuthenticated) {
        const input: AuthCheckoutInput = {
          orderType: normOrderType(args.orderType),
          notes:     trimOrUndefined(args.notes),

          // Auth-only fields — all optional, all preserved
          promoCode: trimOrUndefined(args.promoCode),
          promoId:   trimOrUndefined(args.promoId),
          creditId:  trimOrUndefined(args.creditId),

          // Loyalty — only if all three required parts are valid
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

        return authHook.initiateAuthCheckout(input);
      }

      // ─── GUEST PATH ────────────────────────────────────────────────────
      // Guest MUST have a valid email.
      // Guest-incompatible fields (loyalty, promo, credit, integrity) are
      // silently dropped here; the guest hook has a hard assertion that
      // rejects them if they slip through; the server rejects them with 422.
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

      return guestHook.initiateGuestCheckout(input);
    },
    [isAuthenticated, authHook, guestHook],
  );

  const redirectToCheckout = useCallback(
    async (args: CheckoutRouterArgs): Promise<void> => {
      const result = await checkout(args);

if (!result.ok) {
  // TypeScript can now narrow result to the ok:false branch,
  // where result.error is a valid property.
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
  // Merge state from the active hook + any router-level validation errors.
  const active = isAuthenticated ? authHook : guestHook;

  const error     = routerError ?? active.error;
  const isLoading = active.isLoading;

  // errorCode / canRetry / retryAfter aren't exposed by the underlying hooks
  // in this codebase — surface sensible defaults so CheckoutButton keeps
  // working without changes. (The hooks DO surface status codes internally
  // through their error returns; those aren't split out in the state shape.)
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