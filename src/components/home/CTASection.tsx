// src/components/home/CTASection.tsx
// ─── Ember conversion band ────────────────────────────────────────────────────
//
// Extracted from Home.tsx as a standalone component.
// staggerSlow container has initial="hidden" whileInView="visible".
// All fadeUpBlur children have opacity:0 in their hidden state.
// CTAGlow uses MotionValues (no initial/animate needed — it's event-driven).

import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion as m, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { SECTION_VIEWPORT, fadeUpBlur } from '@/lib/animations/reveal';
import { staggerSlow } from '@/lib/animations/stagger';

// ── Parallax glow orb ─────────────────────────────────────────────────────────

function CTAGlow() {
  const ref    = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);
  const sX     = useSpring(mouseX, { stiffness: 50, damping: 20 });
  const sY     = useSpring(mouseY, { stiffness: 50, damping: 20 });
  const orbX   = useTransform(sX, [0, 1], ['-8%', '8%']);
  const orbY   = useTransform(sY, [0, 1], ['-8%', '8%']);

  return (
    <m.div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{ x: orbX, y: orbY }}
      onMouseMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        mouseX.set((e.clientX - r.left) / r.width);
        mouseY.set((e.clientY - r.top)  / r.height);
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(232,196,106,0.22) 0%, transparent 70%)',
        }}
      />
    </m.div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CTASection() {
  return (
    <section
      aria-label="Call to action"
      className="section-wrap relative overflow-[clip] py-20 sm:py-28 px-5 sm:px-8 md:px-12 text-center"
      style={{ background: 'var(--color-ember-500, #a96840)' }}
    >
      {/* Gradient overlays */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: [
            'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(232,196,106,0.22) 0%, transparent 70%)',
            'radial-gradient(ellipse 40% 35% at 20% 80%, rgba(26,8,0,0.25) 0%, transparent 55%)',
          ].join(','),
        }}
      />

      {/* Noise texture */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '180px',
        }}
      />

      <CTAGlow />

      {/*
        Stagger container.
        initial="hidden" required — fadeUpBlur children start at opacity:0.
        whileInView="visible" triggers when the section scrolls into view.
      */}
      <m.div
        variants={staggerSlow}
        initial="hidden"
        whileInView="visible"
        viewport={SECTION_VIEWPORT}
        className="relative mx-auto max-w-2xl"
      >
        {/* Eyebrow */}
        <m.p
          variants={fadeUpBlur}
          className="mb-5 flex items-center justify-center gap-2.5 font-body
                     text-[0.62rem] font-medium uppercase tracking-[0.22em]"
          style={{ color: 'rgba(232,196,106,0.70)' }}
        >
          <span className="block h-px w-6" style={{ background: 'rgba(232,196,106,0.50)' }} aria-hidden="true" />
          Reserve Your Evening
          <span className="block h-px w-6" style={{ background: 'rgba(232,196,106,0.50)' }} aria-hidden="true" />
        </m.p>

        {/* Headline */}
        <m.h2
          variants={fadeUpBlur}
          className="mb-5 font-display leading-[1.02] tracking-[-0.03em] text-white"
          style={{ fontSize: 'clamp(2.4rem, 6vw, 4rem)' }}
        >
          Ready to{' '}
          <em
            className="font-display italic"
            style={{ fontStyle: 'italic', color: 'var(--color-gold-300, #e8c46a)' }}
          >
            Dine?
          </em>
        </m.h2>

        {/* Sub */}
        <m.p
          variants={fadeUpBlur}
          className="mx-auto mb-10 max-w-md font-body text-lg font-light"
          style={{ color: 'rgba(255,255,255,0.70)' }}
        >
          Browse our full menu and experience Sofi's — at your table or delivered to your door.
        </m.p>

        {/* Buttons */}
        <m.div
          variants={fadeUpBlur}
          className="flex flex-col items-center justify-center gap-4 xs:flex-row"
        >
          <m.div
            whileHover={{ scale: 1.05, y: -2, boxShadow: '0 24px 56px rgba(26,8,0,0.30)' }}
            transition={{ type: 'spring', stiffness: 300, damping: 16 }}
          >
            <Link
              to="/menu"
              className="inline-flex items-center justify-center rounded-full
                         px-8 py-3.5 font-body text-[0.78rem] font-medium uppercase tracking-[0.12em]
                         transition-colors duration-200
                         focus-visible:outline-none focus-visible:ring-2
                         focus-visible:ring-white focus-visible:ring-offset-2"
              style={{ background: 'white', color: 'var(--color-ember-500, #a96840)' }}
            >
              View Full Menu
            </Link>
          </m.div>

          <m.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Link
              to="/reservations"
              className="inline-flex items-center justify-center rounded-full border
                         px-8 py-3.5 font-body text-[0.78rem] font-medium uppercase tracking-[0.12em]
                         transition-all duration-200
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              style={{ borderColor: 'rgba(255,255,255,0.30)', color: 'rgba(255,255,255,0.80)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-gold-300, #e8c46a)';
                e.currentTarget.style.color       = 'var(--color-gold-300, #e8c46a)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.30)';
                e.currentTarget.style.color       = 'rgba(255,255,255,0.80)';
              }}
            >
              Make a Reservation
            </Link>
          </m.div>
        </m.div>
      </m.div>
    </section>
  );
}

export default CTASection;