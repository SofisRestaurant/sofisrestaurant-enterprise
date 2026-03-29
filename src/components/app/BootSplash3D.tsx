// src/components/BootSplash3D.tsx
import { useCallback } from 'react';
import {
  motion,
  MotionConfig,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'framer-motion';

type BootSplash3DProps = {
  visible: boolean;
  fadingOut?: boolean;
  title?: string;
  subtitle?: string;
};

export default function BootSplash3D({
  visible,
  fadingOut = false,
  title = "SOFI'S RESTAURANT",
  subtitle = 'Preparing your experience...',
}: BootSplash3DProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;

  // Parallax motion values
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);
  const sX = useSpring(mouseX, { stiffness: 20, damping: 8 });
  const sY = useSpring(mouseY, { stiffness: 20, damping: 8 });
  const translateX = useTransform(sX, [0, 1], ['-2%', '2%']);
  const translateY = useTransform(sY, [0, 1], ['-2%', '2%']);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (shouldReduceMotion) return;
      const rect = e.currentTarget.getBoundingClientRect();
      mouseX.set((e.clientX - rect.left) / rect.width);
      mouseY.set((e.clientY - rect.top) / rect.height);
    },
    [mouseX, mouseY, shouldReduceMotion],
  );

  const handleMouseLeave = useCallback(() => {
    mouseX.set(0.5);
    mouseY.set(0.5);
  }, [mouseX, mouseY]);

  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        initial={{ opacity: 0, scale: 1.015 }}
        animate={{ opacity: visible ? 1 : 0, scale: visible ? 1 : 1.015 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="pointer-events-none fixed inset-0 z-50"
        aria-hidden={!visible && !fadingOut}
      >
        {/* Background layers */}
        <div className="absolute inset-0 bg-black" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(249,115,22,0.18),transparent_42%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_35%)]" />

        {/* Logo / placeholder container */}
        <div
          className="relative flex h-full w-full flex-col items-center justify-center px-6"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <motion.div
            className="relative mb-8 h-280px w-280px sm:h-360px sm:w-360px bg-linear-to-tr from-orange-400/20 to-transparent rounded-xl border border-white/10 flex items-center justify-center"
            style={{
              x: shouldReduceMotion ? 0 : translateX,
              y: shouldReduceMotion ? 0 : translateY,
            }}
          >
            {/* Spinner fallback */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              initial={{ rotate: 0 }}
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              aria-label="Loading splash"
              role="status"
            >
              <div className="h-24 w-24 rounded-full border-2 border-orange-400/25 border-t-orange-400" />
            </motion.div>
          </motion.div>

          {/* Title & subtitle */}
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-[0.18em] text-white sm:text-3xl">
              {title}
            </h1>
            <p className="mt-3 text-sm text-white/65 sm:text-base">{subtitle}</p>
          </div>
        </div>
      </motion.div>
    </MotionConfig>
  );
}