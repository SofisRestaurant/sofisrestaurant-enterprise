// =============================================================================
// supabase/functions/finalize-order/config.ts
// =============================================================================

export const MAX_BODY_BYTES = 10_000;
export const MAX_SESSION_ID_LEN = 200;
export const MAX_REQUEST_ID_LEN = 128;

export const RATE_LIMIT_MAX = 30;
export const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
export const RATE_LIMIT_BLOCK_MS = 10 * 60 * 1000;
export const FINALIZE_RATE_LIMIT_TABLE = 'checkout_rate_limits';

export const LOYALTY_IDEMPOTENCY_PREFIX = 'finalize-backfill:';
export const MAX_AWARD_AMOUNT_CENTS = 500_000;
export const MAX_ORDER_TOTAL_CENTS = 500_000;

export const DB_PAYMENT_STATUS_PAID = 'paid';
export const DB_ORDER_STATUS_CONFIRMED = 'confirmed';
export const DB_ORDER_TYPE_FOOD = 'food';

export const DEFAULT_STRIPE_API_VERSION = '2026-02-25.clover';

export const STRIPE_SESSION_RE = /^cs_(test|live)_[a-zA-Z0-9]+$/;

export const ALLOWED_ORIGINS = new Set<string>([
  'https://sofislegacy.com',
  'https://www.sofislegacy.com',
  'https://sofisrestaurant-enterprise.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
]);