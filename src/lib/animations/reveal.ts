// src/lib/animations/reveal.ts
// ─── Scroll-triggered entrance variants ──────────────────────────────────────
//
// These variants are designed for use with:
//   initial="hidden" whileInView="visible" viewport={SECTION_VIEWPORT}
//
// Every `hidden` state explicitly sets opacity:0 (and y/scale offsets).
// This is REQUIRED — without it, Framer Motion has no start state and the
// element appears fully visible immediately, making the animation a no-op.
//
// Rule: every variant used with whileInView MUST have opacity:0 in its hidden state.

import type { Variants } from 'framer-motion';

// ── Viewport config ───────────────────────────────────────────────────────────

/** Standard viewport for section-level scroll triggers */
export const SECTION_VIEWPORT = {
  once:   true,
  amount: 0.15,
} as const;

/** Eager trigger — fires as soon as 10% is visible */
export const EAGER_VIEWPORT = {
  once:   true,
  amount: 0.1,
} as const;

/** Lazy trigger — waits for 30% visibility */
export const LAZY_VIEWPORT = {
  once:   true,
  amount: 0.3,
} as const;

// ── Easings (local copy — avoids re-importing motion.ts in every component) ──

const EL = [0.16, 1, 0.3, 1] as const;   // luxury
const ES = [0.34, 1.56, 0.64, 1] as const; // spring

// ── Core entrance variants ────────────────────────────────────────────────────

/** Simple fade-up — primary workhorse for section content */
export const fadeUp: Variants = {
  hidden:  { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.75, ease: EL } },
};

/** Fade-up with blur — headlines and hero text only */
export const fadeUpBlur: Variants = {
  hidden:  { opacity: 0, y: 24, filter: 'blur(4px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.9, ease: EL } },
};

/** Fade in place — overlays, backgrounds, decorative elements */
export const fadeIn: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.65, ease: EL } },
};

/** Slide from left */
export const slideLeft: Variants = {
  hidden:  { opacity: 0, x: -32 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.7, ease: EL } },
};

/** Slide from right */
export const slideRight: Variants = {
  hidden:  { opacity: 0, x: 32 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.7, ease: EL } },
};

/** Scale-up entrance — cards, images, modals */
export const scaleUp: Variants = {
  hidden:  { opacity: 0, scale: 0.94, y: 16 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.6, ease: EL } },
};

/** Scale from center — badges, icons, pops */
export const scaleIn: Variants = {
  hidden:  { opacity: 0, scale: 0.88 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.55, ease: ES } },
};

// ── Feature card variant (supports custom index for per-card delay) ────────────

/**
 * Feature card reveal with custom stagger delay.
 * Usage: custom={index} variants={featureCardReveal}
 * Parent must have initial="hidden" whileInView="visible".
 */
export const featureCardReveal: Variants = {
  hidden: {
    opacity: 0,
    y:       20,
    scale:   0.97,
  },
  visible: (i: number = 0) => ({
    opacity: 1,
    y:       0,
    scale:   1,
    transition: {
      duration: 0.55,
      ease:     EL,
      delay:    i * 0.1,
    },
  }),
};

// ── Line / divider variants ────────────────────────────────────────────────────

/** Gold horizontal rule grow-from-left */
export const lineGrowX: Variants = {
  hidden:  { scaleX: 0, opacity: 0, originX: 0 },
  visible: { scaleX: 1, opacity: 1, transition: { duration: 1.1, ease: EL, delay: 0.2 } },
};

/** Vertical line grow-from-top */
export const lineGrowY: Variants = {
  hidden:  { scaleY: 0, opacity: 0, originY: 0 },
  visible: { scaleY: 1, opacity: 1, transition: { duration: 0.6, ease: EL } },
};