export type CheckoutError = {
  message: string;
  code: string;
  status?: number;
};

function extractError(json: any) {
  if (!json) return { code: "checkout_failed", message: "" };

  // normalize different backend shapes
  const errorObj =
    typeof json.error === "object" && json.error !== null
      ? json.error
      : null;

  return {
    code:
      errorObj?.code ||
      json.code ||
      "checkout_failed",

    message:
      errorObj?.message ||
      json.message ||
      "",
  };
}

export function mapCheckoutError(
  json: Record<string, unknown> | null,
  response: Response,
): CheckoutError {
  const status = response.status;

  // ─── Auth expired ─────────────────────────────────────────────────────────
  if (status === 401) {
    return {
      message: "Session expired. Please sign in again.",
      code: "session_expired",
      status,
    };
  }

  // ─── Rate limit ───────────────────────────────────────────────────────────
  if (status === 429) {
    const retryAfter = response.headers.get("Retry-After");

    return {
      message: retryAfter
        ? `Too many attempts. Please wait ${retryAfter} seconds.`
        : "Too many attempts. Please try again shortly.",
      code: "rate_limited",
      status,
    };
  }

  const { code, message } = extractError(json);

  // ─── VALIDATION (critical path — never override backend) ────────────────
  if (code === "validation_failed") {
    return {
      message:
        message || "Your order couldn't be validated. Please review your cart.",
      code,
      status,
    };
  }

  // ─── PRICING ERROR (keep generic UX, backend not shown) ───────────────────
  if (code === "pricing_failed") {
    return {
      message: "We couldn't calculate pricing. Please try again.",
      code,
      status,
    };
  }

  // ─── STRIPE ERRORS ───────────────────────────────────────────────────────
  if (code === "stripe_session_failed") {
    return {
      message: "Payment system temporarily unavailable. Please try again.",
      code,
      status,
    };
  }

  // ─── GENERIC FALLBACK (last resort only) ──────────────────────────────────
  return {
    message: message || "Checkout failed. Please try again.",
    code,
    status,
  };
}