// src/modules/checkout/components/EmbeddedStripePayment.tsx
// =============================================================================
// Stripe Embedded Checkout surface.
//
// Mounted by CheckoutPage when the server returns a clientSecret (ui_mode
// = embedded). On successful payment, Stripe redirects the embed to the
// session's return_url (which we set to /order-success?session_id=...).
//
// Security:
//   - publishable key only (NEVER the secret key)
//   - no order finalization here — the webhook is the source of truth
//   - no totals or amounts read from the client
//
// Loading state:
//   - loadStripe() is called once via useMemo to avoid recreating the
//     promise on re-render
//   - the EmbeddedCheckoutProvider handles its own internal loading UI
// =============================================================================

import { memo, useMemo } from 'react';
import { loadStripe, type Stripe as StripeJs } from '@stripe/stripe-js';
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from '@stripe/react-stripe-js';

interface EmbeddedStripePaymentProps {
  /** Client secret returned by create-checkout when ui_mode === 'embedded'. */
  clientSecret: string;
}

const PUBLISHABLE_KEY: string | undefined =
  typeof import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY === 'string'
    ? import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
    : undefined;

function EmbeddedStripePaymentImpl({ clientSecret }: EmbeddedStripePaymentProps) {
  // useMemo with an empty dep array gives us a single Stripe.js load per mount.
  const stripePromise = useMemo<Promise<StripeJs | null> | null>(() => {
    if (!PUBLISHABLE_KEY || PUBLISHABLE_KEY.length === 0) return null;
    return loadStripe(PUBLISHABLE_KEY);
  }, []);

  if (stripePromise === null) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
      >
        Stripe is not configured. Please contact support.
      </div>
    );
  }

  if (!clientSecret || clientSecret.length === 0) {
    return null;
  }

  return (
    <div
      className="w-full overflow-hidden rounded-2xl border border-(--color-cream-200) bg-white"
      data-checkout-surface="embedded"
    >
      <EmbeddedCheckoutProvider
        stripe={stripePromise}
        options={{ clientSecret }}
      >
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}

export default memo(EmbeddedStripePaymentImpl);
export { EmbeddedStripePaymentImpl as EmbeddedStripePayment };