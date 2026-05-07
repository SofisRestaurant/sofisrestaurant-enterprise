// src/modules/checkout/hooks/useCheckoutRouter.ts
// =============================================================================
// CHECKOUT ROUTER — the single routing layer (auth vs guest)
// =============================================================================
//
// CHANGES FROM PRIOR VERSION:
//
//   [1] otpChallenge: { nonce, expiresAt } | null
//       Exposed from guestHook.otpChallenge. Non-null exactly when the guest
//       phase is 'otp_required'. CheckoutPage uses this to conditionally render
//       CheckoutChallengeModal.
//
//   [2] retryWithToken(challengeToken: string) => Promise<void>
//       Calls guestHook.retryWithChallengeToken, then redirects on success.
//       Phase changes are handled inside guestHook — parent re-renders
//       accordingly. This is the only call site that should trigger the
//       window.location.assign on a successful OTP retry.
//
//   [3] guestPhase: GuestCheckoutPhase
//       Exposed so CheckoutPage can branch on blocked vs error vs idle
//       without knowing the internal hook shape. Prefer this over reading
//       error/code strings for conditional rendering of terminal states.
//
//   [4] errorCode now populated from the actual guest phase error code.
//       Previously hardcoded to null, making it unusable.
//
//   [5] canRetry now false for checkout_blocked (terminal) and for
//       non-recoverable errors. Previously Boolean(error) — always true.
//
//   [6] redirectToCheckout no longer throws on otp_required or blocked.
//       It returns silently — the phase change causes the parent to re-render
//       and show the appropriate UI. Throwing on otp_required prevented any
//       call site using redirectToCheckout from ever seeing a challenge.
//
// Import rules (unchanged):
//   ✅ ASAP_PICKUP, scheduledPickup, PickupSchedule
//        → from '@/domain/adapters/pickup-schedule.adapter'
//   ❌ NEVER import from '@/modules/shared/domain/pickup' (deleted)
// =============================================================================

import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useAuthCheckout }  from '@/modules/checkout/hooks/useAuthCheckout';
import {
  useGuestCheckout,
  type GuestCheckoutPhase,
} from '@/modules/checkout/hooks/useGuestCheckout';

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
  pickupSchedule?: PickupSchedule;
  /**
   * @deprecated Use pickupSchedule. Accepted for backward compat.
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
};

export type CheckoutRouterReturn = {
  redirectToCheckout: (args: CheckoutRouterArgs) => Promise<void>;
  checkout:           (args: CheckoutRouterArgs) => Promise<CheckoutResult>;
  reset:              () => void;
  isLoading:          boolean;
  error:              string | null;
  errorCode:          string | null;   // populated — was always null before
  canRetry:           boolean;         // false for terminal states
  retryAfter:         number;

  // OTP challenge — non-null when guest phase === 'otp_required'.
  // Pass nonce/expiresAt to CheckoutChallengeModal as props.
  // Use key={otpChallenge.nonce} on the modal to force remount on fresh challenge.
  otpChallenge: { nonce: string; expiresAt: string } | null;

  // Initiates checkout retry after OTP verification succeeds.
  // Handles the window.location.assign internally on success.
  // On fresh otp_required (expired token): otpChallenge updates, modal remounts.
  // On error: guestPhase transitions to 'error', parent shows error UI.
  retryWithToken: (challengeToken: string) => Promise<void>;

  // Full phase state — use for conditional rendering of blocked/error UI.
  guestPhase:      GuestCheckoutPhase;

  mode:            'auth' | 'guest' | 'disabled';
  canCheckout:     boolean;
  isAuthenticated: boolean;
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

function resolvePickupSchedule(args: CheckoutRouterArgs): PickupSchedule {
  if (args.pickupSchedule != null) return args.pickupSchedule;

  const raw = args.pickupTime;
  if (!raw || typeof raw !== 'string' || raw.trim().length === 0) return ASAP_PICKUP;

  const lower = raw.trim().toLowerCase();
  if (lower === 'asap' || lower === 'now') return ASAP_PICKUP;

  try   { return scheduledPickup(raw.trim()); }
  catch { return ASAP_PICKUP; }
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

      // otp_required: phase is now 'otp_required' in guestHook, otpChallenge
      // is non-null. Parent re-renders and shows CheckoutChallengeModal.
      // Do not throw — throwing would prevent the modal from ever rendering.
      if (!result.ok && (result.code === 'otp_required' || result.code === 'checkout_blocked')) {
        return;
      }

      if (!result.ok) throw new Error(result.error ?? 'Checkout failed');
      if (!result.url) throw new Error('Checkout failed: missing session URL.');
      window.location.assign(result.url);
    },
    [checkout],
  );

  // ── OTP retry ──────────────────────────────────────────────────────────────
  //
  // Called by CheckoutPage when CheckoutChallengeModal emits onToken.
  // Delegates to guestHook.retryWithChallengeToken which:
  //   - Dispatches RETRY (phase → retrying, modal stays visible with spinner)
  //   - Re-calls create-checkout-guest with challenge_token
  //   - On success: dispatches RESET, returns { ok: true, url }
  //   - On fresh otp_required: dispatches OTP_REQUIRED with new nonce
  //   - On error: dispatches ERROR (phase → error, parent unmounts modal)
  //
  // window.location.assign is called here, not in guestHook, to keep the
  // navigation concern in the router layer.

  const retryWithToken = useCallback(
    async (challengeToken: string): Promise<void> => {
      const result = await guestHook.retryWithChallengeToken(challengeToken);
      if (result.ok && result.url) {
        window.location.assign(result.url);
      }
      // All other cases: phase change in guestHook drives parent re-render.
    },
    [guestHook.retryWithChallengeToken],
  );

  // ── Derived state ──────────────────────────────────────────────────────────

  const activeError     = isAuthenticated ? authError     : guestError;
  const activeIsLoading = isAuthenticated ? authIsLoading : guestIsLoading;

  const error     = routerError ?? activeError;
  const isLoading = activeIsLoading;

  // errorCode: derived from guestHook phase for guest path.
  // Auth errors are not currently typed at the hook boundary.
  const errorCode: string | null = (() => {
    if (isAuthenticated) return null;
    const p = guestHook.phase;
    if (p.tag === 'error')   return p.code;
    if (p.tag === 'blocked') return 'checkout_blocked';
    return null;
  })();

  // canRetry: false for terminal states (blocked, non-recoverable error).
  // Prevents showing "Try again" buttons that cannot succeed.
  const canRetry = Boolean(error) &&
    guestHook.phase.tag !== 'blocked' &&
    !(guestHook.phase.tag === 'error' && !guestHook.phase.recoverable);

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
    otpChallenge:    guestHook.otpChallenge,
    retryWithToken,
    guestPhase:      guestHook.phase,
    mode,
    canCheckout,
    isAuthenticated,
  };
}