// src/modules/checkout/hooks/useAuthCheckout.ts
// =============================================================================
// Auth checkout hook — calls `create-checkout` with Authorization: Bearer JWT.
//
// CHANGES (2026-05 embedded checkout migration):
//   • Response parser now reads `clientSecret` and `uiMode` alongside `url`.
//   • Missing-URL guard relaxed: success requires EITHER `url` OR `clientSecret`.
//   • Returned CheckoutResult carries all three fields (url, clientSecret, uiMode)
//     so the caller (CheckoutPage / router) can branch on uiMode.
//
// All prior fixes preserved: code-on-failure, typed cart map, unknown-narrowed
// json. pickup_time contract unchanged.
// =============================================================================

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/supabaseClient';
import { useCartStore } from '@/modules/cart/store/cart.store';
import { mapCheckoutError } from '@/modules/checkout/errors/mapCheckoutError';
import type { CartItem } from '@/modules/cart/types/cart.types';
import type {
  CheckoutItemWirePayload,
  CheckoutUiMode,
} from '../types/checkout-wire.types';
import {
  isRecord,
  parseCheckoutPricingResponse,
  serialiseAuthCheckoutInput,
  type AuthCheckoutInput,
  type CheckoutResult,
} from '../types/checkout.types';

const AUTH_CHECKOUT_ENDPOINT = 'create-checkout';

type AuthCheckoutState = {
  isLoading:  boolean;
  error:      string | null;
  sessionUrl: string | null;
};

export type UseAuthCheckoutReturn = AuthCheckoutState & {
  initiateAuthCheckout: (input: AuthCheckoutInput) => Promise<CheckoutResult>;
  clearError: () => void;
};

function asUiMode(value: unknown): CheckoutUiMode | undefined {
  return value === 'embedded' || value === 'hosted' ? value : undefined;
}

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
        const clientSecret = isRecord(rawData) && typeof rawData['clientSecret'] === 'string'
          ? rawData['clientSecret']
          : null;
        const uiMode = isRecord(rawData) ? asUiMode(rawData['uiMode']) : undefined;

        // Success requires exactly one transport field: hosted gets `url`,
        // embedded gets `clientSecret`. Missing both is a contract violation.
        if (url === null && clientSecret === null) {
          const err = 'Invalid checkout response: missing URL or client secret.';
          setState({ isLoading: false, error: err, sessionUrl: null });
          return { ok: false, error: err, code: null };
        }

        setState({ isLoading: false, error: null, sessionUrl: url });

        return {
          ok:           true,
          url:          url          ?? undefined,
          clientSecret: clientSecret ?? undefined,
          uiMode,
          sessionId:    isRecord(rawData) && typeof rawData['sessionId']   === 'string' ? rawData['sessionId']   : undefined,
          pricingHash:  isRecord(rawData) && typeof rawData['pricingHash'] === 'string' ? rawData['pricingHash'] : undefined,
          pricing:      isRecord(rawData) ? parseCheckoutPricingResponse(rawData['pricing']) : undefined,
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