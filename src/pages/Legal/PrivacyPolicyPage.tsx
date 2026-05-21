// src/pages/legal/PrivacyPolicyPage.tsx
// =============================================================================
// PRIVACY POLICY — Sofi's Restaurant
// =============================================================================

import LegalLayout, { LegalSection } from '@/components/legal/LegalLayout';

const LAST_UPDATED = 'May 20, 2026';

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated={LAST_UPDATED}>
      <LegalSection title="Introduction">
        <p>
          Sofi&apos;s Restaurant (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) respects
          your privacy. This policy explains what information we collect when you visit our website,
          place online orders, create an account, or participate in our rewards program — and how we
          use and protect that information.
        </p>
        <p>
          By using our website at{' '}
          <a href="https://www.sofislegacy.com" target="_blank" rel="noopener noreferrer">
            sofislegacy.com
          </a>{' '}
          or placing an order through our online ordering system, you agree to the practices
          described here.
        </p>
      </LegalSection>

      <LegalSection title="1. Information We Collect">
        <p>We may collect the following types of information:</p>
        <ul>
          <li>
            <strong>Contact information:</strong> your name, email address, and phone number when
            you place an order, create an account, or contact us.
          </li>
          <li>
            <strong>Order details:</strong> items ordered, order preferences, special instructions,
            pickup timing, and order history.
          </li>
          <li>
            <strong>Account and rewards data:</strong> loyalty points balance, reward redemptions,
            account preferences, and promotional code usage.
          </li>
          <li>
            <strong>Device and browser information:</strong> IP address, browser type, device type,
            operating system, and general location data (city/region level) collected automatically
            when you visit our site.
          </li>
          <li>
            <strong>Analytics data:</strong> pages visited, time spent, click patterns, and
            referral sources to help us improve our website and service.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="2. Payment Information">
        <p>
          All payments are processed securely by <strong>Stripe</strong>, our third-party payment
          processor. We do not store your credit card number, CVV, or full payment card details on
          our servers. Stripe handles payment data in accordance with PCI-DSS security standards.
        </p>
        <p>
          For more information on how Stripe handles your data, visit{' '}
          <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">
            Stripe&apos;s Privacy Policy
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="3. How We Use Your Information">
        <p>We use the information we collect to:</p>
        <ul>
          <li>Process and fulfill your orders.</li>
          <li>Send order confirmations, status updates, and receipts.</li>
          <li>Manage your account and loyalty rewards.</li>
          <li>Provide customer support and resolve issues.</li>
          <li>Prevent fraud and protect against unauthorized transactions.</li>
          <li>Improve our menu, website, and ordering experience.</li>
          <li>
            Send marketing communications (only if you have opted in — see below).
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Marketing Communications">
        <p>
          We may send you promotional emails or SMS messages about specials, new menu items, and
          exclusive offers — but only if you have opted in. You can opt out at any time by:
        </p>
        <ul>
          <li>Clicking the &quot;unsubscribe&quot; link in any marketing email.</li>
          <li>Replying STOP to any marketing text message.</li>
          <li>
            Contacting us directly at{' '}
            <a href="tel:+16232480536">(623) 248-0536</a> or{' '}
            <a href="mailto:info@sofislegacy.com">info@sofislegacy.com</a>.
          </li>
        </ul>
        <p>
          Opting out of marketing will not affect transactional messages related to your orders.
        </p>
      </LegalSection>

      <LegalSection title="5. Third-Party Services">
        <p>
          We use trusted third-party services to operate our website and process orders. These
          services may receive limited data as needed to perform their functions:
        </p>
        <ul>
          <li>
            <strong>Stripe</strong> — payment processing.
          </li>
          <li>
            <strong>Supabase</strong> — database and authentication services.
          </li>
          <li>
            <strong>Klaviyo</strong> — email and SMS marketing (only for opted-in customers).
          </li>
          <li>
            <strong>Google Analytics</strong> — website usage analytics.
          </li>
          <li>
            <strong>Meta (Facebook/Instagram) and TikTok</strong> — advertising measurement and
            conversion tracking, if applicable.
          </li>
        </ul>
        <p>
          We do not sell your personal information to third parties.
        </p>
      </LegalSection>

      <LegalSection title="6. Cookies and Tracking">
        <p>
          Our website uses cookies and similar technologies to remember your preferences, keep you
          signed in, and understand how visitors use our site. You can control cookie settings
          through your browser, though disabling cookies may affect some website features.
        </p>
      </LegalSection>

      <LegalSection title="7. Data Security">
        <p>
          We take reasonable steps to protect your information using industry-standard security
          measures including encrypted connections (HTTPS), secure authentication, and access
          controls. However, no method of transmission or storage is 100% secure, and we cannot
          guarantee absolute security.
        </p>
      </LegalSection>

      <LegalSection title="8. Children's Privacy">
        <p>
          Our services are not directed to children under 13. We do not knowingly collect personal
          information from children. If you believe a child has provided us with personal
          information, please contact us so we can remove it.
        </p>
      </LegalSection>

      <LegalSection title="9. Changes to This Policy">
        <p>
          We may update this Privacy Policy from time to time. When we do, we will update the
          &quot;Last updated&quot; date at the top of this page. We encourage you to review this
          policy periodically.
        </p>
      </LegalSection>

      <LegalSection title="10. Contact Us">
        <p>
          If you have questions about this Privacy Policy or your personal data, contact us:
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