// =============================================================================
// src/modules/menu/components/MenuItemCard.tsx
// =============================================================================
//
// Performance contracts (2026):
//   Above-fold cards (index ≤ ABOVE_FOLD_THRESHOLD):
//     - loading="eager"  fetchPriority="high"
//     - Entrance animation skipped entirely (initial={false})
//     - Price/badge child animations skipped
//   All other cards:
//     - loading="lazy"   fetchPriority="auto"
//     - Staggered entrance, capped at STAGGER_MAX_SLOTS slots
//
// Image delivery contract:
//   - Supabase /storage/v1/render/image is feature-flagged.
//   - Default behavior uses public object URLs because this project returned
//     403 Forbidden on render/image.
//   - To enable transforms after Supabase allows them, set:
//       VITE_ENABLE_SUPABASE_IMAGE_TRANSFORMS=true
//   - If transforms are enabled and fail, the card falls back once to the
//     public object URL so images never disappear in production.
//
// Price contracts:
//   getPriceCents(item) → CENTS    → PricingEngine.formatPrice(cents)
//   item.price          → DOLLARS  → formatCurrency(item.price)   (fallback)
//
// Availability contracts:
//   getAvailable(item)  → explicit boolean override (full precedence)
//   PricingEngine.getStockStatus → 'in_stock' | 'low_stock' | 'out_of_stock' | 'unknown'
//
// Open contract:
//   onOpen(item) is called IMMEDIATELY on CTA press — no artificial delay.
//   A ref-based debounce (CTA_DEBOUNCE_MS) prevents double-tap on mobile.
//   The caller (MenuGrid → MenuPage) owns all response logic.
//   This card has NO direct modal/auth coupling.
//
// Animation: uses `m` from framer-motion — requires <LazyMotion> in RootLayout.
// AnimatePresence is reserved for genuinely conditional elements.
// =============================================================================

import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';

import type { MenuItemBase } from '@/domain/menu/menu.types';
import { PricingEngine } from '@/domain/pricing/pricing.engine';
import { supabaseImageSrcSet, supabaseImageUrl } from '@/lib/images/supabaseImage';
import { formatCurrency } from '@/utils/currency';

// ─── Performance constants ────────────────────────────────────────────────────

const ABOVE_FOLD_THRESHOLD = 1;
const STAGGER_STEP = 0.055;
const STAGGER_MAX_SLOTS = 8;
const CTA_DEBOUNCE_MS = 400;

// Supabase render/image currently returned 403 on this project.
// Keep this disabled by default so production images never disappear.
const ENABLE_SUPABASE_IMAGE_TRANSFORMS =
  import.meta.env.VITE_ENABLE_SUPABASE_IMAGE_TRANSFORMS === 'true';

// ─── Easing curves ────────────────────────────────────────────────────────────

const EL = [0.16, 1, 0.3, 1] as const;
const ES = [0.34, 1.56, 0.64, 1] as const;

// ─── Internal types ───────────────────────────────────────────────────────────

type AvailState = 'available' | 'low_stock' | 'unavailable';

type DietBadge = {
  key: string;
  label: string;
  fg: string;
  bg: string;
};

type ImageMode = 'optimized' | 'raw' | 'none';

// ─── Props ────────────────────────────────────────────────────────────────────

export type MenuItemCardProps<TItem extends MenuItemBase = MenuItemBase> = {
  item: TItem;
  getPriceCents?: (item: TItem) => number;
  getAvailable?: (item: TItem) => boolean;
  onOpen?: (item: TItem) => void;
  index?: number;
};

// ─── Safe field readers ───────────────────────────────────────────────────────

function safeStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : fallback;
}

function safeBool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function safeNum(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function readId(item: MenuItemBase): string {
  return safeStr(item.id, '');
}

function readName(item: MenuItemBase): string {
  return safeStr(item.name, 'Menu item');
}

function readDescription(item: MenuItemBase): string {
  return safeStr(item.description, '');
}

function readImageUrl(item: MenuItemBase): string | null {
  const s = safeStr(item.image_url, '');
  return s.length > 0 ? s : null;
}

function readPriceDollars(item: MenuItemBase): number {
  return safeNum(item.price, 0);
}

function readSpicyLevel(item: MenuItemBase): number {
  return Math.max(0, Math.min(3, Math.round(safeNum(item.spicy_level, 0))));
}

// ─── Domain helpers ───────────────────────────────────────────────────────────

function resolveAvailability<TItem extends MenuItemBase>(
  item: TItem,
  getAvailable?: (item: TItem) => boolean,
): AvailState {
  if (typeof getAvailable === 'function') {
    return getAvailable(item) ? 'available' : 'unavailable';
  }

  try {
    const status = PricingEngine.getStockStatus(item);
    if (status === 'out_of_stock') return 'unavailable';
    if (status === 'low_stock') return 'low_stock';
    return 'available';
  } catch {
    return 'available';
  }
}

function resolvePrice<TItem extends MenuItemBase>(
  item: TItem,
  getPriceCents?: (item: TItem) => number,
): string {
  if (typeof getPriceCents === 'function') {
    return PricingEngine.formatPrice(getPriceCents(item));
  }

  return formatCurrency(readPriceDollars(item));
}

function resolveDietBadges(item: MenuItemBase): DietBadge[] {
  const badges: DietBadge[] = [];

  if (safeBool(item.is_vegetarian)) {
    badges.push({ key: 'v', label: 'V', fg: '#166534', bg: '#dcfce7' });
  }

  if (safeBool(item.is_vegan)) {
    badges.push({ key: 'vg', label: 'VG', fg: '#14532d', bg: '#bbf7d0' });
  }

  if (safeBool(item.is_gluten_free)) {
    badges.push({ key: 'gf', label: 'GF', fg: '#78350f', bg: '#fef3c7' });
  }

  const spicy = readSpicyLevel(item);

  if (spicy > 0) {
    badges.push({
      key: 'spicy',
      label: '\u{1F336}'.repeat(spicy),
      fg: '#7f1d1d',
      bg: '#fee2e2',
    });
  }

  return badges;
}

// ─── Placeholder gradient ─────────────────────────────────────────────────────

const GRADIENTS = [
  'radial-gradient(ellipse at 40% 35%, #3e2c20 0%, #1c1208 100%)',
  'radial-gradient(ellipse at 60% 40%, #1a2a1a 0%, #0c160c 100%)',
  'radial-gradient(ellipse at 50% 30%, #2e1e0c 0%, #160e04 100%)',
  'radial-gradient(ellipse at 42% 58%, #201a2e 0%, #0e0c18 100%)',
  'radial-gradient(ellipse at 55% 44%, #2e1814 0%, #160a08 100%)',
] as const;

function pickGradient(id: string): string {
  if (!id) return GRADIENTS[0];

  let h = 0;

  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }

  return GRADIENTS[Math.abs(h) % GRADIENTS.length];
}

function resolveImageSrc({
  rawImageUrl,
  isAboveFold,
  imageMode,
}: {
  rawImageUrl: string | null;
  isAboveFold: boolean;
  imageMode: ImageMode;
}): { src: string | null; srcSet: string | undefined } {
  if (!rawImageUrl || imageMode === 'none') {
    return { src: null, srcSet: undefined };
  }

  if (imageMode === 'raw' || !ENABLE_SUPABASE_IMAGE_TRANSFORMS) {
    return { src: rawImageUrl, srcSet: undefined };
  }

  return {
    src: supabaseImageUrl(rawImageUrl, isAboveFold ? 640 : 480, isAboveFold ? 74 : 72),
    srcSet: supabaseImageSrcSet(rawImageUrl),
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

function MenuItemCardInner<TItem extends MenuItemBase>({
  item,
  getPriceCents,
  getAvailable,
  onOpen,
  index = 0,
}: MenuItemCardProps<TItem>) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imageMode, setImageMode] = useState<ImageMode>(
    ENABLE_SUPABASE_IMAGE_TRANSFORMS ? 'optimized' : 'raw',
  );
  const [isOpening, setIsOpening] = useState(false);

  const isOpeningRef = useRef(false);

  const id = readId(item);
  const name = readName(item);
  const description = readDescription(item);
  const rawImageUrl = readImageUrl(item);

  const isAboveFold = index <= ABOVE_FOLD_THRESHOLD;
  const staggerSlot = Math.min(index, STAGGER_MAX_SLOTS);
  const entranceDelay = isAboveFold ? 0 : staggerSlot * STAGGER_STEP;

  const { src: displayImageUrl, srcSet: displaySrcSet } = resolveImageSrc({
    rawImageUrl,
    isAboveFold,
    imageMode,
  });

  const availState = useMemo(() => resolveAvailability(item, getAvailable), [item, getAvailable]);
  const priceLabel = useMemo(() => resolvePrice(item, getPriceCents), [item, getPriceCents]);
  const dietBadges = useMemo(() => resolveDietBadges(item), [item]);

  const isAvailable = availState !== 'unavailable';
  const isLowStock = availState === 'low_stock';
  const showImage = displayImageUrl !== null;

  const articleAnim = isAboveFold
    ? { initial: false as const }
    : {
        initial: { opacity: 0, y: 22, scale: 0.96 } as const,
        animate: { opacity: 1, y: 0, scale: 1 } as const,
        transition: { duration: 0.55, ease: EL, delay: entranceDelay },
      };

  const childAnim = (extraDelay: number) =>
    isAboveFold
      ? {}
      : {
          initial: { opacity: 0, x: 8 } as const,
          animate: { opacity: 1, x: 0 } as const,
          transition: { duration: 0.38, ease: EL, delay: entranceDelay + extraDelay },
        };

  const handleOpen = useCallback(() => {
    if (!isAvailable || isOpeningRef.current) return;

    isOpeningRef.current = true;
    setIsOpening(true);

    onOpen?.(item);

    window.setTimeout(() => {
      isOpeningRef.current = false;
      setIsOpening(false);
    }, CTA_DEBOUNCE_MS);
  }, [isAvailable, onOpen, item]);

  const handleImageError = useCallback(() => {
    setImgLoaded(false);

    if (imageMode === 'optimized' && rawImageUrl) {
      setImageMode('raw');
      return;
    }

    setImageMode('none');
  }, [imageMode, rawImageUrl]);

  return (
    <m.article
      {...articleAnim}
      whileHover={
        isAvailable
          ? {
              y: -6,
              boxShadow: '0 24px 56px rgba(26,18,9,0.13), 0 4px 16px rgba(26,18,9,0.07)',
              transition: { duration: 0.28, ease: EL },
            }
          : undefined
      }
      whileTap={isAvailable ? { scale: 0.985, transition: { duration: 0.1 } } : undefined}
      className="group relative flex flex-col overflow-hidden rounded-2xl bg-white
                 shadow-[0_2px_12px_rgba(26,18,9,0.07),0_1px_3px_rgba(26,18,9,0.04)]
                 ring-1 ring-zinc-900/6 transition-shadow duration-300"
      aria-label={name}
      data-available={isAvailable}
    >
      <div className="relative aspect-4/3 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ background: pickGradient(id) }}
          aria-hidden="true"
        />

        {showImage && !imgLoaded && (
          <div className="absolute inset-0 animate-pulse bg-zinc-200/20" aria-hidden="true" />
        )}

        {showImage && (
          <img
            key={`${displayImageUrl}-${imageMode}`}
            src={displayImageUrl}
            srcSet={displaySrcSet}
            sizes="(max-width: 640px) 92vw, (max-width: 1024px) 45vw, 360px"
            alt={name}
            width={400}
            height={300}
            loading={isAboveFold ? 'eager' : 'lazy'}
            fetchPriority={isAboveFold ? 'high' : 'auto'}
            decoding="async"
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full object-cover
                       transition-[opacity,transform] duration-700
                       ease-luxury group-hover:scale-[1.05]"
            style={{ opacity: imgLoaded ? 1 : 0 }}
            onLoad={() => setImgLoaded(true)}
            onError={handleImageError}
          />
        )}

        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-12"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.28), transparent)' }}
          aria-hidden="true"
        />

        {dietBadges.length > 0 && (
          <m.div {...childAnim(0.16)} className="absolute left-2.5 top-2.5 flex flex-wrap gap-1">
            {dietBadges.map((b) => (
              <span
                key={b.key}
                className="inline-flex items-center rounded-full px-2 py-0.5
                           text-2xs font-bold leading-none tracking-wide shadow-sm"
                style={{ color: b.fg, background: b.bg }}
              >
                {b.label}
              </span>
            ))}
          </m.div>
        )}

        <AnimatePresence>
          {!isAvailable && (
            <m.div
              key="overlay"
              className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              aria-hidden="true"
            >
              <span
                className="rounded-full bg-white/90 px-3 py-1
                           text-[11px] font-bold uppercase tracking-widest text-zinc-600 shadow"
              >
                Unavailable
              </span>
            </m.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3
            className="min-w-0 flex-1 font-semibold leading-snug text-zinc-900"
            style={{ fontSize: '1rem' }}
          >
            {name}
          </h3>

          <m.span
            {...childAnim(0.1)}
            className="shrink-0 whitespace-nowrap font-bold tabular-nums"
            style={{ fontSize: '1rem', color: 'var(--color-ember-500, #a86840)' }}
          >
            {priceLabel}
          </m.span>
        </div>

        {description.length > 0 && (
          <p className="line-clamp-2 text-sm font-light leading-relaxed text-zinc-500">
            {description}
          </p>
        )}

        <AnimatePresence>
          {isLowStock && (
            <m.p
              key="low-stock"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: ES }}
              className="flex items-center gap-1 text-[11px] font-semibold text-amber-600"
            >
              <span aria-hidden="true">&#9888;</span>
              Only a few left
            </m.p>
          )}
        </AnimatePresence>

        <div className="flex-1" />

        <m.div
          whileHover={isAvailable ? { scale: 1.02 } : undefined}
          whileTap={isAvailable ? { scale: 0.97 } : undefined}
          transition={{ duration: 0.12, ease: ES }}
        >
          <button
            type="button"
            className={`min-h-11 w-full ${isAvailable ? 'btn btn-primary' : 'btn btn-ghost-dark'}`}
            onClick={handleOpen}
            disabled={!isAvailable || isOpening}
            aria-label={!isAvailable ? `${name} is currently unavailable` : `Customize ${name}`}
          >
            {isOpening ? 'Opening\u2026' : !isAvailable ? 'Unavailable' : 'Customize'}
          </button>
        </m.div>
      </div>
    </m.article>
  );
}

export const MenuItemCard = memo(MenuItemCardInner) as typeof MenuItemCardInner;
export default MenuItemCard;