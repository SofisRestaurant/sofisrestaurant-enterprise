// src/pages/legal/TermsOfServicePage.tsx
// =============================================================================
// TERMS OF SERVICE — Sofi's Restaurant
// =============================================================================

import { Link } from 'react-router-dom';

import LegalLayout, { LegalSection } from '@/components/legal/LegalLayout';

const LAST_UPDATED = 'May 20, 2026';

export default function TermsOfServicePage() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated={LAST_UPDATED}>
      <LegalSection title="Introduction">
        <p>
          Welcome to Sofi&apos;s Restaurant. These Terms of Service (&quot;Terms&quot;) apply to
          your use of our website at{' '}
          <a href="https://www.sofislegacy.com" target="_blank" rel="noopener noreferrer">
            sofislegacy.com
          </a>
          , our online ordering system, and any associated services. By using our website or
          placing an order, you agree to these Terms.
        </p>
      </LegalSection>

      <LegalSection title="1. Website and App Use">
        <p>
          You may use our website and ordering system for personal, non-commercial purposes —
          primarily to browse our menu, place orders, manage your account, and participate in our
          rewards program. You agree to use our services lawfully and not to interfere with or
          disrupt their operation.
        </p>
      </LegalSection>

      <LegalSection title="2. Account Responsibility">
        <p>
          If you create an account, you are responsible for keeping your login credentials secure.
          You are responsible for all activity that occurs under your account. If you believe your
          account has been compromised, please contact us immediately at{' '}
          <a href="tel:+16232480536">(623) 248-0536</a>.
        </p>
        <p>
          We reserve the right to suspend or close accounts that show signs of unauthorized use,
          fraud, or abuse.
        </p>
      </LegalSection>

      <LegalSection title="3. Menu, Pricing, and Availability">
        <p>
          Our menu items, prices, and availability are subject to change without notice. We do our
          best to keep our online menu accurate, but occasional discrepancies may occur between
          what is shown online and what is available in-store.
        </p>
        <p>
          We reserve the right to correct pricing errors, refuse orders, or limit quantities at
          our discretion.
        </p>
      </LegalSection>

      <LegalSection title="4. Promotions, Discounts, and Rewards">
        <p>
          Promotional offers, discount codes, and loyalty rewards are subject to specific terms,
          availability, and limitations. Unless otherwise stated:
        </p>
        <ul>
          <li>Promotions may have expiration dates or usage limits.</li>
          <li>Discounts and promotional codes may not be combined with other offers.</li>
          <li>We reserve the right to modify or discontinue any promotion at any time.</li>
        </ul>
        <p>
          For full details, see our{' '}
          <Link to="/rewards-terms">Rewards Terms</Link>.
        </p>
      </LegalSection>

      <LegalSection title="5. Prohibited Conduct">
        <p>You agree not to:</p>
        <ul>
          <li>Place fraudulent orders or use stolen payment methods.</li>
          <li>Abuse promotions, rewards, or referral programs.</li>
          <li>Create multiple accounts to circumvent limits or restrictions.</li>
          <li>Attempt to gain unauthorized access to our systems or data.</li>
          <li>Use automated tools to scrape, copy, or interfere with our website.</li>
          <li>Engage in any activity that could harm our business or other customers.</li>
        </ul>
        <p>
          We reserve the right to refuse service, cancel orders, or terminate accounts for
          violations of these Terms.
        </p>
      </LegalSection>

      <LegalSection title="6. Intellectual Property">
        <p>
          All content on our website — including our logo, menu descriptions, photographs, and
          page designs — is the property of Sofi&apos;s Restaurant or its licensors. You may not
          copy, reproduce, or distribute our content without written permission.
        </p>
      </LegalSection>

      <LegalSection title="7. Limitation of Liability">
        <p>
          Sofi&apos;s Restaurant is a local, family-run restaurant. We are not a technology company
          or a large corporation. While we strive to provide a reliable online ordering experience,
          things can occasionally go wrong.
        </p>
        <p>
          To the fullest extent permitted by law, Sofi&apos;s Restaurant and its owners, employees,
          and partners shall not be liable for indirect, incidental, special, or consequential
          damages arising from your use of our website or services — including but not limited to
          lost profits, data loss, or service interruptions.
        </p>
        <p>
          Our total liability for any claim related to our services shall not exceed the amount you
          paid for the specific order in question.
        </p>
      </LegalSection>

      <LegalSection title="8. Dispute Resolution">
        <p>
          We prefer to resolve disputes informally. If you have a concern, please contact us first
          at <a href="tel:+16232480536">(623) 248-0536</a> or{' '}
          <a href="mailto:info@sofislegacy.com">info@sofislegacy.com</a>. Most issues — including
          order problems, billing questions, and account concerns — can be resolved quickly through
          direct communication.
        </p>
        <p>
          These Terms are governed by the laws of the State of Arizona without regard to conflict
          of law principles.
        </p>
      </LegalSection>

      <LegalSection title="9. Changes to These Terms">
        <p>
          We may update these Terms from time to time. When we make changes, we will update the
          &quot;Last updated&quot; date above. Continued use of our services after changes are
          posted constitutes acceptance of the updated Terms.
        </p>
      </LegalSection>

      <LegalSection title="10. Contact Us">
        <p>
          Questions about these Terms? Reach out:
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