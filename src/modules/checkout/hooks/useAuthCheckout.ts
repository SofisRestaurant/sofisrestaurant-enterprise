// src/modules/checkout/hooks/useAuthCheckout.ts
// =============================================================================
// Auth checkout hook — calls `create-checkout` with Authorization: Bearer JWT.
// Server owns the Stripe redirect URLs (built from SITE_URL env var).
//
// ATTRIBUTION:
//   getAttributionForCheckout() is called at checkout time and included in the
//   request body as `attribution: { utm_source, ... }`. The server sanitizes
//   and writes these to Stripe session metadata for order-level attribution.
// =============================================================================

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/supabaseClient';
import { getAttributionForCheckout } from '@/lib/analytics/campaignTracking';
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

      // ─── ATTRIBUTION ─────────────────────────────────────────────────────
      const attribution = getAttributionForCheckout();

      const requestBody: Record<string, unknown> = {
        items: itemsPayload,
        ...serialised,
        ...(attribution !== null ? { attribution } : {}),
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

        const json: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          const err = mapCheckoutError(isRecord(json) ? json : null, response);
          setState({ isLoading: false, error: err.message, sessionUrl: null });
          return { ok: false, error: err.message, code: err.code };
        }

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
          return { ok: false, error: err, code: null };
        }

        setState({ isLoading: false, error: null, sessionUrl: url });

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