// supabase/functions/create-checkout/urls.ts
// =============================================================================
// Stripe Checkout redirect URL resolvers.
//
// All client-supplied URLs reach these functions ONLY after passing the
// origin allowlist in request-validation.ts (`validateRedirectUrl`).
// Env-var fallbacks are operator-trusted. Final fallback is the hardcoded
// origin, which is always in the allowlist by construction.
//
// resolveSuccessUrl   → hosted mode success_url
// resolveCancelUrl    → hosted mode cancel_url
// resolveReturnUrl    → embedded mode return_url (also includes
//                       {CHECKOUT_SESSION_ID} so the success page can
//                       read session_id on redirect_on_completion)
// =============================================================================

import { getAllowedOrigins } from "./cors.ts";
import { optEnv } from "./env.ts";

const DEFAULT_SITE_ORIGIN = "https://www.sofislegacy.com";
const SUCCESS_PATH = "/order-success";
const CANCEL_PATH  = "/menu";

function resolveAppOrigin(): string {
  const candidate =
    optEnv("APP_URL") ??
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
    // fall through to default
  }

  return DEFAULT_SITE_ORIGIN;
}

function withSessionIdPlaceholder(url: URL): URL {
  if (!url.searchParams.has("session_id")) {
    url.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
  }
  return url;
}

export function resolveSuccessUrl(supplied: string | null): string {
  const base =
    supplied ??
    optEnv("CHECKOUT_SUCCESS_URL") ??
    `${resolveAppOrigin()}${SUCCESS_PATH}`;

  try {
    return withSessionIdPlaceholder(new URL(base)).toString();
  } catch {
    return withSessionIdPlaceholder(
      new URL(SUCCESS_PATH, resolveAppOrigin()),
    ).toString();
  }
}

export function resolveCancelUrl(supplied: string | null): string {
  const base =
    supplied ??
    optEnv("CHECKOUT_CANCEL_URL") ??
    `${resolveAppOrigin()}${CANCEL_PATH}`;

  try {
    return new URL(base).toString();
  } catch {
    return new URL(CANCEL_PATH, resolveAppOrigin()).toString();
  }
}

// ─── Embedded Checkout return URL ────────────────────────────────────────────
//
// For embedded mode with the default `redirect_on_completion: "always"`, Stripe
// redirects the embedded surface to return_url on completion. The path is the
// same /order-success page used by hosted mode — both flows land on the same
// confirmation route, which already reads `session_id` from query params.
//
// CHECKOUT_SESSION_ID is mandatory. If a caller-supplied URL omits it, we
// inject it so the success page can always resolve the session.
//
// We deliberately reuse `body.success_url` as the supplied value at the call
// site. The semantics are identical (success-landing destination) and we
// don't want two separate validated URL fields on the request body.

export function resolveReturnUrl(supplied: string | null): string {
  const base =
    supplied ??
    optEnv("CHECKOUT_RETURN_URL") ??
    optEnv("CHECKOUT_SUCCESS_URL") ??
    `${resolveAppOrigin()}${SUCCESS_PATH}`;

  try {
    return withSessionIdPlaceholder(new URL(base)).toString();
  } catch {
    return withSessionIdPlaceholder(
      new URL(SUCCESS_PATH, resolveAppOrigin()),
    ).toString();
  }
}