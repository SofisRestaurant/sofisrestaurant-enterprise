// supabase/functions/stripe-webhook/stripe-client.ts
// Re-exports from _shared so all stripe-webhook files use one import path.
// Do NOT add a new Stripe constructor here — use getStripe() from _shared.
export { getStripe, STRIPE_API_VERSION } from "../_shared/stripe-client.ts";