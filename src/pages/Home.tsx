// src/pages/Home.tsx
// ─── Sofi's Restaurant — Premium Homepage ────────────────────────────────────
//
// Performance upgrade:
//   - Above-the-fold stays eager: HeroSection, MarqueeStrip, feature cards.
//   - Below-the-fold sections are lazy + viewport-deferred.
//   - Heavy sections do not download until the user gets near them.
//   - Root page no longer starts at opacity:0, preventing artificial FCP delay.
//   - Visual order and working logic are preserved.

import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion as m } from 'framer-motion';

import { HeroSection } from '@/components/home/HeroSection';
import { MarqueeStrip } from '@/components/home/MarqueeStrip';
import { SECTION_VIEWPORT, featureCardReveal } from '@/lib/animations/reveal';
import { staggerMedium } from '@/lib/animations/stagger';

// ─────────────────────────────────────────────────────────────────────────────
// Lazy below-the-fold sections
// ─────────────────────────────────────────────────────────────────────────────

const FeaturedMenu = lazy(() =>
  import('@/components/home/FeaturedMenu').then((mod) => ({ default: mod.FeaturedMenu })),
);

const StatsBand = lazy(() =>
  import('@/components/home/AtmosphereBand').then((mod) => ({ default: mod.StatsBand })),
);

const PullQuoteBand = lazy(() =>
  import('@/components/home/AtmosphereBand').then((mod) => ({ default: mod.PullQuoteBand })),
);

const MenuSection = lazy(() =>
  import('@/components/home/MenuSection').then((mod) => ({ default: mod.MenuSection })),
);

const Testimonials = lazy(() =>
  import('@/components/home/Testimonials').then((mod) => ({ default: mod.Testimonials })),
);

const Hours = lazy(() => import('@/components/home/Hours').then((mod) => ({ default: mod.Hours })));

const HouseRules = lazy(() =>
  import('@/components/home/HouseRules').then((mod) => ({ default: mod.HouseRules })),
);

const CTASection = lazy(() =>
  import('@/components/home/CTASection').then((mod) => ({ default: mod.CTASection })),
);

const Newsletter = lazy(() =>
  import('@/components/home/Newsletter').then((mod) => ({ default: mod.Newsletter })),
);

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

// ── Viewport deferred loader ──────────────────────────────────────────────────

function DeferredSection({
  children,
  fallback = null,
  rootMargin = '700px',
  minHeight,
}: {
  children: ReactNode;
  fallback?: ReactNode;
  rootMargin?: string;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (shouldRender) return;

    const node = ref.current;
    if (!node) return;

    if (!('IntersectionObserver' in window)) {
      setShouldRender(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShouldRender(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [rootMargin, shouldRender]);

  return (
    <div ref={ref} style={minHeight ? { minHeight } : undefined}>
      {shouldRender ? <Suspense fallback={fallback}>{children}</Suspense> : fallback}
    </div>
  );
}

// ── Skeleton fallbacks ────────────────────────────────────────────────────────

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

function SoftSectionSkeleton({ height = 260 }: { height?: number }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 md:px-12" aria-hidden="true">
      <div className="skeleton rounded-[1.25rem]" style={{ height }} />
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
        className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-xl"
        style={{ background: 'var(--color-accent-pale, #fdf8e8)' }}
        whileHover={{ scale: 1.1, rotate: 6 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
        aria-hidden="true"
      >
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
    <div
      className="min-h-screen"
      style={{
        background: 'var(--color-cream-100, #faf6ef)',
        color: 'var(--color-ink-900, #1c1c1c)',
      }}
    >
      {/* 1 · Hero */}
      <HeroSection />

      {/* 2 · Marquee */}
      <div style={{ background: 'var(--color-stone-900, #1c1915)' }}>
        <MarqueeStrip variant="dark" />
      </div>

      {/* 3 · Feature cards */}
      <section
        aria-label="Why guests choose Sofi's"
        className="px-5 py-12 sm:py-16 sm:px-8 md:px-12"
        style={{ background: 'var(--color-cream-300, #ede0ce)' }}
      >
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

      {/* 4 · Featured Menu */}
      <DeferredSection fallback={<DishSkeleton />} minHeight={360}>
        <FeaturedMenu />
      </DeferredSection>

      {/* 5 · Stats band */}
      <DeferredSection fallback={<SoftSectionSkeleton height={180} />} minHeight={220}>
        <StatsBand />
      </DeferredSection>

      {/* 6 · Full menu */}
      <DeferredSection fallback={<SoftSectionSkeleton height={520} />} minHeight={560}>
        <MenuSection />
      </DeferredSection>

      {/* 7 · Pull quote */}
      <DeferredSection fallback={<SoftSectionSkeleton height={180} />} minHeight={220}>
        <PullQuoteBand quote="Every detail matters." attribution="— Chef's Philosophy" />
      </DeferredSection>

      {/* 8 · Testimonials */}
      <DeferredSection fallback={<SoftSectionSkeleton height={420} />} minHeight={460}>
        <Testimonials />
      </DeferredSection>

      {/* 9 · Hours */}
      <DeferredSection fallback={<SoftSectionSkeleton height={360} />} minHeight={400}>
        <Hours onReservationClick={() => {}} />
      </DeferredSection>

      {/* 10 · House rules */}
      <DeferredSection fallback={<SoftSectionSkeleton height={340} />} minHeight={380}>
        <HouseRules />
      </DeferredSection>

      {/* 11 · CTA */}
      <DeferredSection fallback={<SoftSectionSkeleton height={240} />} minHeight={280}>
        <CTASection />
      </DeferredSection>

      {/* 12 · Newsletter */}
      <DeferredSection fallback={<SoftSectionSkeleton height={220} />} minHeight={260}>
        <Newsletter />
      </DeferredSection>
    </div>
  );
}