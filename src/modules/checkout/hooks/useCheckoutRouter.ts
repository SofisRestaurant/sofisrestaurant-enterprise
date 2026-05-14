// src/modules/checkout/hooks/useCheckoutRouter.ts
// =============================================================================
// CHECKOUT ROUTER — the single routing layer (auth vs guest)
// =============================================================================
//
// CHANGES FROM PRIOR VERSION:
//
//   [1–6] unchanged — see prior changelog.
//
//   [7] isValidE164UsPhone — new module-private helper.
//       Accepts an unknown value and narrows it to a validated E.164 US number
//       (+1 followed by area code 2–9 then nine more digits). Matches the
//       exact format that PhoneNumberInput stores when the number is complete.
//
//   [8] CheckoutRouterArgs: added guestPhone (string, optional) and
//       smsOptIn (boolean, optional). Both are ignored for authenticated users.
//
//   [9] checkout(): added phone validation for the guest path.
//       Runs before initiateGuestCheckout so the network call is never made
//       with an incomplete or missing phone when SMS opt-in is true.
//       Sets routerError (displayed under the checkout button) and returns a
//       typed { ok: false, code: 'phone_incomplete' } result.
//
//  [10] GuestCheckoutInput construction: passes guestPhone and smsOptIn
//       through to the input type when smsOptIn is true.
//       serialiseGuestCheckoutInput then writes them onto the wire body.
//       When smsOptIn is false or absent the input is identical to the
//       prior version and no phone fields reach the server.
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
  /**
   * Backend-ready E.164 US phone (+1XXXXXXXXXX).
   * Only consulted for guest checkout and only when smsOptIn is true.
   * PhoneNumberInput stores this format when the number is complete (10 digits).
   * Ignored entirely for authenticated users.
   */
  guestPhone?: string;
  /**
   * Guest SMS opt-in flag. When true, guestPhone must be a valid E.164 US
   * number or checkout is blocked with a clear error before the network call.
   * Defaults to absent / false — no phone fields are sent to the server.
   * Ignored for authenticated users.
   */
  smsOptIn?: boolean;
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

/**
 * Validates a backend-ready E.164 US phone number.
 *
 * Accepted format: +1 followed by an area code whose first digit is 2–9,
 * then nine more digits. Total length: 12 characters.
 *
 * This matches exactly what PhoneNumberInput.toStoredPhoneValue() produces
 * for a complete (10-digit) entry: `+1${localDigits}`.
 *
 * Rejects:
 *   - non-strings
 *   - local-only digits (no +1 prefix — incomplete PhoneNumberInput state)
 *   - area codes starting with 0 or 1
 *   - numbers shorter or longer than the E.164 US format
 */
function isValidE164UsPhone(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /^\+1[2-9]\d{9}$/.test(value);
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

      // ── Guest path ──────────────────────────────────────────────────────────

      if (!isValidEmail(args.guestEmail)) {
        const err = 'A valid email is required for guest checkout.';
        setRouterError(err);
        return { ok: false, error: err, code: 'email_invalid' };
      }

      // Phone validation — only when the guest has opted into SMS updates.
      // Runs before any network call so the error is instant and free.
      if (args.smsOptIn) {
        if (!isValidE164UsPhone(args.guestPhone)) {
          const err =
            'Please enter a complete 10-digit mobile number to receive SMS order updates.';
          setRouterError(err);
          return { ok: false, error: err, code: 'phone_incomplete' };
        }
      }

      const input: GuestCheckoutInput = {
        guestEmail:    args.guestEmail!.trim().toLowerCase(),
        orderType:     normOrderType(args.orderType),
        notes:         trimOrUndefined(args.notes),
        pickupSchedule,
        // Conditionally attach SMS fields. When smsOptIn is false or absent
        // neither field is present and the wire body is identical to the
        // pre-SMS version — preserving existing guest checkout behaviour.
        ...(args.smsOptIn && isValidE164UsPhone(args.guestPhone)
          ? { guestPhone: args.guestPhone, smsOptIn: true as const }
          : {}),
      };

      return initiateGuestCheckout(input);
    },
    [isAuthenticated, initiateAuthCheckout, initiateGuestCheckout],
  );

  const redirectToCheckout = useCallback(
    async (args: CheckoutRouterArgs): Promise<void> => {
      const result = await checkout(args);

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

  const retryWithToken = useCallback(
    async (challengeToken: string): Promise<void> => {
      const result = await guestHook.retryWithChallengeToken(challengeToken);
      if (result.ok && result.url) {
        window.location.assign(result.url);
      }
    },
    [guestHook.retryWithChallengeToken],
  );

  // ── Derived state ──────────────────────────────────────────────────────────

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