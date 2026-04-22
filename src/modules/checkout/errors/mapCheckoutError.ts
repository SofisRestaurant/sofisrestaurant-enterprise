// src/modules/checkout/errors/mapCheckoutError.ts

// ─── Types ────────────────────────────────────────────────────────────────────

export type CheckoutError = {
  message: string;
  code: string;
  status?: number;
};

// ─── Mapper ───────────────────────────────────────────────────────────────────

export function mapCheckoutError(
  json: Record<string, unknown> | null,
  response: Response,
): CheckoutError {
  const status = response.status;

  // ─── 401 Session expired ──────────────────────────────────────────────────
  if (status === 401) {
    return {
      message: "Session expired. Please sign in again.",
      code: "session_expired",
      status,
    };
  }

  // ─── 429 Rate limited ─────────────────────────────────────────────────────
  if (status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    const message = retryAfter
      ? `Too many attempts. Please wait ${retryAfter} seconds.`
      : "Too many attempts. Please try again shortly.";

    const code =
      (json?.error as Record<string, unknown>)?.code as string ||
      (json?.code as string) ||
      "rate_limited";

    return { message, code, status };
  }

  // ─── Extract code and message from JSON body ──────────────────────────────
  const errorObj =
    json?.error !== null && typeof json?.error === "object"
      ? (json.error as Record<string, unknown>)
      : null;

  const code =
    (errorObj?.code as string | undefined)?.trim() ||
    (json?.code as string | undefined)?.trim() ||
    "checkout_failed";

  const backendMessage =
    (errorObj?.message as string | undefined)?.trim() ||
    (json?.message as string | undefined)?.trim() ||
    "";

  // ─── validation_failed — always surface backend message verbatim ──────────
  if (code === "validation_failed") {
    return {
      message: backendMessage || "Your order couldn't be validated. Please review your cart.",
      code,
      status,
    };
  }

  // ─── pricing_failed ───────────────────────────────────────────────────────
  if (code === "pricing_failed") {
    return {
      message: "We couldn't calculate pricing. Please try again.",
      code,
      status,
    };
  }

  // ─── Fallback — generic message ───────────────────────────────────────────
  return {
    message: backendMessage || "Checkout failed. Please try again.",
    code,
    status,
  };
}