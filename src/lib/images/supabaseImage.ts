// src/lib/images/supabaseImage.ts
// =============================================================================
// Supabase Storage image helpers
// =============================================================================
// Converts public object URLs into Supabase render/image transformation URLs.
// Non-Supabase URLs pass through safely.
// =============================================================================

export function supabaseImageUrl(url: string | null | undefined, width: number, quality = 72): string {
  if (!url) return '';

  try {
    const parsed = new URL(url);

    if (!parsed.pathname.includes('/storage/v1/object/')) {
      return url;
    }

    parsed.pathname = parsed.pathname.replace(
      '/storage/v1/object/',
      '/storage/v1/render/image/',
    );

    parsed.searchParams.set('width', String(width));
    parsed.searchParams.set('quality', String(quality));

    return parsed.toString();
  } catch {
    return url;
  }
}

export function supabaseImageSrcSet(url: string | null | undefined): string | undefined {
  if (!url) return undefined;

  try {
    const parsed = new URL(url);

    if (!parsed.pathname.includes('/storage/v1/object/')) {
      return undefined;
    }

    return [
      `${supabaseImageUrl(url, 320, 68)} 320w`,
      `${supabaseImageUrl(url, 480, 72)} 480w`,
      `${supabaseImageUrl(url, 640, 74)} 640w`,
      `${supabaseImageUrl(url, 800, 74)} 800w`,
    ].join(', ');
  } catch {
    return undefined;
  }
}