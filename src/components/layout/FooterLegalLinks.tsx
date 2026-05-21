// src/components/layout/FooterLegalLinks.tsx
// =============================================================================
// FOOTER LEGAL LINKS — Drop-in legal nav for the site footer.
// =============================================================================
// Add this component inside your existing Footer.tsx:
//
//   import FooterLegalLinks from '@/components/layout/FooterLegalLinks';
//
//   // Inside the footer JSX:
//   <FooterLegalLinks />
// =============================================================================

import { Link } from 'react-router-dom';

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

type LegalLink = {
  to: string;
  label: string;
};

const LEGAL_LINKS: LegalLink[] = [
  { to: '/privacy-policy', label: 'Privacy Policy' },
  { to: '/terms-of-service', label: 'Terms of Service' },
  { to: '/mobile-order-payment-terms', label: 'Mobile Order & Payment Terms' },
  { to: '/rewards-terms', label: 'Rewards Terms' },
  { to: '/refund-policy', label: 'Refund Policy' },
];

export default function FooterLegalLinks() {
  return (
    <nav aria-label="Legal links" className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {LEGAL_LINKS.map(({ to, label }, index) => (
        <span key={to} className="inline-flex items-center gap-4">
          <Link
            to={to}
            className={cx(
              'text-[11px] font-medium leading-none',
              'text-(--color-ink-400) underline-offset-2',
              'transition-colors hover:text-(--color-ember-600) hover:underline',
              'dark:text-white/40 dark:hover:text-white/70',
              'focus:outline-none focus-visible:underline focus-visible:text-(--color-ember-600)',
              'sm:text-xs',
            )}
          >
            {label}
          </Link>
          {index < LEGAL_LINKS.length - 1 && (
            <span
              className="hidden h-0.5 w-0.5 rounded-full bg-(--color-ink-300) dark:bg-white/20 sm:inline-block"
              aria-hidden="true"
            />
          )}
        </span>
      ))}
    </nav>
  );
}