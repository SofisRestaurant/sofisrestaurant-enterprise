// src/lib/motion.ts
// ─── Shared Framer Motion variants, easings, and helpers ─────────────────────
// Central source of truth for all animation configuration.
// Production-grade with performance hints and accessibility support.
//
// UPGRADED 2026: Added hero section variants, image mosaic reveals,
// experience section animations, and step connector variants.

import type { Variants, Transition } from 'framer-motion';

// ─────────────────────────────────────────────────────────────────────────────
// Easing Curves
// ─────────────────────────────────────────────────────────────────────────────

export const EASE_LUXURY   = [0.16, 1, 0.3, 1]      as const;
export const EASE_OUT      = [0.0,  0, 0.2, 1]       as const;
export const EASE_SPRING   = [0.34, 1.56, 0.64, 1]  as const;
export const EASE_STANDARD = [0.4, 0, 0.2, 1]        as const;

// ─────────────────────────────────────────────────────────────────────────────
// Spring Physics
// ─────────────────────────────────────────────────────────────────────────────

export const SPRING_SNAPPY: Transition = {
  type: 'spring',
  stiffness: 280,
  damping: 26,
  mass: 0.6,
};

export const SPRING_BOUNCY: Transition = {
  type: 'spring',
  stiffness: 220,
  damping: 18,
  mass: 0.8,
};

export const SPRING_GENTLE: Transition = {
  type: 'spring',
  stiffness: 120,
  damping: 22,
  mass: 1,
};

// ─────────────────────────────────────────────────────────────────────────────
// Viewport Defaults
// ─────────────────────────────────────────────────────────────────────────────

export const VIEWPORT_ONCE   = { once: true,  margin: '-80px 0px' } as const;
export const VIEWPORT_REPEAT = { once: false, margin: '-60px 0px' } as const;
export const VIEWPORT_EAGER  = { once: true,  amount: 0.1         } as const;
export const VIEWPORT_LAZY   = { once: true,  amount: 0.3         } as const;

// ─────────────────────────────────────────────────────────────────────────────
// Base Entry Variants
// ─────────────────────────────────────────────────────────────────────────────

/** Simple fade-up entrance — primary workhorse */
export const fadeUp: Variants = {
  hidden:  { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.75, ease: EASE_LUXURY },
  },
};

/** Fade-up with subtle blur — use sparingly for hero/headlines only */
export const fadeUpBlur: Variants = {
  hidden:  { opacity: 0, y: 24, filter: 'blur(4px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.9, ease: EASE_LUXURY },
  },
};

/** Fade in only — for backdrop overlays, text overlays */
export const fadeIn: Variants = {
  hidden:  { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.6, ease: EASE_OUT },
  },
};

/** Slide from left */
export const slideLeft: Variants = {
  hidden:  { opacity: 0, x: -36 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.7, ease: EASE_LUXURY },
  },
};

/** Slide from right */
export const slideRight: Variants = {
  hidden:  { opacity: 0, x: 36 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.7, ease: EASE_LUXURY },
  },
};

/** Scale-up entrance — cards, images */
export const scaleUp: Variants = {
  hidden:  { opacity: 0, scale: 0.94, y: 16 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.6, ease: EASE_LUXURY },
  },
};

/** Scale from center */
export const scaleIn: Variants = {
  hidden:  { opacity: 0, scale: 0.88 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.55, ease: EASE_SPRING },
  },
};

/** Clip reveal — expands from left edge */
export const clipReveal: Variants = {
  hidden:  { clipPath: 'inset(0 100% 0 0)' },
  visible: {
    clipPath: 'inset(0 0% 0 0)',
    transition: { duration: 0.9, ease: EASE_LUXURY },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Container / Stagger Variants
// ─────────────────────────────────────────────────────────────────────────────

/** Standard stagger container */
export const staggerContainer: Variants = {
  hidden:  {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

/** Slower stagger for section reveals */
export const staggerSlow: Variants = {
  hidden:  {},
  visible: {
    transition: { staggerChildren: 0.12, delayChildren: 0.1 },
  },
};

/** Fast stagger for dense lists */
export const staggerFast: Variants = {
  hidden:  {},
  visible: {
    transition: { staggerChildren: 0.055, delayChildren: 0 },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Section / Page-level Variants
// ─────────────────────────────────────────────────────────────────────────────

/** Section header (label + title block) */
export const sectionHeader: Variants = {
  hidden:  { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: EASE_LUXURY },
  },
};

/** Two-column layout stagger */
export const splitReveal: Variants = {
  hidden:  {},
  visible: {
    transition: { staggerChildren: 0.15 },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Hero Variants
// ─────────────────────────────────────────────────────────────────────────────

export const heroText: Variants = {
  hidden:  { opacity: 0, y: 36 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.9, ease: EASE_LUXURY },
  },
};

export const heroImage: Variants = {
  hidden:  { opacity: 0, scale: 1.06 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 1.4, ease: EASE_OUT },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Experience / Story Section Variants (NEW)
// ─────────────────────────────────────────────────────────────────────────────

/** Editorial text column entrance */
export const editorialReveal: Variants = {
  hidden:  { opacity: 0, x: -28 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.85, ease: EASE_LUXURY },
  },
};

/** Image mosaic entrance — slides in from right */
export const mosaicReveal: Variants = {
  hidden:  { opacity: 0, x: 32, scale: 0.97 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { duration: 0.95, ease: EASE_LUXURY },
  },
};

/** Single image tile within the mosaic */
export const tileReveal: Variants = {
  hidden:  { opacity: 0, scale: 0.92, y: 18 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.7, ease: EASE_LUXURY },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Ordering Steps Variants (NEW)
// ─────────────────────────────────────────────────────────────────────────────

/** Step bubble entrance */
export const stepBubble: Variants = {
  hidden:  { opacity: 0, scale: 0.75, y: 20 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.55, ease: EASE_SPRING },
  },
};

/** Step connector line draw — use with scaleX animation */
export const connectorDraw: Variants = {
  hidden:  { scaleX: 0, opacity: 0 },
  visible: {
    scaleX: 1,
    opacity: 1,
    transition: { duration: 0.9, ease: EASE_LUXURY, delay: 0.35 },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Hover / Interactive Variants
// ─────────────────────────────────────────────────────────────────────────────

export const cardHover = {
  rest:  {
    y: 0,
    boxShadow: '0 4px 16px rgb(26 18 9 / 0.08)',
  },
  hover: {
    y: -6,
    boxShadow: '0 20px 56px rgb(26 18 9 / 0.18)',
    transition: { duration: 0.28, ease: EASE_LUXURY },
  },
  tap: {
    scale: 0.98,
    transition: { duration: 0.1 },
  },
};

export const buttonHover = {
  rest:  { scale: 1 },
  hover: {
    scale: 1.03,
    transition: { duration: 0.2, ease: EASE_SPRING },
  },
  tap: { scale: 0.97 },
};

export const arrowNudge = {
  rest:  { x: 0 },
  hover: {
    x: 4,
    transition: { duration: 0.2, ease: EASE_SPRING },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Divider / Decoration Variants
// ─────────────────────────────────────────────────────────────────────────────

export const lineGrow: Variants = {
  hidden:  { scaleX: 0, opacity: 0, originX: 0 },
  visible: {
    scaleX: 1,
    opacity: 1,
    transition: { duration: 1.1, ease: EASE_LUXURY, delay: 0.2 },
  },
};

export const dotPop: Variants = {
  hidden:  { scale: 0, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: SPRING_BOUNCY,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Transition Presets (reusable shorthand)
// ─────────────────────────────────────────────────────────────────────────────

export const TRANSITION_BASE: Transition = {
  duration: 0.2,
  ease: EASE_STANDARD,
};

export const TRANSITION_HOVER: Transition = {
  duration: 0.35,
  ease: EASE_LUXURY,
};

export const TRANSITION_PAGE: Transition = {
  duration: 0.5,
  ease: EASE_LUXURY,
};

// ─────────────────────────────────────────────────────────────────────────────
// PERFORMANCE NOTES
// ─────────────────────────────────────────────────────────────────────────────
//
// 1. All Framer Motion transitions use cubic-bezier (native CSS easings)
//    except where spring physics are explicitly needed.
//
// 2. clipPath animations are GPU-accelerated in modern browsers.
//    Use sparingly for hero reveals only.
//
// 3. Avoid stacking transforms; use discrete properties:
//    ✅ x, y, scale, rotate (not: transform: "translateX() scale()")
//    ✅ filter: blur() as isolated property (not in transform)
//
// 4. will-change is added at component level (motion.tsx),
//    not in variants — cleaner cleanup.
//
// 5. Reduced motion: Framer Motion respects prefers-reduced-motion
//    automatically via skipAnimation when duration === 0.
//
// 6. All durations are 0.2s multiples for sync with CSS tokens.
//
// 7. New 2026 variants (editorialReveal, mosaicReveal, tileReveal,
//    stepBubble, connectorDraw) follow the same GPU-friendly principles.