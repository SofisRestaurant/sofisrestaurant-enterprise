// src/components/home/AtmosphereBand.tsx
// ─── Pull-quote and stats bands ───────────────────────────────────────────────
//
// Animation fix 2026:
//   • PullQuoteBand: quote content wrapper uses variants={fadeIn} initial="hidden"
//     whileInView="visible" — was missing initial="hidden".
//   • Top/bottom rule m.divs: already had initial={{ scaleX:0 }} — correct.
//   • Background image m.div: uses animate (not whileInView) — correct for mount.
//   • StatsBand: stagger wrapper already had initial="hidden" whileInView="visible" — correct.
//   • Stat gold rule m.divs: already had initial={{ scaleX:0 }} whileInView — correct.
//   • No default export — both are named exports. Import as:
//     import { PullQuoteBand, StatsBand } from '@/components/home/AtmosphereBand'

import React, { useRef } from 'react';
import {
  motion as m, useReducedMotion,
  useMotionValue,
  useSpring,
  useTransform,
} from 'framer-motion';
import { EASE_LUXURY, VIEWPORT_ONCE, fadeIn } from '@/lib/motion';
import { type BrandTheme } from '@/assets/logo';

// ── PullQuoteBand ─────────────────────────────────────────────────────────────

export interface PullQuoteBandProps {
  quote:            string;
  attribution?:     string;
  theme?:           BrandTheme;
  backgroundImage?: string;
}

export function PullQuoteBand({
  quote         = 'Every detail is an act of hospitality.',
  attribution   = "— Sofi's Kitchen Philosophy",
  theme         = 'dark',
  backgroundImage,
}: PullQuoteBandProps) {
  const shouldReduceMotion: boolean = useReducedMotion() ?? false;

  const sectionRef = useRef<HTMLElement>(null);
  const mouseX     = useMotionValue(0.5);
  const mouseY     = useMotionValue(0.5);
  const sX         = useSpring(mouseX, { stiffness: 50, damping: 22 });
  const sY         = useSpring(mouseY, { stiffness: 50, damping: 22 });
  const bgX        = useTransform(sX, [0, 1], ['2%', '-2%']);
  const bgY        = useTransform(sY, [0, 1], ['2%', '-2%']);

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (shouldReduceMotion) return;
    const r = sectionRef.current?.getBoundingClientRect();
    if (!r) return;
    mouseX.set((e.clientX - r.left) / r.width);
    mouseY.set((e.clientY - r.top)  / r.height);
  };

  const handleMouseLeave = () => {
    mouseX.set(0.5);
    mouseY.set(0.5);
  };

  return (
    <section
      ref={sectionRef}
      aria-label="Restaurant philosophy"
      className="section-wrap relative overflow-[clip] py-24 sm:py-32 px-5 sm:px-8 md:px-12"
      style={{ background: 'var(--color-stone-900, #1c1915)' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Background image — animate on mount, not scroll */}
      {backgroundImage && (
        <m.div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${backgroundImage})`,
            x:          shouldReduceMotion ? 0 : bgX,
            y:          shouldReduceMotion ? 0 : bgY,
            willChange: 'transform',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.55 }}
          transition={{ duration: 1.4, ease: EASE_LUXURY }}
          aria-hidden="true"
        />
      )}

      {/* Dark scrim */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            'linear-gradient(to top, rgba(28,25,21,0.88) 0%, rgba(28,25,21,0.55) 50%, rgba(28,25,21,0.72) 100%)',
        }}
      />

      {/* Noise texture */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '180px',
        }}
      />

      {/* Gold glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-20"
        style={{
          background: 'radial-gradient(ellipse 65% 55% at 50% 50%, rgba(212,175,55,0.07) 0%, transparent 65%)',
        }}
      />

      {/*
        Quote content wrapper.
        initial="hidden" REQUIRED — without it the content starts fully visible
        and fadeIn variant has no start state to animate from.
      */}
      <m.div
        variants={fadeIn}
        initial="hidden"
        whileInView="visible"
        viewport={VIEWPORT_ONCE}
        className="relative z-30 mx-auto flex max-w-3xl flex-col items-center gap-7 text-center"
      >
        {/* Top rule — initial required */}
        <m.div
          aria-hidden="true"
          className="h-px w-14 origin-center"
          style={{ background: 'var(--color-gold-400, #d4af37)', opacity: 0.38 }}
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={VIEWPORT_ONCE}
          transition={{ duration: 0.9, ease: EASE_LUXURY }}
        />

        <span
          aria-hidden="true"
          className="-mb-10 select-none font-display text-[5.5rem] leading-none"
          style={{ color: 'var(--color-gold-400, #d4af37)', opacity: 0.16 }}
        >
          "
        </span>

        <blockquote
          className="font-display font-light italic tracking-[-0.02em] text-white"
          style={{ fontSize: 'clamp(1.5rem, 4vw, 2.75rem)', lineHeight: 1.22 }}
        >
          {quote}
        </blockquote>

        {attribution && (
          <cite
            className="not-italic font-body font-medium uppercase"
            style={{
              fontSize:      '0.65rem',
              letterSpacing: '0.22em',
              color:         'var(--color-gold-400, #d4af37)',
              opacity:       0.58,
            }}
          >
            {attribution}
          </cite>
        )}

        {/* Bottom rule — initial required */}
        <m.div
          aria-hidden="true"
          className="h-px w-14 origin-center"
          style={{ background: 'var(--color-gold-400, #d4af37)', opacity: 0.38 }}
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={VIEWPORT_ONCE}
          transition={{ duration: 0.9, ease: EASE_LUXURY, delay: 0.18 }}
        />
      </m.div>
    </section>
  );
}

// ── StatsBand ─────────────────────────────────────────────────────────────────

interface Stat {
  value:   string;
  label:   string;
  prefix?: string;
  suffix?: string;
}

const DEFAULT_STATS: Stat[] = [
  { value: '12',  suffix: '+', label: 'Years of Craft'  },
  { value: '340', suffix: '+', label: 'Guest Reviews'   },
  { value: '4.9',              label: 'Average Rating'  },
  { value: '48',               label: 'Seats Available' },
];

export interface StatsBandProps {
  stats?: Stat[];
}

export function StatsBand({ stats = DEFAULT_STATS }: StatsBandProps) {
  return (
    <section
      aria-label="Restaurant statistics"
      className="section-wrap bg-white px-5 py-12 sm:px-8 md:px-12"
      style={{
        borderTop:    '1px solid rgba(212,175,55,0.10)',
        borderBottom: '1px solid rgba(212,175,55,0.10)',
      }}
    >
      {/*
        Stagger wrapper — initial="hidden" required.
        Each stat child uses variants with opacity:0 in hidden state.
      */}
      <m.div
        initial="hidden"
        whileInView="visible"
        viewport={VIEWPORT_ONCE}
        variants={{
          hidden:  {},
          visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
        }}
        className="mx-auto grid max-w-4xl grid-cols-2 gap-8 lg:grid-cols-4 lg:gap-4"
      >
        {stats.map((stat) => (
          <m.div
            key={stat.label}
            variants={{
              hidden:  { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_LUXURY } },
            }}
            className="flex flex-col items-center gap-1.5 text-center"
          >
            <span
              className="font-display font-light tracking-[-0.03em]"
              style={{
                fontSize: 'clamp(2rem, 5vw, 3rem)',
                color:    'var(--color-ember-500, #a96840)',
              }}
            >
              {stat.prefix}{stat.value}{stat.suffix}
            </span>

            <span
              className="font-body font-medium uppercase"
              style={{
                fontSize:      '0.68rem',
                letterSpacing: '0.16em',
                color:         'var(--color-ink-500, #8a7a6a)',
              }}
            >
              {stat.label}
            </span>

            {/* Gold rule — initial required */}
            <m.div
              aria-hidden="true"
              className="mt-1 h-px w-7 origin-center"
              style={{ background: 'var(--color-gold-400, #d4af37)', opacity: 0.30 }}
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={VIEWPORT_ONCE}
              transition={{ duration: 0.65, ease: EASE_LUXURY, delay: 0.22 }}
            />
          </m.div>
        ))}
      </m.div>
    </section>
  );
}

// Both PullQuoteBand and StatsBand are named exports.
// No default export — import as: import { PullQuoteBand, StatsBand } from '...'