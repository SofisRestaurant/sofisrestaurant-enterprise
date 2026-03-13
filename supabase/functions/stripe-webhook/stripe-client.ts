import Stripe from "stripe";
import { DEFAULT_STRIPE_API_VERSION, mustEnv, optEnv } from "./env.ts";

function isValidApiVersion(value: string): boolean {
  return /^2026-\d{2}-\d{2}(\.[a-zA-Z0-9_-]+)?$/.test(value);
}

function resolveStripeApiVersion(): Stripe.LatestApiVersion {
  const envValue = optEnv("STRIPE_API_VERSION");
  const candidate = envValue !== null && isValidApiVersion(envValue)
    ? envValue
    : DEFAULT_STRIPE_API_VERSION;

  return candidate as Stripe.LatestApiVersion;
}

export const STRIPE_API_VERSION = resolveStripeApiVersion();

let stripeSingleton: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripeSingleton !== null) {
    return stripeSingleton;
  }

  stripeSingleton = new Stripe(mustEnv("STRIPE_SECRET_KEY"), {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  });

  return stripeSingleton;
}
