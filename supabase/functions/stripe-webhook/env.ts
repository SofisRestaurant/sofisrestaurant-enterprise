export const WEBHOOK_TOLERANCE_SECONDS = 300;
export const MAX_BODY_BYTES = 524_288;

export const LOYALTY_IDEMPOTENCY_PREFIX = "finalize-backfill:";
export const MAX_AWARD_AMOUNT_CENTS = 500_000;

export const DEFAULT_STRIPE_API_VERSION = "2026-03-25.dahlia";

export const DB_PMT_PAID = "paid";
export const DB_PMT_FAILED = "failed";
export const DB_PMT_REFUNDED = "refunded";
export const DB_PMT_PARTIAL_REFUND = "partially_refunded";
export const DB_PMT_CANCELED = "canceled";
export const DB_PMT_DISPUTED = "disputed";
export const DB_ORD_CONFIRMED = "confirmed";
export const DB_ORD_CANCELED = "canceled";

export function mustEnv(name: string): string {
  const value = Deno.env.get(name);
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value.trim();
}

export function optEnv(name: string): string | null {
  const value = Deno.env.get(name);
  if (value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
