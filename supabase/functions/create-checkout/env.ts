import type Stripe from "stripe";
import type { OrderType } from "../_shared/pricing.ts";

export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_ATTEMPTS = 10;
export const RATE_LIMIT_BLOCK_MS = RATE_LIMIT_WINDOW_MS * 2;

export const MAX_BODY_BYTES = 65_536;
export const MAX_ITEMS = 50;
export const MAX_NOTES_LEN = 500;
export const MAX_PROMO_CODE_LEN = 64;
export const MAX_URL_LEN = 2_048;
export const MAX_ID_LEN = 128;
export const MAX_CLIENT_HASH_LEN = 256;

export const SESSION_EXPIRES_AFTER_SECONDS = 1_800;
export const CART_TTL_MS = SESSION_EXPIRES_AFTER_SECONDS * 1_000;
export const MAX_ORDER_TOTAL_CENTS = 500_000;

export const ALLOWED_ORDER_TYPES: readonly OrderType[] = [
  "pickup",
  "delivery",
  "dine_in",
];

export const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "https://sofislegacy.com",
  "https://www.sofislegacy.com",
  "https://sofisrestaurant-enterprise.vercel.app",
] as const;

export const DEFAULT_STRIPE_API_VERSION = "2026-02-25.clover";

export function isOrderType(value: string): value is OrderType {
  return ALLOWED_ORDER_TYPES.some((entry) => entry === value);
}

export function isValidStripeApiVersion(value: string): boolean {
  return /^2026-\d{2}-\d{2}(\.[a-zA-Z0-9_-]+)?$/.test(value);
}

export const STRIPE_API_VERSION = (
  isValidStripeApiVersion(Deno.env.get("STRIPE_API_VERSION")?.trim() ?? "")
    ? (Deno.env.get("STRIPE_API_VERSION")?.trim() ?? DEFAULT_STRIPE_API_VERSION)
    : DEFAULT_STRIPE_API_VERSION
) as Stripe.LatestApiVersion;

export function mustEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export function optEnv(name: string): string | null {
  return Deno.env.get(name)?.trim() || null;
}

export function parseTaxRateFraction(value: string | null): number | null {
  if (!value) return null;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  if (parsed <= 1) return parsed;
  if (parsed <= 100) return parsed / 100;

  return null;
}

export function resolveTaxRate(): number {
  const envRate = parseTaxRateFraction(
    optEnv("CHECKOUT_TAX_RATE") ??
      optEnv("SALES_TAX_RATE") ??
      optEnv("TAX_RATE") ??
      optEnv("NEXT_PUBLIC_TAX_RATE"),
  );

  return envRate ?? 0;
}
