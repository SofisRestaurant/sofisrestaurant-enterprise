import Stripe from "stripe";

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripe) return stripe;

  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");

  stripe = new Stripe(key, {
    apiVersion: "2026-03-25.dahlia", 
    httpClient: Stripe.createFetchHttpClient(), 
  });

  return stripe;
}
