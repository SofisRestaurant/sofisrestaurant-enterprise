// src/lib/animations/stagger.ts
// ─── Stagger container variants ───────────────────────────────────────────────
//
// These are PARENT-only variants. Children must have their own variants
// (like featureCardReveal, fadeUp, scaleIn) with opacity:0 in their hidden state.
//
// Critical usage pattern:
//   <m.div variants={staggerMedium} initial="hidden" whileInView="visible" viewport={...}>
//     <ChildWithVariants />   ← inherits hidden/visible from parent, no need for initial here
//   </m.div>
//
// The parent's initial="hidden" propagates down to all children that use variants.
// The parent's whileInView="visible" triggers all children when the parent enters view.
// The staggerChildren delay creates the cascade effect.

import type { Variants } from 'framer-motion';

/** Medium stagger — feature cards, service pillars (3-4 items) */
export const staggerMedium: Variants = {
  hidden:  {},
  visible: {
    transition: {
      staggerChildren: 0.10,
      delayChildren:   0.05,
    },
  },
};

/** Slow stagger — CTA sections, hero text blocks */
export const staggerSlow: Variants = {
  hidden:  {},
  visible: {
    transition: {
      staggerChildren: 0.14,
      delayChildren:   0.1,
    },
  },
};

/** Fast stagger — lists, dense grids (6+ items) */
export const staggerFast: Variants = {
  hidden:  {},
  visible: {
    transition: {
      staggerChildren: 0.06,
      delayChildren:   0.0,
    },
  },
};

/** Section header stagger — eyebrow + headline + rule */
export const staggerHeader: Variants = {
  hidden:  {},
  visible: {
    transition: {
      staggerChildren: 0.10,
      delayChildren:   0.0,
    },
  },
};