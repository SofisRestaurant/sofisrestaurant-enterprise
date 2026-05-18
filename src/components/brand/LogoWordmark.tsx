// src/components/brand/LogoWordmark.tsx
// =============================================================================
// Brand wordmark — renders "Sofi's" with guaranteed font consistency.
//
// PROBLEM SOLVED:
//   SofiDisplay is a decorative / script typeface.  When the browser uses
//   `font-display: swap`, it shows serif fallback text first, then swaps.
//   If SofiDisplay lacks a glyph (the ASCII apostrophe U+0027 is the usual
//   offender), that character stays in the fallback font permanently —
//   creating the mixed cursive/serif look.
//
//   No CSS property can prevent per-glyph fallback.  The only reliable fix
//   is to withhold rendering until we *confirm* the font file has loaded.
//
// HOW IT WORKS:
//   1.  On mount, check `document.fonts.check()` — if cached, show immediately.
//   2.  If not cached, call `document.fonts.load()` and wait (max 2.5 s).
//   3.  If the font arrives → show cursive wordmark.
//   4.  If it fails / times out → show a clean sans-serif wordmark at
//       weight 800 (looks intentional, not broken — never shows mixed text).
//   5.  Uses the typographic right single quotation mark (U+2019 ') instead
//       of the ASCII apostrophe — script fonts almost always include it.
//
// USAGE:
//   <Link to="/" aria-label="Sofi's — go to homepage">
//     <LogoWordmark />
//   </Link>
//
//   The parent <Link> carries the aria-label; the <span> is purely visual.
//   Accepts `className` for size / color overrides via Tailwind.
// =============================================================================

import { useEffect, useRef, useState } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Curly right-single-quote — far better glyph coverage in display fonts. */
const BRAND_TEXT = 'Sofi\u2019s';

/** Font-check string (family + weight + size).  Size is arbitrary for the check. */
const FONT_CHECK = '400 20px SofiDisplay';

/** How long we wait for the font before falling back to sans.  */
const TIMEOUT_MS = 2500;

// ── Font state ────────────────────────────────────────────────────────────────

type FontState = 'pending' | 'loaded' | 'failed';

function checkFontSync(): FontState {
  if (typeof document === 'undefined' || !document.fonts) return 'failed';
  return document.fonts.check(FONT_CHECK) ? 'loaded' : 'pending';
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface LogoWordmarkProps {
  /** Tailwind classes forwarded to the outer <span>. */
  className?: string;
}

export default function LogoWordmark({ className = '' }: LogoWordmarkProps) {
  const [state, setState] = useState<FontState>(checkFontSync);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (state !== 'pending') return;

    let cancelled = false;

    // Race: font load vs timeout
    timerRef.current = setTimeout(() => {
      if (!cancelled) setState('failed');
    }, TIMEOUT_MS);

    document.fonts
      .load(FONT_CHECK)
      .then(() => {
        if (!cancelled) {
          if (timerRef.current) clearTimeout(timerRef.current);
          setState('loaded');
        }
      })
      .catch(() => {
        if (!cancelled) {
          if (timerRef.current) clearTimeout(timerRef.current);
          setState('failed');
        }
      });

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state]);

  const isVisible = state !== 'pending';
  const isCursive = state === 'loaded';

  return (
    <span
      className={[
        // ── Base ──────────────────────────────────────────────────────────
        'logo-wordmark inline-block select-none',
        // ── Visibility (fade in once resolved) ────────────────────────────
        isVisible ? 'opacity-100' : 'opacity-0',
        // ── Font branch ───────────────────────────────────────────────────
        isCursive ? 'logo-wordmark--cursive' : 'logo-wordmark--sans',
        // ── Consumer overrides (size, color) ──────────────────────────────
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {BRAND_TEXT}
    </span>
  );
}