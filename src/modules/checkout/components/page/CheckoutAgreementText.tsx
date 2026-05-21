// src/components/checkout/CheckoutAgreementText.tsx
// =============================================================================
// CHECKOUT AGREEMENT TEXT — Legal disclosure near the place-order button.
// =============================================================================
// Links to all legal pages. Guest-aware: adds email/receipt disclosure
// when isGuest is true. Matches the app's premium warm aesthetic.
// =============================================================================

import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

interface CheckoutAgreementTextProps {
  isGuest: boolean;
}

export function CheckoutAgreementText({ isGuest }: CheckoutAgreementTextProps) {
  return (
    <div
      className={cx(
        'relative overflow-hidden rounded-2xl',
        'border border-cream-200/60 bg-linear-to-br from-cream-50/80 via-white to-gold-50/30',
        'px-4 py-3.5',
        'shadow-[0_2px_12px_rgba(46,24,12,0.04)]',
        'dark:border-white/8 dark:from-white/2.5 dark:via-white/1.5 dark:to-gold-500/2',
        'dark:shadow-[0_2px_12px_rgba(0,0,0,0.2)]',
      )}
    >
      {/* Decorative top edge highlight */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-gold-300/50 to-transparent dark:via-gold-400/15"
        aria-hidden="true"
      />

      <div className="flex gap-3">
        {/* Trust icon */}
        <div className="mt-0.5 flex shrink-0">
          <span
            className={cx(
              'flex h-7 w-7 items-center justify-center rounded-lg',
              'bg-linear-to-br from-emerald-50 to-emerald-100/60',
              'ring-1 ring-emerald-200/50',
              'dark:from-emerald-500/15 dark:to-emerald-500/5',
              'dark:ring-emerald-400/20',
            )}
          >
            <ShieldCheck
              className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
              strokeWidth={2.4}
            />
          </span>
        </div>

        {/* Agreement copy */}
        <div className="min-w-0 flex-1">
          <p
            className={cx(
              'text-[11px] leading-[1.6] tracking-[-0.005em]',
              'text-ink-500 dark:text-white/50',
              'sm:text-xs sm:leading-base',
            )}
          >
            By placing your order, you agree to Sofi&apos;s Restaurant&apos;s{' '}
            <PolicyLink to="/mobile-order-payment-terms">
              Mobile Order &amp; Payment Terms
            </PolicyLink>
            , <PolicyLink to="/terms-of-service">Terms of Service</PolicyLink>, and{' '}
            <PolicyLink to="/privacy-policy">Privacy Policy</PolicyLink>. Rewards, discounts, and
            account credits are subject to our{' '}
            <PolicyLink to="/rewards-terms">Rewards Terms</PolicyLink>. No changes can be made after
            the order is placed.
          </p>

          {isGuest && (
            <p
              className={cx(
                'mt-1.5 text-[10.5px] leading-base',
                'text-ink-400 dark:text-white/35',
                'sm:text-[11px]',
              )}
            >
              If you provide an email, we&apos;ll use it for your receipt and to offer optional
              rewards enrollment. See our{' '}
              <PolicyLink to="/privacy-policy" subtle>
                Privacy Policy
              </PolicyLink>{' '}
              for details.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Internal link component ──────────────────────────────────────────────────

function PolicyLink({
  to,
  children,
  subtle = false,
}: {
  to: string;
  children: React.ReactNode;
  subtle?: boolean;
}) {
  return (
    <Link
      to={to}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(
        'inline font-semibold underline decoration-dotted underline-offset-[3px]',
        'transition-colors duration-150',
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-gold-400/60 focus-visible:rounded-sm',
        subtle
          ? 'text-ink-400 decoration-ink-300/50 hover:text-ember-600 hover:decoration-ember-400/40 dark:text-white/40 dark:decoration-white/20 dark:hover:text-ember-300'
          : 'text-ink-600 decoration-ink-300/60 hover:text-ember-600 hover:decoration-ember-400/50 dark:text-white/55 dark:decoration-white/25 dark:hover:text-ember-300',
      )}
    >
      {children}
    </Link>
  );
}

export default CheckoutAgreementText;
