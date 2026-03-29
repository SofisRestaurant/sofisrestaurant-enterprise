// src/assets/images.ts
// ============================================================================
// AUTO-GENERATED — do not edit manually.
// Regenerate: npm run generate-images-ts
// Generated:  2026-03-20T19:15:17.602Z
// Mode:       Local Vite imports
// ============================================================================

// ── Type ─────────────────────────────────────────────────────────────────────

export interface ImageAsset {
  readonly avif:   string;
  readonly webp:   string;
  readonly jpeg:   string;
  readonly width:  number;
  readonly height: number;
}

// ── Vite asset imports ───────────────────────────────────────────────────────
// Vite resolves these to content-hashed URLs at build time.

// hero/
import hero1Avif from './images/optimized/hero/hero1.avif';
import hero1Webp from './images/optimized/hero/hero1.webp';
import hero1Jpeg from './images/optimized/hero/hero1.jpeg';
import hero2Avif from './images/optimized/hero/hero2.avif';
import hero2Webp from './images/optimized/hero/hero2.webp';
import hero2Jpeg from './images/optimized/hero/hero2.jpeg';
import hero3Avif from './images/optimized/hero/hero3.avif';
import hero3Webp from './images/optimized/hero/hero3.webp';
import hero3Jpeg from './images/optimized/hero/hero3.jpeg';

// ── Hero ─────────────────────────────────────────────────────────────────────

// hero1 — 1600×1200px
const hero1: ImageAsset = {
  avif:   hero1Avif,
  webp:   hero1Webp,
  jpeg:   hero1Jpeg,
  width:  1600,
  height: 1200,
};

// hero2 — 1600×2134px
const hero2: ImageAsset = {
  avif:   hero2Avif,
  webp:   hero2Webp,
  jpeg:   hero2Jpeg,
  width:  1600,
  height: 2134,
};

// hero3 — 1600×2133px
const hero3: ImageAsset = {
  avif:   hero3Avif,
  webp:   hero3Webp,
  jpeg:   hero3Jpeg,
  width:  1600,
  height: 2133,
};

// ── HeroImage type (used by HeroSection) ─────────────────────────────────────

export type HeroImage = {
  avif: string;
  webp: string;
  jpeg: string;
  alt: string;
  width?: number;
  height?: number;
};

// ── HERO_IMAGES — uses Vite imports (content-hashed, works on Vercel) ─────────
// Previously used hardcoded /images/ paths which 404 on Vercel because
// Vite renames assets to content-hashed filenames at build time.

export const HERO_IMAGES = {
  hero1: {
    avif: hero1.avif,
    webp: hero1.webp,
    jpeg: hero1.jpeg,
    width: hero1.width,
    height: hero1.height,
    alt: 'Luxury dining room with warm lighting',
  },
  hero2: {
    avif: hero2.avif,
    webp: hero2.webp,
    jpeg: hero2.jpeg,
    width: hero2.width,
    height: hero2.height,
    alt: 'Chef plating signature dish',
  },
  hero3: {
    avif: hero3.avif,
    webp: hero3.webp,
    jpeg: hero3.jpeg,
    width: hero3.width,
    height: hero3.height,
    alt: 'Elegant restaurant exterior at night',
  },
} as const;

// ── Empty stubs ──────────────────────────────────────────────────────────────

export const MENU_IMAGES: Record<string, ImageAsset> = {};
export const GALLERY_IMAGES: Record<string, ImageAsset> = {};
export const BANNER_IMAGES: Record<string, ImageAsset> = {};

// ── IMAGES map ───────────────────────────────────────────────────────────────

export const IMAGES = {
  hero: HERO_IMAGES,
  menu: MENU_IMAGES,
  gallery: GALLERY_IMAGES,
  banners: BANNER_IMAGES,
} as const;