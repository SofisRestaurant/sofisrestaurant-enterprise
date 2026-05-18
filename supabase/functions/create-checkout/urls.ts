import { getAllowedOrigins } from "./cors.ts";
import { optEnv } from "./env.ts";

const DEFAULT_SITE_ORIGIN = "https://sofisrestaurant-enterprise.vercel.app";

function cleanOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
}

function resolveAppOrigin(): string {
  const candidate =
    optEnv("APP_URL") ??
    optEnv("PUBLIC_SITE_URL") ??
    optEnv("SITE_URL") ??
    optEnv("CHECKOUT_BASE_URL") ??
    DEFAULT_SITE_ORIGIN;

  const origin = cleanOrigin(candidate);

  if (origin && getAllowedOrigins().has(origin)) {
    return origin;
  }

  return DEFAULT_SITE_ORIGIN;
}

function resolveAllowedOriginFromUrl(value: string | null): string | null {
  if (!value) return null;

  const origin = cleanOrigin(value);
  if (!origin) return null;

  return getAllowedOrigins().has(origin) ? origin : null;
}

export function resolveSuccessUrl(supplied: string | null): string {
  const suppliedOrigin = resolveAllowedOriginFromUrl(supplied);
  const envOrigin = resolveAllowedOriginFromUrl(optEnv("CHECKOUT_SUCCESS_URL"));
  const origin = suppliedOrigin ?? envOrigin ?? resolveAppOrigin();

  // IMPORTANT:
  // Do not use URLSearchParams for this.
  // Stripe needs literal {CHECKOUT_SESSION_ID}, not encoded %7B...%7D.
  return `${origin}/order-success?session_id={CHECKOUT_SESSION_ID}`;
}

export function resolveCancelUrl(supplied: string | null): string {
  const suppliedOrigin = resolveAllowedOriginFromUrl(supplied);
  const envOrigin = resolveAllowedOriginFromUrl(optEnv("CHECKOUT_CANCEL_URL"));
  const origin = suppliedOrigin ?? envOrigin ?? resolveAppOrigin();

  return `${origin}/order-canceled`;
}