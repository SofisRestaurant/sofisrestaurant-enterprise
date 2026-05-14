// src/modules/checkout/errors/mapCheckoutError.ts
export type CheckoutError = {
  message: string;
  code: string;
  status?: number;
};

// ─── Internal: safe record narrowing ─────────────────────────────────────────
//
// Defined locally to avoid importing from a peer module and creating a
// circular dependency. `mapCheckoutError` is a leaf utility.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ─── Internal: coerce to non-empty string or null ────────────────────────────

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

// ─── Internal: normalise different backend error shapes ───────────────────────
//
// Backend responses arrive in two possible shapes:
//   Flat:   { code, message }
//   Nested: { error: { code, message } }
//
// Both are normalised to a { code, message } pair.
// Every property access is gated behind explicit typeof checks — no `any`.

function extractError(json: Record<string, unknown> | null): { code: string; message: string } {
  if (!json) return { code: 'checkout_failed', message: '' };

  // Try the nested shape first: { error: { code, message } }
  const errorObj: Record<string, unknown> | null = isRecord(json['error']) ? json['error'] : null;

  // Prefer nested.code → flat.code → fallback
  const codeRaw:    unknown = errorObj?.['code']    ?? json['code'];
  const messageRaw: unknown = errorObj?.['message'] ?? json['message'];

  return {
    code:    asNonEmptyString(codeRaw)    ?? 'checkout_failed',
    message: asNonEmptyString(messageRaw) ?? '',
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
      message: 'Session expired. Please sign in again.',
      code: 'session_expired',
      status,
    };
  }

  // ─── Rate limit ───────────────────────────────────────────────────────────
  if (status === 429) {
    const retryAfter = response.headers.get('Retry-After');

    return {
      message: retryAfter
        ? `Too many attempts. Please wait ${retryAfter} seconds.`
        : 'Too many attempts. Please try again shortly.',
      code: 'rate_limited',
      status,
    };
  }

  const { code, message } = extractError(json);

  // ─── VALIDATION (critical path — never override backend) ─────────────────
  if (code === 'validation_failed') {
    return {
      message: message || "Your order couldn't be validated. Please review your cart.",
      code,
      status,
    };
  }

  // ─── PRICING ERROR (keep generic UX, backend not shown) ──────────────────
  if (code === 'pricing_failed') {
    return {
      message: "We couldn't calculate pricing. Please try again.",
      code,
      status,
    };
  }

  // ─── STRIPE ERRORS ───────────────────────────────────────────────────────
  if (code === 'stripe_session_failed') {
    return {
      message: 'Payment system temporarily unavailable. Please try again.',
      code,
      status,
    };
  }

  // ─── GENERIC FALLBACK (last resort only) ─────────────────────────────────
  return {
    message: message || 'Checkout failed. Please try again.',
    code,
    status,
  };
}