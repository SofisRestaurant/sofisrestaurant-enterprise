// =============================================================================
// src/lib/images/menuImageDelivery.ts
// =============================================================================
// Menu image delivery — single source of truth for menu cards + LCP preload.
// =============================================================================
//
// Why this exists:
//   Supabase /storage/v1/render/image returned 403 Forbidden on this project.
//   If the card uses raw /object/public/ but MenuPage preloads /render/image/,
//   Chrome warns "preloaded but not used" and bandwidth is wasted.
//
// Contract:
//   - Default mode is raw public object URLs because they are reliable.
//   - Supabase transforms are feature-flagged behind
//       VITE_ENABLE_SUPABASE_IMAGE_TRANSFORMS=true
//   - Cards and preload use the SAME URL builder — no mismatch possible.
//   - Turning transforms on later requires only flipping the env var.
//
// 2026 compact list-card update:
//   Thumbnails are now 92×92 mobile / 112×112 desktop (square, not full-bleed).
//   CARD_SIZES, intrinsic width/height, and transform widths are calibrated
//   to this layout so browser srcSet selection picks the correct variant and
//   no 640px image is ever requested for a 112px container.
//
// Important:
//   Payment/pricing/security logic is not connected to this file.
// =============================================================================

import { supabaseImageSrcSet, supabaseImageUrl } from '@/lib/images/supabaseImage';

// ─── Feature flag ─────────────────────────────────────────────────────────────

const ENABLE_SUPABASE_IMAGE_TRANSFORMS =
  import.meta.env.VITE_ENABLE_SUPABASE_IMAGE_TRANSFORMS === 'true';

// ─── Layout-matched sizes ─────────────────────────────────────────────────────
//
// Compact list-card thumbnails:
//   Mobile:  92px CSS = 184px @2× retina
//   Desktop: 112px CSS = 224px @2× retina
//
// The sizes attribute tells the browser how wide the image will render so it
// picks the right srcSet candidate. These MUST match the actual CSS container.

const CARD_SIZES = '(min-width: 640px) 112px, 92px';

// ─── Transform widths ─────────────────────────────────────────────────────────
//
// When transforms are enabled, these are the pixel widths requested from
// Supabase /render/image. Sized for the compact thumbnail, not the old
// full-bleed card. 224px covers 2× retina on the 112px desktop container.

const CARD_TRANSFORM_WIDTH_ABOVE_FOLD = 224;
const CARD_TRANSFORM_WIDTH_BELOW_FOLD = 184;
const CARD_TRANSFORM_QUALITY_ABOVE = 76;
const CARD_TRANSFORM_QUALITY_BELOW = 72;

// ─── Types ────────────────────────────────────────────────────────────────────

export type MenuImagePriority = 'high' | 'auto';

export type MenuCardImageAttrs = {
  src: string;
  srcSet: string | undefined;
  sizes: string;
  width: number;
  height: number;
  loading: 'eager' | 'lazy';
  fetchPriority: MenuImagePriority;
  decoding: 'async';
  referrerPolicy: 'no-referrer';
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null;

  const trimmed = url.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function menuImageTransformsEnabled(): boolean {
  return ENABLE_SUPABASE_IMAGE_TRANSFORMS;
}

/**
 * Returns a single image `src` URL.
 *
 * - Transforms disabled → raw public object URL (reliable, no 403).
 * - Transforms enabled  → Supabase render/image URL at given width/quality.
 */
export function getMenuImageSrc(
  rawUrl: string | null | undefined,
  options: {
    width: number;
    quality: number;
  },
): string {
  const url = cleanUrl(rawUrl);
  if (!url) return '';

  if (!ENABLE_SUPABASE_IMAGE_TRANSFORMS) {
    return url;
  }

  return supabaseImageUrl(url, options.width, options.quality);
}

/**
 * Returns a responsive `srcSet` string, or `undefined` if transforms are off.
 *
 * When undefined, the `<img>` tag uses `src` alone — correct HTML behaviour.
 */
export function getMenuImageSrcSet(rawUrl: string | null | undefined): string | undefined {
  const url = cleanUrl(rawUrl);
  if (!url) return undefined;

  if (!ENABLE_SUPABASE_IMAGE_TRANSFORMS) {
    return undefined;
  }

  return supabaseImageSrcSet(url);
}

/**
 * Returns all `<img>` attributes for a menu card thumbnail.
 *
 * Returns `null` if the URL is falsy/invalid — the card shows a gradient
 * placeholder and the layout is unaffected.
 *
 * Intrinsic width/height (112×112) match the desktop thumbnail container
 * for correct aspect-ratio CLS reservation. The actual container is
 * `object-cover` so the image fills the square regardless of source aspect.
 */
export function getMenuCardImageAttrs(
  rawUrl: string | null | undefined,
  options: {
    isAboveFold: boolean;
  },
): MenuCardImageAttrs | null {
  const url = cleanUrl(rawUrl);
  if (!url) return null;

  const { isAboveFold } = options;

  return {
    src: getMenuImageSrc(url, {
      width: isAboveFold ? CARD_TRANSFORM_WIDTH_ABOVE_FOLD : CARD_TRANSFORM_WIDTH_BELOW_FOLD,
      quality: isAboveFold ? CARD_TRANSFORM_QUALITY_ABOVE : CARD_TRANSFORM_QUALITY_BELOW,
    }),
    srcSet: getMenuImageSrcSet(url),
    sizes: CARD_SIZES,
    // Intrinsic dimensions for CLS reservation — matches desktop thumbnail.
    width: 112,
    height: 112,
    loading: isAboveFold ? 'eager' : 'lazy',
    fetchPriority: isAboveFold ? 'high' : 'auto',
    decoding: 'async',
    referrerPolicy: 'no-referrer',
  };
}

/**
 * Returns `<link rel="preload">` attributes for the LCP menu card image.
 *
 * Uses the SAME URL builder as `getMenuCardImageAttrs` with above-fold
 * settings, guaranteeing the preloaded resource matches the `<img>` request.
 * No "preloaded but not used" warning.
 *
 * Returns `null` if the URL is falsy.
 */
export function getMenuLcpPreloadAttrs(
  rawUrl: string | null | undefined,
): Record<string, string> | null {
  const url = cleanUrl(rawUrl);
  if (!url) return null;

  const href = getMenuImageSrc(url, {
    width: CARD_TRANSFORM_WIDTH_ABOVE_FOLD,
    quality: CARD_TRANSFORM_QUALITY_ABOVE,
  });

  if (!href) return null;

  const attrs: Record<string, string> = {
    rel: 'preload',
    as: 'image',
    href,
    fetchpriority: 'high',
  };

  const srcSet = getMenuImageSrcSet(url);

  if (srcSet) {
    attrs.imagesrcset = srcSet;
    attrs.imagesizes = CARD_SIZES;
  }

  return attrs;
}