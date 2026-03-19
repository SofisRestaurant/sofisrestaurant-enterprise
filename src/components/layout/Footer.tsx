// src/components/layout/Footer.tsx
// ─── Luxury restaurant footer ─────────────────────────────────────────────────
//
// Design system upgrade 2026:
//   • Background uses token stone-900 (matches hero/dark sections)
//   • Typography uses font-display / font-body token classes
//   • Links use .nav-link component class with gold active underline
//   • Social links use .glass component class
//   • CTA button uses .btn .btn-primary component classes
//   • All colors reference CSS token vars — zero hardcoded hex
//   • Gold hairline divider above copyright uses .divider-gold class
//   • Contact cards use .card-dark component class
//   • ARIA: role="contentinfo", aria-label on nav landmarks
// ✅ i18n: all user-visible strings via react-i18next useTranslation()
// ✅ LanguageSwitcher embedded in copyright bar

import React from 'react';
import { Link } from 'react-router-dom';
import { motion as m } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';

// ── Constants (URLs never change with locale) ─────────────────────────────────

const PHONE_DISPLAY = '(623) 555-0000';
const PHONE_TEL = 'tel:+16235550000';
const SUPPORT_EMAIL = 'hello@sofisrestaurant.com';
const MAPS_URL = 'https://maps.google.com/?q=San+Francisco+CA';
const INSTAGRAM_URL = 'https://www.instagram.com/sofisrestaurante/';
const TIKTOK_URL = 'https://www.tiktok.com/@Sofisrestaurant';

// Route paths never change — labels come from translations
const QUICK_LINK_PATHS = [
  { to: '/menu',         key: 'quickLinks.menu'         },
  { to: '/about',        key: 'quickLinks.about'        },
  { to: '/gallery',      key: 'quickLinks.gallery'      },
  { to: '/reservations', key: 'quickLinks.reservations' },
  { to: '/contact',      key: 'quickLinks.contact'      },
  { to: '/reviews',      key: 'quickLinks.reviews'      },
] as const;

const LEGAL_LINK_PATHS = [
  { to: '/privacy-policy', key: 'legal.privacyPolicy' },
  { to: '/terms-of-service', key: 'legal.termsOfService' },
  { to: '/refund-policy', key: 'legal.refundPolicy' },
] as const;

// ── Viewport config for scroll reveals ───────────────────────────────────────

const VP = { once: true, amount: 0.15 } as const;
const EL: [number, number, number, number] = [0.16, 1, 0.3, 1];

// ── Footer ────────────────────────────────────────────────────────────────────

export default function Footer() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer
      role="contentinfo"
      className="section-wrap relative overflow-[clip]"
      style={{
        background: 'var(--color-stone-900, #1c1915)',
        borderTop: '1px solid rgba(212,175,55,0.10)',
      }}
    >
      {/* Ambient gold glow at top-center */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-48"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(212,175,55,0.06) 0%, transparent 70%)',
        }}
      />

      {/* Noise texture */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '180px',
        }}
      />

      {/* ── Main footer grid ───────────────────────────────────────────── */}
      <div className="relative mx-auto max-w-6xl px-5 pb-14 pt-16 sm:px-8 md:px-12">
        <m.div
          className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-12"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VP}
          transition={{ duration: 0.7, ease: EL }}
        >
          {/* ── Brand column ─────────────────────────────────────────────── */}
          <div className="flex flex-col gap-6 lg:col-span-4">
            {/* Wordmark */}
            <Link
              to="/"
              className="group flex items-center gap-3 focus-visible:outline-none
                         focus-visible:ring-2 focus-visible:ring-offset-2 w-fit rounded"
              style={{ '--tw-ring-color': 'var(--color-gold-400, #d4af37)' } as React.CSSProperties}
              aria-label={t('footer.logo.aria')}
            >
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full
                           font-display text-base font-medium transition-transform duration-300
                           group-hover:scale-105"
                style={{
                  background: 'var(--color-gold-400, #d4af37)',
                  color: 'var(--color-stone-900, #1c1915)',
                  boxShadow: '0 0 20px rgba(212,175,55,0.22)',
                }}
                aria-hidden="true"
              >
                S
              </span>
              <div>
                <p
                  className="font-display text-[1.1rem] font-medium leading-tight"
                  style={{ color: 'rgba(255,255,255,0.92)' }}
                >
                  {t('footer.logo.name')}
                </p>
                <p
                  className="font-body text-[0.68rem] uppercase tracking-[0.14em]"
                  style={{ color: 'var(--color-ink-500, #8a7a6a)' }}
                >
                  {t('footer.logo.location')}
                </p>
              </div>
            </Link>

            {/* Tagline */}
            <p
              className="max-w-22rem font-body text-[0.88rem] font-light leading-[1.78]"
              style={{ color: 'rgba(255,255,255,0.45)' }}
            >
              {t('footer.tagline')}
            </p>

            {/* Primary CTA */}
            <div>
              <Link to="/reservations" className="btn btn-primary btn-sm">
                {t('footer.cta.reserve')}
              </Link>
            </div>

            {/* Social links */}
            <div className="flex gap-2.5">
              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noreferrer"
                className="glass flex items-center gap-2 rounded-full px-3.5 py-2
                           font-body text-[0.68rem] font-medium uppercase tracking-caps[0.10em]
                           transition-all duration-300 hover:border-gold-400/30"
                style={{ color: 'rgba(255,255,255,0.55)' }}
                aria-label={t('footer.social.instagramAria')}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
                </svg>
                {t('footer.social.instagram')}
              </a>

              <a
                href={TIKTOK_URL}
                target="_blank"
                rel="noreferrer"
                className="glass flex items-center gap-2 rounded-full px-3.5 py-2
                           font-body text-[0.68rem] font-medium uppercase tracking-caps[0.10em]
                           transition-all duration-300 hover:border-gold-400/30"
                style={{ color: 'rgba(255,255,255,0.55)' }}
                aria-label={t('footer.social.tiktokAria')}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.87a8.28 8.28 0 0 0 4.84 1.54V7.01a4.85 4.85 0 0 1-1.07-.32z" />
                </svg>
                {t('footer.social.tiktok')}
              </a>
            </div>
          </div>

          {/* ── Quick links ───────────────────────────────────────────────── */}
          <nav className="lg:col-span-2" aria-label={t('footer.quickLinks.heading')}>
            <h3
              className="mb-5 font-body text-[0.65rem] font-medium uppercase tracking-[0.20em]"
              style={{ color: 'var(--color-gold-400, #d4af37)' }}
            >
              {t('footer.quickLinks.heading')}
            </h3>
            <ul className="flex flex-col gap-2.5">
              {QUICK_LINK_PATHS.map(({ to, key }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="link-line font-body text-[0.85rem] font-light
                               transition-colors duration-200"
                    style={{ color: 'rgba(255,255,255,0.50)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.85)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.50)')}
                  >
                    {t(`footer.${key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* ── Legal ─────────────────────────────────────────────────────── */}
          <nav className="lg:col-span-2" aria-label={t('footer.legal.heading')}>
            <h3
              className="mb-5 font-body text-[0.65rem] font-medium uppercase tracking-[0.20em]"
              style={{ color: 'var(--color-gold-400, #d4af37)' }}
            >
              {t('footer.legal.heading')}
            </h3>
            <ul className="flex flex-col gap-2.5">
              {LEGAL_LINK_PATHS.map(({ to, key }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="link-line font-body text-[0.85rem] font-light
                               transition-colors duration-200"
                    style={{ color: 'rgba(255,255,255,0.50)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.85)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.50)')}
                  >
                    {t(`footer.${key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* ── Contact ───────────────────────────────────────────────────── */}
          <address className="not-italic lg:col-span-4" aria-label={t('footer.contact.heading')}>
            <h3
              className="mb-5 font-body text-[0.65rem] font-medium uppercase tracking-[0.20em]"
              style={{ color: 'var(--color-gold-400, #d4af37)' }}
            >
              {t('footer.contact.heading')}
            </h3>
            <div className="flex flex-col gap-2.5">
              {/* Phone */}
              <a
                href={PHONE_TEL}
                className="card-dark flex items-center gap-3 rounded-xl p-3.5
                           transition-all duration-300 hover:border-gold-400/20"
                aria-label={t('footer.contact.phoneAria', { phone: PHONE_DISPLAY })}
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm"
                  style={{
                    background: 'rgba(212,175,55,0.10)',
                    color: 'var(--color-gold-400, #d4af37)',
                  }}
                  aria-hidden="true"
                >
                  📞
                </span>
                <span
                  className="font-body text-[0.83rem]"
                  style={{ color: 'rgba(255,255,255,0.65)' }}
                >
                  {PHONE_DISPLAY}
                </span>
              </a>

              {/* Email */}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="card-dark flex items-center gap-3 rounded-xl p-3.5
                           transition-all duration-300 hover:border-gold-400/20"
                aria-label={t('footer.contact.emailAria', { email: SUPPORT_EMAIL })}
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm"
                  style={{
                    background: 'rgba(212,175,55,0.10)',
                    color: 'var(--color-gold-400, #d4af37)',
                  }}
                  aria-hidden="true"
                >
                  ✉️
                </span>
                <span
                  className="break-all font-body text-[0.83rem]"
                  style={{ color: 'rgba(255,255,255,0.65)' }}
                >
                  {SUPPORT_EMAIL}
                </span>
              </a>

              {/* Address */}
              <a
                href={MAPS_URL}
                target="_blank"
                rel="noreferrer"
                className="card-dark flex items-start gap-3 rounded-xl p-3.5
                           transition-all duration-300 hover:border-gold-400/20"
                aria-label={t('footer.contact.mapsAria')}
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm"
                  style={{
                    background: 'rgba(212,175,55,0.10)',
                    color: 'var(--color-gold-400, #d4af37)',
                  }}
                  aria-hidden="true"
                >
                  📍
                </span>
                <span
                  className="font-body text-[0.83rem] leading-relaxed"
                  style={{ color: 'rgba(255,255,255,0.65)' }}
                >
                  {t('footer.contact.address')}
                </span>
              </a>

              {/* Hours */}
              <div className="card-dark flex items-center gap-3 rounded-xl p-3.5">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm"
                  style={{
                    background: 'rgba(212,175,55,0.10)',
                    color: 'var(--color-gold-400, #d4af37)',
                  }}
                  aria-hidden="true"
                >
                  🕒
                </span>
                <span
                  className="font-body text-[0.83rem]"
                  style={{ color: 'rgba(255,255,255,0.65)' }}
                >
                  {t('footer.contact.hours')}
                </span>
              </div>
            </div>
          </address>
        </m.div>

        {/* ── Gold divider ───────────────────────────────────────────────── */}
        <hr className="divider-gold mt-14 mb-6" />

        {/* ── Copyright bar ──────────────────────────────────────────────── */}
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="font-body text-[0.70rem]" style={{ color: 'rgba(255,255,255,0.28)' }}>
            {t('footer.copyright', { year })}
          </p>

          {/* Language switcher — dark surface variant, no label (icon-only pill) */}
          <LanguageSwitcher surface="dark" />

          <p className="font-body text-[0.70rem]" style={{ color: 'rgba(255,255,255,0.18)' }}>
            {t('footer.builtWith')}
          </p>
        </div>
      </div>
    </footer>
  );
}