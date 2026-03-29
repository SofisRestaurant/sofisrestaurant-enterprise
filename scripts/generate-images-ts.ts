// scripts/generate-images-ts.ts
// =============================================================================
// SOFIS — Image manifest generator + Supabase uploader
// =============================================================================
//
// Reads optimized images from src/assets/images/optimized/{category}/
// extracts real width/height from file metadata via sharp,
// and writes a fully typed src/assets/images.ts.
//
// Optionally uploads to Supabase Storage and writes CDN URLs instead of
// local import paths — enabling global delivery via Supabase + Cloudflare.
//
// ── Modes ──────────────────────────────────────────────────────────────────
//
//   npm run generate-images-ts
//     Local mode: writes Vite import paths (default — for local dev)
//
//   npm run generate-images-ts -- --cdn
//     CDN mode: writes Supabase public storage URLs, no Vite import
//
//   npm run generate-images-ts -- --upload
//     Upload + CDN: uploads every optimized image to its Supabase bucket,
//     then writes CDN URLs (implies --cdn)
//     Requires: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
//
//   npm run generate-images-ts -- --upload --bucket-prefix sofis
//     Uses sofis-hero-images, sofis-menu-images etc. as bucket names
//
//   npm run generate-images-ts -- --dry-run
//     Preview output without writing files or uploading anything
//
// ── package.json ───────────────────────────────────────────────────────────
//
//   "generate-images-ts": "npx tsx scripts/generate-images-ts.ts",
//   "sync-images": "npm run optimize-images && npm run generate-images-ts -- --upload"
//
// ── Required .env vars for --upload ────────────────────────────────────────
//
//   VITE_SUPABASE_URL          your project URL
//   SUPABASE_SERVICE_ROLE_KEY  from Supabase dashboard → Settings → API
//                              NEVER use the anon key for server-side uploads
//
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// ── CLI flags ─────────────────────────────────────────────────────────────────

const ARGS          = process.argv.slice(2);
const DO_UPLOAD     = ARGS.includes('--upload');
const USE_CDN       = DO_UPLOAD || ARGS.includes('--cdn');
const DRY_RUN       = ARGS.includes('--dry-run');
const VERBOSE       = ARGS.includes('--verbose');
const BUCKET_PREFIX = (() => {
  const idx = ARGS.indexOf('--bucket-prefix');
  return idx !== -1 && ARGS[idx + 1] ? `${ARGS[idx + 1]}-` : '';
})();

// ── Paths ─────────────────────────────────────────────────────────────────────

const OPTIMIZED_ROOT = path.resolve('src/assets/images/optimized');
const OUTPUT_FILE    = path.resolve('src/assets/images.ts');

// ── Supabase config ───────────────────────────────────────────────────────────

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  '';

// Service role key is required for storage uploads — never the anon key.
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

// ── Category config ───────────────────────────────────────────────────────────

interface CategoryConfig {
  folder:     string;
  exportName: string;
  bucket:     string; // base bucket name — BUCKET_PREFIX is prepended at runtime
}

const CATEGORIES: readonly CategoryConfig[] = [
  { folder: 'hero',    exportName: 'HERO_IMAGES',    bucket: 'hero-images'    },
  { folder: 'menu',    exportName: 'MENU_IMAGES',    bucket: 'menu-images'    },
  { folder: 'gallery', exportName: 'GALLERY_IMAGES', bucket: 'gallery-images' },
  { folder: 'banners', exportName: 'BANNER_IMAGES',  bucket: 'banner-images'  },
] as const;

function getBucket(cfg: CategoryConfig): string {
  return `${BUCKET_PREFIX}${cfg.bucket}`;
}

// ── Format config ─────────────────────────────────────────────────────────────

const FORMATS = ['avif', 'webp', 'jpeg'] as const;
type ImageFormat = (typeof FORMATS)[number];

const MIME: Record<ImageFormat, string> = {
  avif: 'image/avif',
  webp: 'image/webp',
  jpeg: 'image/jpeg',
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface FormatPaths {
  localPath: string; // relative import path for Vite
  cdnUrl:    string; // Supabase CDN URL
}

interface ImageEntry {
  baseName:   string;
  identifier: string;
  formats:    Partial<Record<ImageFormat, FormatPaths>>;
  width:      number;
  height:     number;
}

interface CategoryResult {
  config:   CategoryConfig;
  entries:  ImageEntry[];
  skipped:  string[];
  uploaded: number;
  failed:   number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function camelCase(s: string): string {
  return s
    .replace(/[-_](.)/g, (_: string, c: string) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9$_]/g, '');
}

function isValidIdentifier(s: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(s);
}

function localImportPath(folder: string, base: string, fmt: ImageFormat): string {
  return `./images/optimized/${folder}/${base}.${fmt}`;
}

function buildCdnUrl(cfg: CategoryConfig, base: string, fmt: ImageFormat): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${getBucket(cfg)}/${base}.${fmt}`;
}

async function extractDimensions(dir: string, base: string): Promise<{ width: number; height: number }> {
  // Try JPEG first — most reliable for sharp metadata extraction.
  // AVIF may report 0×0 in some sharp versions.
  for (const ext of ['jpeg', 'jpg', 'webp', 'avif'] as const) {
    const p = path.join(dir, `${base}.${ext}`);
    if (!fs.existsSync(p)) continue;
    try {
      const meta = await sharp(p).metadata();
      if (meta.width && meta.height) return { width: meta.width, height: meta.height };
    } catch { /* try next */ }
  }
  return { width: 0, height: 0 };
}

function log(...args: unknown[]) {
  if (VERBOSE) console.log(...args);
}

// ── Supabase upload ───────────────────────────────────────────────────────────

async function uploadFile(
  localAbsPath: string,
  bucket: string,
  objectName: string,
  mimeType: string,
): Promise<boolean> {
  const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${objectName}`;
  try {
    const body = fs.readFileSync(localAbsPath);
    const res  = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization:   `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type':  mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'x-upsert':      'true',  // overwrite on re-runs — safe
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`    ❌ ${res.status} uploading ${objectName}: ${text.slice(0, 100)}`);
      return false;
    }
    log(`    ↑  ${bucket}/${objectName}`);
    return true;
  } catch (err) {
    console.error(`    ❌ Network error uploading ${objectName}: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// ── Category processing ───────────────────────────────────────────────────────

async function processCategory(config: CategoryConfig): Promise<CategoryResult> {
  const dir    = path.join(OPTIMIZED_ROOT, config.folder);
  const result: CategoryResult = { config, entries: [], skipped: [], uploaded: 0, failed: 0 };

  if (!fs.existsSync(dir)) {
    log(`  ⏭  ${config.folder}/ not found`);
    return result;
  }

  // Group files by base name
  const groups = new Map<string, Set<ImageFormat>>();
  for (const file of fs.readdirSync(dir)) {
    const p   = path.parse(file);
    const ext = p.ext.toLowerCase().slice(1) as ImageFormat;
    if (!FORMATS.includes(ext)) continue;
    if (!groups.has(p.name)) groups.set(p.name, new Set());
    groups.get(p.name)!.add(ext);
  }

  // Process in sorted order — deterministic output
  for (const base of Array.from(groups.keys()).sort()) {
    const identifier = camelCase(base);
    if (!isValidIdentifier(identifier)) {
      result.skipped.push(`"${base}" skipped — invalid JS identifier "${identifier}"`);
      continue;
    }

    const { width, height } = await extractDimensions(dir, base);
    const fmtSet = groups.get(base)!;
    const formats: ImageEntry['formats'] = {};

    for (const fmt of FORMATS) {
      if (!fmtSet.has(fmt)) continue;
      formats[fmt] = {
        localPath: localImportPath(config.folder, base, fmt),
        cdnUrl:    buildCdnUrl(config, base, fmt),
      };
    }

    result.entries.push({ baseName: base, identifier, formats, width, height });
  }

  // Upload to Supabase (--upload only, not dry-run)
  if (DO_UPLOAD && !DRY_RUN) {
    const bucket = getBucket(config);
    for (const entry of result.entries) {
      for (const fmt of FORMATS) {
        if (!entry.formats[fmt]) continue;
        const localAbs   = path.join(dir, `${entry.baseName}.${fmt}`);
        const objectName = `${entry.baseName}.${fmt}`;
        const ok = await uploadFile(localAbs, bucket, objectName, MIME[fmt]);
        if (ok) result.uploaded++; else result.failed++;
      }
    }
  }

  return result;
}

// ── Code generation ───────────────────────────────────────────────────────────

function renderFormatValue(entry: ImageEntry, fmt: ImageFormat): string {
  const data = entry.formats[fmt];
  if (!data) {
    // Format not generated — fall back to JPEG so the field is never undefined
    const jpegData = entry.formats['jpeg'];
    return jpegData
      ? (USE_CDN ? `'${jpegData.cdnUrl}'` : `${entry.identifier}Jpeg`)
      : "''";
  }
  return USE_CDN
    ? `'${data.cdnUrl}'`
    : `${entry.identifier}${fmt[0].toUpperCase()}${fmt.slice(1)}`;
}

function generateOutput(results: CategoryResult[]): string {
  const active = results.filter((r) => r.entries.length > 0);
  const empty  = results.filter((r) => r.entries.length === 0);
  const lines: string[] = [];

  // Header
  lines.push(
    `// src/assets/images.ts`,
    `// ============================================================================`,
    `// AUTO-GENERATED — do not edit manually.`,
    `// Regenerate: npm run generate-images-ts`,
    `// Generated:  ${new Date().toISOString()}`,
    `// Mode:       ${USE_CDN ? `CDN — ${SUPABASE_URL || '(no URL set)'}` : 'Local Vite imports'}`,
    `// ============================================================================`,
    ``,
  );

  // Type definition
  lines.push(
    `// ── Type ─────────────────────────────────────────────────────────────────────`,
    ``,
    `/**`,
    ` * Multi-format image asset with intrinsic dimensions.`,
    ` * Use with <picture> for automatic browser format negotiation:`,
    ` *`,
    ` *   <picture>`,
    ` *     <source srcSet={img.avif} type="image/avif" />`,
    ` *     <source srcSet={img.webp} type="image/webp" />`,
    ` *     <img src={img.jpeg} width={img.width} height={img.height} alt="…" />`,
    ` *   </picture>`,
    ` */`,
    `export interface ImageAsset {`,
    `  readonly avif:   string;  // AVIF  — best compression  (Chrome 85+, FF 93+, Safari 16+)`,
    `  readonly webp:   string;  // WebP  — all modern browsers`,
    `  readonly jpeg:   string;  // JPEG  — universal fallback`,
    `  readonly width:  number;  // intrinsic width  (px) — prevents layout shift`,
    `  readonly height: number;  // intrinsic height (px) — prevents layout shift`,
    `}`,
    ``,
  );

  // Vite import declarations (local mode only)
  if (!USE_CDN && active.length > 0) {
    lines.push(
      `// ── Vite asset imports ───────────────────────────────────────────────────────`,
      `// Vite resolves these to content-hashed URLs at build time.`,
      ``,
    );
    for (const result of active) {
      lines.push(`// ${result.config.folder}/`);
      for (const entry of result.entries) {
        for (const fmt of FORMATS) {
          const data = entry.formats[fmt];
          if (!data) continue;
          const name = `${entry.identifier}${fmt[0].toUpperCase()}${fmt.slice(1)}`;
          lines.push(`import ${name} from '${data.localPath}';`);
        }
      }
      lines.push(``);
    }
  }

  // Category blocks
  for (const result of active) {
    const { config, entries } = result;
    const cap = config.folder[0].toUpperCase() + config.folder.slice(1);
    lines.push(
      `// ── ${cap} ─────────────────────────────────────────────────────────────────────`,
      ``,
    );

    for (const entry of entries) {
      const dim = entry.width > 0
        ? `// ${entry.baseName} — ${entry.width}×${entry.height}px`
        : `// ${entry.baseName}`;
      lines.push(dim);
      lines.push(`const ${entry.identifier}: ImageAsset = {`);
      for (const fmt of FORMATS) {
        const val = renderFormatValue(entry, fmt);
        const note = !entry.formats[fmt] ? '  // fallback — format not generated' : '';
        lines.push(`  ${fmt}:   ${val},${note}`);
      }
      lines.push(`  width:  ${entry.width},`);
      lines.push(`  height: ${entry.height},`);
      lines.push(`};`);
      lines.push(``);
    }

    lines.push(
      `/** ${config.folder} images — \`import { ${config.exportName} } from '@/assets/images'\` */`,
      `export const ${config.exportName} = {`,
    );
    for (const entry of entries) {
      lines.push(`  ${entry.identifier},`);
    }
    lines.push(`} as const satisfies Record<string, ImageAsset>;`);
    lines.push(``);
  }

  // Empty stubs
  if (empty.length > 0) {
    lines.push(
      `// ── Empty stubs ──────────────────────────────────────────────────────────────`,
      `// No images found yet — add files to optimized/{folder}/ and re-run.`,
      ``,
    );
    for (const result of empty) {
      lines.push(
        `export const ${result.config.exportName}: Record<string, ImageAsset> = {};`,
      );
    }
    lines.push(``);
  }

  // Flat access map
  lines.push(
    `// ── IMAGES map ───────────────────────────────────────────────────────────────`,
    `// \`import { IMAGES } from '@/assets/images'\` then \`IMAGES.hero.hero1.webp\``,
    ``,
    `export const IMAGES = {`,
  );
  for (const result of results) {
    lines.push(`  ${result.config.folder}: ${result.config.exportName},`);
  }
  lines.push(`} as const;`);
  lines.push(``);

  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n🖼  Sofi's Image Manifest Generator`);
  console.log(`   Optimized: ${OPTIMIZED_ROOT}`);
  console.log(`   Output:    ${OUTPUT_FILE}`);
  console.log(`   Mode:      ${
    DRY_RUN   ? 'Dry run (no writes)' :
    DO_UPLOAD ? 'Upload to Supabase + CDN URLs' :
    USE_CDN   ? 'CDN URLs (no upload)' :
                'Local Vite imports'
  }`);

  // Validate env for upload
  if (DO_UPLOAD) {
    if (!SUPABASE_URL) {
      console.error('\n❌  VITE_SUPABASE_URL (or SUPABASE_URL) is not set.');
      console.error('    Add it to .env and re-run.');
      process.exit(1);
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      console.error('\n❌  SUPABASE_SERVICE_ROLE_KEY is not set.');
      console.error('    Find it: Supabase dashboard → Settings → API → service_role key');
      console.error('    Never use the anon key for uploads — it lacks INSERT permissions.');
      process.exit(1);
    }
    if (BUCKET_PREFIX) console.log(`   Prefix:    ${BUCKET_PREFIX}`);
    console.log(`   Supabase:  ${SUPABASE_URL}`);
  }

  if (!fs.existsSync(OPTIMIZED_ROOT)) {
    console.error(`\n❌  Not found: ${OPTIMIZED_ROOT}`);
    console.error(`    Run \`npm run optimize-images\` first.`);
    process.exit(1);
  }

  // Process all categories (parallel — no sequential bottleneck)
  const results = await Promise.all(CATEGORIES.map(processCategory));

  // Print summary
  let totalImages = 0, totalUploaded = 0, totalFailed = 0;

  for (const r of results) {
    if (!r.entries.length && !r.skipped.length) continue;
    const bucketLabel = DO_UPLOAD ? ` → ${getBucket(r.config)}` : '';
    console.log(`\n  ${r.config.folder}/${bucketLabel}  →  ${r.config.exportName}`);
    for (const entry of r.entries) {
      const fmts = FORMATS.filter((f) => entry.formats[f]).join(' + ');
      const dim  = entry.width > 0 ? ` [${entry.width}×${entry.height}px]` : ' [dims N/A]';
      console.log(`    ✅ ${entry.baseName}${dim}  (${fmts})`);
      totalImages++;
    }
    for (const s of r.skipped) console.log(`    ⏭  ${s}`);
    totalUploaded += r.uploaded;
    totalFailed   += r.failed;
  }

  if (totalImages === 0) {
    console.warn(`\n⚠️  No images found in any category subfolder.`);
    console.warn(`\n   Expected structure:`);
    console.warn(`     ${OPTIMIZED_ROOT}/hero/hero1.avif  hero1.webp  hero1.jpeg`);
    console.warn(`     ${OPTIMIZED_ROOT}/menu/burger01.avif  ...`);
    console.warn(`\n   Move files into category subfolders, then re-run.`);
    process.exit(0);
  }

  const content = generateOutput(results);

  if (DRY_RUN) {
    console.log(`\n${'─'.repeat(72)}`);
    console.log(content);
    console.log(`${'─'.repeat(72)}`);
    console.log(`\n⚠  Dry run — nothing written or uploaded.`);
    return;
  }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, content, 'utf-8');

  console.log(`\n✨  Done`);
  console.log(`   ${totalImages} image(s) across ${results.filter((r) => r.entries.length).length} categories`);
  console.log(`   Written: ${OUTPUT_FILE}`);

  if (DO_UPLOAD) {
    if (totalUploaded) console.log(`   Uploaded: ${totalUploaded} files to Supabase`);
    if (totalFailed)   console.log(`   ⚠  Failed: ${totalFailed} upload(s) — check logs above`);
  }

  console.log(`\n📝  Next:`);
  if (DO_UPLOAD) {
    console.log(`   • Verify bucket policies: Supabase → Storage → Policies`);
    console.log(`     (public buckets need SELECT for "anon" role)`);
    console.log(`   • Add Cloudflare proxying to your Supabase storage subdomain.`);
    console.log(`   • Commit src/assets/images.ts — components pick up CDN URLs automatically.`);
  } else {
    console.log(`   • Vite hashes import paths at build time — no action needed.`);
    console.log(`   • For production CDN: npm run generate-images-ts -- --upload`);
  }
}

main().catch((err: unknown) => {
  console.error('\nFatal:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});