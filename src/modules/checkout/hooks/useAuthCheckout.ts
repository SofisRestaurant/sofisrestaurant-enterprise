// src/modules/checkout/hooks/useAuthCheckout.ts
// =============================================================================
// Auth checkout hook — calls `create-checkout` with Authorization: Bearer JWT.
// Server owns the Stripe redirect URLs (built from SITE_URL env var).
//
// CHANGES FROM PRIOR VERSION:
//
//   [1] TS2322 fix — two bare failure returns.
//
//       CheckoutResultFailure declares `code: string | null | undefined` as a
//       required property (not `code?`). An object literal that omits a required
//       property entirely is not assignable to the type even when `undefined`
//       is in the value union — TypeScript requires the key to be present.
//
//       Two returns lacked `code`:
//         { ok: false, error: err }        (missing URL branch)
//         { ok: false, error: message }    (catch block)
//
//       Fix: add `code: null` to both. `null` is the correct sentinel for
//       "no server-provided code" — it is distinct from `undefined` (absent)
//       and from any string code. mapCheckoutError already provides a string
//       code on the !response.ok path; these two paths are client-side failures
//       where no server code exists.
//
// pickup_time contract (unchanged):
//   AuthCheckoutInput carries pickupSchedule (PickupSchedule domain object).
//   serialiseAuthCheckoutInput() converts it to the wire body.
//   This hook never reads, writes, or touches pickup_time as a string.
// =============================================================================

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/supabaseClient';
import { useCartStore } from '@/modules/cart/store/cart.store';
import { mapCheckoutError } from '@/modules/checkout/errors/mapCheckoutError';
import {
  serialiseAuthCheckoutInput,
  type AuthCheckoutInput,
  type CheckoutResult,
} from '../types/checkout.types';

// ─── Constants ────────────────────────────────────────────────────────────────

const AUTH_CHECKOUT_ENDPOINT = 'create-checkout';

// ─── Types ────────────────────────────────────────────────────────────────────

type AuthCheckoutState = {
  isLoading:  boolean;
  error:      string | null;
  sessionUrl: string | null;
};

export type UseAuthCheckoutReturn = AuthCheckoutState & {
  initiateAuthCheckout: (input: AuthCheckoutInput) => Promise<CheckoutResult>;
  clearError: () => void;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuthCheckout(): UseAuthCheckoutReturn {
  const [state, setState] = useState<AuthCheckoutState>({
    isLoading:  false,
    error:      null,
    sessionUrl: null,
  });

  const cartItems = useCartStore((s) => s.items);

  const initiateAuthCheckout = useCallback(
    async (input: AuthCheckoutInput): Promise<CheckoutResult> => {
      setState({ isLoading: true, error: null, sessionUrl: null });

      // ─── AUTH CHECK ──────────────────────────────────────────────────────
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        const err = 'Authentication required. Please sign in to continue.';
        setState({ isLoading: false, error: err, sessionUrl: null });
        return { ok: false, error: err, code: 'auth_required' };
      }

      const accessToken = session.access_token;

      // ─── CART TRANSFORM ──────────────────────────────────────────────────
      const itemsPayload = cartItems.map((item: any) => {
        const modifiers = Array.isArray(item.modifiers)
          ? item.modifiers.map((m: any) => ({
              id:       String(m.id),
              group_id: String(m.groupId),
            }))
          : [];

        return {
          id:       item.menuItemId ?? item.id,
          quantity: Number(item.quantity ?? 1),
          notes:    item.notes ?? undefined,
          modifiers,
        };
      });

      // ─── SERIALISE INPUT → WIRE BODY ─────────────────────────────────────
      const serialised = serialiseAuthCheckoutInput(input);

      const requestBody: Record<string, unknown> = {
        items: itemsPayload,
        ...serialised,
      };

      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${AUTH_CHECKOUT_ENDPOINT}`,
          {
            method:  'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization:  `Bearer ${accessToken}`,
            },
            body: JSON.stringify(requestBody),
          },
        );

        // response.json() returns Promise<any> per lib.dom.d.ts.
        // json is any — assignable to Record<string, unknown> | null.
        const json = await response.json().catch(() => null);

        if (!response.ok) {
          const err = mapCheckoutError(json, response);
          setState({ isLoading: false, error: err.message, sessionUrl: null });
          return { ok: false, error: err.message, code: err.code };
        }

        const data = json?.data ?? json;
        const url  = data?.url;

        if (typeof url !== 'string') {
          const err = 'Invalid checkout response: missing URL.';
          setState({ isLoading: false, error: err, sessionUrl: null });
          // FIX [1]: added `code: null`.
          // Previous: { ok: false, error: err }
          // code is a required property on CheckoutResultFailure even though
          // its value may be null. Omitting the key entirely causes TS2322.
          return { ok: false, error: err, code: null };
        }

        setState({ isLoading: false, error: null, sessionUrl: url });

        // data is any — data?.pricing is any, assignable to
        // CheckoutPricingResponse | undefined without a parse step here
        // because any satisfies any target type. The auth pipeline validates
        // pricing server-side; client display uses this value read-only.
        return {
          ok:          true,
          url,
          sessionId:   data?.sessionId,
          pricingHash: data?.pricingHash,
          pricing:     data?.pricing,
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Network error. Please try again.';
        setState({ isLoading: false, error: message, sessionUrl: null });
        // FIX [1]: added `code: null`.
        // Previous: { ok: false, error: message }
        // Same structural reason as the missing-URL branch above.
        return { ok: false, error: message, code: null };
      }
    },
    [cartItems],
  );

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return { ...state, initiateAuthCheckout, clearError };
}