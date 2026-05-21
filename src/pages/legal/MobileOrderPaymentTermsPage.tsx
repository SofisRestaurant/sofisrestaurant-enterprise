// src/pages/legal/MobileOrderPaymentTermsPage.tsx
// =============================================================================
// MOBILE ORDER AND PAYMENT TERMS — Sofi's Restaurant
// =============================================================================

import { Link } from 'react-router-dom';

import LegalLayout, { LegalSection } from '@/components/legal/LegalLayout';

const LAST_UPDATED = 'May 20, 2026';

export default function MobileOrderPaymentTermsPage() {
  return (
    <LegalLayout title="Mobile Order &amp; Payment Terms" lastUpdated={LAST_UPDATED}>
      <LegalSection title="Overview">
        <p>
          These terms apply when you place an order through Sofi&apos;s Restaurant&apos;s online
          ordering system. By submitting an order, you agree to the following terms in addition to
          our{' '}
          <Link to="/terms-of-service">Terms of Service</Link> and{' '}
          <Link to="/privacy-policy">Privacy Policy</Link>.
        </p>
      </LegalSection>

      <LegalSection title="1. Placing an Order">
        <p>
          When you place an order online, you are making a request to purchase menu items for
          pickup. Before submitting your order, you should:
        </p>
        <ul>
          <li>Review all items, quantities, and special instructions for accuracy.</li>
          <li>Verify your contact information (phone number and/or email) is correct.</li>
          <li>Select your preferred pickup timing.</li>
          <li>Review the total including applicable taxes and fees.</li>
        </ul>
        <p>
          Once submitted and payment is processed, your order is considered placed. Changing or
          canceling an order may not be possible once the kitchen has begun preparing it.
        </p>
      </LegalSection>

      <LegalSection title="2. Store Hours and Kitchen Availability">
        <p>
          Online ordering is available only during our regular business hours when the kitchen is
          open and accepting orders. Orders cannot be placed when:
        </p>
        <ul>
          <li>The kitchen is closed or outside of operating hours.</li>
          <li>The restaurant is temporarily closed for holidays, maintenance, or emergencies.</li>
        </ul>
        <p>
          Our kitchen hours are displayed on the website. We recommend checking availability before
          planning your order.
        </p>
      </LegalSection>

      <LegalSection title="3. Item Availability">
        <p>
          While we do our best to keep our online menu up to date, items may occasionally become
          unavailable due to:
        </p>
        <ul>
          <li>Ingredients running out during the day.</li>
          <li>Seasonal menu changes.</li>
          <li>Technical issues with our menu system.</li>
        </ul>
        <p>
          If an item in your order is unavailable after you&apos;ve placed it, we will contact you
          to offer a substitution or adjustment. Order confirmation does not guarantee availability
          if a technical or menu issue occurs after submission.
        </p>
      </LegalSection>

      <LegalSection title="4. Pricing, Taxes, and Fees">
        <p>
          All prices are displayed in US dollars. Applicable sales tax is calculated and shown at
          checkout before you submit your order. The total you see at checkout — including taxes
          and any applicable fees — is the amount that will be charged to your payment method.
        </p>
        <p>
          We reserve the right to correct pricing errors. If a significant price discrepancy is
          discovered after your order is placed, we will contact you before processing.
        </p>
      </LegalSection>

      <LegalSection title="5. Payment Processing">
        <p>
          All payments are processed securely through <strong>Stripe</strong>. We accept major
          credit and debit cards. Your payment information is handled entirely by Stripe and is
          never stored on our servers.
        </p>
        <p>
          Payment is collected at the time your order is submitted. Your order will not be sent to
          the kitchen until payment is successfully processed.
        </p>
        <p>
          If payment fails for any reason — declined card, insufficient funds, network issues — 
          your order will not be placed and no charge will appear on your account.
        </p>
      </LegalSection>

      <LegalSection title="6. Order Confirmation">
        <p>
          After successful payment, you will receive an order confirmation with your order details
          and estimated pickup time. This confirmation means your order has been received and
          payment has been collected.
        </p>
        <p>
          Please keep your order confirmation for reference when picking up your order.
        </p>
      </LegalSection>

      <LegalSection title="7. Pickup">
        <p>
          You (or the person picking up on your behalf) are responsible for collecting your order
          at the designated pickup time. We prepare orders fresh, so arriving close to your
          estimated pickup time helps ensure the best food quality.
        </p>
        <p>
          If you are running late, please contact us at{' '}
          <a href="tel:+16232480536">(623) 248-0536</a> so we can coordinate.
        </p>
      </LegalSection>

      <LegalSection title="8. Contact Information">
        <p>
          You must provide a valid phone number and/or email address when placing an order. This
          allows us to:
        </p>
        <ul>
          <li>Send order confirmations and status updates.</li>
          <li>Contact you about item availability or order issues.</li>
          <li>Reach you for pickup coordination.</li>
        </ul>
        <p>
          Orders placed with invalid or unreachable contact information may be delayed or canceled.
        </p>
      </LegalSection>

      <LegalSection title="9. Refunds and Cancellations">
        <p>
          Because food orders are time-sensitive and prepared fresh, our refund and cancellation
          policy is handled on a case-by-case basis. For full details, see our{' '}
          <Link to="/refund-policy">Refund Policy</Link>.
        </p>
        <p>
          If you experience an issue with your order — missing items, incorrect items, or billing
          errors — please contact us as soon as possible.
        </p>
      </LegalSection>

      <LegalSection title="10. SMS Order Updates">
        <p>
          If you opt in to receive SMS order updates, you may receive text messages about your
          order status. Standard messaging rates from your carrier may apply. You can opt out of
          SMS notifications at any time by replying STOP.
        </p>
        <p>
          SMS opt-in is not required to place an order.
        </p>
      </LegalSection>

      <LegalSection title="11. Contact Us">
        <p>
          For questions about these Mobile Order and Payment Terms:
        </p>
        <ul>
          <li>
            <strong>Phone:</strong> <a href="tel:+16232480536">(623) 248-0536</a>
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