// src/components/home/OrderingSteps.tsx
// ─── Visual ordering process section ─────────────────────────────────────────
//
// Fix: removed `borderOpacity` from the StepCard bubble <m.div> style prop.
// `borderOpacity` is not a valid CSS or MotionStyle property.
// Alpha is now encoded directly into the borderColor rgba() value.

import React from 'react';
import { motion as m } from 'framer-motion';
import { Link } from 'react-router-dom';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { EASE_LUXURY, EASE_SPRING, VIEWPORT_ONCE, staggerContainer } from '@/lib/motion';

// ── Data ──────────────────────────────────────────────────────────────────────

const STEPS = [
  {
    number:      '01',
    icon:        '🍽️',
    title:       'Browse the Menu',
    description: 'Explore seasonal dishes, filter by dietary preference, and discover daily specials from our kitchen.',
    cta:         null,
  },
  {
    number:      '02',
    icon:        '✨',
    title:       'Reserve or Order',
    description: 'Book your table for a memorable evening in, or place a delivery order directly from the menu.',
    cta:         null,
  },
  {
    number:      '03',
    icon:        '🥂',
    title:       'Savour the Experience',
    description: 'Whether dining in or at home — every dish arrives as intended, beautifully presented.',
    cta:         '/menu',
  },
];

// ── Step card ─────────────────────────────────────────────────────────────────

function StepCard({
  step,
  index,
  isLast,
}: {
  step:   typeof STEPS[number];
  index:  number;
  isLast: boolean;
}) {
  return (
    <m.div
      className="relative flex flex-col items-center gap-5 text-center"
      variants={{
        hidden:  { opacity: 0, y: 28, scale: 0.95 },
        visible: {
          opacity: 1, y: 0, scale: 1,
          transition: { duration: 0.6, ease: EASE_LUXURY, delay: index * 0.12 },
        },
      }}
    >
      {/* Connector line between step bubbles (hidden on last) */}
      {!isLast && (
        <m.div
          aria-hidden="true"
          className="absolute top-2.75rem left-[calc(50%+3rem)] right-[calc(-50%+3rem)] hidden h-px lg:block"
          style={{
            background: 'linear-gradient(90deg, rgba(212,175,55,0.38) 0%, rgba(212,175,55,0.08) 100%)',
            originX:    0,
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          whileInView={{ scaleX: 1, opacity: 1 }}
          viewport={VIEWPORT_ONCE}
          transition={{ duration: 1.1, ease: EASE_LUXURY, delay: index * 0.12 + 0.4 }}
        />
      )}

      {/* Step bubble */}
      <m.div
        className="relative flex h-5.5rem w-5.5rem shrink-0 items-center
                   justify-center rounded-full border bg-white"
        style={{
          borderColor: 'rgba(212,175,55,0.20)',
          boxShadow:   '0 4px 24px rgba(212,175,55,0.08)',
        }}
        whileHover={{
          scale:       1.08,
          borderColor: 'rgba(212,175,55,0.50)',
          boxShadow:   '0 8px 36px rgba(212,175,55,0.18)',
        }}
        transition={{ duration: 0.3, ease: EASE_SPRING }}
      >
        {/* Step number — top-right badge */}
        <span
          className="absolute -right-1 -top-2 rounded-full bg-white px-1.5
                     font-body text-[0.55rem] font-bold uppercase tracking-[0.18em]"
          style={{ color: 'var(--color-gold-400, #d4af37)' }}
        >
          {step.number}
        </span>

        <span className="text-[2rem]" role="img" aria-label={step.title}>
          {step.icon}
        </span>
      </m.div>

      {/* Text block */}
      <div className="flex max-w-14rem flex-col gap-2">
        <h3
          className="font-display leading-snug text-ink-900"
          style={{ fontSize: '1.08rem' }}
        >
          {step.title}
        </h3>
        <p className="font-body text-[0.82rem] font-light leading-relaxed text-ink-500">
          {step.description}
        </p>

        {step.cta && (
          <m.div
            className="mt-2"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.15, ease: EASE_SPRING }}
          >
            <Link
              to={step.cta}
              className="link-line inline-flex items-center gap-1.5 font-body
                         text-[0.72rem] font-medium uppercase tracking-[0.12em]
                         transition-colors duration-200"
              style={{ color: 'var(--color-gold-400, #d4af37)' }}
              aria-label="Get started — browse our menu"
            >
              Get Started
              <m.span
                animate={{ x: [0, 4, 0] }}
                transition={{ duration: 1.7, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.5 }}
                aria-hidden="true"
              >
                →
              </m.span>
            </Link>
          </m.div>
        )}
      </div>
    </m.div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function OrderingSteps() {
  return (
    <section
      aria-labelledby="ordering-steps-heading"
      className="section-wrap px-5 py-16 sm:py-24 sm:px-8 md:px-12"
      style={{ background: 'var(--color-cream-100, #faf6ef)' }}
    >
      <div className="mx-auto max-w-5xl">

        {/* Section header */}
        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT_ONCE}
          transition={{ duration: 0.65, ease: EASE_LUXURY }}
          className="mb-16 flex flex-col items-center gap-3 text-center"
        >
          <SectionLabel centered>How It Works</SectionLabel>

          <h2
            id="ordering-steps-heading"
            className="font-display leading-[1.05] tracking-[-0.02em] text-ink-900"
            style={{ fontSize: 'clamp(1.8rem, 4.5vw, 3rem)' }}
          >
            Simple. Seamless.{' '}
            <em
              className="font-display italic"
              style={{ fontStyle: 'italic', color: 'var(--color-ember-500, #a96840)' }}
            >
              Delicious.
            </em>
          </h2>

          {/* Gold hairline below headline */}
          <m.div
            aria-hidden="true"
            className="mt-1 h-px w-12 origin-center"
            style={{
              background: 'linear-gradient(90deg, transparent, var(--color-gold-400, #d4af37), transparent)',
            }}
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={VIEWPORT_ONCE}
            transition={{ duration: 0.9, ease: EASE_LUXURY, delay: 0.22 }}
          />
        </m.div>

        {/* Steps grid */}
        <m.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_ONCE}
          className="grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-8"
        >
          {STEPS.map((step, i) => (
            <StepCard
              key={step.number}
              step={step}
              index={i}
              isLast={i === STEPS.length - 1}
            />
          ))}
        </m.div>

      </div>
    </section>
  );
}

export default OrderingSteps;