// src/components/checkout/CheckoutAgreement.tsx
// =============================================================================
// CHECKOUT AGREEMENT — Legal agreement text near the payment/place order button.
// =============================================================================
// Displays: "By placing your order, you agree to Sofi's Restaurant's
// Mobile Order and Payment Terms, Terms of Service, and Privacy Policy.
// Rewards, discounts, and account credits are subject to our Rewards Terms."
//
// Usage:
//   <CheckoutAgreement />
//
// Place this component directly above or below the final checkout/payment
// button in the checkout flow.
// =============================================================================

import { Link } from 'react-router-dom';

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

const linkClass = cx(
  'font-semibold underline underline-offset-2',
  'text-(--color-ink-600) hover:text-(--color-ember-700)',
  'dark:text-white/70 dark:hover:text-white',
  'transition-colors',
);

export function CheckoutAgreement() {
  return (
    <p
      className={cx(
        'text-[11px] leading-relaxed',
        'text-(--color-ink-400) dark:text-white/40',
        'sm:text-xs',
      )}
    >
      By placing your order, you agree to Sofi&apos;s Restaurant&apos;s{' '}
      <Link to="/mobile-order-payment-terms" className={linkClass}>
        Mobile Order &amp; Payment Terms
      </Link>
      ,{' '}
      <Link to="/terms-of-service" className={linkClass}>
        Terms of Service
      </Link>
      , and{' '}
      <Link to="/privacy-policy" className={linkClass}>
        Privacy Policy
      </Link>
      . Rewards, discounts, and account credits are subject to our{' '}
      <Link to="/rewards-terms" className={linkClass}>
        Rewards Terms
      </Link>
      .
    </p>
  );
}

export default CheckoutAgreement;