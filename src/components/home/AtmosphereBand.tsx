// src/components/home/AtmosphereBand.tsx
import { useMemo, useRef } from 'react';
import {
  motion as m,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'framer-motion';

import { type BrandTheme } from '@/assets/logo';
import { EASE_LUXURY, VIEWPORT_ONCE, fadeIn } from '@/lib/motion';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanAttribution(value: string): string {
  return value
    .replace(/^[-–—]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeQuote(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

// ─── PullQuoteBand ────────────────────────────────────────────────────────────

export interface PullQuoteBandProps {
  quote?: string;
  attribution?: string;
  theme?: BrandTheme;
  backgroundImage?: string;
}

export function PullQuoteBand({
  quote = 'Every detail is an act of hospitality.',
  attribution = "Sofi's Kitchen Philosophy",
  theme = 'dark',
  backgroundImage,
}: PullQuoteBandProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const sectionRef = useRef<HTMLElement>(null);

  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);

  const springX = useSpring(mouseX, { stiffness: 44, damping: 24, mass: 0.8 });
  const springY = useSpring(mouseY, { stiffness: 44, damping: 24, mass: 0.8 });

  const bgX = useTransform(springX, [0, 1], ['2.5%', '-2.5%']);
  const bgY = useTransform(springY, [0, 1], ['2%', '-2%']);

  const isDark = theme === 'dark';

  const polishedQuote = useMemo(() => normalizeQuote(quote), [quote]);
  const polishedAttribution = useMemo(() => cleanAttribution(attribution), [attribution]);

  const handleMouseMove = (event: React.MouseEvent<HTMLElement>) => {
    if (shouldReduceMotion) return;

    const rect = sectionRef.current?.getBoundingClientRect();
    if (!rect) return;

    mouseX.set((event.clientX - rect.left) / rect.width);
    mouseY.set((event.clientY - rect.top) / rect.height);
  };

  const handleMouseLeave = () => {
    mouseX.set(0.5);
    mouseY.set(0.5);
  };

  return (
    <section
      ref={sectionRef}
      aria-label="Restaurant philosophy"
      className={[
        'section-wrap relative isolate overflow-hidden px-5 py-24 sm:px-8 sm:py-32 md:px-12',
        isDark ? 'text-white' : 'text-stone-950',
      ].join(' ')}
      style={{
        background: isDark
          ? 'linear-gradient(135deg, #1c1915 0%, #120f0d 55%, #0c0a08 100%)'
          : 'linear-gradient(135deg, var(--color-cream-50, #fffaf2) 0%, var(--color-cream-100, #faf6ef) 100%)',
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {backgroundImage && (
        <m.div
          className="absolute inset-[-3%] z-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${backgroundImage})`,
            x: shouldReduceMotion ? 0 : bgX,
            y: shouldReduceMotion ? 0 : bgY,
            willChange: shouldReduceMotion ? 'auto' : 'transform',
          }}
          initial={{ opacity: 0, scale: 1.02 }}
          animate={{ opacity: isDark ? 0.52 : 0.2, scale: 1 }}
          transition={{ duration: 1.4, ease: EASE_LUXURY }}
          aria-hidden="true"
        />
      )}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background: isDark
            ? [
                'linear-gradient(to top, rgba(12,10,8,0.94) 0%, rgba(28,25,21,0.62) 48%, rgba(12,10,8,0.78) 100%)',
                'radial-gradient(ellipse 80% 58% at 50% 45%, rgba(212,175,55,0.10) 0%, transparent 68%)',
                'radial-gradient(circle at 12% 20%, rgba(184,50,36,0.10) 0%, transparent 34%)',
              ].join(', ')
            : [
                'linear-gradient(to top, rgba(250,246,239,0.92) 0%, rgba(250,246,239,0.64) 52%, rgba(250,246,239,0.88) 100%)',
                'radial-gradient(ellipse 80% 58% at 50% 45%, rgba(212,175,55,0.16) 0%, transparent 68%)',
              ].join(', '),
        }}
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 opacity-[0.035]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '180px',
        }}
      />

      <m.div
        variants={fadeIn}
        initial="hidden"
        whileInView="visible"
        viewport={VIEWPORT_ONCE}
        className="relative z-30 mx-auto flex max-w-3xl flex-col items-center text-center"
      >
        <m.div
          aria-hidden="true"
          className="mb-8 h-px w-16 origin-center"
          style={{ background: 'var(--color-gold-400, #d4af37)', opacity: 0.44 }}
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={VIEWPORT_ONCE}
          transition={{ duration: 0.9, ease: EASE_LUXURY }}
        />

        <span
          aria-hidden="true"
          className="pointer-events-none select-none font-display text-[5.75rem] leading-none sm:text-[7rem]"
          style={{
            color: 'var(--color-gold-400, #d4af37)',
            opacity: isDark ? 0.18 : 0.22,
            marginBottom: '-2.75rem',
          }}
        >
          “
        </span>

        <blockquote
          className={[
            'm-0 border-0 p-0 font-display font-light italic tracking-[-0.025em]',
            isDark ? 'text-white' : 'text-stone-950',
          ].join(' ')}
          style={{
            fontSize: 'clamp(1.65rem, 4vw, 3rem)',
            lineHeight: 1.18,
            textShadow: isDark ? '0 12px 34px rgba(0,0,0,0.34)' : 'none',
          }}
        >
          {polishedQuote}
        </blockquote>

        {polishedAttribution && (
          <cite
            className={[
              'mt-7 font-body text-[0.7rem] font-black uppercase not-italic',
              isDark ? 'text-gold-300' : 'text-orange-800',
            ].join(' ')}
            style={{
              letterSpacing: '0.24em',
              opacity: isDark ? 0.82 : 0.76,
              textShadow: isDark ? '0 0 8px rgba(212,175,55,0.18)' : 'none',
            }}
          >
            {polishedAttribution}
          </cite>
        )}

        <m.div
          aria-hidden="true"
          className="mt-8 h-px w-16 origin-center"
          style={{ background: 'var(--color-gold-400, #d4af37)', opacity: 0.44 }}
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={VIEWPORT_ONCE}
          transition={{ duration: 0.9, ease: EASE_LUXURY, delay: 0.18 }}
        />
      </m.div>
    </section>
  );
}

// ─── StatsBand ────────────────────────────────────────────────────────────────

interface Stat {
  value: string;
  label: string;
  prefix?: string;
  suffix?: string;
}

const DEFAULT_STATS: Stat[] = [
  { value: '2022', label: 'Serving Surprise since' },
  { value: '300', suffix: '+', label: 'Neighbor favorites' },
  { value: '7', label: 'Days of breakfast' },
  { value: '100', suffix: '%', label: 'Family-run hospitality' },
];

export interface StatsBandProps {
  stats?: Stat[];
  theme?: BrandTheme;
}

export function StatsBand({ stats = DEFAULT_STATS, theme = 'light' }: StatsBandProps) {
  const isDark = theme === 'dark';

  return (
    <section
      aria-label="Restaurant highlights"
      className={[
        'section-wrap px-5 py-12 sm:px-8 md:px-12',
        isDark ? 'bg-stone-950 text-white' : 'bg-white text-stone-950',
      ].join(' ')}
      style={{
        borderTop: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(212,175,55,0.12)',
        borderBottom: isDark
          ? '1px solid rgba(255,255,255,0.08)'
          : '1px solid rgba(212,175,55,0.12)',
      }}
    >
      <m.div
        initial="hidden"
        whileInView="visible"
        viewport={VIEWPORT_ONCE}
        variants={{
          hidden: {},
          visible: {
            transition: {
              staggerChildren: 0.1,
              delayChildren: 0.05,
            },
          },
        }}
        className="mx-auto grid max-w-5xl grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4"
      >
        {stats.map((stat) => (
          <m.div
            key={`${stat.value}-${stat.label}`}
            variants={{
              hidden: { opacity: 0, y: 18 },
              visible: {
                opacity: 1,
                y: 0,
                transition: { duration: 0.55, ease: EASE_LUXURY },
              },
            }}
            className={[
              'group rounded-[1.35rem] px-4 py-5 text-center ring-1 transition duration-300',
              isDark
                ? 'bg-white/[0.035] ring-white/10 hover:bg-white/[0.055]'
                : 'bg-stone-50/80 ring-black/5 hover:bg-white hover:shadow-sm',
            ].join(' ')}
          >
            <span
              className="block font-display font-semibold tracking-[-0.045em]"
              style={{
                fontSize: 'clamp(2rem, 5vw, 3.15rem)',
                color: isDark
                  ? 'var(--color-gold-300, #f1d27a)'
                  : 'var(--color-ember-600, #9a4f2d)',
                lineHeight: 0.95,
              }}
            >
              {stat.prefix}
              {stat.value}
              {stat.suffix}
            </span>

            <span
              className="mt-3 block font-body text-[0.68rem] font-black uppercase"
              style={{
                letterSpacing: '0.16em',
                color: isDark ? 'rgba(255,255,255,0.58)' : 'var(--color-ink-500, #8a7a6a)',
                lineHeight: 1.45,
              }}
            >
              {stat.label}
            </span>

            <m.div
              aria-hidden="true"
              className="mx-auto mt-4 h-px w-8 origin-center"
              style={{ background: 'var(--color-gold-400, #d4af37)', opacity: 0.34 }}
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={VIEWPORT_ONCE}
              transition={{ duration: 0.65, ease: EASE_LUXURY, delay: 0.18 }}
            />
          </m.div>
        ))}
      </m.div>
    </section>
  );
}