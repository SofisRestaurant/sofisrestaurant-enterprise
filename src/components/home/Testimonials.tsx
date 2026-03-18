// src/components/home/Testimonials.tsx
// ─── Social proof / review strip with animated entrance ──────────────────────
//
// Animation fix 2026:
//   • Replaced StaggerGroup (external dep with unknown animation behaviour)
//     with a direct m.div stagger wrapper using initial="hidden" whileInView="visible".
//   • QuoteCard: variants={scaleIn} has opacity:0 in hidden — parent stagger
//     wrapper propagates the hidden/visible state.
//   • Header: variants={fadeUp} with initial="hidden" — correct.
//   • RatingBar: initial={{ width: 0 }} on the fill bar — correct.
//   • All hardcoded hex → CSS token var() references.
//   • borderOpacity removed — alpha encoded into rgba() borderColor.

import React from 'react';
import { motion as m } from 'framer-motion';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { EASE_LUXURY, VIEWPORT_ONCE, fadeUp, scaleIn } from '@/lib/motion';
import { SECTION_VIEWPORT } from '@/lib/animations/reveal';
// staggerFast is re-exported from reveal.ts for convenience:
// import { staggerFast } from '@/lib/animations/stagger';

// ── Types & data ──────────────────────────────────────────────────────────────

interface Testimonial {
  id:     number;
  quote:  string;
  author: string;
  detail: string;
  rating: number;
  source: 'Google' | 'Yelp' | 'TripAdvisor' | 'OpenTable';
}

const TESTIMONIALS: Testimonial[] = [
  {
    id: 1,
    quote:
      'An evening that felt like theatre. The braised short rib was worth every penny — I was still thinking about it days later.',
    author: 'Margot L.',
    detail: 'Verified Guest · March 2025',
    rating: 5,
    source: 'OpenTable',
  },
  {
    id: 2,
    quote:
      'The attention to detail here is extraordinary. Every dish arrived as if it had been painted. The wine pairings were inspired.',
    author: 'James & Claire W.',
    detail: 'Anniversary Dinner · February 2025',
    rating: 5,
    source: 'Google',
  },
  {
    id: 3,
    quote:
      "I've dined across Surprise Arizona for twenty years. Sofi's has quietly become my benchmark. Impeccable without pretension.",
    author: 'Rafael M.',
    detail: 'Regular Guest · January 2025',
    rating: 5,
    source: 'Yelp',
  },
  {
    id: 4,
    quote:
      'The chocolate soufflé alone justifies the reservation. Our server knew every dish like a friend would — warm, knowledgeable, genuine.',
    author: 'Priya S.',
    detail: 'Birthday Celebration · December 2024',
    rating: 5,
    source: 'TripAdvisor',
  },
];

// ── Stars ─────────────────────────────────────────────────────────────────────

function Stars({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${count} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => {
        const key = `star-${i}`; // stable key

        return (
          <svg
            key={key}
            width="11"
            height="11"
            viewBox="0 0 12 12"
            aria-hidden="true"
            fill={i < count ? 'var(--color-gold-400, #d4af37)' : 'none'}
            stroke={i < count ? 'var(--color-gold-400, #d4af37)' : 'var(--color-ink-300, #c8b8a8)'}
            strokeWidth="1"
          >
            <polygon points="6,1 7.5,4.5 11,4.8 8.5,7 9.3,10.5 6,8.7 2.7,10.5 3.5,7 1,4.8 4.5,4.5" />
          </svg>
        );
      })}
    </div>
  );
}

// ── Source badge ──────────────────────────────────────────────────────────────

const SOURCE_STYLES: Record<Testimonial['source'], React.CSSProperties> = {
  Google:      { background: 'rgba(66,133,244,0.08)',  color: '#4285F4' },
  Yelp:        { background: 'rgba(211,34,35,0.08)',   color: '#d32323' },
  TripAdvisor: { background: 'rgba(52,224,161,0.08)',  color: '#00aa6c' },
  OpenTable:   { background: 'rgba(218,55,67,0.08)',   color: '#DA3743' },
};

function SourceBadge({ source }: { source: Testimonial['source'] }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 font-body text-[0.55rem] font-medium uppercase tracking-[0.12em]"
      style={SOURCE_STYLES[source]}
    >
      {source}
    </span>
  );
}

// ── Quote card ────────────────────────────────────────────────────────────────

function QuoteCard({ item, index }: { item: Testimonial; index: number }) {
  return (
    /*
      variants={scaleIn} has opacity:0 in its hidden state.
      Parent stagger wrapper (initial="hidden" whileInView="visible") propagates
      the trigger — no initial prop needed directly on this element.
    */
    <m.article
      variants={scaleIn}
      transition={{ delay: index * 0.08 }}
      whileHover={{
        y:           -5,
        boxShadow:   '0 20px 52px rgba(212,175,55,0.12)',
        borderColor: 'rgba(212,175,55,0.28)',
        transition:  { duration: 0.3, ease: EASE_LUXURY },
      }}
      className="group relative flex cursor-default flex-col gap-5 overflow-hidden
                 rounded-[1.25rem] border bg-white p-6 sm:p-7"
      style={{ borderColor: 'rgba(212,175,55,0.10)' }}
      role="article"
      aria-label={`Review by ${item.author}`}
    >
      {/* Decorative quote mark */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-5 top-4 select-none font-display
                   text-[4.5rem] leading-none transition-opacity duration-300
                   group-hover:opacity-[0.12]"
        style={{ color: 'var(--color-gold-400, #d4af37)', opacity: 0.07 }}
      >
        "
      </span>

      <div className="flex items-center justify-between gap-2">
        <Stars count={item.rating} />
        <SourceBadge source={item.source} />
      </div>

      <blockquote
        className="flex-1 font-serif font-light italic leading-[1.78]"
        style={{ fontSize: '0.93rem', color: 'var(--color-ink-700, #4e3e34)' }}
      >
        "{item.quote}"
      </blockquote>

      <footer
        className="flex flex-col gap-0.5 border-t pt-4"
        style={{ borderColor: 'rgba(212,175,55,0.10)' }}
      >
        <span className="font-body text-sm font-medium" style={{ color: 'var(--color-ink-900, #1c1c1c)' }}>
          {item.author}
        </span>
        <span className="font-body text-[0.7rem] font-light" style={{ color: 'var(--color-ink-400, #a89888)' }}>
          {item.detail}
        </span>
      </footer>
    </m.article>
  );
}

// ── Rating bar ────────────────────────────────────────────────────────────────

function RatingBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="w-20 shrink-0 font-body text-[0.72rem] font-light"
        style={{ color: 'var(--color-ink-500, #8a7a6a)' }}
      >
        {label}
      </span>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full"
        style={{ background: 'rgba(212,175,55,0.12)' }}
      >
        {/* initial required — bar starts at width:0 and animates to value% */}
        <m.div
          className="h-full rounded-full"
          style={{ background: 'var(--color-gold-400, #d4af37)' }}
          initial={{ width: 0 }}
          whileInView={{ width: `${value}%` }}
          viewport={VIEWPORT_ONCE}
          transition={{ duration: 1.2, ease: EASE_LUXURY, delay: 0.3 }}
        />
      </div>
      <span
        className="w-7 text-right font-body text-[0.72rem] font-medium"
        style={{ color: 'var(--color-gold-400, #d4af37)' }}
      >
        {(value / 20).toFixed(1)}
      </span>
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

export interface TestimonialsProps {
  testimonials?: Testimonial[];
}

const staggerCards = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

export function Testimonials({ testimonials = TESTIMONIALS }: TestimonialsProps) {
  return (
    <section
      aria-labelledby="testimonials-heading"
      className="section-wrap relative overflow-[clip] px-5 py-16 sm:py-28 sm:px-8 md:px-12"
      style={{ background: 'var(--color-cream-100, #faf6ef)' }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: [
            'radial-gradient(ellipse 60% 40% at 10% 50%, rgba(212,175,55,0.05) 0%, transparent 60%)',
            'radial-gradient(ellipse 50% 30% at 90% 20%, rgba(168,69,32,0.04) 0%, transparent 55%)',
          ].join(','),
        }}
      />

      <div className="relative mx-auto max-w-6xl">

        {/* Section header — initial="hidden" required */}
        <m.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_ONCE}
          className="mb-14 flex flex-col items-center gap-3 text-center"
        >
          <SectionLabel centered>What Our Guests Say</SectionLabel>
          <h2
            id="testimonials-heading"
            className="font-display leading-[1.05] tracking-[-0.02em]"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.2rem)', color: 'var(--color-ink-900, #1c1c1c)' }}
          >
            Experiences Worth{' '}
            <em
              className="font-display italic"
              style={{ fontStyle: 'italic', color: 'var(--color-ember-500, #a96840)' }}
            >
              Sharing
            </em>
          </h2>

          <div className="mt-2 flex items-center gap-3">
            <span
              className="font-display font-medium leading-none"
              style={{ fontSize: '2.5rem', color: 'var(--color-gold-400, #d4af37)' }}
            >
              4.9
            </span>
            <div className="flex flex-col gap-1">
              <Stars count={5} />
              <span className="font-body text-[0.68rem]" style={{ color: 'var(--color-ink-400, #a89888)' }}>
                Based on 340+ reviews
              </span>
            </div>
          </div>
        </m.div>

        {/*
          Cards stagger wrapper.
          initial="hidden" propagates to all QuoteCard children via variants.
          Without initial="hidden" every card starts visible — no animation.
        */}
        <m.div
          variants={staggerCards}
          initial="hidden"
          whileInView="visible"
          viewport={SECTION_VIEWPORT}
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4"
        >
          {testimonials.map((t, i) => (
            <QuoteCard key={t.id} item={t} index={i} />
          ))}
        </m.div>

        {/* Rating bars — initial="hidden" required */}
        <m.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_ONCE}
          transition={{ delay: 0.4 }}
          className="mx-auto mt-12 flex max-w-xs flex-col gap-2.5"
          aria-label="Rating breakdown"
        >
          <RatingBar label="Food"     value={98} />
          <RatingBar label="Service"  value={96} />
          <RatingBar label="Ambiance" value={97} />
          <RatingBar label="Value"    value={90} />
        </m.div>

      </div>
    </section>
  );
}

export default Testimonials;