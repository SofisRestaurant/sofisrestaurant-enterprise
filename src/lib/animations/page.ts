import type { Variants } from 'framer-motion';
import { EASE_LUXURY } from '@/lib/motion';

// Soft page-level transition for marketing pages.
// This is intentionally minimal so it can layer with section-level
// scroll reveals without feeling over-animated.
export const pageFade: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.55,
      ease: EASE_LUXURY,
    },
  },
  exit: {
    opacity: 0,
    y: -12,
    transition: {
      duration: 0.35,
      ease: EASE_LUXURY,
    },
  },
};

