// src/components/home/HouseRules.tsx
// ─── Policy / house rules card grid ──────────────────────────────────────────
//
// Animation: stagger grid with scaleUp variant.
// Every m.* with whileInView has a matching initial.

import { motion as m } from 'framer-motion';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { EASE_LUXURY, VIEWPORT_ONCE, fadeUp } from '@/lib/motion';
import { SECTION_VIEWPORT } from '@/lib/animations/reveal';

// ── Data ──────────────────────────────────────────────────────────────────────

const RULES = [
  {
    id: 'reservations',
    icon: '📅',
    title: 'Reservations',
    body: 'We recommend booking 48 hours ahead for Friday–Sunday evenings. Walk-ins welcome based on availability.',
  },
  {
    id: 'dietary',
    icon: '🌿',
    title: 'Dietary Needs',
    body: 'Please inform us of allergies or dietary requirements when booking. Our kitchen handles nuts, gluten, and dairy.',
  },
  {
    id: 'dress',
    icon: '👔',
    title: 'Dress Code',
    body: 'Smart casual. We want you to feel comfortable — just no beachwear in the dining room, please.',
  },
  {
    id: 'children',
    icon: '👨‍👩‍👧',
    title: 'Families Welcome',
    body: 'Children are welcome at all services. A small plates menu and high chairs are available on request.',
  },
  {
    id: 'cancellation',
    icon: '🔔',
    title: 'Cancellations',
    body: 'Cancel up to 24 hours before your reservation at no charge. Late cancellations may incur a small fee.',
  },
  {
    id: 'private',
    icon: '🥂',
    title: 'Private Dining',
    body: 'Hosting a celebration? We offer a private dining room for groups of 8–20. Contact us to enquire.',
  },
];

const cardVariant = {
  hidden: { opacity: 0, y: 22, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.55, ease: EASE_LUXURY } },
};

const staggerCards = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

// ── Component ─────────────────────────────────────────────────────────────────
export type Rule = {
  id: string;
  title: string;
  description: string;
};

export type HouseRulesProps = {
  rules: Rule[];
};

export function HouseRules() {
  return (
    <section
      aria-labelledby="house-rules-heading"
      className="section-wrap px-5 py-16 sm:py-24 sm:px-8 md:px-12"
      style={{ background: 'var(--color-cream-300, #ede0ce)' }}
    >
      {/* Ambient glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(212,175,55,0.04) 0%, transparent 60%)',
        }}
      />

      <div className="relative mx-auto max-w-6xl">
        {/* Section header */}
        <m.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_ONCE}
          className="mb-12 flex flex-col items-center gap-3 text-center"
        >
          <SectionLabel centered>Good to Know</SectionLabel>
          <h2
            id="house-rules-heading"
            className="font-display leading-[1.05] tracking-[-0.02em]"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.2rem)', color: 'var(--color-ink-900, #1c1c1c)' }}
          >
            Before You{' '}
            <em
              className="font-display italic"
              style={{ fontStyle: 'italic', color: 'var(--color-ember-500, #a96840)' }}
            >
              Visit
            </em>
          </h2>
        </m.div>

        {/*
          Cards stagger — initial="hidden" required.
          cardVariant has opacity:0 in hidden state.
        */}
        <m.div
          variants={staggerCards}
          initial="hidden"
          whileInView="visible"
          viewport={SECTION_VIEWPORT}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {RULES.map((rule) => (
            <m.div
              key={rule.id}
              variants={cardVariant}
              className="flex flex-col gap-3 rounded-[1.25rem] bg-white p-5 sm:p-6"
              style={{ border: '1px solid rgba(212,175,55,0.10)' }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-full text-lg"
                  style={{ background: 'var(--color-accent-pale, #fdf8e8)' }}
                  aria-hidden="true"
                >
                  {rule.icon}
                </span>
                <h3
                  className="font-display leading-snug"
                  style={{ fontSize: '1.05rem', color: 'var(--color-ink-900, #1c1c1c)' }}
                >
                  {rule.title}
                </h3>
              </div>
              <p
                className="font-body text-[0.82rem] font-light leading-relaxed"
                style={{ color: 'var(--color-ink-500, #8a7a6a)' }}
              >
                {rule.body}
              </p>
            </m.div>
          ))}
        </m.div>
      </div>
    </section>
  );
}

