// src/components/home/Hours.tsx
// ─── Operating hours, location, and reservation CTA ──────────────────────────
//
// Animation rules:
//   • <m.tbody> stagger: initial="hidden" whileInView="visible"
//   • Each <m.tr> uses rowVariant (opacity:0 in hidden state)
//   • LocationCard: initial={{ opacity:0, y:20 }} whileInView
//   • Footnotes: initial={{ opacity:0, y:8 }} whileInView each
//   • Section header stagger: initial="hidden" on container
//   • Gold rules: initial={{ scaleX:0 }} whileInView

import type { CSSProperties } from 'react';
import { motion as m } from 'framer-motion';
import { Link } from 'react-router-dom';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { EASE_LUXURY, VIEWPORT_ONCE, fadeUp, fadeIn, staggerContainer } from '@/lib/motion';
import { SECTION_VIEWPORT } from '@/lib/animations/reveal';

// ── Data ──────────────────────────────────────────────────────────────────────

interface DaySchedule {
  day: string;
  lunch?: string;
  dinner: string;
  note?: string;
}

export interface HoursProps {
  onReservationClick?: () => void;
}

const SCHEDULE: DaySchedule[] = [
  { day: 'Monday', dinner: 'Closed' },
  { day: 'Tuesday', dinner: '5:30 – 10 pm' },
  { day: 'Wednesday', dinner: '5:30 – 10 pm' },
  { day: 'Thursday', dinner: '5:30 – 10 pm' },
  { day: 'Friday', lunch: '12 – 2:30 pm', dinner: '5:30 – 11 pm' },
  { day: 'Saturday', lunch: '11 am – 2:30 pm', dinner: '5:30 – 11 pm' },
  { day: 'Sunday', lunch: '11 am – 3 pm', dinner: '5 – 9 pm', note: 'Brunch menu' },
];

const rowVariant = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_LUXURY } },
};

const staggerRows = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } },
};

const lineGrow = {
  hidden: { scaleX: 0, opacity: 0, originX: 0 },
  visible: { scaleX: 1, opacity: 1, transition: { duration: 1.0, ease: EASE_LUXURY } },
};

// ── Footnotes — explicit named entries, no null-slot array mapping ─────────────

interface Footnote {
  key:   string;
  delay: number;
  muted: boolean;
  content: 'kitchen' | 'holiday' | 'reservations';
}

const FOOTNOTES: Footnote[] = [
  { key: 'note-kitchen',      delay: 0.20, muted: false, content: 'kitchen'      },
  { key: 'note-holiday',      delay: 0.28, muted: false, content: 'holiday'      },
  { key: 'note-reservations', delay: 0.36, muted: true,  content: 'reservations' },
];

// ── Hours table ───────────────────────────────────────────────────────────────

function HoursTable() {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });

  return (
    <div
      className="overflow-hidden rounded-[1.25rem] border"
      style={{ borderColor: 'rgba(212,175,55,0.12)' }}
    >
      <table className="w-full border-collapse" aria-label="Operating hours by day">
        <thead>
          <tr
            className="font-body text-[0.62rem] uppercase tracking-[0.18em]"
            style={{
              background: 'rgba(212,175,55,0.06)',
              color: 'var(--color-gold-500, #b8961f)',
              borderBottom: '1px solid rgba(212,175,55,0.10)',
            }}
          >
            <th scope="col" className="py-3 pl-5 pr-3 text-left font-medium sm:pl-6">
              Day
            </th>
            <th scope="col" className="py-3 px-3 text-left font-medium">
              Lunch
            </th>
            <th scope="col" className="py-3 pl-3 pr-5 text-left font-medium sm:pr-6">
              Dinner
            </th>
          </tr>
        </thead>

        {/* tbody is the stagger parent — initial="hidden" required */}
        <m.tbody
          variants={staggerRows}
          initial="hidden"
          whileInView="visible"
          viewport={SECTION_VIEWPORT}
        >
          {SCHEDULE.map((row) => {
            const isToday = row.day === today;
            const isClosed = row.dinner === 'Closed';
            return (
              <m.tr
                key={row.day}
                variants={rowVariant}
                className="border-b font-body text-[0.85rem] last:border-b-0"
                style={{
                  borderColor: 'rgba(212,175,55,0.07)',
                  background: isToday ? 'rgba(212,175,55,0.04)' : 'transparent',
                  color: isClosed
                    ? 'var(--color-ink-300, #c8b8a8)'
                    : 'var(--color-ink-800, #2d2520)',
                }}
              >
                <td className="py-3.5 pl-5 pr-3 sm:pl-6">
                  <span className="flex items-center gap-2">
                    {isToday && (
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: 'var(--color-gold-400, #d4af37)' }}
                        aria-label="Today"
                      />
                    )}
                    <span style={{ fontWeight: isToday ? 500 : 400 }}>{row.day}</span>
                  </span>
                </td>
                <td
                  className="py-3.5 px-3 text-[0.82rem]"
                  style={{ color: 'var(--color-ink-400, #a89888)' }}
                >
                  {row.lunch ?? <span style={{ color: 'var(--color-ink-200, #ddd4c8)' }}>—</span>}
                </td>
                <td className="py-3.5 pl-3 pr-5 sm:pr-6">
                  <span className="flex flex-col gap-0.5">
                    {row.dinner}
                    {row.note && (
                      <span
                        className="font-body text-[0.68rem] uppercase tracking-[0.12em]"
                        style={{ color: 'var(--color-gold-500, #b8961f)' }}
                      >
                        {row.note}
                      </span>
                    )}
                  </span>
                </td>
              </m.tr>
            );
          })}
        </m.tbody>
      </table>
    </div>
  );
}

// ── Location card ─────────────────────────────────────────────────────────────

interface LocationCardProps {
  onReservationClick?: () => void;
}

function LocationCard({ onReservationClick }: LocationCardProps) {
  return (
    <m.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={SECTION_VIEWPORT}
      transition={{ duration: 0.65, ease: EASE_LUXURY, delay: 0.15 }}
      className="flex flex-col gap-5 rounded-[1.25rem] p-6 sm:p-7"
      style={{
        background: 'var(--color-stone-900, #1c1915)',
        border: '1px solid rgba(212,175,55,0.10)',
      }}
    >
      {/* Address */}
      <div className="flex flex-col gap-1">
        <span
          className="font-body text-[0.62rem] font-medium uppercase tracking-[0.20em]"
          style={{ color: 'var(--color-gold-400, #d4af37)' }}
        >
          Find Us
        </span>
        <address className="not-italic font-body text-[0.92rem] font-light leading-relaxed text-white/80">
          742 Valencia Street
          <br />
          Surprise Arizona, AZ 85378
        </address>
      </div>

      {/* Gold rule */}
      <m.div
        className="h-px origin-left"
        style={{ background: 'rgba(212,175,55,0.18)' }}
        variants={lineGrow}
        initial="hidden"
        whileInView="visible"
        viewport={SECTION_VIEWPORT}
      />

      {/* Contact */}
      <div className="flex flex-col gap-2">
        <a
          href="tel:+14158675309"
          className="flex items-center gap-2 font-body text-[0.85rem] transition-colors duration-200"
          style={{ color: 'rgba(255,255,255,0.65)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'white';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'rgba(255,255,255,0.65)';
          }}
        >
          <span style={{ color: 'var(--color-gold-400, #d4af37)' }} aria-hidden="true">
            ↗
          </span>
          (415) 867-5309
        </a>
        <a
          href="mailto:hello@sofisrestaurant.com"
          className="flex items-center gap-2 font-body text-[0.85rem] transition-colors duration-200"
          style={{ color: 'rgba(255,255,255,0.65)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'white';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'rgba(255,255,255,0.65)';
          }}
        >
          <span style={{ color: 'var(--color-gold-400, #d4af37)' }} aria-hidden="true">
            ↗
          </span>
          hello@sofisrestaurant.com
        </a>
      </div>

      {/* Gold rule */}
      <m.div
        className="h-px origin-left"
        style={{ background: 'rgba(212,175,55,0.18)' }}
        variants={lineGrow}
        initial="hidden"
        whileInView="visible"
        viewport={SECTION_VIEWPORT}
        transition={{ delay: 0.12 }}
      />

      {/* Reservation CTA */}
      <m.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.18, ease: EASE_LUXURY }}
      >
        <Link
          to="/reservations"
          onClick={onReservationClick}
          className="flex w-full items-center justify-center gap-2 rounded-full
                     py-3 font-body text-[0.75rem] font-medium uppercase tracking-[0.14em]
                     transition-[background-color,box-shadow] duration-300
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          style={
            {
              background: 'var(--color-gold-400, #d4af37)',
              color: 'var(--color-stone-900, #1c1915)',
              '--tw-ring-color': 'var(--color-gold-400, #d4af37)',
            } as CSSProperties
          }
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-gold-300, #e8c46a)';
            e.currentTarget.style.boxShadow = '0 0 28px rgba(212,175,55,0.28)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--color-gold-400, #d4af37)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          Reserve a Table
          <m.span
            animate={{ x: [0, 4, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.5 }}
            aria-hidden="true"
          >
            →
          </m.span>
        </Link>
      </m.div>
    </m.div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

export function Hours({ onReservationClick }: HoursProps) {
  return (
    <section
      aria-labelledby="hours-heading"
      className="section-wrap px-5 py-16 sm:py-24 sm:px-8 md:px-12"
      style={{ background: 'var(--color-cream-100, #faf6ef)' }}
    >
      {/* Ambient radial */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: [
            'radial-gradient(ellipse 50% 40% at 90% 10%, rgba(212,175,55,0.04) 0%, transparent 55%)',
            'radial-gradient(ellipse 40% 35% at 10% 90%, rgba(168,104,64,0.03) 0%, transparent 50%)',
          ].join(','),
        }}
      />

      <div className="relative mx-auto max-w-6xl">
        {/* Section header stagger — initial="hidden" required */}
        <m.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT_ONCE}
          className="mb-10 flex flex-col items-center gap-4 text-center"
        >
          <m.div variants={fadeIn}>
            <SectionLabel centered>Visit Us</SectionLabel>
          </m.div>

          <m.h2
            id="hours-heading"
            variants={fadeUp}
            className="font-display leading-[1.05] tracking-[-0.02em]"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.2rem)', color: 'var(--color-ink-900, #1c1c1c)' }}
          >
            Hours &{' '}
            <em
              className="font-display italic"
              style={{ fontStyle: 'italic', color: 'var(--color-ember-500, #a96840)' }}
            >
              Location
            </em>
          </m.h2>

          <m.div
            className="mt-1 h-px w-14 origin-center"
            style={{
              background:
                'linear-gradient(90deg, transparent, var(--color-gold-400, #d4af37), transparent)',
            }}
            variants={lineGrow}
            aria-hidden="true"
          />
        </m.div>

        {/* Two-col layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px] xl:grid-cols-[1fr_300px]">
          {/* Hours table */}
          <m.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={SECTION_VIEWPORT}
            transition={{ duration: 0.65, ease: EASE_LUXURY }}
          >
            <HoursTable />

            {/* Footnotes — explicit entries, no null-slot array or index keys */}
            <div className="mt-5 flex flex-col gap-2 px-1">
              {FOOTNOTES.map((fn) => {
                const baseStyle = fn.muted
                  ? 'var(--color-ink-300, #c8b8a8)'
                  : 'var(--color-ink-400, #a89888)';

                if (fn.content === 'holiday') {
                  return (
                    <m.p
                      key={fn.key}
                      initial={{ opacity: 0, y: 8 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={SECTION_VIEWPORT}
                      transition={{ duration: 0.5, ease: EASE_LUXURY, delay: fn.delay }}
                      className="font-body text-[0.72rem] font-light leading-relaxed"
                      style={{ color: baseStyle }}
                    >
                      * Holiday hours may vary — follow us on{' '}
                      <a
                        href="https://instagram.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 transition-colors duration-200"
                        style={{ color: 'var(--color-gold-500, #b8961f)' }}
                      >
                        @sofisrestaurant
                      </a>{' '}
                      for updates.
                    </m.p>
                  );
                }

                const text =
                  fn.content === 'kitchen'
                    ? '* Kitchen closes 30 minutes before listed closing time.'
                    : 'Reservations recommended for Friday–Sunday evenings.';

                return (
                  <m.p
                    key={fn.key}
                    initial={{ opacity: 0, y: 8 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={SECTION_VIEWPORT}
                    transition={{ duration: 0.5, ease: EASE_LUXURY, delay: fn.delay }}
                    className="font-body text-[0.72rem] font-light"
                    style={{ color: baseStyle }}
                  >
                    {text}
                  </m.p>
                );
              })}
            </div>
          </m.div>

          {/* Location + contact card */}
          <LocationCard onReservationClick={onReservationClick} />
        </div>
      </div>
    </section>
  );
}

export default Hours;