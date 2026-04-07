// src/pages/NotFound.tsx
// =============================================================================
// 404 NOT FOUND — 2026 App Shell
// =============================================================================
// Branded, on-theme 404 that works inside the app shell.
// Feels like part of the restaurant experience — not a generic error page.
//
// Mobile: centered, full viewport minus nav bars
// Desktop: centered in main content area
//
// No hard-coded routes — uses useNavigate(-1) to go back,
// or falls back to / and /menu as safe destinations.
// =============================================================================

import { useNavigate, Link } from 'react-router-dom';
import { UtensilsCrossed, ArrowLeft, Home, ShoppingBag } from 'lucide-react';

function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export default function NotFound() {
  const navigate = useNavigate();

  const handleBack = () => {
    // If there's history to go back to, use it. Otherwise go home.
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  return (
    <div
      className={cx(
        // Full height minus top bar — BottomNav handles its own spacer
        'flex min-h-[calc(100dvh-56px)] flex-col items-center justify-center',
        'px-6 py-12 text-center',
        // Page background — matches app shell
        'bg-(--color-cream-100)',
        // Subtle grain via surface-noise (from effects.css)
        'surface-noise relative',
      )}
      role="main"
      aria-labelledby="not-found-title"
    >
      {/* Decorative radial — same as OrderCanceled, feels native */}
      <div className="overlay-luxury pointer-events-none" aria-hidden="true" />

      <div className="relative z-10 flex flex-col items-center">
        {/* Icon */}
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-(--color-ember-50) ring-8 ring-(--color-ember-50)/60">
          <UtensilsCrossed
            className="h-9 w-9 text-(--color-ember-500)"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </div>

        {/* 404 number — large, editorial */}
        <p
          className={cx(
            'font-display',
            'mb-1 text-[5rem] font-normal leading-none tracking-[-0.04em]',
            'text-(--color-cream-400)',
            // Slight color shift so it's decorative, not dominant
            'select-none',
          )}
          aria-hidden="true"
        >
          404
        </p>

        {/* Headline */}
        <h1
          id="not-found-title"
          className="font-display mb-3 text-2xl font-normal tracking-tight text-(--color-ink-900)"
        >
          Page not found
        </h1>

        {/* Subtext — brand-voice, not robotic */}
        <p className="mb-8 max-w-280px text-sm leading-relaxed text-(--color-ink-400)">
          That page doesn&apos;t exist — but our menu does. Let&apos;s get you somewhere good.
        </p>

        {/* Primary CTAs */}
        <div className="flex w-full max-w-280px flex-col gap-3">
          {/* Back button — most natural first action */}
          <button
            type="button"
            onClick={handleBack}
            className={cx('btn btn-ghost-light w-full', 'flex items-center justify-center gap-2')}
          >
            <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            Go back
          </button>

          {/* Menu — highest-value destination */}
          <Link
            to="/menu"
            className="btn btn-primary w-full flex items-center justify-center gap-2"
          >
            <ShoppingBag className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            View menu
          </Link>
        </div>

        {/* Quiet home link */}
        <Link
          to="/"
          className={cx(
            'mt-6 inline-flex items-center gap-1.5',
            'text-xs text-(--color-ink-300)',
            'transition-colors duration-(--duration-base)',
            'hover:text-(--color-ink-600)',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) rounded',
          )}
        >
          <Home className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
          Back to home
        </Link>
      </div>
    </div>
  );
}