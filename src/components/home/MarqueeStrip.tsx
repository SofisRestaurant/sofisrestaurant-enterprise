// src/components/home/MarqueeStrip.tsx
// ─── Infinite-scroll marquee strip ───────────────────────────────────────────
//
// Animation fix 2026:
//   • Added `variant` prop ('dark' | 'cream') to control background context.
//   • The inner m.div that scrolls uses animate (not whileInView) — it's always
//     visible. No initial needed for the scroll animation.
//   • Wrapper has no Framer animation — parent (Home.tsx) wraps it in a
//     m.div with initial/animate for the entrance fade.
//   • Duplicate key bug fixed: keys encode copyIdx-itemIdx.
//   • useReducedMotion coerced to boolean.
//   • All hardcoded hex → CSS token var() references.

import React from 'react';
import { motion as m, useReducedMotion } from 'framer-motion';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MarqueeItem {
  label: string;
  icon?: React.ReactNode;
}

export interface MarqueeStripProps {
  items?:         MarqueeItem[];
  copies?:        number;
  speed?:         number;
  variant?:       'dark' | 'cream';
  className?:     string;
  itemClassName?: string;
  separator?:     React.ReactNode;
}

// ── Default data ──────────────────────────────────────────────────────────────

const DEFAULT_ITEMS: MarqueeItem[] = [
  { label: 'Fine Dining' },
  { label: 'Seasonal Menu' },
  { label: 'Private Events' },
  { label: 'Natural Wines' },
  { label: 'Dog-Friendly Terrace' },
  { label: 'Takeout & Delivery' },
  { label: 'Locally Sourced' },
  { label: 'Open Evenings' },
  { label: 'Michelin Recommended' },
  { label: 'Craft Cocktails' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function MarqueeStrip({
  items         = DEFAULT_ITEMS,
  copies        = 2,
  speed         = 40,
  variant       = 'dark',
  className,
  itemClassName,
  separator,
}: MarqueeStripProps) {
  const shouldReduceMotion: boolean = useReducedMotion() ?? false;

  const isDark = variant === 'dark';

  const defaultSeparator = (
    <span
      aria-hidden="true"
      className="mx-4 select-none"
      style={{ color: isDark ? 'rgba(212,175,55,0.40)' : 'rgba(212,175,55,0.55)' }}
    >
      ✦
    </span>
  );

  const sep = separator ?? defaultSeparator;

  const approxStripWidth = items.length * 120;
  const duration         = shouldReduceMotion ? 0 : approxStripWidth / speed;

  const allItems = Array.from({ length: copies }, (_, copyIdx) =>
    items.map((item, itemIdx) => ({ ...item, key: `${copyIdx}-${itemIdx}` })),
  ).flat();

  const edgeMaskFrom = isDark
    ? 'var(--color-stone-900, #1c1915)'
    : 'var(--color-cream-100, #faf6ef)';

  return (
    <div
      aria-hidden="true"
      className={`relative overflow-hidden py-3 ${className ?? ''}`}
      style={{
        background: isDark
          ? 'var(--color-stone-900, #1c1915)'
          : 'var(--color-cream-100, #faf6ef)',
      }}
    >
      {/* Edge fade masks */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20"
        style={{ background: `linear-gradient(to right, ${edgeMaskFrom}, transparent)` }}
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20"
        style={{ background: `linear-gradient(to left, ${edgeMaskFrom}, transparent)` }}
      />

      {/*
        The scrolling strip uses animate (not whileInView) — it loops forever
        and should start scrolling immediately. No initial prop needed.
      */}
      <m.div
        className="flex w-max items-center"
        animate={shouldReduceMotion ? undefined : { x: ['0%', '-50%'] }}
        transition={
          shouldReduceMotion
            ? undefined
            : { x: { duration, ease: 'linear', repeat: Infinity } }
        }
      >
        {allItems.map(({ key, label, icon }) => (
          <React.Fragment key={key}>
            <span
              className={[
                'inline-flex shrink-0 select-none items-center gap-2',
                'font-body text-[0.68rem] font-medium uppercase tracking-[0.18em]',
                'transition-colors duration-300',
                isDark ? 'text-white/35 hover:text-white/70' : 'text-ink-400 hover:text-ink-700',
                itemClassName ?? '',
              ].join(' ')}
            >
              {icon && (
                <span style={{ color: 'var(--color-gold-400, #d4af37)', opacity: 0.6 }}>
                  {icon}
                </span>
              )}
              {label}
            </span>
            {sep}
          </React.Fragment>
        ))}
      </m.div>
    </div>
  );
}

export default React.memo(MarqueeStrip);