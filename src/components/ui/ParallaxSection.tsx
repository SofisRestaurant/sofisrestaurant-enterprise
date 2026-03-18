// src/components/ui/ParallaxSection.tsx
// ─── Scroll-driven parallax wrapper ──────────────────────────────────────────
// Wraps a section and applies a subtle vertical offset as user scrolls past.
// Uses overflow:clip (not hidden) so IntersectionObserver still fires for
// whileInView children. Gracefully degrades when prefers-reduced-motion is set.

import { type ReactNode, useRef } from 'react';
import { m, useScroll, useTransform, useSpring, useReducedMotion } from 'framer-motion';

// Removed unused EASE_OUT import

export interface ParallaxSectionProps {
  children: ReactNode;
  /** Parallax intensity: fraction of section height (0 = none, 0.12 = subtle, 0.25 = strong) */
  strength?: number;
  className?: string;
  innerClassName?: string;
}

export function ParallaxSection({
  children,
  strength = 0.12,
  className = '',
  innerClassName = '',
}: ParallaxSectionProps) {
  const shouldReduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  // Convert strength to percentage dynamically
  const rawY = useTransform(
    scrollYProgress,
    [0, 1],
    shouldReduce ? [0, 0] : [strength * 100, -strength * 100],
  );

  // Smooth spring for luxury feel
  const y = useSpring(rawY, { stiffness: 45, damping: 24, mass: 0.9 });

  return (
    <div ref={ref} className={`overflow-[clip] ${className}`}>
      <m.div style={{ y }} className={innerClassName}>
        {children}
      </m.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ParallaxImage — background image parallax
// ─────────────────────────────────────────────────────────────────────────────

export interface ParallaxImageProps {
  src: string;
  alt?: string;
  className?: string;
  strength?: number; // unused for now
}

export function ParallaxImage({ src, alt = '', className = '' }: ParallaxImageProps) {
  const shouldReduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  const y = useTransform(scrollYProgress, [0, 1], shouldReduce ? [0, 0] : [-8, 8]);

  return (
    <div ref={ref} className={`relative overflow-[clip] ${className}`}>
      <m.img
        src={src}
        alt={alt}
        style={{ y, scale: 1.18 }}
        className="w-full h-full object-cover"
        loading="lazy"
        decoding="async"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      />
    </div>
  );
}

export default ParallaxSection;