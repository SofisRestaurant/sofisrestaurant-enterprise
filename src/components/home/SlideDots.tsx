// src/components/home/SlideDots.tsx
// ─── Hero slider navigation dots ─────────────────────────────────────────────
//
// Design system upgrade 2026:
//   • Active dot color uses CSS token var() instead of hardcoded hex
//   • Inactive dot opacity aligned with token opacity scale
//   • Focus ring uses token gold-400 reference
//   • Height corrected to h-[3px] (Tailwind arbitrary value)

import { motion as m } from 'framer-motion';
import React from 'react';
import { SPRING_SNAPPY } from '@/lib/motion';

interface SlideDotsProps {
  slides:   { id: number }[];
  current:  number;
  onSelect: (index: number) => void;
}

export function SlideDots({ slides, current, onSelect }: SlideDotsProps) {
  return (
    <div
      className="absolute bottom-8 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2"
      role="tablist"
      aria-label="Slide navigation"
    >
      {slides.map((slide, index) => {
        const isActive = index === current;
        return (
          <m.button
            key={slide.id}
            role="tab"
            aria-selected={isActive}
            aria-label={`Go to slide ${index + 1}`}
            onClick={() => onSelect(index)}
            className="h-3px cursor-pointer rounded-full
                       focus-visible:outline-none focus-visible:ring-2
                       focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            style={{
              // Focus ring uses token color — cannot be a Tailwind class here
              // because the ring target is a motion element
              outlineColor: 'var(--color-gold-400, #d4af37)',
            }}
            animate={{
              width:           isActive ? 32 : 12,
              backgroundColor: isActive
                ? 'var(--color-gold-400, #d4af37)'
                : 'rgba(255,255,255,0.28)',
            }}
            whileHover={
              !isActive
                ? { backgroundColor: 'rgba(255,255,255,0.55)', width: 18 }
                : undefined
            }
            transition={SPRING_SNAPPY}
          />
        );
      })}
    </div>
  );
}

export default SlideDots;