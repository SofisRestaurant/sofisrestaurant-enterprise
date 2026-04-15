// =============================================================================
// supabase/functions/finalize-order/stripe-client.ts
// =============================================================================
// Batch 4: Stripe client centralization.
// Removed local Stripe initialization. Delegates to the shared singleton.
//
// Preserves the existing getStripeOrThrow() call signature exactly:
//   returns { stripe: Stripe, apiVersion: string }
// No changes required in index.ts, order-creation.ts, or snapshot.ts.
// =============================================================================

import type Stripe from "stripe";
import { getStripe } from "../_shared/stripe-client.ts";

const STRIPE_API_VERSION = "2026-03-25.dahlia" as const;

export function getStripeOrThrow(): { stripe: Stripe; apiVersion: string } {
  return { stripe: getStripe(), apiVersion: STRIPE_API_VERSION };
}