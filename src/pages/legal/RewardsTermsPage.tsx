// src/pages/legal/RewardsTermsPage.tsx
// =============================================================================
// REWARDS TERMS — Sofi's Restaurant
// =============================================================================

import { Link } from 'react-router-dom';

import LegalLayout, { LegalSection } from '@/components/legal/LegalLayout';

const LAST_UPDATED = 'May 20, 2026';

export default function RewardsTermsPage() {
  return (
    <LegalLayout title="Rewards Program Terms" lastUpdated={LAST_UPDATED}>
      <LegalSection title="Overview">
        <p>
          Sofi&apos;s Restaurant&apos;s rewards program lets you earn points on qualifying orders
          and redeem them for discounts. These terms govern your participation in the program.
          By using our rewards program, you agree to these terms and our{' '}
          <Link to="/terms-of-service">Terms of Service</Link>.
        </p>
      </LegalSection>

      <LegalSection title="1. No Cash Value">
        <p>
          Points, credits, rewards, and any earned benefits have no cash value and cannot be
          exchanged for cash, transferred to another person, or sold. They can only be redeemed
          through our online ordering system or as otherwise specified by Sofi&apos;s Restaurant.
        </p>
      </LegalSection>

      <LegalSection title="2. Account-Based Rewards">
        <p>
          Rewards are tied to your Sofi&apos;s Restaurant account. You must be signed in to earn
          and redeem points. Guest checkout orders (without an account) do not earn rewards.
        </p>
        <p>
          Each customer may maintain one rewards account. Creating multiple accounts to accumulate
          additional rewards is not permitted and may result in account suspension.
        </p>
      </LegalSection>

      <LegalSection title="3. Earning Points">
        <p>
          You earn points on qualifying orders placed through our online ordering system. The
          number of points earned is determined by the order total after applicable discounts and
          before taxes and fees.
        </p>
        <p>
          Points are credited to your account after your order is completed and payment is
          confirmed. Points are not earned on promotional or discounted portions of orders unless
          otherwise stated.
        </p>
      </LegalSection>

      <LegalSection title="4. Redeeming Points">
        <p>
          You can redeem earned points for discounts on future orders. Redemption options and
          point values are displayed in your account and at checkout.
        </p>
        <p>
          There may be limits on how many points you can redeem per order or per day. These
          limits are designed to ensure fair use and are displayed at the time of redemption.
        </p>
      </LegalSection>

      <LegalSection title="5. Combining Discounts">
        <p>
          Rewards redemptions generally cannot be combined with promotional codes or other
          discount offers on the same order. If a conflict exists between a rewards discount and
          a promotional code, only one will apply.
        </p>
        <p>
          Specific promotions may have their own rules about combining with rewards — check the
          terms of each promotion.
        </p>
      </LegalSection>

      <LegalSection title="6. Expiration">
        <p>
          Unless otherwise stated, earned points do not expire. However, we reserve the right to
          introduce expiration policies in the future with reasonable notice. If expiration rules
          are added, we will notify you through your account or via email before any points expire.
        </p>
      </LegalSection>

      <LegalSection title="7. Program Changes">
        <p>
          Sofi&apos;s Restaurant reserves the right to modify, pause, or discontinue the rewards
          program at any time, with or without notice. This includes changes to:
        </p>
        <ul>
          <li>Point earning rates.</li>
          <li>Redemption values and options.</li>
          <li>Eligibility requirements.</li>
          <li>Daily or per-order limits.</li>
          <li>The program itself.</li>
        </ul>
        <p>
          If the program is discontinued, we will make reasonable efforts to allow you to use any
          earned points before the program ends.
        </p>
      </LegalSection>

      <LegalSection title="8. Fraud and Abuse">
        <p>
          Any attempt to abuse, manipulate, or defraud the rewards program may result in:
        </p>
        <ul>
          <li>Forfeiture of earned points and rewards.</li>
          <li>Suspension or termination of your account.</li>
          <li>Cancellation of orders placed using fraudulently obtained rewards.</li>
        </ul>
        <p>
          Examples of abuse include creating duplicate accounts, exploiting technical errors to
          earn unintended points, or sharing account credentials for the purpose of accumulating
          rewards.
        </p>
      </LegalSection>

      <LegalSection title="9. Account Closure">
        <p>
          If you close your account or if your account is terminated for any reason, any unused
          points and rewards will be forfeited. We are not responsible for notifying you of points
          balances upon account closure.
        </p>
      </LegalSection>

      <LegalSection title="10. Contact Us">
        <p>
          Questions about the rewards program or your points balance? Contact us:
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