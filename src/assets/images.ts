// src/assets/images.ts
// ============================================================================
// AUTO-GENERATED — do not edit manually.
// Regenerate: npm run generate-images-ts
// Generated:  2026-03-20T19:15:17.602Z
// Mode:       Local Vite imports
// ============================================================================

// ── Type ─────────────────────────────────────────────────────────────────────

/**
 * Multi-format image asset with intrinsic dimensions.
 * Use with <picture> for automatic browser format negotiation:
 *
 *   <picture>
 *     <source srcSet={img.avif} type="image/avif" />
 *     <source srcSet={img.webp} type="image/webp" />
 *     <img src={img.jpeg} width={img.width} height={img.height} alt="…" />
 *   </picture>
 */
export interface ImageAsset {
  readonly avif:   string;  // AVIF  — best compression  (Chrome 85+, FF 93+, Safari 16+)
  readonly webp:   string;  // WebP  — all modern browsers
  readonly jpeg:   string;  // JPEG  — universal fallback
  readonly width:  number;  // intrinsic width  (px) — prevents layout shift
  readonly height: number;  // intrinsic height (px) — prevents layout shift
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

// src/assets/images.ts
export type HeroImage = {
  avif: string;
  webp: string;
  jpeg: string;
  alt: string;
  width?: number;
  height?: number;
};

/** hero images — `import { HERO_IMAGES } from '@/assets/images'` */
// src/assets/images.ts
export const HERO_IMAGES = {
  hero1: {
    avif: '/images/hero1.avif',
    webp: '/images/hero1.webp',
    jpeg: '/images/hero1.jpg',
    width: 1920,
    height: 1080,
    alt: 'Luxury dining room with warm lighting', // <--- add descriptive alt
  },
  hero2: {
    avif: '/images/hero2.avif',
    webp: '/images/hero2.webp',
    jpeg: '/images/hero2.jpg',
    width: 1920,
    height: 1080,
    alt: 'Chef plating signature dish',
  },
  hero3: {
    avif: '/images/hero3.avif',
    webp: '/images/hero3.webp',
    jpeg: '/images/hero3.jpg',
    width: 1920,
    height: 1080,
    alt: 'Elegant restaurant exterior at night',
  },
} as const;

// ── Empty stubs ──────────────────────────────────────────────────────────────
// No images found yet — add files to optimized/{folder}/ and re-run.

export const MENU_IMAGES: Record<string, ImageAsset> = {};
export const GALLERY_IMAGES: Record<string, ImageAsset> = {};
export const BANNER_IMAGES: Record<string, ImageAsset> = {};

// ── IMAGES map ───────────────────────────────────────────────────────────────
// `import { IMAGES } from '@/assets/images'` then `IMAGES.hero.hero1.webp`

export const IMAGES = {
  hero: HERO_IMAGES,
  menu: MENU_IMAGES,
  gallery: GALLERY_IMAGES,
  banners: BANNER_IMAGES,
} as const;
