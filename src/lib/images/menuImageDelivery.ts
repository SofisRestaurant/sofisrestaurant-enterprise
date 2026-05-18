// =============================================================================
// src/lib/images/menuImageDelivery.ts
// =============================================================================
// Menu + featured image delivery — single source of truth.
// =============================================================================
//
// Purpose:
//   - Keep compact menu cards lightweight.
//   - Prevent homepage hero images from looking blurry.
//   - Use layout-specific image sizes instead of forcing every image to 224px.
//   - Keep Supabase transform support feature-flagged.
//   - Keep wsrv.nl proxy as the current performance-safe image optimizer.
// =============================================================================

import { supabaseImageSrcSet, supabaseImageUrl } from '@/lib/images/supabaseImage';

// ─── Feature flags ────────────────────────────────────────────────────────────

const ENABLE_SUPABASE_TRANSFORMS =
  import.meta.env.VITE_ENABLE_SUPABASE_IMAGE_TRANSFORMS === 'true';

const USE_IMAGE_PROXY = import.meta.env.VITE_USE_IMAGE_PROXY !== 'false';

// ─── Proxy configuration ──────────────────────────────────────────────────────

const PROXY_BASE = 'https://wsrv.nl/';

// ─── Image variants ───────────────────────────────────────────────────────────

export type MenuImagePriority = 'high' | 'auto';

export type FeaturedImageVariant = 'hero' | 'circle' | 'mini';

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

export type FeaturedImageAttrs = MenuCardImageAttrs;

// ─── Menu card layout sizes ───────────────────────────────────────────────────
//
// Compact list-card thumbnails:
//   Mobile:  92px CSS → 184px @2×
//   Desktop: 112px CSS → 224px @2×

const CARD_SIZES = '(min-width: 640px) 112px, 92px';

const CARD_WIDTH_ABOVE_FOLD = 224;
const CARD_WIDTH_BELOW_FOLD = 184;
const CARD_QUALITY_ABOVE = 78;
const CARD_QUALITY_BELOW = 72;

const CARD_SRCSET_WIDTHS = [
  { w: 92, q: 72 },
  { w: 112, q: 74 },
  { w: 184, q: 72 },
  { w: 224, q: 76 },
] as const;

// ─── Featured homepage sizes ──────────────────────────────────────────────────
//
// Hero needs real resolution. Do NOT reuse card sizes here.
// Circle/mini stay lighter but still sharp on retina screens.

const FEATURED_VARIANTS: Record<
  FeaturedImageVariant,
  {
    width: number;
    height: number;
    quality: number;
    sizes: string;
    srcSet: readonly { w: number; h: number; q: number }[];
  }
> = {
  hero: {
    width: 960,
    height: 760,
    quality: 80,
    sizes: '(min-width: 1280px) 520px, (min-width: 1024px) 46vw, 92vw',
    srcSet: [
      { w: 480, h: 384, q: 74 },
      { w: 720, h: 576, q: 78 },
      { w: 960, h: 760, q: 80 },
      { w: 1200, h: 950, q: 80 },
    ],
  },

  circle: {
    width: 320,
    height: 320,
    quality: 78,
    sizes: '(min-width: 640px) 128px, 112px',
    srcSet: [
      { w: 160, h: 160, q: 72 },
      { w: 224, h: 224, q: 76 },
      { w: 320, h: 320, q: 78 },
    ],
  },

  mini: {
    width: 240,
    height: 172,
    quality: 76,
    sizes: '106px',
    srcSet: [
      { w: 106, h: 76, q: 70 },
      { w: 212, h: 152, q: 74 },
      { w: 240, h: 172, q: 76 },
    ],
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null;

  const trimmed = url.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildProxyUrl({
  rawUrl,
  width,
  height,
  quality,
  fit = 'cover',
}: {
  rawUrl: string;
  width: number;
  height: number;
  quality: number;
  fit?: 'cover' | 'contain' | 'inside';
}): string {
  const params = new URLSearchParams({
    url: rawUrl,
    w: String(width),
    h: String(height),
    fit,
    output: 'webp',
    q: String(quality),
    n: '-1',
  });

  return `${PROXY_BASE}?${params.toString()}`;
}

function buildProxySrcSet(
  rawUrl: string,
  widths: readonly { w: number; h: number; q: number }[],
): string {
  return widths
    .map(({ w, h, q }) => {
      const src = buildProxyUrl({
        rawUrl,
        width: w,
        height: h,
        quality: q,
      });

      return `${src} ${w}w`;
    })
    .join(', ');
}

function buildCardProxySrcSet(rawUrl: string): string {
  return CARD_SRCSET_WIDTHS
    .map(({ w, q }) => {
      const src = buildProxyUrl({
        rawUrl,
        width: w,
        height: w,
        quality: q,
      });

      return `${src} ${w}w`;
    })
    .join(', ');
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function menuImageTransformsEnabled(): boolean {
  return ENABLE_SUPABASE_TRANSFORMS;
}

export function getMenuImageSrc(
  rawUrl: string | null | undefined,
  options: { width: number; quality: number },
): string {
  const url = cleanUrl(rawUrl);
  if (!url) return '';

  if (ENABLE_SUPABASE_TRANSFORMS) {
    return supabaseImageUrl(url, options.width, options.quality);
  }

  if (USE_IMAGE_PROXY) {
    return buildProxyUrl({
      rawUrl: url,
      width: options.width,
      height: options.width,
      quality: options.quality,
    });
  }

  return url;
}

export function getMenuImageSrcSet(rawUrl: string | null | undefined): string | undefined {
  const url = cleanUrl(rawUrl);
  if (!url) return undefined;

  if (ENABLE_SUPABASE_TRANSFORMS) {
    return supabaseImageSrcSet(url);
  }

  if (USE_IMAGE_PROXY) {
    return buildCardProxySrcSet(url);
  }

  return undefined;
}

export function getMenuCardImageAttrs(
  rawUrl: string | null | undefined,
  options: { isAboveFold: boolean },
): MenuCardImageAttrs | null {
  const url = cleanUrl(rawUrl);
  if (!url) return null;

  const { isAboveFold } = options;

  return {
    src: getMenuImageSrc(url, {
      width: isAboveFold ? CARD_WIDTH_ABOVE_FOLD : CARD_WIDTH_BELOW_FOLD,
      quality: isAboveFold ? CARD_QUALITY_ABOVE : CARD_QUALITY_BELOW,
    }),
    srcSet: getMenuImageSrcSet(url),
    sizes: CARD_SIZES,
    width: 112,
    height: 112,
    loading: isAboveFold ? 'eager' : 'lazy',
    fetchPriority: isAboveFold ? 'high' : 'auto',
    decoding: 'async',
    referrerPolicy: 'no-referrer',
  };
}

export function getFeaturedImageAttrs(
  rawUrl: string | null | undefined,
  options: {
    variant: FeaturedImageVariant;
    isAboveFold: boolean;
  },
): FeaturedImageAttrs | null {
  const url = cleanUrl(rawUrl);
  if (!url) return null;

  const config = FEATURED_VARIANTS[options.variant];

  if (ENABLE_SUPABASE_TRANSFORMS) {
    return {
      src: supabaseImageUrl(url, config.width, config.quality),
      srcSet: supabaseImageSrcSet(url),
      sizes: config.sizes,
      width: config.width,
      height: config.height,
      loading: options.isAboveFold ? 'eager' : 'lazy',
      fetchPriority: options.isAboveFold ? 'high' : 'auto',
      decoding: 'async',
      referrerPolicy: 'no-referrer',
    };
  }

  if (USE_IMAGE_PROXY) {
    return {
      src: buildProxyUrl({
        rawUrl: url,
        width: config.width,
        height: config.height,
        quality: config.quality,
      }),
      srcSet: buildProxySrcSet(url, config.srcSet),
      sizes: config.sizes,
      width: config.width,
      height: config.height,
      loading: options.isAboveFold ? 'eager' : 'lazy',
      fetchPriority: options.isAboveFold ? 'high' : 'auto',
      decoding: 'async',
      referrerPolicy: 'no-referrer',
    };
  }

  return {
    src: url,
    srcSet: undefined,
    sizes: config.sizes,
    width: config.width,
    height: config.height,
    loading: options.isAboveFold ? 'eager' : 'lazy',
    fetchPriority: options.isAboveFold ? 'high' : 'auto',
    decoding: 'async',
    referrerPolicy: 'no-referrer',
  };
}

export function getMenuLcpPreloadAttrs(
  rawUrl: string | null | undefined,
): Record<string, string> | null {
  const url = cleanUrl(rawUrl);
  if (!url) return null;

  const href = getMenuImageSrc(url, {
    width: CARD_WIDTH_ABOVE_FOLD,
    quality: CARD_QUALITY_ABOVE,
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

export function getFeaturedLcpPreloadAttrs(
  rawUrl: string | null | undefined,
): Record<string, string> | null {
  const url = cleanUrl(rawUrl);
  if (!url) return null;

  const config = FEATURED_VARIANTS.hero;

  const href = USE_IMAGE_PROXY
    ? buildProxyUrl({
        rawUrl: url,
        width: config.width,
        height: config.height,
        quality: config.quality,
      })
    : url;

  if (!href) return null;

  const attrs: Record<string, string> = {
    rel: 'preload',
    as: 'image',
    href,
    fetchpriority: 'high',
  };

  if (USE_IMAGE_PROXY) {
    attrs.imagesrcset = buildProxySrcSet(url, config.srcSet);
    attrs.imagesizes = config.sizes;
  }

  return attrs;
}