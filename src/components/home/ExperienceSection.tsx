// src/components/home/ExperienceSection.tsx
// ─── Restaurant story / experience section ───────────────────────────────────
//
// Fix: the pillar gold bar <m.div> had two separate `style` props on the same
// element. In JSX, duplicate props are not a compile error but only the second
// one takes effect at runtime — so `style={{ background, opacity }}` was being
// silently overwritten by `style={{ originY: 0 }}`, making the bar invisible.
// Fixed by merging all style properties into a single style object.

import React from 'react';
import { motion as m } from 'framer-motion';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { EASE_LUXURY, VIEWPORT_ONCE, staggerContainer } from '@/lib/motion';

// ── Image tile ────────────────────────────────────────────────────────────────

interface ImageTileProps {
  src?:         string;
  alt:          string;
  gradient:     string;
  className?:   string;
  aspectClass?: string;
}

function ImageTile({
  src,
  alt,
  gradient,
  className  = '',
  aspectClass = 'aspect-4/3',
}: ImageTileProps) {
  return (
    <m.div
      className={`img-zoom relative overflow-hidden rounded-1.5rem ${aspectClass} ${className}`}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.65, ease: EASE_LUXURY }}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          className="img-zoom-target absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: gradient }}
          aria-label={alt}
        />
      )}

      {/* Bottom vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 80% at 50% 100%, rgba(28,18,8,0.38) 0%, transparent 65%)',
        }}
      />
    </m.div>
  );
}

// ── Experience pillars ────────────────────────────────────────────────────────

const PILLARS = [
  {
    label: 'The Craft',
    text:  'Twelve years of obsessive iteration — each season pushing the kitchen further.',
  },
  {
    label: 'The Sourcing',
    text:  'Direct relationships with eight local farms. Ingredients arrive within 24 hours of harvest.',
  },
  {
    label: 'The Room',
    text:  'Forty-eight seats, candlelit. Designed for conversation, not Instagram.',
  },
];

// ── Main component ────────────────────────────────────────────────────────────

export function ExperienceSection() {
  return (
    <section
      aria-labelledby="experience-heading"
      className="section-wrap bg-white py-20 sm:py-32 px-5 sm:px-8 md:px-12"
    >
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2 lg:gap-28">
          {/* ── Left: Copy ─────────────────────────────────────────────────── */}
          <m.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT_ONCE}
            className="flex flex-col gap-8"
          >
            {/* Eyebrow */}
            <m.div
              variants={{
                hidden: { opacity: 0, y: 14 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE_LUXURY } },
              }}
            >
              <SectionLabel>The Sofi's Story</SectionLabel>
            </m.div>

            {/* Headline */}
            <m.h2
              id="experience-heading"
              variants={{
                hidden: { opacity: 0, y: 22, filter: 'blur(5px)' },
                visible: {
                  opacity: 1,
                  y: 0,
                  filter: 'blur(0px)',
                  transition: { duration: 0.9, ease: EASE_LUXURY },
                },
              }}
              className="font-display text-[clamp(2rem,4.5vw,3rem)]
                         leading-[1.06] tracking-[-0.02em] text-ink-900"
            >
              A Kitchen Built on{' '}
              <em
                className="font-display italic"
                style={{ fontStyle: 'italic', color: 'var(--color-ember-500, #a96840)' }}
              >
                Conviction
              </em>
            </m.h2>

            {/* Body */}
            <m.p
              variants={{
                hidden: { opacity: 0, y: 16 },
                visible: {
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.75, ease: EASE_LUXURY, delay: 0.1 },
                },
              }}
              className="max-w-30rem font-body text-[1.02rem] font-light
                         leading-[1.82] text-ink-600"
            >
              Sofi's began as a simple belief: that honest food, served with care in a room that
              feels like home, is more valuable than spectacle. Twelve years later, that belief is
              still the only thing on the menu.
            </m.p>

            {/* Pillars */}
            <m.div
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.1, delayChildren: 0.2 } },
              }}
              className="flex flex-col gap-5"
            >
              {PILLARS.map((p) => (
                <m.div
                  key={p.label}
                  variants={{
                    hidden: { opacity: 0, x: -18 },
                    visible: { opacity: 1, x: 0, transition: { duration: 0.6, ease: EASE_LUXURY } },
                  }}
                  className="flex items-start gap-4"
                >
                  {/*
                    Gold vertical bar.
                    FIX: previously had TWO `style` props on this element —
                      style={{ background: '...', opacity: 0.38 }}
                      style={{ originY: 0 }}              ← second silently overwrote the first
                    All properties are now merged into a single style object.
                  */}
                  <m.div
                    className="mt-1.5 min-h-2.5rem w-px shrink-0"
                    style={{
                      background: 'var(--color-gold-400, #d4af37)',
                      opacity: 0.38,
                      originY: 0,
                    }}
                    initial={{ scaleY: 0 }}
                    whileInView={{ scaleY: 1 }}
                    viewport={VIEWPORT_ONCE}
                    transition={{ duration: 0.5, ease: EASE_LUXURY }}
                    aria-hidden="true"
                  />

                  <div>
                    <h3
                      className="mb-1 font-body text-[0.68rem] font-medium
                                 uppercase tracking-[0.20em]"
                      style={{ color: 'var(--color-gold-400, #d4af37)' }}
                    >
                      {p.label}
                    </h3>
                    <p className="text-[0.86rem] font-light leading-relaxed text-ink-400">
                      {p.text}
                    </p>
                  </div>
                </m.div>
              ))}
            </m.div>

            {/* Signature / establishment line */}
            <m.div
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: { duration: 0.7, ease: EASE_LUXURY, delay: 0.4 },
                },
              }}
              className="flex items-center gap-4 pt-2"
            >
              <div
                className="h-px flex-1"
                style={{ background: 'var(--color-gold-400, #d4af37)', opacity: 0.18 }}
                aria-hidden="true"
              />
              <cite className="not-italic font-body text-[0.65rem] uppercase tracking-[0.22em] text-ink-300">
                Est. Surprise Arizona, 2022
              </cite>
            </m.div>
          </m.div>

          {/* ── Right: Image mosaic ─────────────────────────────────────────── */}
          <m.div
            initial={{ opacity: 0, x: 32 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={VIEWPORT_ONCE}
            transition={{ duration: 0.95, ease: EASE_LUXURY, delay: 0.15 }}
            className="grid grid-cols-2 gap-4"
            aria-hidden="true"
          >
            <ImageTile
              alt="Restaurant interior at Sofi's"
              gradient="radial-gradient(circle at 40% 30%, #7A4020 0%, #3A1A08 50%, #1C0E04 100%)"
              aspectClass="aspect-3/4"
              className="row-span-2"
            />
            <ImageTile
              alt="Seasonal dish beautifully plated"
              gradient="radial-gradient(circle at 50% 40%, #C07830 0%, #7A3C0A 45%, #2E1404 100%)"
              aspectClass="aspect-square"
            />
            <ImageTile
              alt="Kitchen craft and preparation"
              gradient="radial-gradient(circle at 45% 55%, #6A5530 0%, #3E2E0E 50%, #1E1406 100%)"
              aspectClass="aspect-square"
            />
          </m.div>
        </div>
      </div>
    </section>
  );
}

export default ExperienceSection;