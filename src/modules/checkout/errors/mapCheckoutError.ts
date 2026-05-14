// src/modules/checkout/errors/mapCheckoutError.ts
// =============================================================================
// CHECKOUT ERROR MAPPER
// =============================================================================
//
// Purpose:
//   Converts an untrusted checkout error response into a safe customer-facing
//   error object.
//
// Design rules:
//   - Treat all response JSON as unknown at the boundary.
//   - Never use `any`.
//   - Never destructure unknown/untrusted objects before narrowing.
//   - Support both backend shapes:
//       Flat:   { code, message }
//       Nested: { error: { code, message } }
//   - Keep customer messaging safe and professional.
//   - Preserve backend codes for logging/control flow.
// =============================================================================

export type CheckoutError = {
  readonly message: string;
  readonly code: string;
  readonly status?: number;
};

type NormalizedBackendError = {
  readonly code: string;
  readonly message: string;
};

const FALLBACK_ERROR: NormalizedBackendError = {
  code: 'checkout_failed',
  message: '',
};

const CUSTOMER_MESSAGES: Record<string, string> = {
  validation_failed: "Your order couldn't be validated. Please review your cart.",
  pricing_failed: "We couldn't calculate pricing. Please try again.",
  stripe_session_failed: 'Payment system temporarily unavailable. Please try again.',
  checkout_blocked:
    'This order could not be processed. Please contact us if you believe this is a mistake.',
  otp_required: 'Additional verification is required before checkout.',
  promo_invalid: 'That promo code is not valid for this order.',
  promo_not_found: 'That promo code was not found.',
  credit_invalid: 'That store credit could not be applied.',
  loyalty_invalid: 'Your loyalty reward could not be applied.',
  cart_empty: 'Your cart is empty. Please add items before checkout.',
  cart_invalid: 'Your cart has changed. Please review your order and try again.',
  item_unavailable: 'One or more items are no longer available. Please review your cart.',
  checkout_failed: 'Checkout failed. Please try again.',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Safe narrowing helpers
// ─────────────────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asFinitePositiveInteger(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Backend error extraction
// ─────────────────────────────────────────────────────────────────────────────

function getNestedErrorObject(json: Record<string, unknown>): Record<string, unknown> | null {
  const nested = json['error'];
  return isRecord(nested) ? nested : null;
}

function extractError(json: unknown): NormalizedBackendError {
  if (!isRecord(json)) return FALLBACK_ERROR;

  const nestedError = getNestedErrorObject(json);

  const code =
    asNonEmptyString(nestedError?.['code']) ??
    asNonEmptyString(json['code']) ??
    FALLBACK_ERROR.code;

  const message =
    asNonEmptyString(nestedError?.['message']) ??
    asNonEmptyString(json['message']) ??
    FALLBACK_ERROR.message;

  return { code, message };
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer message policy
// ─────────────────────────────────────────────────────────────────────────────
//
// Only specific safe backend messages are allowed through. Most backend messages
// should not be shown directly because they can be too technical, inconsistent,
// or accidentally leak internal details.

function shouldUseBackendMessage(code: string): boolean {
  return (
    code === 'validation_failed' ||
    code === 'promo_invalid' ||
    code === 'promo_not_found' ||
    code === 'cart_invalid' ||
    code === 'item_unavailable'
  );
}

function customerMessageFor(code: string, backendMessage: string): string {
  if (shouldUseBackendMessage(code) && backendMessage.length > 0) {
    return backendMessage;
  }

  return CUSTOMER_MESSAGES[code] ?? CUSTOMER_MESSAGES.checkout_failed;
}

function formatRateLimitMessage(response: Response): string {
  const retryAfter = asFinitePositiveInteger(response.headers.get('Retry-After'));

  if (retryAfter === null) {
    return 'Too many attempts. Please try again shortly.';
  }

  if (retryAfter < 60) {
    return `Too many attempts. Please wait ${retryAfter} second${retryAfter === 1 ? '' : 's'}.`;
  }

  const minutes = Math.ceil(retryAfter / 60);
  return `Too many attempts. Please wait about ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function mapCheckoutError(
  json: unknown,
  response: Response,
): CheckoutError {
  const status = response.status;

  if (status === 401) {
    return {
      message: 'Session expired. Please sign in again.',
      code: 'session_expired',
      status,
    };
  }

  if (status === 403) {
    return {
      message: "You don't have permission to complete this checkout.",
      code: 'checkout_forbidden',
      status,
    };
  }

  if (status === 408) {
    return {
      message: 'Checkout timed out. Please try again.',
      code: 'checkout_timeout',
      status,
    };
  }

  if (status === 409) {
    return {
      message: 'Your cart changed. Please review your order and try again.',
      code: 'checkout_conflict',
      status,
    };
  }

  if (status === 429) {
    return {
      message: formatRateLimitMessage(response),
      code: 'rate_limited',
      status,
    };
  }

  if (status >= 500) {
    return {
      message: 'Checkout is temporarily unavailable. Please try again shortly.',
      code: 'checkout_unavailable',
      status,
    };
  }

  const backendError = extractError(json);

  return {
    message: customerMessageFor(backendError.code, backendError.message),
    code: backendError.code,
    status,
  };
}