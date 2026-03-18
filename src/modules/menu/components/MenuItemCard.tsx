// =============================================================================
// src/modules/menu/components/MenuItemCard.tsx
// =============================================================================
//
// Price contracts:
//   getPriceCents(item) → CENTS    → PricingEngine.formatPrice(cents)   (when provided)
//   item.price          → DOLLARS  → formatCurrency(item.price)         (fallback)
//
// Availability contracts:
//   getAvailable(item)  → explicit boolean override (takes full precedence)
//   PricingEngine.getStockStatus → 'in_stock' | 'low_stock' | 'out_of_stock' | 'unknown'
//
// Open contract:
//   onOpen(item) is called when the user taps the CTA button.
//   The caller (MenuGrid → MenuPage) decides what happens next.
//   This card has NO direct modal/auth coupling.
//
// Animation: uses `m` from framer-motion — requires <LazyMotion> in RootLayout.
// =============================================================================

import { memo, useCallback, useMemo, useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';

import type { MenuItemBase } from '@/domain/menu/menu.types';
import { PricingEngine } from '@/domain/pricing/pricing.engine';
import { formatCurrency } from '@/utils/currency';
import { Button } from '@/components/ui/Button';

// ─── Easing curves ────────────────────────────────────────────────────────────

/** Luxury deceleration — entrances, lifts, image zoom */
const EL = [0.16, 1, 0.3, 1] as const;
/** Spring overshoot — badges, pops, small interactive elements */
const ES = [0.34, 1.56, 0.64, 1] as const;

// ─── Internal types ───────────────────────────────────────────────────────────

type AvailState = 'available' | 'low_stock' | 'unavailable';

type DietBadge = {
  key: string;
  label: string;
  fg: string;
  bg: string;
};

// ─── Props ────────────────────────────────────────────────────────────────────

export type MenuItemCardProps<TItem extends MenuItemBase = MenuItemBase> = {
  item: TItem;
  /**
   * Optional price override. Receives item, must return integer CENTS.
   * When provided, PricingEngine.formatPrice(cents) is used.
   * When omitted, item.price (dollars) is formatted via formatCurrency.
   */
  getPriceCents?: (item: TItem) => number;
  /**
   * Optional availability override. Receives item, must return boolean.
   * When provided, supersedes PricingEngine stock status entirely.
   * When omitted, PricingEngine.getStockStatus provides granular state.
   */
  getAvailable?: (item: TItem) => boolean;
  /**
   * Called when the user presses the CTA button on an available item.
   * The caller owns the response: open a modal, require login, navigate, etc.
   * If omitted the button still renders but does nothing after the animation.
   */
  onOpen?: (item: TItem) => void;
  /**
   * Stagger index for entrance animation delay (0-based).
   * Capped at 8 to avoid excessive delays in long grids.
   */
  index?: number;
};

// ─── Runtime field readers ────────────────────────────────────────────────────
// Typed against MenuItemBase (the constraint) so they are safe for any TItem.
// Only fields that actually exist on MenuItemBase are accessed directly.
// All reads go through safe coercion helpers — no direct field access in JSX.

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
  // MenuItemBase only has image_url (snake_case) — confirmed by TS errors 2551/2339
  const s = safeStr(item.image_url, '');
  return s.length > 0 ? s : null;
}

function readPriceDollars(item: MenuItemBase): number {
  return safeNum(item.price, 0);
}

function readSpicyLevel(item: MenuItemBase): number {
  // MenuItemBase only has spicy_level (snake_case) — confirmed by TS error 2551
  return Math.max(0, Math.min(3, Math.round(safeNum(item.spicy_level, 0))));
}

// ─── Helpers — generic over TItem to avoid contravariance errors ──────────────

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
  // MenuItemBase only has snake_case fields — confirmed by TS errors 2551
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
    badges.push({ key: 'spicy', label: '🌶'.repeat(spicy), fg: '#7f1d1d', bg: '#fee2e2' });
  }
  return badges;
}

/** Deterministic warm-dark gradient per item id — shown while image loads */
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
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(h) % GRADIENTS.length];
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
  const [imgErrored, setImgErrored] = useState(false);
  const [isOpening, setIsOpening] = useState(false);

  const id = useMemo(() => readId(item), [item]);
  const name = useMemo(() => readName(item), [item]);
  const description = useMemo(() => readDescription(item), [item]);
  const imageUrl = useMemo(() => readImageUrl(item), [item]);
  const availState = useMemo(() => resolveAvailability(item, getAvailable), [item, getAvailable]);
  const priceLabel = useMemo(() => resolvePrice(item, getPriceCents), [item, getPriceCents]);
  const dietBadges = useMemo(() => resolveDietBadges(item), [item]);

  const isAvailable = availState !== 'unavailable';
  const isLowStock = availState === 'low_stock';
  const showImage = imageUrl !== null && !imgErrored;

  const entranceDelay = Math.min(index, 8) * 0.055;

  const handleOpen = useCallback(async () => {
    if (!isAvailable || isOpening) return;
    setIsOpening(true);
    await new Promise<void>((r) => setTimeout(r, 110));
    setIsOpening(false);
    onOpen?.(item);
  }, [isAvailable, isOpening, onOpen, item]);

  return (
    <m.article
      initial={{ opacity: 0, y: 22, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, ease: EL, delay: entranceDelay }}
      whileHover={
        isAvailable
          ? {
              y: -7,
              boxShadow: '0 28px 60px rgba(26,18,9,0.16), 0 6px 18px rgba(26,18,9,0.08)',
              transition: { duration: 0.3, ease: EL },
            }
          : undefined
      }
      whileTap={isAvailable ? { scale: 0.985, transition: { duration: 0.1 } } : undefined}
      className="group relative flex flex-col overflow-hidden rounded-2xl bg-white
                 ring-1 ring-zinc-200/70 transition-box-shadow duration-300"
      aria-label={name}
      data-available={isAvailable}
    >
      {/* ── Image block ───────────────────────────────────────────────── */}
      <div className="relative aspect-4/3 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ background: pickGradient(id) }}
          aria-hidden="true"
        />

        <AnimatePresence>
          {showImage && !imgLoaded && (
            <m.div
              key="shimmer"
              className="absolute inset-0 animate-shimmer"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45 }}
              aria-hidden="true"
            />
          )}
        </AnimatePresence>

        {showImage && (
          <img
            src={imageUrl}
            alt={name}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full object-cover scale-100
                       transition-[opacity,transform] duration-700
                       ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
            style={{ opacity: imgLoaded ? 1 : 0 }}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgErrored(true)}
          />
        )}

        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-12"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.32), transparent)' }}
          aria-hidden="true"
        />

        {dietBadges.length > 0 && (
          <m.div
            className="absolute left-2.5 top-2.5 flex flex-wrap gap-1"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, ease: EL, delay: entranceDelay + 0.18 }}
          >
            {dietBadges.map((b) => (
              <span
                key={b.key}
                className="inline-flex items-center rounded-full px-2 py-0.5
                           text-[10px] font-bold leading-none tracking-wide shadow-sm"
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
              className="absolute inset-0 flex items-center justify-center
                         bg-black/45 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
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

      {/* ── Text body ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3
            className="min-w-0 flex-1 font-semibold leading-snug text-zinc-900"
            style={{ fontSize: '1rem' }}
          >
            {name}
          </h3>
          <m.span
            className="shrink-0 whitespace-nowrap font-bold tabular-nums"
            style={{ fontSize: '1rem', color: 'var(--color-ember-500, #a86840)' }}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.42, ease: EL, delay: entranceDelay + 0.12 }}
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
              transition={{ duration: 0.22, ease: ES }}
              className="flex items-center gap-1 text-[11px] font-semibold text-amber-600"
            >
              <span aria-hidden="true">⚠</span>
              Only a few left
            </m.p>
          )}
        </AnimatePresence>

        <div className="flex-1" />

        <m.div
          whileHover={isAvailable ? { scale: 1.025 } : undefined}
          whileTap={isAvailable ? { scale: 0.965 } : undefined}
          transition={{ duration: 0.13, ease: ES }}
        >
          <Button
            type="button"
            variant={isAvailable ? 'primary' : 'secondary'}
            size="md"
            onClick={() => {
              void handleOpen();
            }}
            disabled={!isAvailable}
            isLoading={isOpening}
            className="w-full"
            aria-label={!isAvailable ? `${name} is currently unavailable` : `Customize ${name}`}
          >
            {!isAvailable ? 'Unavailable' : 'Customize'}
          </Button>
        </m.div>
      </div>
    </m.article>
  );
}

export const MenuItemCard = memo(MenuItemCardInner) as typeof MenuItemCardInner;
export default MenuItemCard;