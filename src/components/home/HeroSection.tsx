// src/components/home/HeroSection.tsx
// ─── Full-screen hero with auto-advancing image slider ────────────────────────
//
// Motion 12.38 best practices applied:
//   • motion() factory replaced with motion.create() — fixes deprecation warning.
//   • MotionConfig reducedMotion="user" wraps the entire section for automatic
//     site-wide reduced-motion handling. useReducedMotion() still used for
//     imperative logic (video play, parallax, autoAdvance).
//   • All motion.* imports replaced with the named motion object (no `m` alias
//     needed when you import `motion` directly from "motion/react").
//   • useReducedMotion coercion kept (??false) for safe boolean comparison.
//   • AnimatePresence mode="sync" kept — correct for crossfade slides.
//   • layoutAnchor noted (not needed here; no layout projection animations).
//   • whileHover scale guarded: MotionConfig automatically strips transforms
//     when reducedMotion="user", so no manual shouldReduceMotion guard needed
//     on whileHover/whileTap — MotionConfig handles it.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  MotionConfig,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'motion/react'; // ← preferred package alias for Motion 12+
import { Link } from 'react-router-dom';
import { APP_TAGLINE, type BrandTheme } from '@/assets/logo';
import { HERO_IMAGES } from '@/assets/images';
import { EASE_LUXURY, heroText, staggerContainer } from '@/lib/motion';
import SlideDots from '@/components/home/SlideDots';

// motion.create() replaces the deprecated motion() factory — fixes console warning
const MotionLink = motion.create(Link);

// ── Types & data ──────────────────────────────────────────────────────────────

interface BaseHeroSlide {
  id: number;
  headline: string;
  accentWord: string;
  sub: string;
  ariaLabel?: string;
}

interface ImageHeroSlide extends BaseHeroSlide {
  kind: 'image';
  image: string;
}

interface VideoHeroSlide extends BaseHeroSlide {
  kind: 'video';
  videoSrc: string;
  poster?: string;
}

export type HeroSlide = ImageHeroSlide | VideoHeroSlide;

const SLIDES: HeroSlide[] = [
  {
    id: 1,
    kind: 'image',
    image: HERO_IMAGES.hero1,
    headline: 'Crafted With',
    accentWord: 'Intention',
    sub: 'Seasonal ingredients, honest technique, unforgettable evenings.',
    ariaLabel: "Dining room with warm candlelight at Sofi's Restaurant",
  },
  {
    id: 2,
    kind: 'image',
    image: HERO_IMAGES.hero2,
    headline: 'Every Dish',
    accentWord: 'Tells a Story',
    sub: 'From our kitchen to your table — flavour rooted in place.',
    ariaLabel: "Chef plating a seasonal dish at Sofi's Restaurant",
  },
  {
    id: 3,
    kind: 'image',
    image: HERO_IMAGES.hero3,
    headline: 'The Table',
    accentWord: 'Is Yours',
    sub: 'Reserve your evening. Make it a memory worth keeping.',
    ariaLabel: "Intimate table setting ready for guests at Sofi's Restaurant",
  },
];

const SLIDE_COUNT = SLIDES.length;
const SLIDE_DURATION = 5500;

// ── SlideMedia ────────────────────────────────────────────────────────────────

interface SlideMediaProps {
  slide: HeroSlide;
  kenBurnsActive: boolean;
  shouldReduceMotion: boolean;
}

function SlideMedia({ slide, kenBurnsActive, shouldReduceMotion }: SlideMediaProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (slide.kind !== 'video') return;
    const video = videoRef.current;
    if (!video) return;
    if (shouldReduceMotion) {
      video.pause();
      return;
    }
    void video.play().catch(() => undefined);
  }, [slide, shouldReduceMotion]);

  return (
    // initial + animate + exit — crossfade handled by AnimatePresence above
    <motion.div
      className="absolute inset-0"
      initial={{ opacity: 0, scale: 1.04 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 1.6, ease: 'easeInOut' }}
      aria-hidden="true"
    >
      {slide.kind === 'image' ? (
        <motion.div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${slide.image})` }}
          initial={kenBurnsActive ? { scale: 1.12 } : { scale: 1 }}
          animate={{ scale: kenBurnsActive ? 1.02 : 1 }}
          transition={
            kenBurnsActive
              ? { duration: SLIDE_DURATION / 1000 + 1.5, ease: 'linear' }
              : { duration: 0.4, ease: 'easeOut' }
          }
        />
      ) : (
        <motion.video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          src={slide.videoSrc}
          poster={slide.poster}
          muted
          playsInline
          loop
          // autoPlay still controlled imperatively — MotionConfig does not touch
          // HTML attributes, only Motion animation values.
          autoPlay={!shouldReduceMotion}
          initial={{ scale: 1.02 }}
          animate={{ scale: 1 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      )}

      {/* Vignette overlays */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            'linear-gradient(to top, rgba(28,25,21,0.96) 0%, rgba(28,25,21,0.32) 45%, rgba(28,25,21,0.10) 100%)',
            'linear-gradient(to right, rgba(28,25,21,0.42) 0%, transparent 62%)',
          ].join(', '),
        }}
      />
    </motion.div>
  );
}

// ── ScrollHint ────────────────────────────────────────────────────────────────
// Only rendered when !shouldReduceMotion, so no internal guard needed.

function ScrollHint() {
  return (
    <motion.div
      className="absolute bottom-9 right-7 z-20 flex select-none flex-col items-center gap-2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 2.6, duration: 1 }}
      aria-hidden="true"
    >
      <div
        className="h-14 w-px animate-scroll-pulse"
        style={{
          background: 'linear-gradient(to bottom, rgba(212,175,55,0.60), transparent)',
        }}
      />
      <span
        className="font-body text-[0.55rem] uppercase tracking-[0.24em] text-white/35"
        style={{ writingMode: 'vertical-rl' }}
      >
        Scroll
      </span>
    </motion.div>
  );
}

// ── HeroSection ───────────────────────────────────────────────────────────────

export interface HeroSectionProps {
  onMenuClick?: () => void;
  onReservationClick?: () => void;
  theme?: BrandTheme;
}

export function HeroSection({ onMenuClick, onReservationClick, theme = 'dark' }: HeroSectionProps) {
  // Still needed for imperative logic: video autoplay, parallax, auto-advance.
  // MotionConfig handles declarative animation suppression automatically.
  const shouldReduceMotion: boolean = useReducedMotion() ?? false;

  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchStartX = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const next = useCallback(() => setCurrent((c) => (c + 1) % SLIDE_COUNT), []);
  const prev = useCallback(() => setCurrent((c) => (c - 1 + SLIDE_COUNT) % SLIDE_COUNT), []);

  useEffect(() => {
    if (paused || shouldReduceMotion) return;
    timerRef.current = setInterval(next, SLIDE_DURATION);
    return clearTimer;
  }, [next, paused, shouldReduceMotion, clearTimer]);

  const jumpTo = useCallback(
    (i: number) => {
      clearTimer();
      setCurrent(i);
      if (!paused && !shouldReduceMotion) {
        timerRef.current = setInterval(next, SLIDE_DURATION);
      }
    },
    [clearTimer, paused, shouldReduceMotion, next],
  );

  const [liveAnnounce, setLiveAnnounce] = useState('');
  useEffect(() => {
    const s = SLIDES[current];
    setLiveAnnounce(`Slide ${current + 1} of ${SLIDE_COUNT}: ${s.headline} ${s.accentWord}`);
  }, [current]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        clearTimer();
        next();
      }
      if (e.key === 'ArrowLeft') {
        clearTimer();
        prev();
      }
    },
    [clearTimer, next, prev],
  );

  const heroRef = useRef<HTMLElement>(null);
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);
  const sX = useSpring(mouseX, { stiffness: 50, damping: 22 });
  const sY = useSpring(mouseY, { stiffness: 50, damping: 22 });
  const bgX = useTransform(sX, [0, 1], ['2%', '-2%']);
  const bgY = useTransform(sY, [0, 1], ['2%', '-2%']);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (shouldReduceMotion) return;
      const r = heroRef.current?.getBoundingClientRect();
      if (!r) return;
      mouseX.set((e.clientX - r.left) / r.width);
      mouseY.set((e.clientY - r.top) / r.height);
    },
    [mouseX, mouseY, shouldReduceMotion],
  );

  const handleMouseLeave = useCallback(() => {
    mouseX.set(0.5);
    mouseY.set(0.5);
    setPaused(false);
  }, [mouseX, mouseY]);

  const slide = SLIDES[current];
  const parallaxY = useTransform(sY, [0, 1], ['1.5%', '-1.5%']);

  return (
    /*
     * MotionConfig reducedMotion="user":
     *   - Reads prefers-reduced-motion from the OS automatically.
     *   - Strips transform/scale/layout animations from ALL motion.* children.
     *   - Preserves opacity and backgroundColor animations (safe for all users).
     *   - Works as the declarative layer; useReducedMotion() above handles the
     *     imperative side (video play, parallax, auto-advance).
     *
     * Scope: wrapping only <HeroSection> keeps it isolated. If you want it
     * site-wide, move <MotionConfig> to your root App component instead.
     */
    <MotionConfig reducedMotion="user">
      <>
        <div role="status" aria-live="polite" aria-atomic={true} className="sr-only">
          {liveAnnounce}
        </div>

        <motion.section
          ref={heroRef}
          role="region"
          aria-roledescription="carousel"
          aria-label="Sofi's Restaurant — featured slides"
          aria-live="off"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className="relative flex flex-col justify-end overflow-hidden bg-stone-900 outline-none"
          style={{ minHeight: '100svh' }}
          onMouseMove={handleMouseMove}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={handleMouseLeave}
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            const dx = e.changedTouches[0].clientX - touchStartX.current;
            if (typeof dx === 'number' && Math.abs(dx) > 30) {
              clearTimer();
              if (dx < 0) next();
              else if (dx > 0) prev();
            }
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7 }}
        >
          {/* Parallax background layer */}
          <motion.div
            className="absolute inset-0 z-0"
            style={{
              // MotionConfig will zero-out x/y when reduced motion is requested,
              // but we also guard imperatively so spring values don't accumulate.
              x: shouldReduceMotion ? 0 : bgX,
              y: shouldReduceMotion ? 0 : bgY,
              willChange: 'transform',
            }}
          >
            <AnimatePresence mode="sync">
              <SlideMedia
                key={slide.id}
                slide={slide}
                kenBurnsActive={!shouldReduceMotion && slide.kind === 'image'}
                shouldReduceMotion={shouldReduceMotion}
              />
            </AnimatePresence>
          </motion.div>

          {/* Luxury colour overlays */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-10"
            style={{
              background: [
                'radial-gradient(ellipse 80% 55% at 78% 12%, rgba(212,175,55,0.09) 0%, transparent 55%)',
                'radial-gradient(ellipse 55% 45% at 12% 88%, rgba(168,69,32,0.11) 0%, transparent 50%)',
              ].join(','),
            }}
          />

          {/* Noise texture */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-10 opacity-[0.025]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
              backgroundSize: '180px',
            }}
          />

          {/* Hero copy — parallax wrapper */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            style={{ y: shouldReduceMotion ? 0 : parallaxY }}
            className="relative z-20 mx-auto w-full max-w-6xl px-5 pb-28 pt-32 sm:px-8 sm:pb-36 md:px-12"
          >
            {/*
              Text stagger container.
              key={`text-${slide.id}`} remounts on slide change, replaying the entrance.
              initial="hidden" + animate="visible" (not whileInView — already in viewport).
              MotionConfig automatically suppresses transforms inside heroText variant
              when reducedMotion="user"; opacity animations are preserved.
            */}
            <motion.div
              key={`text-${slide.id}`}
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="flex max-w-36rem flex-col gap-5"
            >
              {/* Eyebrow */}
              <motion.p
                variants={heroText}
                transition={{ duration: 0.6, ease: EASE_LUXURY, delay: 0.08 }}
                className="flex items-center gap-2.5 font-body text-[0.62rem] font-medium
                           uppercase tracking-[0.22em]"
                style={{ color: 'var(--color-gold-300, #e8c46a)' }}
              >
                <span
                  className="block h-px w-6"
                  style={{ background: 'var(--color-gold-400, #d4af37)' }}
                  aria-hidden="true"
                />
                San Francisco · Est. 2024
              </motion.p>

              {/* Headline */}
              <motion.h1
                variants={heroText}
                transition={{ duration: 0.9, ease: EASE_LUXURY, delay: 0.18 }}
                className="font-display text-[clamp(3rem,11vw,6.5rem)] leading-[0.92]
                           tracking-[-0.04em] text-white"
              >
                {slide.headline}
                <br />
                <span
                  className="text-script"
                  style={{
                    color: 'var(--color-gold-300, #e8c46a)',
                    textShadow: '0 0 48px rgba(212,175,55,0.35)',
                  }}
                >
                  {slide.accentWord}
                </span>
              </motion.h1>

              {/* Sub */}
              <motion.p
                variants={heroText}
                transition={{ duration: 0.7, ease: EASE_LUXURY, delay: 0.32 }}
                className="font-body max-w-28rem text-[1rem] font-light
                           leading-[1.75] text-white/60 sm:text-[1.05rem]"
              >
                {slide.sub}
                {APP_TAGLINE && <span className="text-white/35"> · {APP_TAGLINE}</span>}
              </motion.p>

              {/* CTA buttons */}
              <motion.div
                variants={heroText}
                transition={{ duration: 0.7, ease: EASE_LUXURY, delay: 0.46 }}
                className="mt-1 flex flex-col gap-3 xs:flex-row"
              >
                {/*
                  whileHover/whileTap scale: no manual shouldReduceMotion guard needed.
                  MotionConfig reducedMotion="user" automatically suppresses these
                  transform animations when the user's OS preference is set.
                */}
                <MotionLink
                  to="/menu"
                  onClick={onMenuClick}
                  aria-label="View the full menu"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.18, ease: EASE_LUXURY }}
                  className={[
                    'inline-flex items-center justify-center gap-2 rounded-full',
                    'px-7 py-3.5 font-body text-[0.78rem] font-medium uppercase tracking-[0.12em]',
                    'transition-[background-color,box-shadow] duration-300',
                    theme === 'dark'
                      ? 'bg-[#d4af37] text-[#1c1915] hover:bg-[#e8c46a] hover:shadow-[0_0_32px_rgba(212,175,55,0.35)]'
                      : 'bg-white text-[#1c1915] hover:bg-[#e8c46a]',
                    'focus-visible:outline-none focus-visible:ring-2',
                    'focus-visible:ring-[#d4af37] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1c1915]',
                  ].join(' ')}
                >
                  Explore Menu
                </MotionLink>

                <MotionLink
                  to="/reservations"
                  onClick={onReservationClick}
                  aria-label="Make a reservation"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.18, ease: EASE_LUXURY }}
                  className={[
                    'inline-flex items-center justify-center gap-2 rounded-full',
                    'px-7 py-3.5 font-body text-[0.78rem] font-medium uppercase tracking-[0.12em]',
                    'transition-all duration-300',
                    theme === 'dark'
                      ? 'border border-white/28 text-white/80 hover:border-[#d4af37] hover:text-[#e8c46a]'
                      : 'border border-stone/40 text-stone/80 hover:border-[#e8c46a] hover:text-[#1c1915]',
                    'focus-visible:outline-none focus-visible:ring-2',
                    'focus-visible:ring-[#d4af37] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1c1915]',
                  ].join(' ')}
                >
                  Reserve a Table
                </MotionLink>
              </motion.div>
            </motion.div>
          </motion.div>

          <SlideDots slides={SLIDES} current={current} onSelect={jumpTo} />

          {!shouldReduceMotion && <ScrollHint />}

          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-40"
            style={{
              background: 'linear-gradient(to top, rgba(250,246,239,0.06), transparent)',
            }}
          />
        </motion.section>
      </>
    </MotionConfig>
  );
}

export default React.memo(HeroSection);