import { getAllowedOrigins } from "./cors.ts";
import { optEnv } from "./env.ts";

const DEFAULT_SITE_ORIGIN = "https://www.sofislegacy.com";

function resolveAppOrigin(): string {
  const candidate = optEnv("APP_URL") ??
    optEnv("PUBLIC_SITE_URL") ??
    optEnv("SITE_URL") ??
    optEnv("CHECKOUT_BASE_URL") ??
    DEFAULT_SITE_ORIGIN;

  try {
    const parsed = new URL(candidate);
    if (getAllowedOrigins().has(parsed.origin)) {
      return parsed.origin;
    }
  } catch {
    // fall through
  }

  return DEFAULT_SITE_ORIGIN;
}

export function resolveSuccessUrl(supplied: string | null): string {
  const base = supplied ??
    optEnv("CHECKOUT_SUCCESS_URL") ??
    `${resolveAppOrigin()}/order-success`;

  try {
    const parsed = new URL(base);
    if (!parsed.searchParams.has("session_id")) {
      parsed.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
    }
    return parsed.toString();
  } catch {
    const fallback = new URL("/order-success", resolveAppOrigin());
    fallback.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
    return fallback.toString();
  }
}

export function resolveCancelUrl(supplied: string | null): string {
  const base = supplied ?? optEnv("CHECKOUT_CANCEL_URL") ??
    `${resolveAppOrigin()}/menu`;

  try {
    return new URL(base).toString();
  } catch {
    return new URL("/menu", resolveAppOrigin()).toString();
  }
}
