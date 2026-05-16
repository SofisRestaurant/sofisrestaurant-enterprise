// src/modules/checkout/hooks/useCheckoutRouter.ts
// =============================================================================
// CHECKOUT ROUTER — the single routing layer (auth vs guest)
//
// CHANGES (2026-05 embedded checkout migration):
//   • Reads VITE_CHECKOUT_UI_MODE via readCheckoutUiModeFromEnv() and passes
//     it into both AuthCheckoutInput and GuestCheckoutInput (as `uiMode`).
//   • CheckoutRouterArgs.uiMode lets callers override the env default per-call
//     (used by redirectToCheckout below to force 'hosted' for the legacy path).
//   • redirectToCheckout forces uiMode='hosted' so the legacy CheckoutButton
//     internal-mode flow never returns a clientSecret that it can't handle.
//   • redirectToCheckout now handles BOTH success shapes: url → assign;
//     clientSecret → throw (legacy redirect path does not render embedded).
//
// All prior fixes preserved: SMS phone validation for both auth and guest
// paths, OTP handling, blocked-state passthrough, derived state.
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

import {
  toE164UsPhone,
  type CheckoutUiMode,
  readCheckoutUiModeFromEnv,
} from '@/modules/checkout/types/checkout-wire.types';

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
  /** @deprecated Use pickupSchedule. */
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
  guestPhone?: string;
  smsOptIn?: boolean;
  /**
   * Override the env-default checkout UI mode for this single call.
   * Absent → uses readCheckoutUiModeFromEnv() (VITE_CHECKOUT_UI_MODE).
   * `redirectToCheckout` forces 'hosted' regardless of env.
   */
  uiMode?: CheckoutUiMode;
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

  otpChallenge: { nonce: string; expiresAt: string } | null;
  retryWithToken: (challengeToken: string) => Promise<void>;
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

  const initiateAuthCheckout    = authHook.initiateAuthCheckout;
  const initiateGuestCheckout   = guestHook.initiateGuestCheckout;
  const retryWithChallengeToken = guestHook.retryWithChallengeToken;
  const clearAuthError          = authHook.clearError;
  const clearGuestError         = guestHook.clearError;

  const authError      = authHook.error;
  const authIsLoading  = authHook.isLoading;
  const guestError     = guestHook.error;
  const guestIsLoading = guestHook.isLoading;

  const [routerError, setRouterError] = useState<string | null>(null);

  // Read once per mount. To toggle modes at runtime, hard-refresh.
  const envUiMode = useMemo<CheckoutUiMode>(() => readCheckoutUiModeFromEnv(), []);

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
      const effectiveUiMode: CheckoutUiMode = args.uiMode ?? envUiMode;

      // ── Authenticated path ────────────────────────────────────────────────
      if (isAuthenticated) {
        const validatedPhone = args.smsOptIn ? toE164UsPhone(args.guestPhone) : null;

        if (args.smsOptIn && validatedPhone === null) {
          const err =
            'Please enter a complete 10-digit mobile number to receive SMS order updates.';
          setRouterError(err);
          return { ok: false, error: err, code: 'phone_incomplete' };
        }

        const input: AuthCheckoutInput = {
          orderType:    normOrderType(args.orderType),
          notes:        trimOrUndefined(args.notes),
          promoCode:    trimOrUndefined(args.promoCode),
          promoId:      trimOrUndefined(args.promoId),
          creditId:     trimOrUndefined(args.creditId),
          pickupSchedule,
          uiMode:       effectiveUiMode,
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
          ...(validatedPhone !== null
            ? { smsPhone: validatedPhone, smsOptIn: true as const }
            : {}),
        };

        return initiateAuthCheckout(input);
      }

      // ── Guest path ──────────────────────────────────────────────────────────

      if (!isValidEmail(args.guestEmail)) {
        const err = 'A valid email is required for guest checkout.';
        setRouterError(err);
        return { ok: false, error: err, code: 'email_invalid' };
      }

      const validatedPhone = args.smsOptIn ? toE164UsPhone(args.guestPhone) : null;

      if (args.smsOptIn && validatedPhone === null) {
        const err =
          'Please enter a complete 10-digit mobile number to receive SMS order updates.';
        setRouterError(err);
        return { ok: false, error: err, code: 'phone_incomplete' };
      }

      const input: GuestCheckoutInput = {
        guestEmail:    args.guestEmail!.trim().toLowerCase(),
        orderType:     normOrderType(args.orderType),
        notes:         trimOrUndefined(args.notes),
        pickupSchedule,
        uiMode:        effectiveUiMode,
        ...(validatedPhone !== null
          ? { guestPhone: validatedPhone, smsOptIn: true as const }
          : {}),
      };

      return initiateGuestCheckout(input);
    },
    [isAuthenticated, initiateAuthCheckout, initiateGuestCheckout, envUiMode],
  );

  // ── Legacy redirect-only path (CheckoutButton internal mode) ──────────────
  // Forces hosted mode so the redirect contract (window.location.assign(url))
  // is always satisfied. If a legacy caller ever ends up here while the env
  // is set to embedded, we throw a clear error rather than navigate to nowhere.
  const redirectToCheckout = useCallback(
    async (args: CheckoutRouterArgs): Promise<void> => {
      const result = await checkout({ ...args, uiMode: 'hosted' });

      if (!result.ok && (result.code === 'otp_required' || result.code === 'checkout_blocked')) {
        return;
      }

      if (!result.ok) throw new Error(result.error ?? 'Checkout failed');

      if (result.url) {
        window.location.assign(result.url);
        return;
      }

      if (result.clientSecret) {
        throw new Error(
          'Embedded Checkout returned via legacy redirect path. Use CheckoutPage embedded flow instead.',
        );
      }

      throw new Error('Checkout failed: missing session URL.');
    },
    [checkout],
  );

  const retryWithToken = useCallback(
    async (challengeToken: string): Promise<void> => {
      const result = await retryWithChallengeToken(challengeToken);
      if (result.ok && result.url) {
        window.location.assign(result.url);
      }
    },
    [retryWithChallengeToken],
  );

  const activeError     = isAuthenticated ? authError     : guestError;
  const activeIsLoading = isAuthenticated ? authIsLoading : guestIsLoading;

  const error     = routerError ?? activeError;
  const isLoading = activeIsLoading;

  const errorCode: string | null = (() => {
    if (isAuthenticated) return null;
    const p = guestHook.phase;
    if (p.tag === 'error')   return p.code;
    if (p.tag === 'blocked') return 'checkout_blocked';
    return null;
  })();

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