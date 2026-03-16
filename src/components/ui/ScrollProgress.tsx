// src/components/ui/ScrollProgress.tsx
// ─── Thin progress bar fixed at top of viewport ───────────────────────────────

import React from 'react';
import { m, useScroll, useSpring } from 'framer-motion';

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <m.div
      aria-hidden="true"
      className="fixed inset-x-0 top-0 z-9999 h-2px origin-left"
      style={{
        scaleX,
        background: 'linear-gradient(90deg, #D4AF37 0%, #E8C46A 50%, #A84520 100%)',
      }}
    />
  );
}

export default ScrollProgress;