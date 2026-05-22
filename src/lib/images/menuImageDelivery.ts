// =============================================================================
// src/lib/images/menuImageDelivery.ts
// =============================================================================
// Menu + featured image delivery — production reliability first (2026).
// =============================================================================
//
// Menu UI (cards, rail, featured, modal):
//   - NO wsrv.nl.
//   - NO srcSet — one stable src per item.
//   - Canonical URL: /storage/v1/object/public/... (render URLs normalized away).
//   - Default: object/public only (VITE_ENABLE_SUPABASE_IMAGE_TRANSFORMS !== 'true').
//   - If transforms explicitly enabled: render/image first, object/public on error.
//   - Branded fallback always visible on failure.
//
// wsrv remains in this file only for legacy getMenuImageSrc(..., mode: 'optimized')
// callers outside menu UI; menu components do not use it.
// =============================================================================

import { env } from '@/lib/config/env';
import {
  isSupabaseStorageUrl,
  supabaseImageUrl,
  toSupabasePublicObjectUrl,
} from '@/lib/images/supabaseImage';

export { isSupabaseStorageUrl, toSupabasePublicObjectUrl };

const PROXY_HOST_PATTERN = /(^|\.)wsrv\.nl$/i;
const STORAGE_OBJECT_SEGMENT = '/storage/v1/object/public/';

const KNOWN_IMAGE_BUCKETS = ['menu-images', 'hero-images', 'gallery-images', 'banner-images'] as const;

// Legacy types — MenuFoodImage uses attempt-based delivery, not these stages.
export type MenuImageDeliveryMode = 'optimized' | 'direct' | 'raw';
export type MenuImageDeliveryStage = MenuImageDeliveryMode | 'unavailable';

/** @deprecated MenuFoodImage no longer uses stage machine; always starts sized attempt. */
export function getInitialMenuImageDeliveryStage(): MenuImageDeliveryMode {
  return 'optimized';
}

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
export type MenuImgElementAttrs = Omit<MenuCardImageAttrs, 'srcSet'> & { srcSet?: string };

/** Sized Supabase transform URL for first load attempt (never wsrv). */
export type MenuImageSources = MenuImgElementAttrs & {
  /** Public object URL — second attempt when sized transform fails. */
  publicSrc: string;
  /** True when sized and public URLs differ (retry is worthwhile). */
  hasPublicFallback: boolean;
};

// ─── Layout sizes ─────────────────────────────────────────────────────────────

const CARD_SIZES = '(min-width: 640px) 112px, 92px';
const CARD_WIDTH_ABOVE_FOLD = 224;
const CARD_WIDTH_BELOW_FOLD = 184;
const CARD_QUALITY_ABOVE = 78;
const CARD_QUALITY_BELOW = 72;

const MODAL_SIZES = '(max-width: 640px) 100vw, 540px';
const MODAL_WIDTH = 960;
const MODAL_QUALITY = 78;

const FEATURED_VARIANTS: Record<
  FeaturedImageVariant,
  { width: number; height: number; quality: number; sizes: string }
> = {
  hero: {
    width: 360,
    height: 288,
    quality: 74,
    sizes: '(max-width: 640px) 92vw, (min-width: 1280px) 520px, (min-width: 1024px) 46vw, 92vw',
  },
  circle: {
    width: 224,
    height: 224,
    quality: 76,
    sizes: '(min-width: 640px) 128px, 112px',
  },
  mini: {
    width: 212,
    height: 152,
    quality: 74,
    sizes: '106px',
  },
  rail: {
    width: 448,
    height: 224,
    quality: 78,
    sizes: '224px',
  },
};

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

export function resolveMenuImageUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;

  let url = raw.trim();
  if (!url.length || url.length > 2_048) return null;

  url = decodeRepeatedly(url);
  url = unwrapProxyUrl(url);
  url = absolutizeStorageUrl(url);
  url = toSupabasePublicObjectUrl(url);

  if (!isRenderableHttpUrl(url)) return null;

  return url;
}

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

function buildReliableSources(
  publicUrl: string,
  config: {
    width: number;
    height: number;
    quality: number;
    sizes: string;
  },
  isPriority: boolean,
): MenuImageSources {
  const transformsEnabled = menuImageTransformsEnabled();
  const canTransform = transformsEnabled && isSupabaseStorageUrl(publicUrl);

  const primarySrc = canTransform
    ? supabaseImageUrl(publicUrl, config.width, config.quality)
    : publicUrl;

  const hasPublicFallback = canTransform && primarySrc !== publicUrl;

  return {
    src: primarySrc,
    publicSrc: publicUrl,
    hasPublicFallback,
    sizes: config.sizes,
    width: config.width,
    height: config.height,
    loading: isPriority ? 'eager' : 'lazy',
    fetchPriority: isPriority ? 'high' : 'auto',
    decoding: 'async',
    referrerPolicy: 'no-referrer',
  };
}

/** Props for <img> — never includes srcSet. */
export function toImgElementAttrs(attrs: MenuImageSources): MenuImgElementAttrs {
  const { publicSrc: _publicSrc, hasPublicFallback: _hasPublicFallback, ...img } = attrs;
  return img;
}

export function menuImageTransformsEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_SUPABASE_IMAGE_TRANSFORMS === 'true';
}

export function getMenuCardImageSources(
  rawUrl: string | null | undefined,
  options: { isAboveFold: boolean },
): MenuImageSources | null {
  const url = cleanUrl(rawUrl);
  if (!url) return null;

  return buildReliableSources(
    url,
    {
      width: options.isAboveFold ? CARD_WIDTH_ABOVE_FOLD : CARD_WIDTH_BELOW_FOLD,
      height: options.isAboveFold ? CARD_WIDTH_ABOVE_FOLD : CARD_WIDTH_BELOW_FOLD,
      quality: options.isAboveFold ? CARD_QUALITY_ABOVE : CARD_QUALITY_BELOW,
      sizes: CARD_SIZES,
    },
    options.isAboveFold,
  );
}

/** @deprecated Use getMenuCardImageSources */
export function getMenuCardImageAttrs(
  rawUrl: string | null | undefined,
  options: { isAboveFold: boolean; mode?: MenuImageDeliveryMode },
): MenuCardImageAttrs | null {
  void options.mode;
  const sources = getMenuCardImageSources(rawUrl, { isAboveFold: options.isAboveFold });
  if (!sources) return null;
  return { ...toImgElementAttrs(sources), srcSet: undefined };
}

export function getFeaturedImageSources(
  rawUrl: string | null | undefined,
  options: {
    variant: FeaturedImageVariant;
    isAboveFold: boolean;
  },
): MenuImageSources | null {
  const url = cleanUrl(rawUrl);
  if (!url) return null;

  const config = FEATURED_VARIANTS[options.variant];

  return buildReliableSources(
    url,
    {
      width: config.width,
      height: config.height,
      quality: config.quality,
      sizes: config.sizes,
    },
    options.isAboveFold,
  );
}

/** @deprecated Use getFeaturedImageSources */
export function getFeaturedImageAttrs(
  rawUrl: string | null | undefined,
  options: {
    variant: FeaturedImageVariant;
    isAboveFold: boolean;
    mode?: MenuImageDeliveryMode;
  },
): FeaturedImageAttrs | null {
  void options.mode;
  const sources = getFeaturedImageSources(rawUrl, {
    variant: options.variant,
    isAboveFold: options.isAboveFold,
  });
  if (!sources) return null;
  return { ...toImgElementAttrs(sources), srcSet: undefined };
}

export function getModalImageSources(
  rawUrl: string | null | undefined,
): MenuImageSources | null {
  const url = cleanUrl(rawUrl);
  if (!url) return null;

  return buildReliableSources(
    url,
    {
      width: MODAL_WIDTH,
      height: Math.round((MODAL_WIDTH * 10) / 16),
      quality: MODAL_QUALITY,
      sizes: MODAL_SIZES,
    },
    true,
  );
}

/** @deprecated Use getModalImageSources */
export function getModalImageAttrs(
  rawUrl: string | null | undefined,
  options: { mode?: MenuImageDeliveryMode } = {},
): MenuCardImageAttrs | null {
  void options;
  const sources = getModalImageSources(rawUrl);
  if (!sources) return null;
  return { ...toImgElementAttrs(sources), srcSet: undefined };
}

/** Legacy helper — menu UI does not call this. */
export function getMenuImageSrc(
  rawUrl: string | null | undefined,
  options: { width: number; quality: number; mode?: MenuImageDeliveryMode },
): string {
  const url = cleanUrl(rawUrl);
  if (!url) return '';

  if (options.mode === 'raw' || !menuImageTransformsEnabled()) {
    return url;
  }

  if (isSupabaseStorageUrl(url)) {
    return supabaseImageUrl(url, options.width, options.quality);
  }

  return url;
}

export function getMenuImageSrcSet(
  _rawUrl: string | null | undefined,
  _options: { mode?: MenuImageDeliveryMode } = {},
): string | undefined {
  return undefined;
}

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

export function getMenuLcpPreloadAttrs(
  _rawUrl: string | null | undefined,
): Record<string, string> | null {
  return null;
}

export function getFeaturedLcpPreloadAttrs(
  _rawUrl: string | null | undefined,
): Record<string, string> | null {
  return null;
}
