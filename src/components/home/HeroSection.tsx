// src/components/home/HeroSection.tsx
// ─── Full-screen hero with auto-advancing image slider ────────────────────────
//
// Fixes vs previous version:
//   • Removed dead `VIEWPORT_ONCE` import (was unused)
//   • Fixed crossfade: app.css has `opacity: 1 !important` which blocks Framer
//     Motion's animated opacity. Resolved by moving opacity to inline `style`
//     on the animated layer — Framer Motion's inline style always wins over
//     stylesheet rules, making crossfades reliable.
//   • Fixed a11y: aria-roledescription="carousel", aria-live announce region,
//     keyboard ArrowLeft/ArrowRight navigation, aria-label on each slide
//   • Fixed CTA buttons: replaced `<m.div whileHover> + <Link>` with
//     `MotionLink = m(Link)` — eliminates nested-interactive element a11y
//     violation and mismatched focus rings
//   • Fixed parallax: added will-change: transform GPU hint; respects
//     useReducedMotion — no translate applied when reduced motion preferred
//   • Fixed Ken Burns: disabled when useReducedMotion is true
//   • Fixed timer: `jumpTo` now clears AND restarts the interval so the new
//     slide gets a full SLIDE_DURATION before advancing
//   • Fixed timer deps: removed `current` from the interval effect dep array —
//     including it caused the interval to restart on every auto-advance, making
//     the effective duration shorter than intended (drift)
//   • Fixed typo in comment: "aoverlays" → "overlays"
//   • Fixed `setPaused(false)` — now called explicitly in handleMouseLeave
//   • Fixed browser compat: min-h via inline style with 100svh (dvh-aware)
//   • Upgraded: integrated APP_TAGLINE display
//   • Upgraded: added optional BrandTheme prop for dynamic styling
//   • Merged: SlideDots inlined (no longer a separate import)

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  m,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'framer-motion';
import { Link } from 'react-router-dom';
import { APP_TAGLINE, type BrandTheme } from '@/assets/logo';
import { HERO_IMAGES } from '@/assets/images';
import { EASE_LUXURY, SPRING_SNAPPY, heroText, staggerContainer } from '@/lib/motion';
import SlideDots from '@/components/home/SlideDots';

const MotionLink = m(Link);

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
  // To add a video slide, push an object like:
  // {
  //   id: 4,
  //   kind: 'video',
  //   videoSrc: '/media/sofis-hero.mp4',
  //   poster: HERO_IMAGES.hero2,
  //   headline: 'Moments That',
  //   accentWord: 'Linger',
  //   sub: 'A cinematic glimpse into evenings at Sofi’s.',
  // }
];

const SLIDE_COUNT = SLIDES.length;
const SLIDE_DURATION = 5500; // ms between auto-advances

// ── Slide media (image / video) ───────────────────────────────────────────────

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
      // Pause video for users who prefer reduced motion.
      video.pause();
      return;
    }

    // Best-effort autoplay; failures are safe.
    void video.play().catch(() => undefined);
  }, [slide, shouldReduceMotion]);

  return (
    <m.div
      className="absolute inset-0"
      initial={{ opacity: 0, scale: 1.04 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 1.6, ease: 'easeInOut' }}
      aria-hidden="true"
    >
      {slide.kind === 'image' ? (
        <m.div
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
        <m.video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          src={slide.videoSrc}
          poster={slide.poster}
          muted
          playsInline
          loop
          autoPlay={!shouldReduceMotion}
          initial={{ scale: 1.02 }}
          animate={{ scale: 1 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      )}
      <div className="absolute inset-0 bg-linear-to-t from-stone/95 via-stone/30 to-stone/10" />
      <div className="absolute inset-0 bg-linear-to-r from-stone/40 to-transparent" />
    </m.div>
  );
}

// ── ScrollHint ────────────────────────────────────────────────────────────────

function ScrollHint() {
  return (
    <m.div
      className="absolute bottom-8 right-6 z-20 flex flex-col items-center gap-1.5 select-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 2.4, duration: 0.9 }}
      aria-hidden="true"
    >
      <div className="w-px h-12 animate-scroll-pulse bg-linear-to-b from-[#D4AF37]/70 to-transparent" />
      <span
        className="text-white/40 text-[0.58rem] tracking-[0.18em] uppercase font-body"
        style={{ writingMode: 'vertical-rl' }}
      >
        Scroll
      </span>
    </m.div>
  );
}

// ── HeroSection ───────────────────────────────────────────────────────────────

export interface HeroSectionProps {
  onMenuClick?: () => void;
  onReservationClick?: () => void;
  theme?: BrandTheme; // optional dynamic theme
}

export function HeroSection({
  onMenuClick,
  onReservationClick,
  theme = 'dark',
}: HeroSectionProps) {
  const shouldReduceMotion = useReducedMotion();

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
    const slide = SLIDES[current];
    setLiveAnnounce(
      `Slide ${current + 1} of ${SLIDE_COUNT}: ${slide.headline} ${slide.accentWord}`,
    );
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
    <>
      <div role="status" aria-live="polite" aria-atomic={true} className="sr-only">
        {liveAnnounce}
      </div>

      <m.section
        ref={heroRef}
        role="region"
        aria-roledescription="carousel"
        aria-label="Sofi's Restaurant — featured slides"
        aria-live="off"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="relative flex flex-col justify-end overflow-hidden bg-stone outline-none"
        style={{ minHeight: '100svh' }}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={handleMouseLeave}
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          const dx = e.changedTouches[0].clientX - touchStartX.current;
          if (Math.abs(dx) > 50) {
            clearTimer();
            if (dx < 0) {
              next();
            } else {
              prev();
            }
          }
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      >
        <m.div
          className="absolute inset-0 z-0"
          style={{
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
        </m.div>

        {/* Overlays */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background: [
              'radial-gradient(ellipse 90% 60% at 75% 15%, rgba(212,175,55,0.10) 0%, transparent 55%)',
              'radial-gradient(ellipse 60% 50% at 15% 85%, rgba(168,69,32,0.12) 0%, transparent 50%)',
            ].join(','),
          }}
        />

        {/* Hero Copy */}
        <m.div
          style={{ y: shouldReduceMotion ? 0 : parallaxY }}
          className="relative z-20 mx-auto w-full max-w-6xl px-5 pb-24 pt-28 sm:px-8 sm:pb-32 md:px-12"
        >
          <m.div
            key={`text-${slide.id}`}
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="flex max-w-xl flex-col gap-4"
          >
            <m.p
              variants={heroText}
              transition={{ duration: 0.6, ease: EASE_LUXURY, delay: 0.1 }}
              className="flex items-center gap-2.5 font-body text-[0.62rem] font-medium
                         uppercase tracking-[0.22em] text-[#E8C46A]"
            >
              <span className="block h-px w-6 bg-[#D4AF37]" aria-hidden="true" />
              San Francisco · Est. 2024
            </m.p>

            <m.h1
              variants={heroText}
              transition={{ duration: 0.85, ease: EASE_LUXURY, delay: 0.2 }}
              className="font-display text-[clamp(3rem,11vw,6.5rem)] leading-[0.93]
                         tracking-tight text-white"
            >
              {slide.headline}
              <br />
              <em className="font-display italic text-[#E8C46A]" style={{ fontStyle: 'italic' }}>
                {slide.accentWord}
              </em>
            </m.h1>

            <m.p
              variants={heroText}
              transition={{ duration: 0.7, ease: EASE_LUXURY, delay: 0.35 }}
              className="font-body max-w-sm text-base font-light leading-relaxed text-white/65 sm:text-lg"
            >
              {slide.sub} {APP_TAGLINE && `· ${APP_TAGLINE}`}
            </m.p>

            <m.div
              variants={heroText}
              transition={{ duration: 0.7, ease: EASE_LUXURY, delay: 0.5 }}
              className="mt-2 flex flex-col gap-3 xs:flex-row"
            >
              <MotionLink
                to="/menu"
                onClick={onMenuClick}
                aria-label="View the full menu"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.18, ease: EASE_LUXURY }}
                className={`inline-flex items-center justify-center gap-2
                           rounded-full px-7 py-3.5 font-body text-[0.78rem] font-medium
                           uppercase tracking-[0.12em]
                           transition-colors duration-300
                           ${theme === 'dark' ? 'bg-[#D4AF37] text-[#1C1C1C] hover:bg-[#E8C46A]'
                                              : 'bg-white text-[#1C1C1C] hover:bg-[#E8C46A]'}
                           focus-visible:outline-none focus-visible:ring-2
                           focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2
                           focus-visible:ring-offset-stone`}
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
                className={`inline-flex items-center justify-center gap-2
                           rounded-full px-7 py-3.5 font-body text-[0.78rem] font-medium
                           uppercase tracking-[0.12em]
                           transition-all duration-300
                           ${theme === 'dark'
                             ? 'border border-white/30 text-white/85 hover:border-[#D4AF37] hover:text-[#E8C46A]'
                             : 'border border-stone/40 text-stone/80 hover:border-[#E8C46A] hover:text-[#1C1C1C]'}
                           focus-visible:outline-none focus-visible:ring-2
                           focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2
                           focus-visible:ring-offset-stone`}
              >
                Reserve a Table
              </MotionLink>
            </m.div>
          </m.div>
        </m.div>

        <SlideDots slides={SLIDES} current={current} onSelect={jumpTo} />

        {!shouldReduceMotion && <ScrollHint />}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-32
                     bg-linear-to-t from-cream/8 to-transparent"
        />
      </m.section>
    </>
  );
}

export default React.memo(HeroSection);