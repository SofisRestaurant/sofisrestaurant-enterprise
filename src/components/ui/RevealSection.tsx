// src/components/ui/RevealSection.tsx
// ─── Scroll-triggered section wrapper with luxury entrance ───────────────────
// Wraps any section content with a configurable viewport-triggered animation.
// Used to DRY up repetitive whileInView boilerplate across sections.

import React, { type ReactNode } from 'react';
import { m, type Variants } from 'framer-motion';
import { EASE_LUXURY, VIEWPORT_ONCE } from '@/lib/motion';

export interface RevealSectionProps {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article' | 'aside';
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'fade';
  distance?: number;
  duration?: number;
  id?: string;
  'aria-labelledby'?: string;
  'aria-label'?: string;
}

function buildVariants(
  direction: RevealSectionProps['direction'],
  distance: number,
): Variants {
  const hidden: Record<string, unknown> = { opacity: 0 };
  if (direction === 'up') hidden.y = distance;
  if (direction === 'down') hidden.y = -distance;
  if (direction === 'left') hidden.x = distance;
  if (direction === 'right') hidden.x = -distance;

  return {
    hidden,
    visible: {
      opacity: 1,
      y: 0,
      x: 0,
      transition: { duration: 0.75, ease: EASE_LUXURY },
    },
  };
}

export function RevealSection({
  children,
  className,
  as: Tag = 'section',
  delay = 0,
  direction = 'up',
  distance = 28,
  duration = 0.75,
  id,
  'aria-labelledby': ariaLabelledby,
  'aria-label': ariaLabel,
}: RevealSectionProps) {
  const variants = buildVariants(direction, distance);

  // Override transition if delay/duration differ from defaults
  const overrideVariants: Variants = {
    hidden: variants.hidden,
    visible: {
      ...(typeof variants.visible === 'object' ? variants.visible : {}),
      transition: { duration, ease: EASE_LUXURY, delay },
    },
  };

  // Cast motion element dynamically
  const MotionTag = m[Tag as 'div'] as typeof m.div;

  return (
    <MotionTag
      id={id}
      variants={overrideVariants}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT_ONCE}
      className={className}
      aria-labelledby={ariaLabelledby}
      aria-label={ariaLabel}
    >
      {children}
    </MotionTag>
  );
}

export default RevealSection;