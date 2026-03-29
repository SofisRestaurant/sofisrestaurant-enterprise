// src/lib/supabase/storage/uploadImage.ts
// =============================================================================
// Sofi's Restaurant — Supabase image upload utility with auto-compression
// =============================================================================
//
// Pipeline:
//   1. Validate MIME type + file size
//   2. AUTO-COMPRESS via browser Canvas API (no external dependencies):
//      - Max dimension: 1200px (longest side, aspect ratio preserved)
//      - Quality: 0.82 (sharp for food photos)
//      - Output: WebP (best compression/quality in 2026)
//      - SVG and GIF skipped (canvas can't handle them cleanly)
//      - Falls back to original file if compression fails for any reason
//   3. Upload compressed Blob to Supabase Storage
//   4. Return public URL + compression stats
//
// Result: a 3MB phone photo becomes ~150-300KB WebP automatically.
// No npm packages needed — uses only the browser's built-in Canvas API.
//
// =============================================================================

import { supabase } from '@/lib/supabase/supabaseClient';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

const COMPRESSION = {
  MAX_DIMENSION: 1200,
  QUALITY: 0.82,
  OUTPUT_MIME: 'image/webp' as const,
  OUTPUT_EXT: '.webp',
} as const;

const SKIP_COMPRESSION_TYPES = new Set(['image/svg+xml', 'image/gif']);

export const IMAGE_BUCKETS = {
  HERO:    'hero-images',
  MENU:    'menu-images',
  GALLERY: 'gallery-images',
  BANNERS: 'banner-images',
} as const satisfies Record<string, string>;

export type ImageBucket = (typeof IMAGE_BUCKETS)[keyof typeof IMAGE_BUCKETS] | (string & {});

export const IMAGE_MIME_TYPES = {
  'image/avif':    '.avif',
  'image/webp':    '.webp',
  'image/jpeg':    '.jpeg',
  'image/jpg':     '.jpg',
  'image/png':     '.png',
  'image/svg+xml': '.svg',
  'image/gif':     '.gif',
  // iPhone/iOS formats — converted to WebP via canvas before upload
  'image/heic':    '.heic',
  'image/heif':    '.heif',
} as const satisfies Record<string, string>;

export type ImageMimeType = keyof typeof IMAGE_MIME_TYPES;
const ALLOWED_MIME_SET = new Set<string>(Object.keys(IMAGE_MIME_TYPES));

// ── Helpers ───────────────────────────────────────────────────────────────────

function inferMimeFromExtension(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  const map: Record<string, string> = {
    avif: 'image/avif', webp: 'image/webp', jpeg: 'image/jpeg',
    jpg: 'image/jpeg', png: 'image/png', svg: 'image/svg+xml', gif: 'image/gif',
    heic: 'image/heic', heif: 'image/heif',
  };
  return map[ext] ?? null;
}

function sanitisePath(raw: string): string {
  const trimmed = raw.trim().replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
  if (!trimmed) throw new Error('Storage path must not be empty.');
  if (trimmed.split('/').some((s) => s === '..'))
    throw new Error(`Storage path must not contain "..": "${trimmed}"`);
  return trimmed;
}

function toWebpPath(path: string): string {
  const lastDot = path.lastIndexOf('.');
  const lastSlash = path.lastIndexOf('/');
  if (lastDot > lastSlash) return path.slice(0, lastDot) + COMPRESSION.OUTPUT_EXT;
  return path + COMPRESSION.OUTPUT_EXT;
}

// ── Compression ───────────────────────────────────────────────────────────────

export type CompressionResult = {
  blob: Blob;
  path: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  wasCompressed: boolean;
};

/**
 * Load an image file via an HTMLImageElement (works for HEIC on Safari,
 * unlike createImageBitmap which doesn't support HEIC).
 */
function loadImageElement(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode image'));
    };
    img.src = url;
  });
}

export async function compressImage(
  file: File | Blob,
  storagePath: string,
  contentType: string,
): Promise<CompressionResult> {
  const originalSize = file.size;

  if (SKIP_COMPRESSION_TYPES.has(contentType)) {
    return { blob: file, path: storagePath, originalSizeBytes: originalSize, compressedSizeBytes: originalSize, wasCompressed: false };
  }

  const requiresConversion = contentType === 'image/heic' || contentType === 'image/heif';

  try {
    // Use HTMLImageElement instead of createImageBitmap — works for HEIC on Safari
    const img = await loadImageElement(file);
    const origW = img.naturalWidth;
    const origH = img.naturalHeight;

    if (origW === 0 || origH === 0) throw new Error('Image has zero dimensions');

    const maxDim = COMPRESSION.MAX_DIMENSION;
    let targetW = origW;
    let targetH = origH;

    if (origW > maxDim || origH > maxDim) {
      if (origW >= origH) {
        targetW = maxDim;
        targetH = Math.round((origH / origW) * maxDim);
      } else {
        targetH = maxDim;
        targetW = Math.round((origW / origH) * maxDim);
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    ctx.drawImage(img, 0, 0, targetW, targetH);

    const compressed = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, COMPRESSION.OUTPUT_MIME, COMPRESSION.QUALITY),
    );

    if (!compressed || compressed.size === 0) throw new Error('Canvas produced empty blob');

    const finalBlob = compressed.size < originalSize ? compressed : file;
    const wasCompressed = finalBlob === compressed;

    return {
      blob: finalBlob,
      path: toWebpPath(storagePath), // always use .webp path when we ran through canvas
      originalSizeBytes: originalSize,
      compressedSizeBytes: finalBlob.size,
      wasCompressed: wasCompressed || requiresConversion, // HEIC→WebP counts as compressed
    };
  } catch (err) {
    if (requiresConversion) {
      // Re-throw with a clear message — raw HEIC can't be uploaded to Supabase
      const msg = err instanceof Error ? err.message : 'Unknown error';
      throw new Error(
        `Could not process iPhone photo (${msg}). ` +
        'On iPhone: go to Settings → Camera → Formats → Most Compatible to shoot in JPEG instead.',
      );
    }
    // For other formats, fall back to original
    return { blob: file, path: storagePath, originalSizeBytes: originalSize, compressedSizeBytes: originalSize, wasCompressed: false };
  }
}

// ── Result types ──────────────────────────────────────────────────────────────

export type UploadImageSuccess = {
  ok: true;
  url: string;
  path: string;
  bucket: string;
  compression: {
    originalSizeBytes: number;
    compressedSizeBytes: number;
    wasCompressed: boolean;
    savingPercent: number;
  };
};

export type UploadImageFailure = {
  ok: false;
  error: string;
  cause?: unknown;
};

export type UploadImageResult = UploadImageSuccess | UploadImageFailure;

export interface UploadImageOptions {
  bucket: ImageBucket;
  path: string;
  upsert?: boolean;
  cacheControl?: string;
  useSignedUrl?: boolean;
  signedUrlExpiresInSeconds?: number;
  signal?: AbortSignal;
  /** Set false to skip compression (e.g. already-optimised WebP) */
  compress?: boolean;
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function uploadImage(
  file: File | Blob | ArrayBuffer,
  options: UploadImageOptions,
): Promise<UploadImageResult> {
  const {
    bucket, path: rawPath, upsert = true,
    cacheControl = 'public, max-age=31536000, immutable',
    useSignedUrl = false, signedUrlExpiresInSeconds = 3600,
    signal, compress = true,
  } = options;

  if (!bucket || typeof bucket !== 'string' || !bucket.trim())
    return { ok: false, error: 'Bucket name must be a non-empty string.' };

  let cleanPath: string;
  try {
    cleanPath = sanitisePath(rawPath);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid storage path.', cause: err };
  }

  let contentType: string;
  if (file instanceof File && file.type) {
    contentType = file.type;
  } else {
    const inferred = inferMimeFromExtension(cleanPath);
    if (!inferred) return { ok: false, error: `Cannot determine image type from path "${cleanPath}".` };
    contentType = inferred;
  }

  if (!ALLOWED_MIME_SET.has(contentType))
    return { ok: false, error: `Unsupported image type "${contentType}".` };

  const fileSize = file instanceof File || file instanceof Blob ? file.size : (file as ArrayBuffer).byteLength;

  if (fileSize > MAX_FILE_SIZE_BYTES)
    return { ok: false, error: `File too large (${(fileSize / 1024 / 1024).toFixed(1)} MB). Max: ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB.` };

  if (fileSize === 0) return { ok: false, error: 'File is empty (0 bytes).' };
  if (signal?.aborted) return { ok: false, error: 'Upload was cancelled before it started.' };

  // ── COMPRESSION ────────────────────────────────────────────────────────────
  let uploadBlob: Blob | File | ArrayBuffer = file;
  let finalPath = cleanPath;
  let compressionStats = { originalSizeBytes: fileSize, compressedSizeBytes: fileSize, wasCompressed: false, savingPercent: 0 };

  if (compress && (file instanceof File || file instanceof Blob)) {
    const result = await compressImage(file, cleanPath, contentType);
    uploadBlob = result.blob;
    finalPath = result.path;
    if (result.wasCompressed) contentType = COMPRESSION.OUTPUT_MIME;
    compressionStats = {
      originalSizeBytes: result.originalSizeBytes,
      compressedSizeBytes: result.compressedSizeBytes,
      wasCompressed: result.wasCompressed,
      savingPercent: result.wasCompressed
        ? Math.round((1 - result.compressedSizeBytes / result.originalSizeBytes) * 100)
        : 0,
    };
  }

  // ── UPLOAD ─────────────────────────────────────────────────────────────────
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(finalPath, uploadBlob, { contentType, cacheControl, upsert });

  if (uploadError) {
    const message = uploadError.message ?? 'Upload failed.';
    const isConflict = message.toLowerCase().includes('already exists') ||
      ('statusCode' in uploadError && (uploadError as { statusCode?: string }).statusCode === '409');
    return {
      ok: false,
      error: isConflict ? `A file already exists at "${finalPath}". Set upsert: true to overwrite.` : `Upload failed: ${message}`,
      cause: uploadError,
    };
  }

  // ── GET URL ────────────────────────────────────────────────────────────────
  if (useSignedUrl) {
    const { data: signedData, error: signedError } = await supabase.storage
      .from(bucket).createSignedUrl(finalPath, signedUrlExpiresInSeconds);
    if (signedError || !signedData?.signedUrl)
      return { ok: false, error: `Uploaded but signed URL failed: ${signedError?.message ?? 'Unknown error'}.`, cause: signedError };
    return { ok: true, url: signedData.signedUrl, path: finalPath, bucket, compression: compressionStats };
  }

  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(finalPath);
  if (!publicData?.publicUrl)
    return { ok: false, error: 'Uploaded but public URL could not be retrieved. Check the bucket is public.' };

  return { ok: true, url: publicData.publicUrl, path: finalPath, bucket, compression: compressionStats };
}

// ── Convenience wrappers ──────────────────────────────────────────────────────

export function uploadHeroImage(file: File | Blob | ArrayBuffer, path: string, options?: Omit<UploadImageOptions, 'bucket' | 'path'>): Promise<UploadImageResult> {
  return uploadImage(file, { ...options, bucket: IMAGE_BUCKETS.HERO, path });
}

export function uploadMenuImage(file: File | Blob | ArrayBuffer, path: string, options?: Omit<UploadImageOptions, 'bucket' | 'path'>): Promise<UploadImageResult> {
  return uploadImage(file, { ...options, bucket: IMAGE_BUCKETS.MENU, path });
}

export function uploadGalleryImage(file: File | Blob | ArrayBuffer, path: string, options?: Omit<UploadImageOptions, 'bucket' | 'path'>): Promise<UploadImageResult> {
  return uploadImage(file, { ...options, bucket: IMAGE_BUCKETS.GALLERY, path });
}

export function uploadBannerImage(file: File | Blob | ArrayBuffer, path: string, options?: Omit<UploadImageOptions, 'bucket' | 'path'>): Promise<UploadImageResult> {
  return uploadImage(file, { ...options, bucket: IMAGE_BUCKETS.BANNERS, path });
}