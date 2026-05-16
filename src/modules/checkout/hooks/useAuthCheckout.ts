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
//   [2] Removed explicit `(item: any)` / `(m: any)` annotations.
//
//       cartItems is CartItem[] from the Zustand store. The explicit `:any`
//       annotations on the .map() callbacks overrode the inferred CartItem type,
//       causing @typescript-eslint/no-unsafe-assignment and
//       @typescript-eslint/no-unsafe-member-access on every property access.
//
//       Fix: import CartItem and CartModifier, remove annotations so TypeScript
//       infers the correct types throughout the transformation.
//
//   [3] response.json() now typed as `unknown`, narrowed before property access.
//
//       `response.json()` returns `Promise<any>` per lib.dom.d.ts. Treating
//       the result as `any` made every property access (json?.data, data?.url,
//       data?.sessionId …) unsafe. Fix: declare `const json: unknown`, then use
//       the isRecord() guard imported from checkout.types before each access.
//       parseCheckoutPricingResponse() is used for the pricing field (same
//       pattern as useGuestCheckout).
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
import type { CartItem } from '@/modules/cart/types/cart.types';
import type { CheckoutItemWirePayload } from '../types/checkout-wire.types';
import {
  isRecord,
  parseCheckoutPricingResponse,
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

  // cartItems is CartItem[] — typed by the CartStore interface
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
      // item is CartItem (inferred from CartItem[]) — no explicit :any needed.
      // m is CartModifier — id and groupId are string.
      const itemsPayload: CheckoutItemWirePayload[] = cartItems.map(
        (item: CartItem): CheckoutItemWirePayload => ({
          id:       item.menuItemId,
          quantity: item.quantity,
          notes:    item.notes ?? undefined,
          modifiers: item.modifiers.map((m) => ({
            id:       m.id,
            group_id: m.groupId,
          })),
        }),
      );

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
        // Declare as unknown and narrow with isRecord() before every access
        // so that no property read is unsafe.
        const json: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          const err = mapCheckoutError(isRecord(json) ? json : null, response);
          setState({ isLoading: false, error: err.message, sessionUrl: null });
          return { ok: false, error: err.message, code: err.code };
        }

        // Normalise { data: {...} } envelope or flat response.
        const envelope = isRecord(json) ? json : null;
        const rawData: unknown = envelope !== null
          ? (isRecord(envelope['data']) ? envelope['data'] : envelope)
          : null;

        const url = isRecord(rawData) && typeof rawData['url'] === 'string'
          ? rawData['url']
          : null;

        if (url === null) {
          const err = 'Invalid checkout response: missing URL.';
          setState({ isLoading: false, error: err, sessionUrl: null });
          // FIX [1]: added `code: null`.
          // Previous: { ok: false, error: err }
          // code is a required property on CheckoutResultFailure even though
          // its value may be null. Omitting the key entirely causes TS2322.
          return { ok: false, error: err, code: null };
        }

        setState({ isLoading: false, error: null, sessionUrl: url });

        // Each field is narrowed from rawData before use.
        // parseCheckoutPricingResponse safely parses an unknown pricing blob.
        return {
          ok:          true,
          url,
          sessionId:   isRecord(rawData) && typeof rawData['sessionId']   === 'string' ? rawData['sessionId']   : undefined,
          pricingHash: isRecord(rawData) && typeof rawData['pricingHash'] === 'string' ? rawData['pricingHash'] : undefined,
          pricing:     isRecord(rawData) ? parseCheckoutPricingResponse(rawData['pricing']) : undefined,
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