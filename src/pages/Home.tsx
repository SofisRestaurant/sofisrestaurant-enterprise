// src/pages/Home.tsx
// ─── Sofi's Restaurant — Premium Homepage ────────────────────────────────────
//
// Section order:
//   1.  HeroSection      — cinematic full-screen slider
//   2.  MarqueeStrip     — gold ticker
//   3.  Feature cards    — 3 value props (inline)
//   4.  FeaturedMenu     — horizontal dish carousel (lazy)
//   5.  StatsBand        — animated achievement counters
//   6.  MenuSection      — filterable full menu
//   7.  PullQuoteBand    — philosophy pull-quote
//   8.  Testimonials     — review grid with rating bars
//   9.  Hours            — schedule + location
//  10.  HouseRules       — policy cards grid
//  11.  CTASection       — ember conversion band
//  12.  Newsletter       — email capture strip
//
// Animation rules enforced throughout:
//   • Every <m.*> with whileInView has a matching initial prop.
//   • Every stagger container has initial="hidden" whileInView="visible".
//   • Variants passed to children all have opacity:0 in their hidden state.
//   • Elements using animate (not whileInView) are only those above the fold.
//   • The global opacity:1 !important override has been permanently removed
//     from globals.css and app.css — it breaks all Framer Motion animations.
//
// FIX (2026-03-15):
//   BEFORE — crashed with "Element type is invalid. Received a promise that
//   resolves to: undefined." because:
//     1. The eager import { FeaturedMenu as FeaturedMenuEager } was dead code
//        (aliased and never used in JSX). Vite tree-shakes unused bindings
//        before type-checking, so the build succeeded even though the named
//        export may not exist on the module — but the runtime lazy .then()
//        call got back undefined and React.lazy received { default: undefined }.
//     2. The lazy .then((m) => ...) callback shadowed the outer `m` alias
//        for framer-motion, which is confusing and a lint error.
//
//   AFTER — both issues removed:
//     • Eager FeaturedMenuEager import deleted entirely.
//     • Lazy import uses `() => import(...)` with no .then() — relies on
//       FeaturedMenu.tsx having `export default FeaturedMenu` (see note below).
//     • If FeaturedMenu only has a named export, see OPTION B comment below.

import { Suspense, lazy, useEffect } from 'react';
import { motion as m } from 'framer-motion';
import { HeroSection } from '@/components/home/HeroSection';
import { MarqueeStrip } from '@/components/home/MarqueeStrip';
import { MenuSection } from '@/components/home/MenuSection';
import { Hours } from '@/components/home/Hours';
import { HouseRules } from '@/components/home/HouseRules';
import { Testimonials } from '@/components/home/Testimonials';
import { PullQuoteBand, StatsBand } from '@/components/home/AtmosphereBand';
import { Newsletter } from '@/components/home/Newsletter';
import { CTASection } from '@/components/home/CTASection';
import { SECTION_VIEWPORT, featureCardReveal } from '@/lib/animations/reveal';
import { staggerMedium } from '@/lib/animations/stagger';

// ─────────────────────────────────────────────────────────────────────────────
// FeaturedMenu — lazy-loaded for bundle splitting
//
// OPTION A (default): FeaturedMenu.tsx has `export default FeaturedMenu`
//   React.lazy requires the dynamic import to resolve to a module whose
//   DEFAULT export is a valid React component. No .then() needed.
//
// OPTION B: FeaturedMenu.tsx only has `export function FeaturedMenu` (named only)
//   Uncomment the .then() line below AND comment out Option A.
//   Also add `export default FeaturedMenu` to FeaturedMenu.tsx — that's cleaner.
//
// WHY the old code crashed:
//   The old lazy used .then((m) => ({ default: m.FeaturedMenu })) while ALSO
//   having a dead static import `import { FeaturedMenu as FeaturedMenuEager }`.
//   Vite tree-shakes unused bindings before runtime, so the static import
//   never validated that the named export existed. At runtime, m.FeaturedMenu
//   was undefined → React.lazy got { default: undefined } → crash.
// ─────────────────────────────────────────────────────────────────────────────

// OPTION A — use this if FeaturedMenu.tsx has `export default FeaturedMenu`
const FeaturedMenu = lazy(() => import('@/components/home/FeaturedMenu'));

// OPTION B — use this instead if FeaturedMenu.tsx only has a named export
// (rename the .then param to `mod` — never `m`, which shadows the motion alias)
// const FeaturedMenu = lazy(
//   () => import('@/components/home/FeaturedMenu')
//     .then((mod) => ({ default: mod.FeaturedMenu })),
// );

// ── Data ──────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    id: 'seasonal',
    icon: '🌿',
    title: 'Seasonal Sourcing',
    desc: 'Ingredients selected weekly from local farms and foragers.',
  },
  {
    id: 'atmosphere',
    icon: '🕯️',
    title: 'Intimate Atmosphere',
    desc: 'Thoughtfully designed spaces — perfect for dates and celebrations.',
  },
  {
    id: 'delivery',
    icon: '🏍️',
    title: 'Swift Delivery',
    desc: 'Hot, beautifully packaged meals delivered in 30–45 minutes.',
  },
] as const;

// ── Skeleton fallback ─────────────────────────────────────────────────────────

function DishSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 px-5 py-16 sm:grid-cols-2 sm:px-8 md:px-12 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="skeleton h-52 rounded-[1.25rem]"
          style={{ animationDelay: `${i * 0.1}s` }}
        />
      ))}
    </div>
  );
}

// ── Feature card ──────────────────────────────────────────────────────────────

function FeatureCard({
  icon,
  title,
  desc,
  index,
}: {
  icon: string;
  title: string;
  desc: string;
  index: number;
}) {
  return (
    /*
      Receives hidden/visible from parent stagger container.
      featureCardReveal.hidden has opacity:0 — no separate initial needed here.
      custom={index} feeds the per-card delay in featureCardReveal.visible.
    */
    <m.article
      custom={index}
      variants={featureCardReveal}
      whileHover={{
        y: -7,
        scale: 1.02,
        boxShadow: '0 28px 60px rgba(26,18,9,0.18)',
        borderColor: 'rgba(212,175,55,0.35)',
      }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      className="flex cursor-default items-start gap-4 rounded-[1.25rem] bg-white p-5"
      style={{ border: '1px solid rgba(212,175,55,0.10)' }}
    >
      <m.div
        className="relative flex h-11 w-11 shrink-0 items-center justify-center
                   overflow-hidden rounded-full text-xl"
        style={{ background: 'var(--color-accent-pale, #fdf8e8)' }}
        whileHover={{ scale: 1.1, rotate: 6 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
        aria-hidden="true"
      >
        {/* Noise texture — position:absolute (NOT fixed) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.06] mix-blend-multiply"
          style={{
            backgroundImage: `url('data:image/svg+xml,%3Csvg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"%3E%3Cfilter id="n"%3E%3CfeTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch"/%3E%3C/filter%3E%3Crect width="100%25" height="100%25" filter="url(%23n)"/%3E%3C/svg%3E')`,
            backgroundSize: '200px',
          }}
        />
        {icon}
      </m.div>

      <div>
        <h3
          className="mb-1 font-display leading-snug"
          style={{ fontSize: '1.05rem', color: 'var(--color-ink-900, #1c1c1c)' }}
        >
          {title}
        </h3>
        <p
          className="font-body text-[0.82rem] font-light leading-relaxed"
          style={{ color: 'var(--color-ink-500, #8a7a6a)' }}
        >
          {desc}
        </p>
      </div>
    </m.article>
  );
}

// ── HOME PAGE ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  useEffect(() => {
    document.title = "Sofi's Restaurant — Crafted With Intention";
  }, []);

  return (
    // Page wrapper — initial + animate (root element, always in viewport)
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
      className="min-h-screen"
      style={{
        background: 'var(--color-cream-100, #faf6ef)',
        color: 'var(--color-ink-900, #1c1c1c)',
      }}
    >
      {/* ── 1 · Hero ──────────────────────────────────────────────────────── */}
      <HeroSection />

      {/* ── 2 · Marquee ───────────────────────────────────────────────────── */}
      {/* Entrance wrapper — above the fold so uses animate, not whileInView */}
      <div style={{ background: 'var(--color-stone-900, #1c1915)' }}>
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.22 }}
        >
          <MarqueeStrip variant="dark" />
        </m.div>
      </div>

      {/* ── 3 · Feature cards ─────────────────────────────────────────────── */}
      <section
        aria-label="Why guests choose Sofi's"
        className="px-5 py-12 sm:py-16 sm:px-8 md:px-12"
        style={{ background: 'var(--color-cream-300, #ede0ce)' }}
      >
        {/*
          initial="hidden" required — featureCardReveal has opacity:0 in hidden.
          Without it, every card starts visible and no animation plays.
          whileInView="visible" triggers on scroll.
          viewport amount:0.15 fires early so cards animate before fully in view.
        */}
        <m.div
          variants={staggerMedium}
          initial="hidden"
          whileInView="visible"
          viewport={SECTION_VIEWPORT}
          className="mx-auto grid max-w-6xl grid-cols-1 gap-4 sm:grid-cols-3"
        >
          {FEATURES.map((f, i) => (
            <FeatureCard key={f.id} {...f} index={i} />
          ))}
        </m.div>
      </section>

      {/* ── 4 · Featured Menu ─────────────────────────────────────────────── */}
      <Suspense fallback={<DishSkeleton />}>
        <FeaturedMenu />
      </Suspense>

      {/* ── 5 · Stats band ────────────────────────────────────────────────── */}
      <StatsBand />

      {/* ── 6 · Full menu ─────────────────────────────────────────────────── */}
      <MenuSection />

      {/* ── 7 · Pull quote ────────────────────────────────────────────────── */}
      <PullQuoteBand
        quote="Every detail matters."
        attribution="— Chef's Philosophy"
        backgroundImage="/src/assets/images/atmosphere-band/bg1.jpg"
      />

      {/* ── 8 · Testimonials ──────────────────────────────────────────────── */}
      <Testimonials />

      {/* ── 9 · Hours ─────────────────────────────────────────────────────── */}
      <Hours onReservationClick={() => {}} />

      {/* ── 10 · House rules ──────────────────────────────────────────────── */}
      <HouseRules />

      {/* ── 11 · CTA ──────────────────────────────────────────────────────── */}
      <CTASection />

      {/* ── 12 · Newsletter ───────────────────────────────────────────────── */}
      <Newsletter />
    </m.div>
  );
}
