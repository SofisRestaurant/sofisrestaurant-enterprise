// src/modules/checkout/hooks/useCheckoutRouter.ts
// =============================================================================
// CHECKOUT ROUTER — the single routing layer (auth vs guest)
// =============================================================================
//
// Import rules (critical — wrong imports here caused the TS2322 brand errors):
//
//   ✅ ASAP_PICKUP, scheduledPickup, PickupSchedule
//        → from '@/domain/adapters/pickup-schedule.adapter'
//          OR from '@/domain/order/pickup-schedule'
//        (both resolve to the same IsoTimestamp brand from
//         @/domain/value-objects/pickup-time)
//
//   ❌ NEVER import from '@/modules/shared/domain/pickup'
//        That file is deleted. It contained a SECOND unique symbol brand for
//        IsoTimestamp, which made ScheduledPickup structurally incompatible
//        with the ScheduledPickup from the new domain layers — hence TS2322.
//
// All types in this file now resolve to the same brand declarations in
// src/domain/value-objects/pickup-time.ts. No duplicate symbols exist.
// =============================================================================

import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useAuthCheckout }  from '@/modules/checkout/hooks/useAuthCheckout';
import { useGuestCheckout } from '@/modules/checkout/hooks/useGuestCheckout';

// ─── Pickup constructors — from adapter (single source of truth) ──────────────
// Using the adapter path ensures the PickupSchedule and IsoTimestamp types here
// share the exact same unique symbol brands as those in checkout.types.ts.
import {
  ASAP_PICKUP,
  scheduledPickup,
  type PickupSchedule,
} from '@/domain/adapters/pickup-schedule.adapter';

import type {
  AuthCheckoutInput,
  GuestCheckoutInput,
  CheckoutResult,
  FulfillmentType,
} from '@/modules/checkout/types/checkout.types';

// ─── Public types ─────────────────────────────────────────────────────────────

export type CheckoutRouterArgs = {
  customer_uid?: string;
  guestEmail?: string;
  /**
   * Preferred: typed PickupSchedule from domain constructors.
   * Use ASAP_PICKUP for immediate orders.
   * Use scheduledPickup(isoString) for scheduled orders.
   */
  pickupSchedule?: PickupSchedule;
  /**
   * @deprecated Use pickupSchedule. Accepted for backward compatibility with
   * call sites that pass a raw ISO string (e.g. from PickupTimeSelector state).
   * "asap", "now", empty, and unparseable values → ASAP_PICKUP silently.
   */
  pickupTime?: string;
  orderType?: FulfillmentType;
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
  // successUrl / cancelUrl intentionally absent — server controls them.
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

function normOrderType(v: unknown): FulfillmentType {
  return v === 'delivery' || v === 'dine_in' || v === 'pickup' ? v : 'pickup';
}

function trimOrUndefined(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

/**
 * Resolves a PickupSchedule from CheckoutRouterArgs.
 *
 * Priority:
 *   1. args.pickupSchedule — typed, used directly.
 *   2. args.pickupTime — legacy string, normalised here.
 *      Sentinel strings / unparseable values → ASAP_PICKUP (no throw).
 *      Valid ISO string → scheduledPickup(iso).
 *
 * After this function returns, all downstream code works with PickupSchedule.
 * No raw pickup string ever passes the router boundary.
 */
function resolvePickupSchedule(args: CheckoutRouterArgs): PickupSchedule {
  if (args.pickupSchedule != null) {
    return args.pickupSchedule;
  }

  const raw = args.pickupTime;
  if (!raw || typeof raw !== 'string' || raw.trim().length === 0) {
    return ASAP_PICKUP;
  }

  const lower = raw.trim().toLowerCase();
  if (lower === 'asap' || lower === 'now') {
    return ASAP_PICKUP;
  }

  try {
    return scheduledPickup(raw.trim());
  } catch {
    return ASAP_PICKUP;
  }
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

  const authError      = authHook.error;
  const authIsLoading  = authHook.isLoading;
  const guestError     = guestHook.error;
  const guestIsLoading = guestHook.isLoading;

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

      const pickupSchedule = resolvePickupSchedule(args);

      if (isAuthenticated) {
        const input: AuthCheckoutInput = {
          orderType:    normOrderType(args.orderType),
          notes:        trimOrUndefined(args.notes),
          promoCode:    trimOrUndefined(args.promoCode),
          promoId:      trimOrUndefined(args.promoId),
          creditId:     trimOrUndefined(args.creditId),
          pickupSchedule,

          // loyaltyAccountId is always forwarded when present so earn-only
          // checkouts propagate it through Stripe metadata into
          // orders.loyalty_account_id. The previous triple-AND condition
          // short-circuited on applyPoints=false and silently dropped it,
          // breaking the earn linkage on every non-redemption checkout.
          //
          // Redeem fields (points, reward ID, redemption ID) are only included
          // when the user has explicitly opted in (applyPoints=true, points>0).
          ...(args.loyalty?.loyaltyAccountId
            ? { loyaltyAccountId: args.loyalty.loyaltyAccountId }
            : {}),
          ...(args.loyalty?.applyPoints &&
              args.loyalty.pointsToRedeem &&
              args.loyalty.loyaltyAccountId
            ? {
                loyaltyRedeemPoints: args.loyalty.pointsToRedeem,
                loyaltyRewardId:     args.loyalty.loyaltyRewardId,
                loyaltyRedemptionId: args.loyalty.loyaltyRedemptionId,
              }
            : {}),

          clientIntegrityHash: trimOrUndefined(args.clientIntegrityHash),
        };

        return initiateAuthCheckout(input);
      }

      if (!isValidEmail(args.guestEmail)) {
        const err = 'A valid email is required for guest checkout.';
        setRouterError(err);
        return { ok: false, error: err, code: 'email_invalid' };
      }

      const input: GuestCheckoutInput = {
        guestEmail:    args.guestEmail!.trim().toLowerCase(),
        orderType:     normOrderType(args.orderType),
        notes:         trimOrUndefined(args.notes),
        pickupSchedule,
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
  const canRetry   = Boolean(error);
  const retryAfter = 0;

  const canCheckout = useMemo(() => {
    switch (mode) {
      case 'auth':
      case 'guest': return true;
      default:      return false;
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