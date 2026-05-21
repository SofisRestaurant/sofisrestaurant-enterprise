// src/pages/legal/RefundPolicyPage.tsx
// =============================================================================
// REFUND POLICY — Sofi's Restaurant
// =============================================================================

import LegalLayout, { LegalSection } from '@/components/legal/LegalLayout';

const LAST_UPDATED = 'May 20, 2026';

export default function RefundPolicyPage() {
  return (
    <LegalLayout title="Refund Policy" lastUpdated={LAST_UPDATED}>
      <LegalSection title="Overview">
        <p>
          At Sofi&apos;s Restaurant, we want every order to be right. Because food orders are
          time-sensitive and prepared fresh, our refund policy is handled on a case-by-case basis
          rather than as a blanket guarantee. We are committed to resolving issues fairly and
          quickly.
        </p>
      </LegalSection>

      <LegalSection title="1. Reporting an Issue">
        <p>
          If something is wrong with your order — missing items, incorrect items, food quality
          concerns, or any other issue — please contact us as soon as possible. The sooner you
          reach out, the better we can help.
        </p>
        <p>
          When contacting us, please have the following ready:
        </p>
        <ul>
          <li>Your order confirmation number or email.</li>
          <li>The date and time of your order.</li>
          <li>A description of the issue (what was missing, wrong, or concerning).</li>
          <li>Photos, if applicable (especially for food quality concerns).</li>
        </ul>
      </LegalSection>

      <LegalSection title="2. Missing or Incorrect Items">
        <p>
          If your order is missing items or contains incorrect items, we will work with you to
          make it right. Depending on the situation, we may:
        </p>
        <ul>
          <li>Prepare and provide the missing or correct items for immediate pickup.</li>
          <li>Issue a refund or credit for the affected items.</li>
          <li>Apply a credit to your rewards account for a future order.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Duplicate Charges and Payment Errors">
        <p>
          If you believe you were charged twice for the same order or see an unexpected charge,
          please contact us. We will review the transaction with our payment processor (Stripe)
          and resolve any billing error promptly.
        </p>
      </LegalSection>

      <LegalSection title="4. Cancellations">
        <p>
          Once an order is placed and payment is processed, cancellation may not be possible —
          especially if the kitchen has already started preparing your food. If you need to cancel,
          contact us immediately. We will do our best to accommodate your request, but refunds for
          canceled orders that are already in preparation are not guaranteed.
        </p>
      </LegalSection>

      <LegalSection title="5. Refund Timing">
        <p>
          When a refund is approved, the timeline depends on your payment method and card issuer:
        </p>
        <ul>
          <li>
            <strong>Credit cards:</strong> refunds typically appear within 5–10 business days.
          </li>
          <li>
            <strong>Debit cards:</strong> refunds may take up to 10 business days.
          </li>
          <li>
            <strong>Other payment methods:</strong> timing varies by provider.
          </li>
        </ul>
        <p>
          Refunds are processed through Stripe back to the original payment method used at
          checkout. We cannot issue refunds to a different card or payment method than the one used
          for the original transaction.
        </p>
      </LegalSection>

      <LegalSection title="6. Situations Not Eligible for Refund">
        <p>
          While we review each case individually, refunds are generally not issued for:
        </p>
        <ul>
          <li>Change of mind after the order has been prepared.</li>
          <li>
            Dissatisfaction with a correctly prepared item that matches the menu description.
          </li>
          <li>Orders picked up late that have affected food temperature or quality.</li>
          <li>Issues reported long after the order was picked up (we ask that you report issues
            within a few hours of pickup).</li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Our Commitment">
        <p>
          We are a family-run restaurant and we take pride in our food and service. If we made a
          mistake, we will make it right. Our goal is to ensure you have a great experience every
          time you order from us. Do not hesitate to reach out — we are here to help.
        </p>
      </LegalSection>

      <LegalSection title="8. Contact Us">
        <p>
          To report an order issue or request a refund:
        </p>
        <ul>
          <li>
            <strong>Phone:</strong>{' '}
            <a href="tel:+16232480536">(623) 248-0536</a> (fastest for urgent issues)
          </li>
          <li>
            <strong>Email:</strong>{' '}
            <a href="mailto:info@sofislegacy.com">info@sofislegacy.com</a>
          </li>
          <li>
            <strong>Address:</strong> 12851 W Bell Rd Unit #120, Surprise, AZ 85378
          </li>
        </ul>
      </LegalSection>
    </LegalLayout>
  );
}
