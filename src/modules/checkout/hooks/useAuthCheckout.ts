// src/modules/checkout/hooks/useAuthCheckout.ts
// =============================================================================
// Auth checkout hook — calls `create-checkout` with Authorization: Bearer JWT.
// Server owns the Stripe redirect URLs (built from SITE_URL env var).
// =============================================================================

import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/supabaseClient";
import { useCartStore } from "@/modules/cart/store/cart.store";
import { mapCheckoutError } from "@/modules/checkout/errors/mapCheckoutError";
import type {
  AuthCheckoutInput,
  CheckoutResult,
} from "../types/checkout.types";

// ─── Constants ────────────────────────────────────────────────────────────────

const AUTH_CHECKOUT_ENDPOINT = "create-checkout";

// ─── Types ────────────────────────────────────────────────────────────────────

type AuthCheckoutState = {
  isLoading: boolean;
  error: string | null;
  sessionUrl: string | null;
};

export type UseAuthCheckoutReturn = AuthCheckoutState & {
  initiateAuthCheckout: (input: AuthCheckoutInput) => Promise<CheckoutResult>;
  clearError: () => void;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuthCheckout(): UseAuthCheckoutReturn {
  const [state, setState] = useState<AuthCheckoutState>({
    isLoading: false,
    error: null,
    sessionUrl: null,
  });

  const cartItems = useCartStore((s) => s.items);

  const initiateAuthCheckout = useCallback(
    async (input: AuthCheckoutInput): Promise<CheckoutResult> => {
      setState({ isLoading: true, error: null, sessionUrl: null });

      // ─── AUTH CHECK ────────────────────────────────────────────────────────
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        const err = "Authentication required. Please sign in to continue.";
        setState({ isLoading: false, error: err, sessionUrl: null });
        return { ok: false, error: err, code: "auth_required" };
      }

      const accessToken = session.access_token;

      // ─── SAFE CART TRANSFORM ───────────────────────────────────────────────
      const itemsPayload = cartItems.map((item: any) => {
        const modifiers = Array.isArray(item.modifiers)
          ? item.modifiers.map((m: any) => ({
              id: String(m.id),
              group_id: String(m.groupId),
            }))
          : [];

        return {
          id: item.menuItemId ?? item.id,
          quantity: Number(item.quantity ?? 1),
          notes: item.notes ?? undefined,
          modifiers,
        };
      });

      // ─── REQUEST BODY ──────────────────────────────────────────────────────
      // NOTE: success_url / cancel_url intentionally NOT sent.
      // The Edge Function generates them from its SITE_URL env var.
      const requestBody: Record<string, unknown> = {
        items: itemsPayload,
        order_type: input.orderType,

        ...(input.notes && { notes: input.notes }),
        ...(input.promoCode && { promo_code: input.promoCode }),
        ...(input.promoId && { promo_id: input.promoId }),
        ...(input.creditId && { credit_id: input.creditId }),

        ...(input.loyaltyRedeemPoints
          ? { loyalty_redeem_points: input.loyaltyRedeemPoints }
          : {}),

        ...(input.loyaltyAccountId && {
          loyalty_account_id: input.loyaltyAccountId,
        }),

        ...(input.loyaltyRewardId && {
          loyalty_reward_id: input.loyaltyRewardId,
        }),

        ...(input.loyaltyRedemptionId && {
          loyalty_redemption_id: input.loyaltyRedemptionId,
        }),

        ...(input.clientIntegrityHash && {
          client_integrity_hash: input.clientIntegrityHash,
        }),
      };

      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${AUTH_CHECKOUT_ENDPOINT}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(requestBody),
          },
        );

        const json = await response.json().catch(() => null);

        // ─── ERROR HANDLING ───────────────────────────────────────────────────
        if (!response.ok) {
          const err = mapCheckoutError(json, response);
          setState({ isLoading: false, error: err.message, sessionUrl: null });
          return { ok: false, error: err.message, code: err.code };
        }

        // ─── SUCCESS PARSE ────────────────────────────────────────────────────
        const data = json?.data ?? json;

        const url = data?.url;
        if (typeof url !== "string") {
          const err = "Invalid checkout response: missing URL.";
          setState({ isLoading: false, error: err, sessionUrl: null });
          return { ok: false, error: err };
        }

        setState({ isLoading: false, error: null, sessionUrl: url });

        return {
          ok: true,
          url,
          sessionId: data?.sessionId,
          pricingHash: data?.pricingHash,
          pricing: data?.pricing,
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Network error. Please try again.";

        setState({ isLoading: false, error: message, sessionUrl: null });

        return { ok: false, error: message };
      }
    },
    [cartItems],
  );

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    initiateAuthCheckout,
    clearError,
  };
}