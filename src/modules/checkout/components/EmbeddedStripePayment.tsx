// src/modules/checkout/components/EmbeddedStripePayment.tsx
// =============================================================================
// Stripe Embedded Checkout surface.
//
// Mounted by CheckoutPage when the server returns a clientSecret.
// Security:
// - publishable key only
// - no order finalization here
// - webhook remains the source of truth
// =============================================================================

import { memo, useMemo } from 'react';
import { loadStripe, type Stripe as StripeJs } from '@stripe/stripe-js';
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from '@stripe/react-stripe-js';

interface EmbeddedStripePaymentProps {
  clientSecret: string;
}

function readStripePublishableKey(): string | null {
  const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
  const publicKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY;

  if (typeof publishableKey === 'string' && publishableKey.trim().length > 0) {
    return publishableKey.trim();
  }

  if (typeof publicKey === 'string' && publicKey.trim().length > 0) {
    return publicKey.trim();
  }

  return null;
}

const PUBLISHABLE_KEY = readStripePublishableKey();

function EmbeddedStripePaymentImpl({ clientSecret }: EmbeddedStripePaymentProps) {
  const stripePromise = useMemo<Promise<StripeJs | null> | null>(() => {
    if (!PUBLISHABLE_KEY) return null;
    return loadStripe(PUBLISHABLE_KEY);
  }, []);

  if (!clientSecret || clientSecret.trim().length === 0) {
    return null;
  }

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

  return (
    <div
      className="w-full overflow-hidden rounded-2xl border border-(--color-cream-200) bg-white"
      data-checkout-surface="embedded"
    >
      <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}

export default memo(EmbeddedStripePaymentImpl);
export { EmbeddedStripePaymentImpl as EmbeddedStripePayment };