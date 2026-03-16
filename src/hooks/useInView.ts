// src/hooks/useInView.ts
// ─── Lightweight IntersectionObserver hook ───────────────────────────────────
// Alternative to Framer Motion's useInView for non-animated scenarios.

import { useEffect, useRef, useState, type RefObject } from 'react';

export interface UseInViewOptions {
  /** IntersectionObserver threshold (default: 0.15) */
  threshold?: number | number[];
  /** IntersectionObserver root margin (default: '-60px 0px') */
  rootMargin?: string;
  /** Observe only once? (default: true) */
  once?: boolean;
}

/**
 * Returns [ref, isInView] — attach ref to the element you want to observe.
 *
 * @example
 * const [ref, isInView] = useInView({ once: true });
 * return <div ref={ref}>{isInView ? 'Visible!' : 'Hidden'}</div>;
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(
  options: UseInViewOptions = {},
): [RefObject<T>, boolean] {
  const { threshold = 0.15, rootMargin = '-60px 0px', once = true } = options;

  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Slight delay to prevent flicker in rapid intersections
          timer = setTimeout(() => setInView(true));
          if (once) observer.unobserve(el);
        } else if (!once) {
          if (timer) clearTimeout(timer);
          setInView(false);
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(el);

    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [threshold, rootMargin, once]);

  return [ref as RefObject<T>, inView];
}

export default useInView;