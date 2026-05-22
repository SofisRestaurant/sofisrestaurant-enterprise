// =============================================================================
// src/lib/images/supabaseImage.ts
// =============================================================================
// Supabase Storage image-transform helpers — centralised pipeline
// =============================================================================
//
// Converts Supabase Storage public/signed object URLs into render/image
// transformation URLs with width, quality, and resize parameters.
//
// Handles:
//   /storage/v1/object/public/...   → /storage/v1/render/image/public/...
//   /storage/v1/object/sign/...     → /storage/v1/render/image/sign/...
//   /storage/v1/render/image/...    → keeps path, updates params only
//   Non-Supabase / malformed URLs   → pass-through (no throw)
//
// Performance contracts (2026):
//   - Quality clamped [40, 90] — prevents accidental full-quality downloads.
//   - Width clamped [16, 2400] — prevents 0/negative/absurd transforms.
//   - `resize=cover` explicit — consistent crop across Supabase versions.
//   - srcSet builds all widths in a single URL parse — O(1) parse per call.
//   - No double-transform: already-rendered URLs update params in place.
//   - Signed URL tokens preserved: only width/quality/resize are touched.
//
// Exports:
//   isSupabaseStorageUrl(url)           → boolean
//   supabaseImageUrl(url, width, q?)    → string
//   supabaseImageSrcSet(url)            → string | undefined
//   getMenuCardImageProps(url, opts)     → { src, srcSet, sizes, ... }
//   getModalImageProps(url, name)        → { src, srcSet, sizes, ... }
// =============================================================================

// ─── Constants ────────────────────────────────────────────────────────────────

const OBJECT_SEGMENT = '/storage/v1/object/';
const RENDER_SEGMENT = '/storage/v1/render/image/';

const MIN_QUALITY = 40;
const MAX_QUALITY = 90;
const MIN_WIDTH = 16;
const MAX_WIDTH = 2400;

/** Standard srcSet breakpoints for menu images. */
const SRCSET_WIDTHS: ReadonlyArray<{ w: number; q: number }> = [
  { w: 320, q: 68 },
  { w: 480, q: 72 },
  { w: 640, q: 74 },
  { w: 800, q: 74 },
];

/** Default sizes attribute for menu grid cards (3-col grid, full-bleed mobile). */
const CARD_SIZES = '(max-width: 640px) 92vw, (max-width: 1024px) 45vw, 360px';

/** Sizes attribute for the modal hero image. */
const MODAL_SIZES = '(max-width: 640px) 100vw, 540px';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clampInt(value: number, min: number, max: number): number {
  const n = Math.round(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

// ─── Detection ────────────────────────────────────────────────────────────────

/**
 * Returns `true` if the URL points to a Supabase Storage endpoint
 * (either `/storage/v1/object/` or already-transformed `/storage/v1/render/image/`).
 */
export function isSupabaseStorageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes(OBJECT_SEGMENT) || url.includes(RENDER_SEGMENT);
}

/**
 * Normalize any Supabase storage URL to a true object URL (never render/image).
 *
 * Example:
 *   /storage/v1/render/image/public/menu-images/x.webp?width=448
 *     → /storage/v1/object/public/menu-images/x.webp
 *
 * Transform query params (width, quality, resize) are stripped so the public URL
 * is stable across reloads and safe to use as the canonical image identity.
 * Signed URL `token` and other non-transform params are preserved.
 */
export function toSupabasePublicObjectUrl(url: string): string {
  if (!url) return url;

  const isStorage = url.includes(OBJECT_SEGMENT) || url.includes(RENDER_SEGMENT);
  if (!isStorage) return url;

  try {
    const parsed = new URL(url);

    if (parsed.pathname.includes(RENDER_SEGMENT)) {
      parsed.pathname = parsed.pathname.replace(RENDER_SEGMENT, OBJECT_SEGMENT);
    }

    for (const key of ['width', 'quality', 'resize'] as const) {
      parsed.searchParams.delete(key);
    }

    return parsed.toString();
  } catch {
    return url.includes(RENDER_SEGMENT)
      ? url.replace(RENDER_SEGMENT, OBJECT_SEGMENT)
      : url;
  }
}

// ─── Single-URL transform ─────────────────────────────────────────────────────

/**
 * Convert a Supabase Storage URL into a render/image transformation URL.
 *
 * - `/storage/v1/object/...` → `/storage/v1/render/image/...` + params
 * - `/storage/v1/render/image/...` → keeps path, updates params only
 * - Non-Supabase / falsy / malformed → returned as-is (empty string for falsy)
 *
 * Width and quality are clamped to safe ranges. `resize=cover` is always set.
 * Existing query params (including signed URL `token`) are preserved.
 */
export function supabaseImageUrl(
  url: string | null | undefined,
  width: number,
  quality = 72,
): string {
  if (!url) return '';

  const isObject = url.includes(OBJECT_SEGMENT);
  const isRender = url.includes(RENDER_SEGMENT);

  // Not a Supabase Storage URL — pass through unchanged.
  if (!isObject && !isRender) return url;

  const safeWidth = clampInt(width, MIN_WIDTH, MAX_WIDTH);
  const safeQuality = clampInt(quality, MIN_QUALITY, MAX_QUALITY);

  try {
    const parsed = new URL(url);

    // Convert object path → render path (skip if already render).
    if (isObject) {
      parsed.pathname = parsed.pathname.replace(OBJECT_SEGMENT, RENDER_SEGMENT);
    }

    // Set (or overwrite) transform params. Existing params like `token` survive
    // because we only touch these three specific keys.
    parsed.searchParams.set('width', String(safeWidth));
    parsed.searchParams.set('quality', String(safeQuality));
    parsed.searchParams.set('resize', 'cover');

    return parsed.toString();
  } catch {
    // Malformed URL — return original to avoid blank images.
    return url;
  }
}

// ─── srcSet builder ───────────────────────────────────────────────────────────

/**
 * Build a responsive `srcSet` string for a Supabase Storage image.
 *
 * Returns `undefined` for non-Supabase / falsy URLs so the `<img>` falls back
 * to `src` alone (correct HTML behaviour — omitted srcSet means single source).
 *
 * Internally parses the URL **once** and mutates search params per breakpoint,
 * avoiding 4× redundant `new URL()` calls per invocation.
 */
export function supabaseImageSrcSet(url: string | null | undefined): string | undefined {
  if (!url) return undefined;

  const isObject = url.includes(OBJECT_SEGMENT);
  const isRender = url.includes(RENDER_SEGMENT);

  if (!isObject && !isRender) return undefined;

  try {
    const parsed = new URL(url);

    // Normalise to render path once.
    if (isObject) {
      parsed.pathname = parsed.pathname.replace(OBJECT_SEGMENT, RENDER_SEGMENT);
    }

    parsed.searchParams.set('resize', 'cover');

    const parts: string[] = [];

    for (const { w, q } of SRCSET_WIDTHS) {
      parsed.searchParams.set('width', String(w));
      parsed.searchParams.set('quality', String(q));
      parts.push(`${parsed.toString()} ${w}w`);
    }

    return parts.join(', ');
  } catch {
    return undefined;
  }
}

// ─── Component-level helpers ──────────────────────────────────────────────────

/**
 * Returns all `<img>` props needed for a MenuItemCard image.
 *
 * Centralises the above-fold / below-fold split so card components don't
 * duplicate the priority logic.
 *
 * @param url       Raw image URL from the menu item.
 * @param options   `{ isAboveFold, alt }` — index ≤ 1 should set isAboveFold.
 *
 * @example
 * ```tsx
 * const imgProps = getMenuCardImageProps(item.image_url, {
 *   isAboveFold: index <= 1,
 *   alt: item.name,
 * });
 * // <img {...imgProps} onLoad={...} onError={...} />
 * ```
 */
export function getMenuCardImageProps(
  url: string | null | undefined,
  options: { isAboveFold: boolean; alt: string },
): {
  src: string;
  srcSet: string | undefined;
  sizes: string;
  width: number;
  height: number;
  loading: 'eager' | 'lazy';
  fetchPriority: 'high' | 'auto';
  decoding: 'async';
  referrerPolicy: 'no-referrer';
} {
  const { isAboveFold, alt: _alt } = options;

  const primaryWidth = isAboveFold ? 640 : 480;
  const primaryQuality = isAboveFold ? 74 : 72;

  return {
    src: supabaseImageUrl(url, primaryWidth, primaryQuality),
    srcSet: supabaseImageSrcSet(url),
    sizes: CARD_SIZES,
    width: 400,
    height: 300,
    loading: isAboveFold ? 'eager' : 'lazy',
    fetchPriority: isAboveFold ? 'high' : 'auto',
    decoding: 'async',
    referrerPolicy: 'no-referrer',
  };
}

/**
 * Returns `<img>` props for the MenuItemModal hero image.
 *
 * Always eager/high because the user intentionally opened the modal.
 * Uses a wider transform (960px) at higher quality (78) since the modal
 * hero is the primary conversion visual.
 */
export function getModalImageProps(
  url: string | null | undefined,
  name: string,
): {
  src: string;
  srcSet: string | undefined;
  sizes: string;
  width: number;
  height: number;
  alt: string;
  loading: 'eager';
  fetchPriority: 'high';
  decoding: 'async';
  referrerPolicy: 'no-referrer';
} {
  return {
    src: supabaseImageUrl(url, 960, 78),
    srcSet: supabaseImageSrcSet(url),
    sizes: MODAL_SIZES,
    width: 800,
    height: 450,
    alt: name,
    loading: 'eager',
    fetchPriority: 'high',
    decoding: 'async',
    referrerPolicy: 'no-referrer',
  };
}

// ─── LCP preload helper ──────────────────────────────────────────────────────

/**
 * Build `<link rel="preload">` attributes for the LCP menu card image.
 *
 * Call this in MenuPage after data loads to inject a preload tag for the
 * first visible card image. Returns `null` if the URL is falsy or not
 * a Supabase Storage URL (preloading a non-transformed image would be
 * counterproductive).
 *
 * @example
 * ```ts
 * const preload = getLcpPreloadAttrs(firstItem.image_url);
 * if (preload) {
 *   const link = document.createElement('link');
 *   Object.entries(preload).forEach(([k, v]) => link.setAttribute(k, v));
 *   document.head.appendChild(link);
 * }
 * ```
 */
export function getLcpPreloadAttrs(
  url: string | null | undefined,
): Record<string, string> | null {
  if (!url || !isSupabaseStorageUrl(url)) return null;

  const src = supabaseImageUrl(url, 640, 74);
  const srcSet = supabaseImageSrcSet(url);

  const attrs: Record<string, string> = {
    rel: 'preload',
    as: 'image',
    href: src,
    fetchpriority: 'high',
  };

  if (srcSet) {
    attrs.imagesrcset = srcSet;
    attrs.imagesizes = CARD_SIZES;
  }

  return attrs;
}