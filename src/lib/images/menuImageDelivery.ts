// =============================================================================
// src/lib/images/menuImageDelivery.ts
// =============================================================================
// Menu + featured image delivery — single source of truth.
// =============================================================================
//
// Responsibilities:
//   - Normalize image URLs from every legacy DB / API field name.
//   - Convert Supabase storage paths → public object URLs.
//   - Unwrap accidental wsrv.nl double-proxy URLs before re-wrapping.
//   - Deliver layout-specific sizes (card, hero, circle, mini, rail).
//   - Keep wsrv.nl as the default optimizer (Supabase /render/image 403s here).
//   - Support a direct-URL delivery mode for onError fallback in UI.
//
// LCP: priority images use fetchPriority="high" + loading="eager" on the <img>.
// Manual <link rel="preload"> stays disabled (dimension mismatch with srcSet).
// =============================================================================

import { env } from '@/lib/config/env';
import {
  isSupabaseStorageUrl,
  supabaseImageSrcSet,
  supabaseImageUrl,
} from '@/lib/images/supabaseImage';

export { isSupabaseStorageUrl };

// ─── Feature flags ────────────────────────────────────────────────────────────

const ENABLE_SUPABASE_TRANSFORMS =
  import.meta.env.VITE_ENABLE_SUPABASE_IMAGE_TRANSFORMS === 'true';

const USE_IMAGE_PROXY = import.meta.env.VITE_USE_IMAGE_PROXY !== 'false';

// ─── Proxy configuration ──────────────────────────────────────────────────────

const PROXY_BASE = 'https://wsrv.nl/';
const PROXY_HOST_PATTERN = /(^|\.)wsrv\.nl$/i;

const STORAGE_OBJECT_SEGMENT = '/storage/v1/object/public/';

const KNOWN_IMAGE_BUCKETS = ['menu-images', 'hero-images', 'gallery-images', 'banner-images'] as const;

// ─── Image variants ───────────────────────────────────────────────────────────

export type MenuImagePriority = 'high' | 'auto';

export type FeaturedImageVariant = 'hero' | 'circle' | 'mini' | 'rail';

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

/** Props safe to spread onto <img> — srcSet omitted unless optimized. */
export type MenuImgElementAttrs = Omit<MenuCardImageAttrs, 'srcSet'> & { srcSet?: string };

export type MenuImageDeliveryMode = 'optimized' | 'direct';

/** Delivery stage for MenuFoodImage state machine. */
export type MenuImageDeliveryStage = MenuImageDeliveryMode | 'unavailable';

/**
 * Priority / LCP images use direct Supabase public URLs first (wsrv.nl is best-effort).
 * Non-priority images try wsrv optimization first, then fall back to direct.
 */
export function getInitialMenuImageDeliveryStage(options: {
  priority: boolean;
  skipOptimized?: boolean;
}): MenuImageDeliveryMode {
  if (options.priority || options.skipOptimized) {
    return 'direct';
  }
  return 'optimized';
}

// ─── Menu card layout sizes ───────────────────────────────────────────────────

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

const MODAL_SIZES = '(max-width: 640px) 100vw, 540px';
const MODAL_WIDTH = 960;
const MODAL_QUALITY = 78;

// ─── Featured / rail sizes ────────────────────────────────────────────────────

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
    width: 360,
    height: 288,
    quality: 74,
    sizes: '(max-width: 640px) 92vw, (min-width: 1280px) 520px, (min-width: 1024px) 46vw, 92vw',
    srcSet: [
      { w: 280, h: 224, q: 70 },
      { w: 360, h: 288, q: 72 },
      { w: 480, h: 384, q: 74 },
      { w: 720, h: 576, q: 78 },
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

  rail: {
    width: 448,
    height: 224,
    quality: 78,
    sizes: '224px',
    srcSet: [
      { w: 224, h: 112, q: 74 },
      { w: 336, h: 168, q: 76 },
      { w: 448, h: 224, q: 78 },
    ],
  },
};

/** Field names seen across menu_items, RPC payloads, and admin forms. */
export const MENU_IMAGE_FIELD_KEYS = [
  'image_url',
  'imageUrl',
  'image_path',
  'imagePath',
  'photo_url',
  'photoUrl',
  'public_url',
  'publicUrl',
  'storage_path',
  'storagePath',
  'thumbnail_url',
  'thumbnailUrl',
  'image',
  'photo',
] as const;

// ─── URL normalization ──────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getSupabaseOrigin(): string {
  return env.supabase.url.replace(/\/+$/u, '');
}

function decodeRepeatedly(value: string, maxPasses = 3): string {
  let current = value;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    if (!/%[0-9A-Fa-f]{2}/u.test(current)) break;

    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }

  return current;
}

function unwrapProxyUrl(url: string): string {
  let current = url.trim();

  for (let depth = 0; depth < 4; depth += 1) {
    try {
      const parsed = new URL(current);
      if (!PROXY_HOST_PATTERN.test(parsed.hostname)) break;

      const inner = parsed.searchParams.get('url');
      if (!inner) break;

      current = decodeRepeatedly(inner);
    } catch {
      break;
    }
  }

  return current;
}

function isLikelyStoragePath(value: string): boolean {
  if (value.startsWith('http://') || value.startsWith('https://')) return false;
  if (value.startsWith('/storage/v1/')) return false;
  if (value.startsWith('//')) return false;

  const firstSegment = value.split('/')[0]?.toLowerCase() ?? '';
  if ((KNOWN_IMAGE_BUCKETS as readonly string[]).includes(firstSegment)) return true;

  return /^[a-z0-9][a-z0-9_-]*\/[\w.-]+$/iu.test(value);
}

function toPublicStorageUrl(path: string): string {
  const trimmed = path.replace(/^\/+/u, '');
  const origin = getSupabaseOrigin();
  return `${origin}${STORAGE_OBJECT_SEGMENT}${trimmed}`;
}

function absolutizeStorageUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;

  if (url.startsWith('/storage/v1/')) {
    return `${getSupabaseOrigin()}${url}`;
  }

  if (isLikelyStoragePath(url)) {
    return toPublicStorageUrl(url);
  }

  return url;
}

function isRenderableHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Normalize any raw menu image reference into a fetchable absolute URL.
 * Returns null when the value is empty, unsafe, or cannot be resolved.
 */
export function resolveMenuImageUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;

  let url = raw.trim();
  if (!url.length || url.length > 2_048) return null;

  url = decodeRepeatedly(url);
  url = unwrapProxyUrl(url);
  url = absolutizeStorageUrl(url);

  if (!isRenderableHttpUrl(url)) return null;

  return url;
}

/**
 * Read the first valid image URL from a menu item / API record.
 */
export function pickMenuImageUrlFromRecord(
  record: Record<string, unknown> | null | undefined,
): string | null {
  if (!record) return null;

  for (const key of MENU_IMAGE_FIELD_KEYS) {
    if (!(key in record)) continue;
    const resolved = resolveMenuImageUrl(
      typeof record[key] === 'string' ? record[key] : null,
    );
    if (resolved) return resolved;
  }

  const metadata = record.metadata;
  if (isRecord(metadata)) {
    const fromMeta = pickMenuImageUrlFromRecord(metadata);
    if (fromMeta) return fromMeta;
  }

  const meta = record.meta;
  if (isRecord(meta)) {
    const fromMeta = pickMenuImageUrlFromRecord(meta);
    if (fromMeta) return fromMeta;
  }

  return null;
}

function cleanUrl(url: string | null | undefined): string | null {
  return resolveMenuImageUrl(url);
}

// ─── Delivery builders ──────────────────────────────────────────────────────────

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
  const source = unwrapProxyUrl(rawUrl);

  const params = new URLSearchParams({
    url: source,
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

function buildAttrs(
  url: string,
  config: {
    width: number;
    height: number;
    quality: number;
    sizes: string;
    srcSet?: readonly { w: number; h: number; q: number }[];
    cardSrcSet?: boolean;
  },
  options: { isAboveFold: boolean; mode: MenuImageDeliveryMode },
): MenuCardImageAttrs {
  const { isAboveFold, mode } = options;
  const useOptimized = mode === 'optimized';

  if (useOptimized && ENABLE_SUPABASE_TRANSFORMS) {
    return {
      src: supabaseImageUrl(url, config.width, config.quality),
      srcSet: supabaseImageSrcSet(url),
      sizes: config.sizes,
      width: config.width,
      height: config.height,
      loading: isAboveFold ? 'eager' : 'lazy',
      fetchPriority: isAboveFold ? 'high' : 'auto',
      decoding: 'async',
      referrerPolicy: 'no-referrer',
    };
  }

  if (useOptimized && USE_IMAGE_PROXY) {
    return {
      src: buildProxyUrl({
        rawUrl: url,
        width: config.width,
        height: config.height,
        quality: config.quality,
      }),
      srcSet: config.srcSet
        ? buildProxySrcSet(url, config.srcSet)
        : config.cardSrcSet
          ? buildCardProxySrcSet(url)
          : undefined,
      sizes: config.sizes,
      width: config.width,
      height: config.height,
      loading: isAboveFold ? 'eager' : 'lazy',
      fetchPriority: isAboveFold ? 'high' : 'auto',
      decoding: 'async',
      referrerPolicy: 'no-referrer',
    };
  }

  // Direct mode: plain Supabase public (or other) URL — never attach wsrv/transform srcSet.
  return {
    src: url,
    srcSet: undefined,
    sizes: config.sizes,
    width: config.width,
    height: config.height,
    loading: isAboveFold ? 'eager' : 'lazy',
    fetchPriority: isAboveFold ? 'high' : 'auto',
    decoding: 'async',
    referrerPolicy: 'no-referrer',
  };
}

/** Strip srcSet when absent so direct fallback never forwards wsrv candidates. */
export function toImgElementAttrs(attrs: MenuCardImageAttrs): MenuImgElementAttrs {
  const { srcSet, ...rest } = attrs;
  return srcSet ? { ...rest, srcSet } : rest;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function menuImageTransformsEnabled(): boolean {
  return ENABLE_SUPABASE_TRANSFORMS;
}

export function getMenuImageSrc(
  rawUrl: string | null | undefined,
  options: { width: number; quality: number; mode?: MenuImageDeliveryMode },
): string {
  const url = cleanUrl(rawUrl);
  if (!url) return '';

  const mode = options.mode ?? 'optimized';

  if (mode === 'optimized' && ENABLE_SUPABASE_TRANSFORMS) {
    return supabaseImageUrl(url, options.width, options.quality);
  }

  if (mode === 'optimized' && USE_IMAGE_PROXY) {
    return buildProxyUrl({
      rawUrl: url,
      width: options.width,
      height: options.width,
      quality: options.quality,
    });
  }

  return url;
}

export function getMenuImageSrcSet(
  rawUrl: string | null | undefined,
  options: { mode?: MenuImageDeliveryMode } = {},
): string | undefined {
  const url = cleanUrl(rawUrl);
  if (!url) return undefined;

  const mode = options.mode ?? 'optimized';

  if (mode === 'optimized' && ENABLE_SUPABASE_TRANSFORMS) {
    return supabaseImageSrcSet(url);
  }

  if (mode === 'optimized' && USE_IMAGE_PROXY) {
    return buildCardProxySrcSet(url);
  }

  return undefined;
}

export function getMenuCardImageAttrs(
  rawUrl: string | null | undefined,
  options: { isAboveFold: boolean; mode?: MenuImageDeliveryMode },
): MenuCardImageAttrs | null {
  const url = cleanUrl(rawUrl);
  if (!url) return null;

  const { isAboveFold } = options;
  const mode = options.mode ?? 'optimized';

  return buildAttrs(
    url,
    {
      width: isAboveFold ? CARD_WIDTH_ABOVE_FOLD : CARD_WIDTH_BELOW_FOLD,
      height: isAboveFold ? CARD_WIDTH_ABOVE_FOLD : CARD_WIDTH_BELOW_FOLD,
      quality: isAboveFold ? CARD_QUALITY_ABOVE : CARD_QUALITY_BELOW,
      sizes: CARD_SIZES,
      cardSrcSet: true,
    },
    { isAboveFold, mode },
  );
}

export function getFeaturedImageAttrs(
  rawUrl: string | null | undefined,
  options: {
    variant: FeaturedImageVariant;
    isAboveFold: boolean;
    mode?: MenuImageDeliveryMode;
  },
): FeaturedImageAttrs | null {
  const url = cleanUrl(rawUrl);
  if (!url) return null;

  const config = FEATURED_VARIANTS[options.variant];
  const mode = options.mode ?? 'optimized';

  return buildAttrs(
    url,
    {
      width: config.width,
      height: config.height,
      quality: config.quality,
      sizes: config.sizes,
      srcSet: config.srcSet,
    },
    { isAboveFold: options.isAboveFold, mode },
  );
}

export function getModalImageAttrs(
  rawUrl: string | null | undefined,
  options: { mode?: MenuImageDeliveryMode } = {},
): MenuCardImageAttrs | null {
  const url = cleanUrl(rawUrl);
  if (!url) return null;

  const mode = options.mode ?? 'optimized';

  return buildAttrs(
    url,
    {
      width: MODAL_WIDTH,
      height: Math.round((MODAL_WIDTH * 10) / 16),
      quality: MODAL_QUALITY,
      sizes: MODAL_SIZES,
      srcSet: [
        { w: 480, h: 300, q: 72 },
        { w: 720, h: 450, q: 76 },
        { w: 960, h: 600, q: 78 },
      ],
    },
    { isAboveFold: true, mode },
  );
}

/** Stable warm gradient for branded fallbacks (keyed by item id). */
export function pickMenuImageFallbackGradient(seed: string): string {
  const gradients = [
    'radial-gradient(ellipse at 38% 28%, rgba(245,158,11,0.22) 0%, rgba(250,246,239,1) 48%, rgba(237,224,206,1) 100%)',
    'radial-gradient(ellipse at 62% 34%, rgba(180,83,9,0.14) 0%, rgba(255,251,235,1) 50%, rgba(237,224,206,1) 100%)',
    'radial-gradient(ellipse at 50% 22%, rgba(217,119,6,0.18) 0%, rgba(254,243,199,0.9) 45%, rgba(237,224,206,1) 100%)',
    'radial-gradient(ellipse at 44% 58%, rgba(120,53,15,0.12) 0%, rgba(250,246,239,1) 52%, rgba(228,213,195,1) 100%)',
  ] as const;

  if (!seed) return gradients[0];

  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }

  return gradients[Math.abs(hash) % gradients.length];
}

/**
 * @deprecated Manual preload removed — use fetchpriority="high" on the img.
 */
export function getMenuLcpPreloadAttrs(
  _rawUrl: string | null | undefined,
): Record<string, string> | null {
  return null;
}

/**
 * @deprecated Manual preload removed — use fetchpriority="high" on the img.
 */
export function getFeaturedLcpPreloadAttrs(
  _rawUrl: string | null | undefined,
): Record<string, string> | null {
  return null;
}
