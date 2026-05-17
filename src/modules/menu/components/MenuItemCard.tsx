// =============================================================================
// src/modules/menu/components/MenuItemCard.tsx
// =============================================================================
//
// Performance contracts (2026):
//   Above-fold cards (index ≤ ABOVE_FOLD_THRESHOLD):
//     - loading="eager"  fetchPriority="high"
//     - Entrance animation skipped entirely (initial={false})
//     - Price/badge child animations skipped
//
//   All other cards:
//     - loading="lazy"   fetchPriority="auto"
//     - Staggered entrance, capped at STAGGER_MAX_SLOTS slots
//
// Image delivery contract:
//   - Uses src/lib/images/menuImageDelivery.ts as the single source of truth.
//   - Default mode uses raw Supabase public object URLs because this project
//     returned 403 Forbidden from /storage/v1/render/image.
//   - If transforms are enabled later, set:
//       VITE_ENABLE_SUPABASE_IMAGE_TRANSFORMS=true
//   - If any image fails, the card keeps its stable gradient placeholder.
//   - No raw/optimized mismatch between card image and MenuPage preload.
//
// Price contracts:
//   getPriceCents(item) → CENTS    → PricingEngine.formatPrice(cents)
//   item.price          → DOLLARS  → formatCurrency(item.price)
//
// Availability contracts:
//   getAvailable(item)  → explicit boolean override
//   PricingEngine.getStockStatus → fallback granular state
//
// Open contract:
//   onOpen(item) is called immediately on CTA press.
//   Ref debounce prevents accidental mobile double-tap.
// =============================================================================

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';

import type { MenuItemBase } from '@/domain/menu/menu.types';
import { PricingEngine } from '@/domain/pricing/pricing.engine';
import { getMenuCardImageAttrs } from '@/lib/images/menuImageDelivery';
import { formatCurrency } from '@/utils/currency';

// ─── Performance constants ────────────────────────────────────────────────────

const ABOVE_FOLD_THRESHOLD = 1;
const STAGGER_STEP = 0.055;
const STAGGER_MAX_SLOTS = 8;
const CTA_DEBOUNCE_MS = 400;

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

type ImageState = 'ready' | 'failed';

// ─── Props ────────────────────────────────────────────────────────────────────

export type MenuItemCardProps<TItem extends MenuItemBase = MenuItemBase> = {
  item: TItem;
  getPriceCents?: (item: TItem) => number;
  getAvailable?: (item: TItem) => boolean;
  onOpen?: (item: TItem) => void;
  index?: number;
};

// ─── Safe field readers ───────────────────────────────────────────────────────

function safeStr(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function safeBool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function safeNum(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
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
  const value = safeStr(item.image_url, '');
  return value.length > 0 ? value : null;
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

  let hash = 0;

  for (let i = 0; i < id.length; i += 1) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }

  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
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
  const [imageState, setImageState] = useState<ImageState>('ready');
  const [isOpening, setIsOpening] = useState(false);

  const isOpeningRef = useRef(false);
  const openTimerRef = useRef<number | null>(null);

  const id = readId(item);
  const name = readName(item);
  const description = readDescription(item);
  const rawImageUrl = readImageUrl(item);

  const isAboveFold = index <= ABOVE_FOLD_THRESHOLD;
  const staggerSlot = Math.min(index, STAGGER_MAX_SLOTS);
  const entranceDelay = isAboveFold ? 0 : staggerSlot * STAGGER_STEP;

  const imageAttrs = useMemo(
    () => getMenuCardImageAttrs(rawImageUrl, { isAboveFold }),
    [rawImageUrl, isAboveFold],
  );

  useEffect(() => {
    setImgLoaded(false);
    setImageState('ready');
  }, [imageAttrs?.src]);

  useEffect(() => {
    return () => {
      if (openTimerRef.current !== null) {
        window.clearTimeout(openTimerRef.current);
      }
    };
  }, []);

  const availState = useMemo(() => resolveAvailability(item, getAvailable), [item, getAvailable]);
  const priceLabel = useMemo(() => resolvePrice(item, getPriceCents), [item, getPriceCents]);
  const dietBadges = useMemo(() => resolveDietBadges(item), [item]);

  const isAvailable = availState !== 'unavailable';
  const isLowStock = availState === 'low_stock';
  const showImage = imageAttrs !== null && imageState === 'ready';

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

    openTimerRef.current = window.setTimeout(() => {
      isOpeningRef.current = false;
      setIsOpening(false);
      openTimerRef.current = null;
    }, CTA_DEBOUNCE_MS);
  }, [isAvailable, item, onOpen]);

  const handleImageLoad = useCallback(() => {
    setImgLoaded(true);
  }, []);

  const handleImageError = useCallback(() => {
    setImgLoaded(false);
    setImageState('failed');
  }, []);

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

        {showImage && imageAttrs && (
          <img
            key={imageAttrs.src}
            {...imageAttrs}
            alt={name}
            className="absolute inset-0 h-full w-full object-cover
                       transition-[opacity,transform] duration-700
                       ease-luxury group-hover:scale-[1.05]"
            style={{ opacity: imgLoaded ? 1 : 0 }}
            onLoad={handleImageLoad}
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
            {dietBadges.map((badge) => (
              <span
                key={badge.key}
                className="inline-flex items-center rounded-full px-2 py-0.5
                           text-2xs font-bold leading-none tracking-wide shadow-sm"
                style={{ color: badge.fg, background: badge.bg }}
              >
                {badge.label}
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