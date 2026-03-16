// src/components/ui/AnimateIn.tsx
import React, { type ReactNode } from 'react';
import { m, type Variants, type MotionProps } from 'framer-motion';
import {
  fadeUp,
  fadeUpBlur,
  fadeIn,
  slideLeft,
  slideRight,
  scaleUp,
  scaleIn,
  VIEWPORT_ONCE,
  VIEWPORT_EAGER,
  VIEWPORT_LAZY,
  VIEWPORT_REPEAT,
} from '@/lib/motion';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AnimatePreset =
  | 'fadeUp'
  | 'fadeUpBlur'
  | 'fadeIn'
  | 'slideLeft'
  | 'slideRight'
  | 'scaleUp'
  | 'scaleIn'
  | 'custom';

export type ViewportMode = 'once' | 'eager' | 'lazy' | 'repeat';

export interface AnimateInProps {
  children: ReactNode;
  preset?: AnimatePreset;
  variants?: Variants;
  delay?: number;
  duration?: number;
  viewport?: ViewportMode;
  className?: string;
  as?: keyof typeof m; // only motion-supported tags
  staggerIndex?: number;
  motionProps?: Omit<MotionProps, 'variants' | 'initial' | 'whileInView' | 'viewport'>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Preset map
// ─────────────────────────────────────────────────────────────────────────────

const PRESETS: Record<Exclude<AnimatePreset, 'custom'>, Variants> = {
  fadeUp,
  fadeUpBlur,
  fadeIn,
  slideLeft,
  slideRight,
  scaleUp,
  scaleIn,
};

const VIEWPORT_MAP: Record<ViewportMode, MotionProps['viewport']> = {
  once: VIEWPORT_ONCE,
  eager: VIEWPORT_EAGER,
  lazy: VIEWPORT_LAZY,
  repeat: VIEWPORT_REPEAT,
};

// ─────────────────────────────────────────────────────────────────────────────
// AnimateIn Component
// ─────────────────────────────────────────────────────────────────────────────

export function AnimateIn({
  children,
  preset = 'fadeUp',
  variants: customVariants,
  delay = 0,
  duration,
  viewport = 'once',
  className,
  as = 'div',
  staggerIndex,
  motionProps,
}: AnimateInProps) {
  const baseVariants = preset === 'custom' ? (customVariants ?? fadeUp) : PRESETS[preset];

  const mergedVariants: Variants = delay || duration || staggerIndex !== undefined
    ? {
        hidden: baseVariants.hidden,
        visible: {
          ...(typeof baseVariants.visible === 'object' ? baseVariants.visible : {}),
          transition: {
            ...(typeof baseVariants.visible === 'object' &&
            typeof (baseVariants.visible as Record<string, unknown>).transition === 'object'
              ? (baseVariants.visible as Record<string, unknown>).transition as object
              : {}),
            delay: delay + (staggerIndex ?? 0) * 0.08,
            ...(duration ? { duration } : {}),
          },
        },
      }
    : baseVariants;

  // Type-safe dynamic motion tag
  const MotionTag = m[as] as typeof m.div;

  return (
    <MotionTag
      variants={mergedVariants}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT_MAP[viewport]}
      className={className}
      {...motionProps}
    >
      {children}
    </MotionTag>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StaggerGroup Component
// ─────────────────────────────────────────────────────────────────────────────

export interface StaggerGroupProps {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
  initialDelay?: number;
  viewport?: ViewportMode;
  as?: keyof typeof m;
}

export function StaggerGroup({
  children,
  className,
  staggerDelay = 0.08,
  initialDelay = 0.05,
  viewport = 'once',
  as = 'div',
}: StaggerGroupProps) {
  const containerVariants: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: staggerDelay, delayChildren: initialDelay } },
  };

  const MotionTag = m[as] as typeof m.div;

  return (
    <MotionTag
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT_MAP[viewport]}
      className={className}
    >
      {children}
    </MotionTag>
  );
}

export default AnimateIn;