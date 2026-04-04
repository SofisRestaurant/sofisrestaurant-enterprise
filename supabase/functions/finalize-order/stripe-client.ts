// =============================================================================
// supabase/functions/finalize-order/stripe-client.ts
// =============================================================================

import Stripe from 'stripe';
import { DEFAULT_STRIPE_API_VERSION } from './config.ts';

function mustEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function isValidStripeApiVersion(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(\.[a-zA-Z0-9_-]+)?$/.test(value);
}

const STRIPE_SECRET_KEY = mustEnv('STRIPE_SECRET_KEY');
const ENV_STRIPE_API_VERSION = (Deno.env.get('STRIPE_API_VERSION') ?? '').trim();
const STRIPE_API_VERSION = (
  isValidStripeApiVersion(ENV_STRIPE_API_VERSION)
    ? ENV_STRIPE_API_VERSION
    : DEFAULT_STRIPE_API_VERSION
) as Stripe.LatestApiVersion;

let stripeSingleton: Stripe | null = null;

export function getStripeOrThrow(): { stripe: Stripe; apiVersion: string } {
  if (stripeSingleton) return { stripe: stripeSingleton, apiVersion: STRIPE_API_VERSION };

  stripeSingleton = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  });

  return { stripe: stripeSingleton, apiVersion: STRIPE_API_VERSION };
}