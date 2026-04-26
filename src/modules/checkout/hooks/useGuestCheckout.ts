// src/modules/checkout/hooks/useGuestCheckout.ts
// =============================================================================
// Guest checkout hook — calls `create-checkout-guest` with the `apikey` header
// and no Authorization header. Server owns the Stripe redirect URLs.
//
// pickup_time contract:
//   This hook receives a GuestCheckoutInput which carries pickupSchedule
//   (a PickupSchedule domain object — never a raw string). At the network
//   boundary, serialiseGuestCheckoutInput() converts it to the wire body.
//   That function calls toTransport() from the adapter layer:
//     ASAP_PICKUP          → key absent from JSON body
//     scheduledPickup(iso) → pickup_time: "ISO string"
//   This hook never reads, writes, or touches pickup_time as a string.
// =============================================================================

import { useState, useCallback } from 'react';
import { useCartStore } from '@/modules/cart/store/cart.store';
import { mapCheckoutError } from '@/modules/checkout/errors/mapCheckoutError';
import {
  serialiseGuestCheckoutInput,
  type GuestCheckoutInput,
  type CheckoutResult,
} from '../types/checkout.types';

// ─── Constants ────────────────────────────────────────────────────────────────

const GUEST_TOKEN_STORAGE_KEY = 'checkout_guest_token';
const GUEST_CHECKOUT_ENDPOINT = 'create-checkout-guest';

// ─── Types ────────────────────────────────────────────────────────────────────

type GuestCheckoutState = {
  isLoading:  boolean;
  error:      string | null;
  sessionUrl: string | null;
};

export type UseGuestCheckoutReturn = GuestCheckoutState & {
  initiateGuestCheckout: (input: GuestCheckoutInput) => Promise<CheckoutResult>;
  clearError: () => void;
};

// ─── Guest token helpers ──────────────────────────────────────────────────────

function getStoredGuestToken(): string | null {
  try {
    return sessionStorage.getItem(GUEST_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeGuestToken(token: string): void {
  try {
    sessionStorage.setItem(GUEST_TOKEN_STORAGE_KEY, token);
  } catch {
    // no-op (private browsing safe)
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGuestCheckout(): UseGuestCheckoutReturn {
  const [state, setState] = useState<GuestCheckoutState>({
    isLoading:  false,
    error:      null,
    sessionUrl: null,
  });

  const cartItems = useCartStore((s) => s.items);

  const initiateGuestCheckout = useCallback(
    async (input: GuestCheckoutInput): Promise<CheckoutResult> => {
      setState({ isLoading: true, error: null, sessionUrl: null });

      const storedToken = getStoredGuestToken();

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
      // serialiseGuestCheckoutInput converts the typed GuestCheckoutInput
      // (which uses PickupSchedule from the domain layer) into the
      // snake_case wire body the Edge Function expects.
      //
      // pickup_time will be:
      //   - an ISO string if input.pickupSchedule is a ScheduledPickup
      //   - absent (key omitted) if input.pickupSchedule is ASAP or omitted
      //
      // This is the ONLY place pickup serialisation occurs in this hook.
      // NOTE: success_url / cancel_url intentionally NOT included —
      // the Edge Function generates them from its SITE_URL env var.
      const serialised = serialiseGuestCheckoutInput(input);

      const requestBody: Record<string, unknown> = {
        items: itemsPayload,
        ...serialised,
        ...(storedToken ? { guest_token: storedToken } : {}),
      };

      // ─── FORBIDDEN FIELDS GUARD ───────────────────────────────────────────
      // pickup_time is NOT forbidden — guests may schedule pickup times.
      // These fields are auth-only and must never appear in a guest request.
      const FORBIDDEN_FIELDS = [
        'promo_code',
        'promo_id',
        'credit_id',
        'loyalty_redeem_points',
        'loyalty_reward_id',
        'loyalty_redemption_id',
        'loyalty_account_id',
        'client_integrity_hash',
      ] as const;

      for (const field of FORBIDDEN_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(requestBody, field)) {
          const err = `BUG: forbidden field '${field}' in guest checkout request`;
          console.error(err);
          setState({ isLoading: false, error: err, sessionUrl: null });
          return { ok: false, error: err };
        }
      }

      // ─── ENV VAR GUARD ────────────────────────────────────────────────────
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey     = import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (typeof supabaseUrl !== 'string' || supabaseUrl.length === 0) {
        const err = 'Checkout is not configured. Please contact support.';
        console.error('[useGuestCheckout] VITE_SUPABASE_URL is missing');
        setState({ isLoading: false, error: err, sessionUrl: null });
        return { ok: false, error: err };
      }

      if (typeof anonKey !== 'string' || anonKey.length === 0) {
        const err = 'Checkout is not configured. Please contact support.';
        console.error('[useGuestCheckout] VITE_SUPABASE_ANON_KEY is missing');
        setState({ isLoading: false, error: err, sessionUrl: null });
        return { ok: false, error: err };
      }

      try {
        const response = await fetch(
          `${supabaseUrl}/functions/v1/${GUEST_CHECKOUT_ENDPOINT}`,
          {
            method:  'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: anonKey,
            },
            body: JSON.stringify(requestBody),
          },
        );

        const json = await response.json().catch(() => null);

        if (!response.ok) {
          const err = mapCheckoutError(json, response);
          setState({ isLoading: false, error: err.message, sessionUrl: null });
          return { ok: false, error: err.message, code: err.code };
        }

        const data     = json?.data ?? json;
        const url      = data?.url;

        if (typeof url !== 'string') {
          const err = 'Invalid checkout response: missing URL.';
          setState({ isLoading: false, error: err, sessionUrl: null });
          return { ok: false, error: err };
        }

        const newToken = data?.guest_token;
        if (typeof newToken === 'string' && newToken.length > 0) {
          storeGuestToken(newToken);
        }

        setState({ isLoading: false, error: null, sessionUrl: url });

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
        return { ok: false, error: message };
      }
    },
    [cartItems],
  );

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return { ...state, initiateGuestCheckout, clearError };
}