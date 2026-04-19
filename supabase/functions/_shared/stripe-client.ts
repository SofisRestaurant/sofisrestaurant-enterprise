// supabase/functions/_shared/stripe-client.ts
// =============================================================================
// SINGLE SOURCE OF TRUTH for Stripe API version and client singleton.
//
// Rules:
//   - STRIPE_API_VERSION is defined ONCE here. No other file may hardcode
//     a Stripe API version string.
//   - All functions that need a Stripe client call getStripe(). No file
//     may call `new Stripe(...)` directly.
//   - To upgrade the API version: change STRIPE_API_VERSION here only.
// =============================================================================

import Stripe from "stripe";

export const STRIPE_API_VERSION = "2026-03-25.dahlia" as const;

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripe) return stripe;

  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");

  stripe = new Stripe(key, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  });

  return stripe;
}