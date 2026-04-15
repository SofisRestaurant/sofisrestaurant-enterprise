// src/modules/checkout/hooks/useGuestCheckout.ts

import { useState, useCallback } from "react";
import { useCartStore } from "@/modules/cart/store/cart.store";
import type {
  GuestCheckoutInput,
  CheckoutResult,
} from "../types/checkout.types";

// ─── Constants ────────────────────────────────────────────────────────────────

const GUEST_TOKEN_STORAGE_KEY = "checkout_guest_token";
const GUEST_CHECKOUT_ENDPOINT = "create-checkout-guest";

// ─── Types ────────────────────────────────────────────────────────────────────

type GuestCheckoutState = {
  isLoading: boolean;
  error: string | null;
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
    // no-op (private mode safe)
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGuestCheckout(): UseGuestCheckoutReturn {
  const [state, setState] = useState<GuestCheckoutState>({
    isLoading: false,
    error: null,
    sessionUrl: null,
  });

  const cartItems = useCartStore((s) => s.items);

  const initiateGuestCheckout = useCallback(
    async (input: GuestCheckoutInput): Promise<CheckoutResult> => {
      setState({ isLoading: true, error: null, sessionUrl: null });

      const storedToken = getStoredGuestToken();

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
      const requestBody: Record<string, unknown> = {
        items: itemsPayload,
        order_type: input.orderType,
        guest_email: input.guestEmail,

        ...(input.notes && { notes: input.notes }),
        ...(storedToken && { guest_token: storedToken }),
        ...(input.successUrl && { success_url: input.successUrl }),
        ...(input.cancelUrl && { cancel_url: input.cancelUrl }),
      };

      // ─── SAFETY CHECK (forbidden fields guard) ─────────────────────────────
      const FORBIDDEN_FIELDS = [
        "promo_code",
        "promo_id",
        "credit_id",
        "loyalty_redeem_points",
        "loyalty_reward_id",
        "loyalty_redemption_id",
        "loyalty_account_id",
        "client_integrity_hash",
      ] as const;

      for (const field of FORBIDDEN_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(requestBody, field)) {
          const err = `BUG: forbidden field '${field}' in guest checkout request`;
          console.error(err);
          setState({ isLoading: false, error: err, sessionUrl: null });
          return { ok: false, error: err };
        }
      }

      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${GUEST_CHECKOUT_ENDPOINT}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          },
        );

        const json = await response.json().catch(() => null);

        // ─── ERROR HANDLING ───────────────────────────────────────────────────
        if (!response.ok) {
          const message =
            json?.error?.message ||
            json?.message ||
            "Checkout failed. Please try again.";

          const code = json?.error?.code || "checkout_failed";

          if (response.status === 429) {
            const retryAfter = response.headers.get("Retry-After");
            const msg = retryAfter
              ? `Too many attempts. Please wait ${retryAfter} seconds.`
              : message;

            setState({ isLoading: false, error: msg, sessionUrl: null });
            return { ok: false, error: msg, code };
          }

          setState({ isLoading: false, error: message, sessionUrl: null });
          return { ok: false, error: message, code };
        }

        // ─── SUCCESS PARSE ────────────────────────────────────────────────────
        const data = json?.data ?? json;

        const url = data?.url;
        if (typeof url !== "string") {
          const err = "Invalid checkout response: missing URL.";
          setState({ isLoading: false, error: err, sessionUrl: null });
          return { ok: false, error: err };
        }

        const newToken = data?.guest_token;

        if (typeof newToken === "string" && newToken.length > 0) {
          storeGuestToken(newToken);
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
    initiateGuestCheckout,
    clearError,
  };
}