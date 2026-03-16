// =============================================================================
// src/modules/menu/components/MenuItemCard.tsx
// =============================================================================
//
// Price contracts:
//   item.price          → DOLLARS  → formatCurrency(item.price)
//   getPriceCents(item) → CENTS    → PricingEngine.formatPrice(cents)
//
// Availability contracts:
//   getAvailable(item)  → explicit boolean override (takes full precedence)
//   PricingEngine.getStockStatus(item) → 'in_stock' | 'low_stock' | 'out_of_stock' | 'unknown'
//
// Modal contracts:
//   logged in  → openModal('menu-item', { data: { item } })
//   logged out → openModal('login')
//
// Animation: uses `m` from framer-motion — requires <LazyMotion> in RootLayout (already set).
// =============================================================================

import { memo, useCallback, useMemo, useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';

import type { MenuItemPublic } from '@/domain/menu/menu.types';
import { PricingEngine } from '@/domain/pricing/pricing.engine';
import { formatCurrency } from '@/utils/currency';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { useModal } from '@/components/ui/useModal';
import { Button } from '@/components/ui/Button';

// ─── Easing curves ────────────────────────────────────────────────────────────

/** Luxury deceleration — entrances, lifts, image zoom */
const EL = [0.16, 1, 0.3, 1] as const;
/** Spring overshoot — badges, pops, small interactive elements */
const ES = [0.34, 1.56, 0.64, 1] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

type AvailState = 'available' | 'low_stock' | 'unavailable';

type DietBadge = {
  key: string;
  label: string;
  fg: string;
  bg: string;
};

export type MenuItemCardProps = {
  item: MenuItemPublic;
  /**
   * Optional price override. Receives item, must return integer CENTS.
   * When provided, PricingEngine.formatPrice(cents) is used.
   * When omitted, item.price (dollars) is formatted via formatCurrency.
   */
  getPriceCents?: (item: MenuItemPublic) => number;
  /**
   * Optional availability override. Receives item, must return boolean.
   * When provided, supersedes PricingEngine stock status entirely.
   * When omitted, PricingEngine.getStockStatus provides granular state.
   */
  getAvailable?: (item: MenuItemPublic) => boolean;
  /**
   * Stagger index for entrance animation delay (0-based).
   * Capped at 8 to avoid excessive delays in long grids.
   */
  index?: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveAvailability(
  item: MenuItemPublic,
  getAvailable?: (item: MenuItemPublic) => boolean,
): AvailState {
  if (typeof getAvailable === 'function') {
    return getAvailable(item) ? 'available' : 'unavailable';
  }
  const status = PricingEngine.getStockStatus(item);
  if (status === 'out_of_stock') return 'unavailable';
  if (status === 'low_stock') return 'low_stock';
  return 'available';
}

function resolvePrice(
  item: MenuItemPublic,
  getPriceCents?: (item: MenuItemPublic) => number,
): string {
  if (typeof getPriceCents === 'function') {
    // getPriceCents returns CENTS — use the cents-first engine formatter
    return PricingEngine.formatPrice(getPriceCents(item));
  }
  // item.price is DOLLARS — use the currency utility directly
  return formatCurrency(item.price);
}

function resolveDietBadges(item: MenuItemPublic): DietBadge[] {
  const badges: DietBadge[] = [];
  if (item.is_vegetarian) {
    badges.push({ key: 'v', label: 'V', fg: '#166534', bg: '#dcfce7' });
  }
  if (item.is_vegan) {
    badges.push({ key: 'vg', label: 'VG', fg: '#14532d', bg: '#bbf7d0' });
  }
  if (item.is_gluten_free) {
    badges.push({ key: 'gf', label: 'GF', fg: '#78350f', bg: '#fef3c7' });
  }
  if (item.spicy_level && item.spicy_level > 0) {
    badges.push({
      key: 'spicy',
      label: '🌶'.repeat(Math.min(item.spicy_level, 3)),
      fg: '#7f1d1d',
      bg: '#fee2e2',
    });
  }
  return badges;
}

/** Deterministic warm-dark gradient per item — no image flash before load */
const GRADIENTS = [
  'radial-gradient(ellipse at 40% 35%, #3e2c20 0%, #1c1208 100%)',
  'radial-gradient(ellipse at 60% 40%, #1a2a1a 0%, #0c160c 100%)',
  'radial-gradient(ellipse at 50% 30%, #2e1e0c 0%, #160e04 100%)',
  'radial-gradient(ellipse at 42% 58%, #201a2e 0%, #0e0c18 100%)',
  'radial-gradient(ellipse at 55% 44%, #2e1814 0%, #160a08 100%)',
] as const;

function pickGradient(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(h) % GRADIENTS.length];
}

// ─── Component ────────────────────────────────────────────────────────────────

function MenuItemCardInner({ item, getPriceCents, getAvailable, index = 0 }: MenuItemCardProps) {
  const { user } = useAuth();
  const { openModal } = useModal();

  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgErrored, setImgErrored] = useState(false);
  const [isOpening, setIsOpening] = useState(false);

  const availState = useMemo(() => resolveAvailability(item, getAvailable), [item, getAvailable]);
  const priceLabel = useMemo(() => resolvePrice(item, getPriceCents), [item, getPriceCents]);
  const dietBadges = useMemo(() => resolveDietBadges(item), [item]);

  const isAvailable = availState !== 'unavailable';
  const isLowStock = availState === 'low_stock';
  const showImage = Boolean(item.image_url) && !imgErrored;

  // Cap stagger at 8 items so late cards don't wait forever
  const entranceDelay = Math.min(index, 8) * 0.055;

  const handleOpen = useCallback(async () => {
    if (!isAvailable || isOpening) return;

    // Let the press animation complete before the modal opens
    setIsOpening(true);
    await new Promise<void>((r) => setTimeout(r, 110));
    setIsOpening(false);

    if (!user) {
      openModal('login');
      return;
    }
    openModal('menu-item', { data: { item } });
  }, [isAvailable, isOpening, user, openModal, item]);

  return (
    <m.article
      // ── Entrance ──────────────────────────────────────────────────────────
      initial={{ opacity: 0, y: 22, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, ease: EL, delay: entranceDelay }}
      // ── Hover lift (only when available) ──────────────────────────────────
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
                 ring-1 ring-zinc-200/70 transition-[box-shadow] duration-300"
      aria-label={item.name}
      data-available={isAvailable}
    >
      {/* ── Image block ─────────────────────────────────────────────────── */}
      <div className="relative aspect-[4/3] overflow-hidden">
        {/* Placeholder gradient — always behind image */}
        <div
          className="absolute inset-0"
          style={{ background: pickGradient(item.id) }}
          aria-hidden="true"
        />

        {/* Shimmer while image is loading */}
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

        {/* Image — CSS group-hover zoom, no extra Framer layer needed */}
        {showImage && (
          <img
            src={item.image_url!}
            alt={item.name}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full object-cover
                       scale-100 transition-[opacity,transform]
                       duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]
                       group-hover:scale-[1.06]"
            style={{ opacity: imgLoaded ? 1 : 0 }}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgErrored(true)}
          />
        )}

        {/* Bottom scrim — text legibility over image */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-12"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.32), transparent)' }}
          aria-hidden="true"
        />

        {/* Diet badges — top-left */}
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

        {/* Unavailable overlay */}
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

      {/* ── Text body ───────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        {/* Name + price row */}
        <div className="flex items-start justify-between gap-2">
          <h3
            className="min-w-0 flex-1 font-semibold leading-snug text-zinc-900"
            style={{ fontSize: '1rem' }}
          >
            {item.name}
          </h3>
          <m.span
            className="shrink-0 whitespace-nowrap font-bold tabular-nums"
            style={{
              fontSize: '1rem',
              color: 'var(--color-ember-500, #a86840)',
            }}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.42, ease: EL, delay: entranceDelay + 0.12 }}
          >
            {priceLabel}
          </m.span>
        </div>

        {/* Description */}
        {item.description && (
          <p className="line-clamp-2 text-sm font-light leading-relaxed text-zinc-500">
            {item.description}
          </p>
        )}

        {/* Low-stock warning */}
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

        {/* Push button to bottom of card */}
        <div className="flex-1" />

        {/* CTA button */}
        <m.div
          whileHover={isAvailable ? { scale: 1.025 } : undefined}
          whileTap={isAvailable ? { scale: 0.965 } : undefined}
          transition={{ duration: 0.13, ease: ES }}
        >
          <Button
            type="button"
            variant={isAvailable ? 'primary' : 'secondary'}
            size="md"
            onClick={handleOpen}
            disabled={!isAvailable}
            isLoading={isOpening}
            className="w-full"
            aria-label={
              !isAvailable
                ? `${item.name} is currently unavailable`
                : user
                  ? `Customize ${item.name}`
                  : `Sign in to order ${item.name}`
            }
          >
            {!isAvailable ? 'Unavailable' : user ? 'Customize' : 'Order Now'}
          </Button>
        </m.div>

        {/* Guest sign-in nudge */}
        <AnimatePresence>
          {!user && isAvailable && (
            <m.p
              key="guest-hint"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28, delay: 0.08 }}
              className="text-center text-[11px] text-zinc-400"
              aria-live="polite"
            >
              Sign in to customize &amp; checkout
            </m.p>
          )}
        </AnimatePresence>
      </div>
    </m.article>
  );
}

export const MenuItemCard = memo(MenuItemCardInner);
export default MenuItemCard;