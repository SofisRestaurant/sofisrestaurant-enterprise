// src/modules/checkout/hooks/useCheckoutRouter.ts
// =============================================================================
// CHECKOUT ROUTER — the single routing layer (auth vs guest)
// =============================================================================
//
// CHANGES FROM PRIOR VERSION:
//
//   [1–9] unchanged — see prior changelog.
//
//  [10] Auth path gains SMS opt-in support (mirrors the guest path exactly).
//
//       checkout() now validates guestPhone / smsOptIn for BOTH paths before
//       constructing the input type. The early-return error gate ('phone_incomplete')
//       fires for auth users who toggle SMS on but leave the field incomplete.
//
//       validatedPhone is spread into AuthCheckoutInput as { smsPhone, smsOptIn }
//       (distinct field names from the guest input). TypeScript narrows the
//       branded E164UsPhone type without a cast in both branches.
//
//  [11] CheckoutRouterArgs.guestPhone / smsOptIn JSDoc updated.
//       These fields now serve both guest AND authenticated checkout.
//       The "guestPhone" naming reflects the original guest-only scope;
//       it is not renamed to avoid a breaking change at the call site
//       (CheckoutPage passes a single state variable for both paths).
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

import { toE164UsPhone } from '@/modules/checkout/types/checkout-wire.types';

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
   * Raw phone string from the form (PhoneNumberInput output).
   * Validated and branded to E164UsPhone inside checkout() via toE164UsPhone().
   * Used by BOTH guest and authenticated checkout paths when smsOptIn is true.
   * No-op when smsOptIn is false or absent.
   */
  guestPhone?: string;
  /**
   * SMS order-updates opt-in flag. Applies to both guest and authenticated
   * checkout paths. When true, guestPhone must be a valid E.164 US number or
   * checkout is blocked with a clear error before the network call.
   * Defaults to absent / false — no phone fields are sent to the server.
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

// isValidE164UsPhone has been removed.
// Use toE164UsPhone() from checkout-wire.types.ts instead.

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

      // ── Authenticated path ────────────────────────────────────────────────
      if (isAuthenticated) {
        // ── SMS phone validation (auth path) ──────────────────────────────
        //
        // Identical gate to the guest path below. toE164UsPhone() is called
        // once; the result is stored in validatedPhone and reused in both the
        // error guard and the input spread — no double evaluation.
        //
        // When smsOptIn is false or absent, validatedPhone is null and no SMS
        // fields are included in the request — existing auth behavior preserved.
        //
        // When smsOptIn is true:
        //   - validatedPhone null        → early return, error shown under button
        //   - validatedPhone E164UsPhone → spread into AuthCheckoutInput
        //
        // TypeScript narrows validatedPhone to E164UsPhone inside the spread
        // condition without a cast (toE164UsPhone returns E164UsPhone | null).

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
          // validatedPhone is E164UsPhone (branded) when non-null.
          // TypeScript narrows without a cast inside the truthy branch.
          // Absent when smsOptIn is false/unset — wire body is byte-identical
          // to the pre-SMS auth checkout in that case.
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

      // ── SMS phone validation ────────────────────────────────────────────────
      //
      // toE164UsPhone() is called once. The result is stored in validatedPhone
      // so the regex runs exactly once regardless of how many times the value
      // is referenced below.
      //
      // When smsOptIn is false or absent, validatedPhone is null and the SMS
      // fields are not included in the input — existing behavior is preserved.
      //
      // When smsOptIn is true:
      //   - validatedPhone null   → early return, routerError shown under button
      //   - validatedPhone E164UsPhone → spread into GuestCheckoutInput

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
        ...(validatedPhone !== null
          ? { guestPhone: validatedPhone, smsOptIn: true as const }
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
      const result = await retryWithChallengeToken(challengeToken);
      if (result.ok && result.url) {
        window.location.assign(result.url);
      }
    },
    [retryWithChallengeToken],
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