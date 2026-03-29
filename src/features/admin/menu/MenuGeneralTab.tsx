// src/features/admin/menu/MenuGeneralTab.tsx
// ============================================================================
// MENU GENERAL TAB — Pure presenter
// ============================================================================

import { useState, useRef, useCallback } from 'react';
import type { GeneralTabFormState } from '@/domain/menu/menu-general.types';
import type { MenuCategory } from '@/domain/menu/menu.types';
import { InlineToggle } from '@/components/ui/InlineToggle';
import { FormSection } from '@/components/ui/FormSection';
import { formStyles } from '@/components/ui/formStyles';
import { VALID_CATEGORIES } from '@/domain/menu/menu-general.schema';
import { uploadMenuImage } from '@/lib/supabase/storage/uploadImage';

export type { GeneralTabFormState } from '@/domain/menu/menu-general.types';
export { GENERAL_TAB_EMPTY } from '@/domain/menu/menu-general.types';

// ─────────────────────────────────────────────────────────────────────────────
// Image Uploader
// ─────────────────────────────────────────────────────────────────────────────

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
}

function ImageUploader({ value, onChange, disabled }: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [compressionInfo, setCompressionInfo] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      // Accept image files including HEIC/HEIF from iPhone
      const isImage =
        file.type.startsWith('image/') ||
        file.name.toLowerCase().endsWith('.heic') ||
        file.name.toLowerCase().endsWith('.heif');
      if (!isImage) {
        setUploadError('Please select an image file.');
        return;
      }

      setUploading(true);
      setUploadError(null);
      setCompressionInfo(null);

      try {
        // Build a unique filename: timestamp + sanitised original name
        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
        const base = file.name
          .replace(/\.[^.]+$/, '')
          .replace(/[^a-zA-Z0-9-_]/g, '-')
          .slice(0, 40);
        const path = `${Date.now()}-${base}.${ext}`;

        const result = await uploadMenuImage(file, path);

        if (!result.ok) {
          setUploadError(result.error);
          return;
        }

        onChange(result.url);

        // Show compression savings if meaningful
        if (result.compression.wasCompressed && result.compression.savingPercent >= 5) {
          const origKB = Math.round(result.compression.originalSizeBytes / 1024);
          const compKB = Math.round(result.compression.compressedSizeBytes / 1024);
          setCompressionInfo(
            `Compressed ${origKB} KB → ${compKB} KB (${result.compression.savingPercent}% smaller)`,
          );
        }
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed.');
      } finally {
        setUploading(false);
      }
    },
    [onChange],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled || uploading) return;
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled && !uploading) setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCompressionInfo(null);
    onChange(e.target.value);
  };

  const handleRemove = () => {
    onChange('');
    setCompressionInfo(null);
    setUploadError(null);
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
        className={[
          'relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition cursor-pointer select-none',
          dragOver
            ? 'border-amber-400 bg-amber-50'
            : uploading
              ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
              : disabled
                ? 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-60'
                : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100',
        ].join(' ')}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif"
          className="hidden"
          onChange={handleInputChange}
          disabled={disabled || uploading}
        />

        {uploading ? (
          <>
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-amber-500" />
            <p className="text-xs text-gray-500">Compressing &amp; uploading…</p>
          </>
        ) : value ? (
          <>
            <img
              src={value}
              alt="Menu item preview"
              className="h-24 w-24 rounded-lg object-cover border border-gray-100 shadow-sm"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <p className="text-xs text-gray-400">Click or drop to replace</p>
          </>
        ) : (
          <>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-400 text-xl shadow-sm">
              📷
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">
                Drop a photo here, or <span className="text-amber-600">click to browse</span>
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                JPEG, PNG, WebP, AVIF — auto-compressed to WebP
              </p>
            </div>
          </>
        )}
      </div>

      {/* Compression info */}
      {compressionInfo && (
        <p className="text-xs text-green-600 flex items-center gap-1">
          <span>✓</span> {compressionInfo}
        </p>
      )}

      {/* Upload error */}
      {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}

      {/* URL field — keep so admins can also paste a CDN URL directly */}
      <div>
        <label className={formStyles.label} htmlFor="menu-image-url">
          Or paste image URL
        </label>
        <div className="flex gap-2">
          <input
            id="menu-image-url"
            value={value}
            onChange={handleUrlChange}
            placeholder="https://..."
            className={`${formStyles.input} flex-1`}
            disabled={disabled || uploading}
          />
          {value && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={disabled || uploading}
              className="px-3 py-2 text-xs text-red-500 hover:text-red-700 border border-gray-200 rounded-lg transition disabled:opacity-40"
              title="Remove image"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface MenuGeneralTabProps {
  form: GeneralTabFormState;
  onChange: <K extends keyof GeneralTabFormState>(key: K, value: GeneralTabFormState[K]) => void;
  disabled?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function MenuGeneralTab({ form, onChange, disabled = false }: MenuGeneralTabProps) {
  function field<K extends keyof GeneralTabFormState>(key: K, value: GeneralTabFormState[K]) {
    onChange(key, value);
  }

  return (
    <div className="space-y-8">
      {/* ── Item Info ─────────────────────────────────────────────────────── */}
      <FormSection title="Item Info">
        <div>
          <label className={formStyles.label} htmlFor="menu-name">
            Name *
          </label>
          <input
            id="menu-name"
            value={form.name}
            onChange={(e) => field('name', e.target.value)}
            placeholder="e.g. Grilled Salmon"
            className={formStyles.input}
            disabled={disabled}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={formStyles.label} htmlFor="menu-category">
              Category *
            </label>
            <select
              id="menu-category"
              value={form.category}
              onChange={(e) => field('category', e.target.value as MenuCategory)}
              className={formStyles.select}
              disabled={disabled}
            >
              {VALID_CATEGORIES.map((c) => (
                <option key={c} value={c} className="capitalize">
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={formStyles.label} htmlFor="menu-price">
              Price (USD) *
            </label>
            <input
              id="menu-price"
              type="number"
              min="0.01"
              step="0.01"
              value={form.price}
              onChange={(e) => field('price', e.target.value)}
              placeholder="0.00"
              className={formStyles.input}
              disabled={disabled}
            />
          </div>
        </div>
        <div>
          <label className={formStyles.label} htmlFor="menu-description">
            Description
          </label>
          <textarea
            id="menu-description"
            value={form.description}
            onChange={(e) => field('description', e.target.value)}
            rows={3}
            placeholder="Short description shown on menu card"
            className={`${formStyles.input} resize-none`}
            disabled={disabled}
          />
        </div>

        {/* ── Image uploader ─────────────────────────────────────────────── */}
        <div>
          <label className={formStyles.label}>Item Photo</label>
          <ImageUploader
            value={form.image_url}
            onChange={(url) => field('image_url', url)}
            disabled={disabled}
          />
        </div>
      </FormSection>

      {/* ── Visibility ────────────────────────────────────────────────────── */}
      <FormSection title="Visibility">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InlineToggle
            checked={form.available}
            onChange={(v) => field('available', v)}
            label="Available to customers"
            disabled={disabled}
          />
          <InlineToggle
            checked={form.featured}
            onChange={(v) => field('featured', v)}
            label="⭐ Featured item"
            disabled={disabled}
          />
          <InlineToggle
            checked={form.is_vegetarian}
            onChange={(v) => field('is_vegetarian', v)}
            label="🌿 Vegetarian"
            disabled={disabled}
          />
          <InlineToggle
            checked={form.is_vegan}
            onChange={(v) => field('is_vegan', v)}
            label="🌱 Vegan"
            disabled={disabled}
          />
          <InlineToggle
            checked={form.is_gluten_free}
            onChange={(v) => field('is_gluten_free', v)}
            label="🌾 Gluten-Free"
            disabled={disabled}
          />
        </div>
      </FormSection>

      {/* ── Details ───────────────────────────────────────────────────────── */}
      <FormSection title="Details">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={formStyles.label} htmlFor="menu-sort">
              Sort Order
            </label>
            <input
              id="menu-sort"
              type="number"
              min="0"
              value={form.sort_order}
              onChange={(e) => field('sort_order', e.target.value)}
              placeholder="0"
              className={formStyles.input}
              disabled={disabled}
            />
          </div>
          <div>
            <label className={formStyles.label} htmlFor="menu-spicy">
              Spicy Level (0–5)
            </label>
            <input
              id="menu-spicy"
              type="number"
              min="0"
              max="5"
              value={form.spicy_level}
              onChange={(e) => field('spicy_level', e.target.value)}
              placeholder="0"
              className={formStyles.input}
              disabled={disabled}
            />
          </div>
          <div>
            <label className={formStyles.label} htmlFor="menu-inventory">
              Inventory Count
            </label>
            <input
              id="menu-inventory"
              type="number"
              min="0"
              value={form.inventory_count}
              onChange={(e) => field('inventory_count', e.target.value)}
              placeholder="Unlimited"
              className={formStyles.input}
              disabled={disabled}
            />
          </div>
          <div>
            <label className={formStyles.label} htmlFor="menu-lowstock">
              Low Stock Threshold
            </label>
            <input
              id="menu-lowstock"
              type="number"
              min="0"
              value={form.low_stock_threshold}
              onChange={(e) => field('low_stock_threshold', e.target.value)}
              placeholder="0"
              className={formStyles.input}
              disabled={disabled}
            />
          </div>
        </div>
        <div>
          <label className={formStyles.label} htmlFor="menu-popularity">
            Popularity Score
          </label>
          <input
            id="menu-popularity"
            type="number"
            min="0"
            value={form.popularity_score}
            onChange={(e) => field('popularity_score', e.target.value)}
            placeholder="0"
            className={formStyles.input}
            disabled={disabled}
          />
          <p className="text-xs text-gray-400 mt-1">
            Used to sort popular items in the customer menu. Higher = more prominent.
          </p>
        </div>
      </FormSection>
    </div>
  );
}
