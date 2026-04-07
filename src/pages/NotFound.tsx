// src/pages/NotFound.tsx
// =============================================================================
// 404 NOT FOUND — 2026 App Shell
// =============================================================================
// Branded, on-theme 404 that lives inside the app shell (TopBar + BottomNav).
// Feels like a restaurant page — not a generic system error.
//
// Height accounts for TopBar (56px) so the content centers correctly.
// BottomNav renders its own spacer so no extra padding needed here.
// =============================================================================

import { useNavigate, Link } from 'react-router-dom';
import { UtensilsCrossed, ArrowLeft, ShoppingBag, Home } from 'lucide-react';

function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export default function NotFound() {
  const navigate = useNavigate();

  const handleBack = () => {
    // Go back if there's history, otherwise home
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  return (
    <div
      className={cx(
        // Center within available height (viewport minus top bar)
        'flex min-h-[calc(100dvh-56px)] flex-col items-center justify-center',
        'px-6 py-12 text-center',
        // Matches app shell background
        'bg-(--color-cream-100)',
        // Grain texture from effects.css
        'surface-noise relative',
      )}
      role="main"
      aria-labelledby="not-found-title"
    >
      {/* Decorative radial glow — same as rest of app shell */}
      <div className="overlay-luxury pointer-events-none" aria-hidden="true" />

      <div className="relative z-10 flex flex-col items-center">

        {/* Icon ring */}
        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-(--color-ember-50) ring-8 ring-(--color-ember-50)/60">
          <UtensilsCrossed
            className="h-9 w-9 text-(--color-ember-400)"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </div>

        {/* Large decorative 404 */}
        <p
          className="font-display mb-1 select-none text-[6rem] font-normal leading-none tracking-[-0.04em] text-(--color-cream-400)"
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

        {/* Brand-voice copy — not robotic */}
        <p className="mb-8 max-w-260px text-sm leading-relaxed text-(--color-ink-400)">
          That page doesn&apos;t exist — but our kitchen is open.
          Let&apos;s get you somewhere useful.
        </p>

        {/* CTAs — priority order: back → menu → home */}
        <div className="flex w-full max-w-280px flex-col gap-3">

          <button
            type="button"
            onClick={handleBack}
            className="btn btn-ghost-light w-full flex items-center justify-center gap-2"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            Go back
          </button>

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
            'transition-colors duration-(--duration-base) hover:text-(--color-ink-600)',
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