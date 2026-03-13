import Stripe from "stripe";
import { mustEnv, STRIPE_API_VERSION } from "./env.ts";

let stripeSingleton: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripeSingleton) {
    return stripeSingleton;
  }

  stripeSingleton = new Stripe(mustEnv("STRIPE_SECRET_KEY"), {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  });

  return stripeSingleton;
}
