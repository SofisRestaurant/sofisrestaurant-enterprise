// =============================================================================
// src/modules/menu/components/MenuItemCard.tsx
// =============================================================================
//
// 2026 premium compact list-card redesign.
//
// Mobile-first layout:
//   - Clean horizontal card
//   - Text left, soft rounded thumbnail right
//   - Price visible without clutter
//   - Modern black “Add +” pill instead of Grubhub-style yellow circle
//   - Fixed image dimensions to prevent CLS
//   - Bigger touch targets for mobile
//
// Performance contracts:
//   Above-fold cards (index ≤ ABOVE_FOLD_THRESHOLD):
//     - loading="eager"  fetchPriority="high"
//     - Entrance animation skipped (initial={false})
//   All other cards:
//     - loading="lazy"   fetchPriority="auto"
//     - Staggered entrance, capped at STAGGER_MAX_SLOTS
//
// Image delivery contract:
//   - Uses src/lib/images/menuImageDelivery.ts
//   - Default mode should stay raw Supabase public object URLs while
//     /render/image returns 403 on this project.
//   - Failed images → stable gradient placeholder, layout unaffected.
//
// Price contracts:
//   getPriceCents(item) → CENTS   → PricingEngine.formatPrice(cents)
//   item.price          → DOLLARS → formatCurrency(item.price)
//
// Open contract:
//   onOpen(item) fires immediately on card tap or “Add +” press.
//   Ref debounce prevents accidental mobile double-tap.
// =============================================================================

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { m } from 'framer-motion';

import type { MenuItemBase } from '@/domain/menu/menu.types';
import { PricingEngine } from '@/domain/pricing/pricing.engine';
import { getMenuCardImageAttrs } from '@/lib/images/menuImageDelivery';
import { formatCurrency } from '@/utils/currency';

// ─── Performance constants ────────────────────────────────────────────────────

const ABOVE_FOLD_THRESHOLD = 3;
const STAGGER_STEP = 0.035;
const STAGGER_MAX_SLOTS = 10;
const CTA_DEBOUNCE_MS = 400;

// ─── Easing ───────────────────────────────────────────────────────────────────

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

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

// ─── Plus icon ────────────────────────────────────────────────────────────────

function PlusIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="pointer-events-none"
    >
      <path
        d="M10 4.5v11M4.5 10h11"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
    </svg>
  );
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
        initial: { opacity: 0, y: 10 } as const,
        animate: { opacity: 1, y: 0 } as const,
        transition: { duration: 0.32, ease: EASE_OUT, delay: entranceDelay },
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

  const handleCardClick = useCallback(() => {
    handleOpen();
  }, [handleOpen]);

  const handlePlusClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      handleOpen();
    },
    [handleOpen],
  );

  const handleCardKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;

      event.preventDefault();
      handleOpen();
    },
    [handleOpen],
  );

  return (
    <m.article
      {...articleAnim}
      whileHover={
        isAvailable
          ? {
              y: -1,
              boxShadow: '0 12px 32px rgba(24,24,27,0.08)',
              transition: { duration: 0.2, ease: EASE_OUT },
            }
          : undefined
      }
      whileTap={isAvailable ? { scale: 0.995, transition: { duration: 0.08 } } : undefined}
      onClick={isAvailable ? handleCardClick : undefined}
      role="button"
      tabIndex={isAvailable ? 0 : -1}
      onKeyDown={handleCardKeyDown}
      className={[
        'group relative flex min-h-[126px] items-stretch overflow-hidden rounded-[22px]',
        'bg-white',
        'ring-1 ring-zinc-950/[0.055]',
        'shadow-[0_1px_2px_rgba(24,24,27,0.04)]',
        'transition-shadow duration-200',
        'sm:min-h-[142px]',
        isAvailable ? 'cursor-pointer' : 'cursor-default',
        !isAvailable ? 'opacity-60' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={
        !isAvailable
          ? `${name} is currently unavailable`
          : `${name}, ${priceLabel}. Tap to customize.`
      }
      data-available={isAvailable}
    >
      {/* ── Text content ──────────────────────────────────────────────── */}
      <div className="relative flex min-w-0 flex-1 flex-col justify-between gap-2 px-4 py-3.5 sm:px-5 sm:py-4">
        <div className="min-w-0">
          <h3
            className="truncate text-[0.98rem] font-semibold leading-snug text-zinc-950 sm:text-[1.05rem]"
            title={name}
          >
            {name}
          </h3>

          {description.length > 0 && (
            <p className="mt-1 line-clamp-2 text-[0.82rem] leading-relaxed text-zinc-500 sm:text-sm">
              {description}
            </p>
          )}
        </div>

        {/* Mobile-first bottom action row */}
        <div className="mt-auto flex items-end justify-between gap-3 pt-2">
          <div className="min-w-0">
            <span className="block whitespace-nowrap text-[0.95rem] font-semibold tabular-nums text-zinc-950 sm:text-base">
              {priceLabel}
            </span>

            {(dietBadges.length > 0 || isLowStock) && (
              <div className="mt-1 flex max-w-full flex-wrap items-center gap-1.5">
                {dietBadges.slice(0, 3).map((badge) => (
                  <span
                    key={badge.key}
                    className="inline-flex items-center rounded-full bg-zinc-100 px-1.5 py-[2px] text-[10px] font-semibold text-zinc-600"
                    title={badge.label}
                  >
                    {badge.label}
                  </span>
                ))}

                {isLowStock && (
                  <span className="inline-flex items-center text-[10px] font-semibold text-amber-700">
                    Few left
                  </span>
                )}
              </div>
            )}
          </div>

          <m.button
            type="button"
            whileHover={isAvailable ? { scale: 1.03 } : undefined}
            whileTap={isAvailable ? { scale: 0.96 } : undefined}
            transition={{ duration: 0.12 }}
            onClick={handlePlusClick}
            disabled={!isAvailable || isOpening}
            aria-label={!isAvailable ? `${name} is currently unavailable` : `Add ${name}`}
            className={[
              'inline-flex min-h-10 shrink-0 items-center justify-center rounded-full px-4 text-sm font-semibold',
              'transition-colors duration-150',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20',
              'sm:min-h-11 sm:px-5',
              isAvailable
                ? 'bg-zinc-950 text-white hover:bg-zinc-800 active:bg-black'
                : 'cursor-not-allowed bg-zinc-200 text-zinc-400',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {isOpening ? (
              'Opening'
            ) : (
              <>
                Add
                <span className="ml-1 inline-flex items-center leading-none">
                  <PlusIcon />
                </span>
              </>
            )}
          </m.button>
        </div>

        {!isAvailable && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center rounded-[22px] bg-white/75 backdrop-blur-[1px]"
            aria-hidden="true"
          >
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-zinc-500 shadow-sm">
              Unavailable
            </span>
          </div>
        )}
      </div>

      {/* ── Thumbnail ─────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center py-3 pr-3 sm:py-4 sm:pr-4">
        <div
          className="relative h-[92px] w-[92px] overflow-hidden rounded-2xl bg-zinc-100 shadow-[inset_0_0_0_1px_rgba(24,24,27,0.04)] sm:h-[112px] sm:w-[112px]"
          aria-hidden={!showImage}
        >
          <div
            className="absolute inset-0"
            style={{ background: pickGradient(id) }}
            aria-hidden="true"
          />

          {showImage && !imgLoaded && (
            <div className="sofi-shimmer absolute inset-0" aria-hidden="true" />
          )}

          {showImage && imageAttrs && (
            <img
              key={imageAttrs.src}
              {...imageAttrs}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-500 ease-out group-hover:scale-[1.04]"
              style={{ opacity: imgLoaded ? 1 : 0 }}
              onLoad={handleImageLoad}
              onError={handleImageError}
            />
          )}

          <div
            className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-black/[0.04]"
            aria-hidden="true"
          />
        </div>
      </div>
    </m.article>
  );
}

export const MenuItemCard = memo(MenuItemCardInner) as typeof MenuItemCardInner;
export default MenuItemCard;