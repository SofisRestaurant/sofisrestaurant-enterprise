// src/components/ui/AnimatedHeadline.tsx
// ─── Animated headline with shimmer accent word ───────────────────────────────
// Use for section headings that need a premium entrance with an italic
// gold accent word. Supports stagger with sibling AnimateIn components.

import React from 'react';
import { m } from 'framer-motion';
import { EASE_LUXURY, VIEWPORT_ONCE } from '@/lib/motion';

export interface AnimatedHeadlineProps {
  /** Plain text before the accent word */
  prefix?: string;
  /** Italic gold accent word(s) */
  accent: string;
  /** Plain text after the accent word */
  suffix?: string;
  /** Tailwind size class or clamp string */
  size?: string;
  /** Light or dark surface */
  theme?: 'light' | 'dark';
  /** Semantic heading level */
  as?: 'h1' | 'h2' | 'h3';
  id?: string;
  className?: string;
  /** Extra animation delay in seconds */
  delay?: number;
}

export function AnimatedHeadline({
  prefix,
  accent,
  suffix,
  size = "text-[clamp(2rem,5vw,3.2rem)]",
  theme = 'light',
  as: Tag = 'h2',
  id,
  className = '',
  delay = 0,
}: AnimatedHeadlineProps) {
  const textColor = theme === 'dark' ? 'text-white' : 'text-[#1C1C1C]';
  const accentColor = theme === 'dark' ? 'text-[#E8C46A]' : 'text-[#A84520]';

  return (
    <m.div
      initial={{ opacity: 0, y: 20, filter: 'blur(6px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={VIEWPORT_ONCE}
      transition={{ duration: 0.85, ease: EASE_LUXURY, delay }}
    >
      <Tag
        id={id}
        className={[
          'font-display leading-[1.05] tracking-tight',
          size,
          textColor,
          className,
        ].join(' ')}
      >
        {prefix && <>{prefix}{' '}</>}
        <em className={`font-display italic ${accentColor}`} style={{ fontStyle: 'italic' }}>
          {accent}
        </em>
        {suffix && <>{' '}{suffix}</>}
      </Tag>
    </m.div>
  );
}

export default AnimatedHeadline;