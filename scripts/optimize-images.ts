// scripts/optimize-images.ts
// =============================================================================
// SOFIS — Image optimization pipeline
// =============================================================================
//
// Reads original images from src/assets/images/original/
// Outputs jpeg + webp + avif variants to src/assets/images/optimized/
//
// Usage:
//   npm run optimize-images
//
// Add to package.json scripts:
//   "optimize-images": "npx tsx scripts/optimize-images.ts"
//
// Requirements:
//   npm install -D sharp tsx
//   (sharp should already be present if you ran npm install)
//
// Output per source file (e.g. hero1.jpg):
//   optimized/hero1.jpeg   → high-quality JPEG (universal fallback)
//   optimized/hero1.webp   → WebP (good compression, all modern browsers)
//   optimized/hero1.avif   → AVIF (best compression, newer browsers)
//
// After running, update src/assets/images.ts if you added/renamed any files.
// width/height values in images.ts should reflect targetWidth and actual
// aspect ratios of the originals.
// =============================================================================

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

// ── Configuration ─────────────────────────────────────────────────────────────

const INPUT_DIR  = path.resolve('src/assets/images/original');
const OUTPUT_DIR = path.resolve('src/assets/images/optimized');

/** Maximum width for optimized output. Height scales proportionally. */
const TARGET_WIDTH = 1600;

interface FormatConfig {
  ext: 'jpeg' | 'webp' | 'avif';
  options: sharp.JpegOptions | sharp.WebpOptions | sharp.AvifOptions;
  description: string;
}

const FORMATS: readonly FormatConfig[] = [
  {
    ext: 'jpeg',
    options: { quality: 90, progressive: true, mozjpeg: true } satisfies sharp.JpegOptions,
    description: 'JPEG (universal fallback, progressive)',
  },
  {
    ext: 'webp',
    options: { quality: 85, effort: 4 } satisfies sharp.WebpOptions,
    description: 'WebP (modern browsers)',
  },
  {
    ext: 'avif',
    options: { quality: 60, effort: 4, chromaSubsampling: '4:2:0' } satisfies sharp.AvifOptions,
    description: 'AVIF (best compression, newest browsers)',
  },
] as const;

/** Source file extensions to process. */
const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif']);

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function processImage(inputPath: string, baseName: string): Promise<void> {
  const inputStats = fs.statSync(inputPath);
  console.log(`\n📷  ${baseName} (${formatBytes(inputStats.size)})`);

  const image = sharp(inputPath);
  const metadata = await image.metadata();

  const originalWidth  = metadata.width  ?? TARGET_WIDTH;
  const originalHeight = metadata.height ?? TARGET_WIDTH;
  const aspectRatio    = originalHeight / originalWidth;

  // Only downscale — never upscale a source image
  const outputWidth  = Math.min(TARGET_WIDTH, originalWidth);
  const outputHeight = Math.round(outputWidth * aspectRatio);

  console.log(
    `   Source: ${originalWidth}×${originalHeight}px → Output: ${outputWidth}×${outputHeight}px`,
  );

  // Process all formats for this image, sequentially to avoid
  // sharp memory spikes when processing many large files at once.
  for (const format of FORMATS) {
    const outputPath = path.join(OUTPUT_DIR, `${baseName}.${format.ext}`);

    try {
      const result = await sharp(inputPath)
        .resize({ width: outputWidth, withoutEnlargement: true })
        .toFormat(format.ext, format.options)
        .toFile(outputPath);

      const savings = ((1 - result.size / inputStats.size) * 100).toFixed(1);
      console.log(
        `   ✅ ${format.ext.toUpperCase().padEnd(5)} ${formatBytes(result.size).padStart(9)}` +
        `  (${savings}% smaller)  →  ${path.basename(outputPath)}`,
      );
    } catch (err) {
      console.error(
        `   ❌ ${format.ext.toUpperCase()} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Don't throw — continue processing other formats and images
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🔧  Sofi\'s Image Optimizer');
  console.log(`   Input:  ${INPUT_DIR}`);
  console.log(`   Output: ${OUTPUT_DIR}`);
  console.log(`   Width:  ${TARGET_WIDTH}px (downscale only)\n`);

  // Validate input directory
  if (!fs.existsSync(INPUT_DIR)) {
    console.error(`❌  Input directory not found: ${INPUT_DIR}`);
    console.error(`    Create it and add your source images, then re-run.`);
    process.exit(1);
  }

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Collect source images
  const allFiles = fs.readdirSync(INPUT_DIR);
  const imageFiles = allFiles.filter((file) => {
    const ext = path.extname(file).toLowerCase();
    return SUPPORTED_EXTENSIONS.has(ext);
  });

  if (imageFiles.length === 0) {
    console.warn(`⚠️   No supported image files found in ${INPUT_DIR}`);
    console.warn(`    Supported formats: ${[...SUPPORTED_EXTENSIONS].join(', ')}`);
    process.exit(0);
  }

  console.log(`Found ${imageFiles.length} source image(s) to process.`);

  // Process each image
  let successCount = 0;
  for (const file of imageFiles) {
    const inputPath = path.join(INPUT_DIR, file);
    const baseName  = path.parse(file).name;
    try {
      await processImage(inputPath, baseName);
      successCount++;
    } catch (err) {
      console.error(
        `❌  Failed to process ${file}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log(
    `\n✨  Done — ${successCount}/${imageFiles.length} images processed,` +
    ` ${imageFiles.length * FORMATS.length} total files written to ${OUTPUT_DIR}`,
  );

  console.log(
    `\n📝  Next: verify width/height values in src/assets/images.ts match the output dimensions above.`,
  );
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});