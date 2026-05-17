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
//   - Supabase transforms are feature-flagged.
//   - Cards and preload use the same URL builder.
//   - Turning transforms on later requires only:
//       VITE_ENABLE_SUPABASE_IMAGE_TRANSFORMS=true
//
// Important:
//   Payment/pricing/security logic is not connected to this file.
// =============================================================================

import { supabaseImageSrcSet, supabaseImageUrl } from '@/lib/images/supabaseImage';

const ENABLE_SUPABASE_IMAGE_TRANSFORMS =
  import.meta.env.VITE_ENABLE_SUPABASE_IMAGE_TRANSFORMS === 'true';

const CARD_SIZES = '(max-width: 640px) 92vw, (max-width: 1024px) 45vw, 360px';

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

function cleanUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null;

  const trimmed = url.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function menuImageTransformsEnabled(): boolean {
  return ENABLE_SUPABASE_IMAGE_TRANSFORMS;
}

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

export function getMenuImageSrcSet(rawUrl: string | null | undefined): string | undefined {
  const url = cleanUrl(rawUrl);
  if (!url) return undefined;

  if (!ENABLE_SUPABASE_IMAGE_TRANSFORMS) {
    return undefined;
  }

  return supabaseImageSrcSet(url);
}

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
      width: isAboveFold ? 640 : 480,
      quality: isAboveFold ? 74 : 72,
    }),
    srcSet: getMenuImageSrcSet(url),
    sizes: CARD_SIZES,
    width: 400,
    height: 300,
    loading: isAboveFold ? 'eager' : 'lazy',
    fetchPriority: isAboveFold ? 'high' : 'auto',
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
    width: 640,
    quality: 74,
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