// src/components/BootSplash3D.tsx
// ─── 3D boot splash with model-viewer, parallax, and spinner fallback ─────────
//
// TypeScript / ESLint compliance notes:
//   • 'use client' removed — this is a Vite/React project, not Next.js.
//   • useRef<any> removed in favour of a callback ref. The callback ref:
//       – is called by React with the live DOM element on mount and null on
//         unmount, so event wiring happens at exactly the right moment;
//       – holds the element in a plain useRef<ModelViewerElement | null>
//         that is only written via the callback, keeping lint clean;
//       – avoids the useEffect([modelSrc]) dependency that caused the Lit
//         "change-in-update" warning (the effect fired *after* model-viewer
//         had already started processing the new src, triggering a second
//         reactive update cycle inside Lit).
//   • Callback ref parameter type is HTMLElement | null, NOT ModelViewerElement | null.
//     Why: React's JSX ref for <model-viewer> is an intersection of two arms —
//       (instance: HTMLElement | null) => void            ← from ClassAttributes<HTMLElement>
//     & (instance: ModelViewerElement | null) => void    ← from ModelViewerJSXProps
//     TypeScript requires the callback to be assignable to BOTH arms simultaneously.
//     ModelViewerElement extends HTMLElement, so (HTMLElement | null) => void satisfies
//     the contravariant requirement: a function that accepts any HTMLElement can
//     safely accept the more-specific ModelViewerElement. The reverse is NOT true —
//     (ModelViewerElement | null) => void cannot accept a plain HTMLElement, so TS
//     rejects it. Solution: accept HTMLElement | null, then narrow with instanceof
//     inside the callback to recover the full ModelViewerElement interface for
//     addEventListener and the internal ref.
//   • Event listener callbacks are stable useCallback references so the
//     callback ref can safely remove the exact same function it added.
//   • key={modelSrc} on <model-viewer> is kept: it forces a full
//     unmount/remount when src changes, which is the only reliable way to
//     reset Lit's internal state without triggering the change-in-update
//     warning. Event listeners are rewired automatically via the callback ref.
//   • Spinner initial={{ rotate: 0 }} added — without an explicit initial,
//     Motion has no origin to animate from and the spin may not start.
//   • MotionConfig here so BootSplash3D is self-contained when rendered
//     outside a parent MotionConfig tree (e.g. before the App shell mounts).
//     Nested MotionConfig is safe — inner values override outer ones per-subtree.

// @google/model-viewer is registered once in src/lib/modelViewer.ts (imported from main.tsx).
import type { ModelViewerElement } from '@google/model-viewer';
import { useCallback, useRef, useState } from 'react';
import {
  motion,
  MotionConfig,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'motion/react';

// ── Types ─────────────────────────────────────────────────────────────────────

type BootSplash3DProps = {
  visible: boolean;
  fadingOut?: boolean;
  modelSrc: string;
  title?: string;
  subtitle?: string;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function BootSplash3D({
  visible,
  fadingOut = false,
  modelSrc,
  title = "SOFI'S RESTAURANT",
  subtitle = 'Preparing your experience...',
}: BootSplash3DProps) {
  const shouldReduceMotion: boolean = useReducedMotion() ?? false;

  // ── 3D model ref & state ───────────────────────────────────────────────────

  const [modelReady, setModelReady] = useState(false);

  // Internal ref holds the typed ModelViewerElement after instanceof narrowing.
  // Written only via the callback ref below — never passed to JSX directly.
  const modelElRef = useRef<ModelViewerElement | null>(null);

  // Stable handler identities so addEventListener / removeEventListener pair
  // correctly. setModelReady from useState is guaranteed stable, so [] is right.
  const handleLoad = useCallback(() => setModelReady(true), []);
  const handleError = useCallback(() => setModelReady(false), []);

  /**
   * Callback ref — called by React:
   *   • with the live element on mount / after a key-forced remount
   *   • with null just before unmount / before a key-forced remount
   *
   * Parameter type: HTMLElement | null
   *   React's JSX ref for <model-viewer> is the intersection:
   *     ((instance: HTMLElement | null) => void)          ← ClassAttributes<HTMLElement>
   *   & ((instance: ModelViewerElement | null) => void)  ← ModelViewerJSXProps
   *   By contravariance, the callback must be assignable to BOTH arms.
   *   (HTMLElement | null) => void satisfies both — a handler that accepts
   *   any HTMLElement safely accepts the more-specific ModelViewerElement too.
   *   The inverse is not true, so (ModelViewerElement | null) => void is rejected.
   *
   *   We recover the typed interface via instanceof after accepting HTMLElement,
   *   which is zero-cost and correct since ModelViewerElement is always an
   *   HTMLElement subclass at runtime.
   */
  const modelCallbackRef = useCallback(
    (el: HTMLElement | null) => {
      // Teardown: remove listeners from the previous element before replacing it.
      if (modelElRef.current) {
        modelElRef.current.removeEventListener('load', handleLoad);
        modelElRef.current.removeEventListener('error', handleError);
        modelElRef.current = null;
      }

      // instanceof narrows el to ModelViewerElement so we get the typed
      // addEventListener overloads without any `as` assertion.
      // customElements.get returns undefined until the element is defined, but
      // by the time React calls this ref the custom element is already mounted,
      // so the instanceof check is always valid in practice.
      const mvConstructor = customElements.get('model-viewer');
      if (el && mvConstructor && el instanceof mvConstructor) {
        // el is now typed as ModelViewerElement (the registered custom element class)
        const mv = el as ModelViewerElement;
        modelElRef.current = mv;
        setModelReady(false);
        mv.addEventListener('load', handleLoad);
        mv.addEventListener('error', handleError);
      }
    },
    [handleLoad, handleError],
  );

  // ── Parallax ───────────────────────────────────────────────────────────────

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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    // MotionConfig here so BootSplash3D is self-contained when rendered
    // outside a parent MotionConfig tree (e.g. before App shell mounts).
    // Safe to nest — inner MotionConfig values override outer ones per-subtree.
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

        {/* Logo + 3D model container */}
        <div
          className="relative flex h-full w-full flex-col items-center justify-center px-6"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <motion.div
            className="relative mb-8 h-280px w-280px sm:h-360px sm:w-360px"
            style={{
              // MotionConfig strips transforms when reducedMotion="user";
              // the explicit guard prevents spring values from accumulating
              // while animations are suppressed.
              x: shouldReduceMotion ? 0 : translateX,
              y: shouldReduceMotion ? 0 : translateY,
            }}
          >
            {/* Glow & border layers */}
            <div className="absolute inset-0 rounded-full bg-orange-500/20 blur-3xl" />
            <div className="absolute inset-0 rounded-full border border-white/10" />

            {/*
              key={modelSrc} forces a full DOM unmount → remount when src changes.
              This resets Lit's internal reactive state cleanly and avoids the
              "scheduled an update after an update completed" warning.
              The callback ref (typed HTMLElement | null) rewires load/error
              listeners automatically on each remount via instanceof narrowing.
            */}
            <model-viewer
              ref={modelCallbackRef}
              key={modelSrc}
              src={modelSrc}
              poster="poster.webp"
              alt="Sofi's 3D logo"
              ar
              ar-modes="webxr scene-viewer quick-look"
              camera-controls
              auto-rotate
              shadow-intensity="1"
              tone-mapping="neutral"
              style={{
                width: '100%',
                height: '100%',
                display: 'block',
                background: 'transparent',
                filter: 'drop-shadow(0 0 28px rgba(249,115,22,0.20))',
              }}
            />

            {/*
              Spinner fallback — shown until 'load' fires.
              initial={{ rotate: 0 }} is required: without an explicit initial,
              Motion has no starting value and the animation may not play.
            */}
            {!modelReady && (
              <motion.div
                className="absolute inset-0 flex items-center justify-center"
                initial={{ rotate: 0 }}
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                aria-label="Loading 3D model"
                role="status"
              >
                <div className="h-24 w-24 rounded-full border-2 border-orange-400/25 border-t-orange-400" />
              </motion.div>
            )}
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
