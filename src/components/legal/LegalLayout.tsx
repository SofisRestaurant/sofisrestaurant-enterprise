// src/components/legal/LegalLayout.tsx
// =============================================================================
// LEGAL LAYOUT — Reusable wrapper for all legal/policy pages.
// =============================================================================
// Provides: page title, last-updated date, clean readable sections,
// mobile-friendly spacing, consistent app styling, and nav links back
// to Contact, Menu, and Checkout.
// =============================================================================

import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, Mail, MapPin, Phone, UtensilsCrossed } from 'lucide-react';

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export interface LegalSectionProps {
  /** Section heading (e.g. "1. Information We Collect") */
  title: string;
  children: ReactNode;
}

export function LegalSection({ title, children }: LegalSectionProps) {
  return (
    <section className="mb-8 last:mb-0">
      <h2
        className={cx(
          'mb-3 text-lg font-bold leading-snug tracking-tight',
          'text-(--color-ink-900) dark:text-white',
          'sm:text-xl',
        )}
      >
        {title}
      </h2>
      <div
        className={cx(
          'space-y-3 text-[0.94rem] leading-relaxed',
          'text-(--color-ink-600) dark:text-white/70',
          '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5',
          '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1.5',
          '[&_li]:text-[0.92rem] [&_li]:leading-relaxed',
          '[&_strong]:font-semibold [&_strong]:text-(--color-ink-800) [&_strong]:dark:text-white/85',
          '[&_a]:text-(--color-ember-600) [&_a]:underline [&_a]:underline-offset-2',
          '[&_a:hover]:text-(--color-ember-700) [&_a]:dark:text-(--color-ember-300)',
        )}
      >
        {children}
      </div>
    </section>
  );
}

export interface LegalLayoutProps {
  /** Page title displayed as h1 */
  title: string;
  /** ISO date string or readable date (e.g. "May 20, 2026") */
  lastUpdated: string;
  children: ReactNode;
}

export default function LegalLayout({ title, lastUpdated, children }: LegalLayoutProps) {
  return (
    <main
      id="main-content"
      className={cx(
        'min-h-screen',
        'bg-gradient-to-b from-cream-50/60 via-white to-white',
        'dark:from-(--color-ink-950) dark:via-(--color-ink-950) dark:to-(--color-ink-950)',
      )}
    >
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12 lg:px-8">
        {/* ── Back link ──────────────────────────────────────────────────── */}
        <Link
          to="/"
          className={cx(
            'mb-6 inline-flex items-center gap-1.5 rounded-full',
            'px-3 py-1.5 text-xs font-bold',
            'text-(--color-ink-500) transition-colors',
            'hover:bg-cream-100 hover:text-(--color-ember-700)',
            'dark:text-white/50 dark:hover:bg-white/8 dark:hover:text-white',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)',
          )}
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.4} />
          Back to Home
        </Link>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="mb-10">
          <div className="mb-3 flex items-center gap-2">
            <span
              className={cx(
                'flex h-8 w-8 items-center justify-center rounded-xl',
                'bg-(--color-ember-50) dark:bg-(--color-ember-500)/15',
              )}
            >
              <FileText
                className="h-4 w-4 text-(--color-ember-600) dark:text-(--color-ember-300)"
                strokeWidth={2.2}
              />
            </span>
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-(--color-ink-400) dark:text-white/40">
              Legal
            </span>
          </div>

          <h1
            className={cx(
              'text-2xl font-black leading-tight tracking-tight',
              'text-(--color-ink-950) dark:text-white',
              'sm:text-3xl',
            )}
          >
            {title}
          </h1>

          <p className="mt-2 text-sm font-medium text-(--color-ink-400) dark:text-white/45">
            Last updated: {lastUpdated}
          </p>

          <div
            className="mt-5 h-px bg-gradient-to-r from-cream-300/80 via-gold-200/50 to-transparent dark:from-white/10 dark:via-white/5 dark:to-transparent"
            aria-hidden="true"
          />
        </header>

        {/* ── Content ────────────────────────────────────────────────────── */}
        <article className="mb-16">{children}</article>

        {/* ── Footer nav + contact ───────────────────────────────────────── */}
        <footer
          className={cx(
            'rounded-2xl border border-cream-200/70 bg-white/80 p-5',
            'shadow-[0_4px_16px_rgba(46,24,12,0.04)]',
            'dark:border-white/8 dark:bg-white/[0.03]',
            'sm:p-6',
          )}
        >
          <h3 className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-(--color-ink-400) dark:text-white/40">
            Questions?
          </h3>

          <div className="mb-5 space-y-2">
            <div className="flex items-center gap-2 text-sm text-(--color-ink-600) dark:text-white/65">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-(--color-ember-500)" strokeWidth={2.2} />
              <span>12851 W Bell Rd Unit #120, Surprise, AZ 85378</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-(--color-ink-600) dark:text-white/65">
              <Phone className="h-3.5 w-3.5 shrink-0 text-(--color-ember-500)" strokeWidth={2.2} />
              <a href="tel:+16232480536" className="underline-offset-2 hover:underline">
                (623) 248-0536
              </a>
            </div>
            <div className="flex items-center gap-2 text-sm text-(--color-ink-600) dark:text-white/65">
              <Mail className="h-3.5 w-3.5 shrink-0 text-(--color-ember-500)" strokeWidth={2.2} />
              <a href="mailto:info@sofislegacy.com" className="underline-offset-2 hover:underline">
                info@sofislegacy.com
              </a>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { to: '/menu', label: 'Menu', icon: UtensilsCrossed },
              { to: '/contact', label: 'Contact Us', icon: Mail },
            ].map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-full',
                  'border border-cream-200/80 bg-cream-50/60 px-3 py-1.5',
                  'text-xs font-bold text-(--color-ink-600)',
                  'transition hover:bg-cream-100 hover:text-(--color-ember-700)',
                  'dark:border-white/10 dark:bg-white/5 dark:text-white/60',
                  'dark:hover:bg-white/10 dark:hover:text-white',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)',
                )}
              >
                <Icon className="h-3 w-3" strokeWidth={2.2} />
                {label}
              </Link>
            ))}
          </div>
        </footer>
      </div>
    </main>
  );
}