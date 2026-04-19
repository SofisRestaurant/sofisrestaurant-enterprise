// supabase/functions/finalize-order/stripe-client.ts
// =============================================================================
// Delegates to the shared Stripe singleton. No local Stripe constructor.
// Preserves the getStripeOrThrow() call signature expected by callers:
//   returns { stripe: Stripe, apiVersion: string }
// =============================================================================

import type Stripe from "stripe";
import { getStripe, STRIPE_API_VERSION } from "../_shared/stripe-client.ts";

export function getStripeOrThrow(): { stripe: Stripe; apiVersion: string } {
  return { stripe: getStripe(), apiVersion: STRIPE_API_VERSION };
}