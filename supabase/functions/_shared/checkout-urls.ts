// supabase/functions/_shared/checkout-urls.ts
// =============================================================================
// SERVER-CONTROLLED STRIPE REDIRECT URLs (single source of truth)
// -----------------------------------------------------------------------------
// Both create-checkout and create-checkout-guest import from here.
// Nothing else in the codebase should build Stripe success/cancel URLs.
//
// Why this file exists:
//   Previously URLs came from 3 places (frontend origin, legacy hook, backend
//   resolveSuccessUrl). `new URL(x).toString()` percent-encodes `{` and `}`,
//   which breaks Stripe's {CHECKOUT_SESSION_ID} substitution — leading to
//   redirects like /order-success?session_id=%7BCHECKOUT_SESSION_ID%7D.
//
// Contract:
//   - Raw string interpolation only. No URL() normalization.
//   - Stripe's `{CHECKOUT_SESSION_ID}` placeholder must reach Stripe with
//     literal curly braces, unencoded.
//   - SITE_URL must be an https origin with no trailing slash (enforced
//     at import time — function boot fails loudly if misconfigured).
// =============================================================================

// ─── Env resolution ──────────────────────────────────────────────────────────

const RAW_SITE_URL =
  Deno.env.get("SITE_URL") ??
  Deno.env.get("PUBLIC_SITE_URL") ??
  "";

function validateSiteUrl(raw: string): string {
  if (!raw) {
    throw new Error(
      "SITE_URL env var is not set. " +
        "Set it to your public origin (e.g. https://sofisrestaurant-enterprise.vercel.app) " +
        "in Supabase → Edge Functions → Settings → Secrets.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`SITE_URL is not a valid URL: ${raw}`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`SITE_URL must use http(s): ${raw}`);
  }

  // Strip trailing slash so we can interpolate `${SITE_URL}/path` safely.
  return parsed.origin;
}

export const SITE_URL = validateSiteUrl(RAW_SITE_URL);

// ─── Stripe redirect URLs ────────────────────────────────────────────────────
// Frozen constants. Do NOT run these through new URL().toString() — that would
// percent-encode the `{` and `}` and break Stripe's placeholder substitution.

export const STRIPE_SUCCESS_URL =
  `${SITE_URL}/order-success?session_id={CHECKOUT_SESSION_ID}`;

export const STRIPE_CANCEL_URL =
  `${SITE_URL}/order-canceled`;