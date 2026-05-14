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
// AnimatePresence is reserved for genuinely conditional elements (availability
// overlay, low-stock badge) — not for elements present on initial render.
// =============================================================================

import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';

import type { MenuItemBase } from '@/domain/menu/menu.types';
import { PricingEngine } from '@/domain/pricing/pricing.engine';
import { formatCurrency } from '@/utils/currency';

// ─── Performance constants ────────────────────────────────────────────────────

/**
 * Cards at or below this index are treated as above-the-fold LCP candidates.
 * They receive eager loading, fetchPriority="high", and skip entrance animations
 * so the browser compositor is not blocked on first paint.
 *
 * Set to 1 → index 0 and 1 (first two cards, visible on all device widths).
 */
const ABOVE_FOLD_THRESHOLD = 1;

/** Stagger delay increment per card slot (seconds). */
const STAGGER_STEP = 0.055;

/**
 * Maximum stagger slots. Cards beyond this index receive the same max delay.
 * Prevents absurdly long waits in grids with 20+ items.
 */
const STAGGER_MAX_SLOTS = 8;

/**
 * CTA debounce window (ms). onOpen is called immediately; the button stays
 * in "Opening" state for this duration to prevent double-tap on touchscreens.
 */
const CTA_DEBOUNCE_MS = 400;

// ─── Easing curves ────────────────────────────────────────────────────────────

/** Luxury deceleration — entrances, lifts, image zoom. */
const EL = [0.16, 1, 0.3, 1] as const;
/** Spring overshoot — badges, pops, small interactive elements. */
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
   * Called immediately when the user presses the CTA button on an available item.
   * Debounced via ref to block double-tap; no artificial latency added.
   * If omitted, the button renders but is inert after the visual feedback.
   */
  onOpen?: (item: TItem) => void;
  /**
   * Stagger index for entrance animation delay (0-based).
   * Index ≤ ABOVE_FOLD_THRESHOLD → above-fold treatment (eager img, no entrance anim).
   * Capped at STAGGER_MAX_SLOTS to prevent excessive delays in long grids.
   */
  index?: number;
};

// ─── Safe field readers ───────────────────────────────────────────────────────
// All field access goes through coercion helpers. No raw property access in JSX.
// Typed against MenuItemBase (the constraint) — safe for any TItem.
//
// NOTE: These are intentionally NOT memoised in the component.
// They are O(1) string/number reads. The useMemo machinery (weak-map lookup,
// dep comparison, cache entry) costs more than the computation itself.

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

// ─── Domain helpers ───────────────────────────────────────────────────────────
// Generic over TItem to avoid contravariance errors.
// These DO benefit from useMemo: they call external engines or produce new arrays.

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
    badges.push({ key: 'spicy', label: '\u{1F336}'.repeat(spicy), fg: '#7f1d1d', bg: '#fee2e2' });
  }
  return badges;
}

/** Deterministic warm-dark gradient per item id — shown while the image loads. */
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

  // Ref-based debounce for the CTA.
  // isOpeningRef is the guard; isOpening state is cosmetic (button label only).
  // Removing isOpening from useCallback deps prevents a new callback on each
  // state flip, which would have made the debounce pointless.
  const isOpeningRef = useRef(false);

  // ── Derived values ─────────────────────────────────────────────────────────
  // O(1) reads — computed inline, not memoised (see note on field readers above).
  const id = readId(item);
  const name = readName(item);
  const description = readDescription(item);
  const imageUrl = readImageUrl(item);

  // These call external engines or produce new arrays — useMemo is justified.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const availState = useMemo(() => resolveAvailability(item, getAvailable), [item, getAvailable]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const priceLabel = useMemo(() => resolvePrice(item, getPriceCents), [item, getPriceCents]);
  const dietBadges = useMemo(() => resolveDietBadges(item), [item]);

  const isAvailable = availState !== 'unavailable';
  const isLowStock = availState === 'low_stock';
  const showImage = imageUrl !== null && !imgErrored;

  // ── Above-fold performance flags ───────────────────────────────────────────
  const isAboveFold = index <= ABOVE_FOLD_THRESHOLD;
  const staggerSlot = Math.min(index, STAGGER_MAX_SLOTS);
  const entranceDelay = isAboveFold ? 0 : staggerSlot * STAGGER_STEP;

  // ── Entrance animation props ───────────────────────────────────────────────
  // Above-fold (LCP candidates): initial={false} tells Framer Motion to render
  // the final state immediately, skipping mount animation entirely.
  // This is the official FM pattern for SSR / LCP-sensitive elements.
  const articleAnim = isAboveFold
    ? { initial: false as const }
    : {
        initial: { opacity: 0, y: 22, scale: 0.96 } as const,
        animate: { opacity: 1, y: 0, scale: 1 } as const,
        transition: { duration: 0.55, ease: EL, delay: entranceDelay },
      };

  // Child element entrance (price label, badge group).
  // Also skipped above-fold: no point animating inside an already-visible card.
  const childAnim = (extraDelay: number) =>
    isAboveFold
      ? {}
      : {
          initial: { opacity: 0, x: 8 } as const,
          animate: { opacity: 1, x: 0 } as const,
          transition: { duration: 0.38, ease: EL, delay: entranceDelay + extraDelay },
        };

  // ── CTA handler ────────────────────────────────────────────────────────────
  // onOpen is called synchronously — no artificial delay.
  // The 110 ms wait that existed previously added dead time before every modal
  // open, which is noticeable on mobile and inexcusable on slow devices.
  const handleOpen = useCallback(() => {
    if (!isAvailable || isOpeningRef.current) return;
    isOpeningRef.current = true;
    setIsOpening(true);
    onOpen?.(item);
    setTimeout(() => {
      isOpeningRef.current = false;
      setIsOpening(false);
    }, CTA_DEBOUNCE_MS);
  }, [isAvailable, onOpen, item]);
  // NOTE: isOpening (state) is intentionally absent from deps.
  // The ref is the guard; reading stale isOpening state here is harmless.

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
                 ring-1 ring-zinc-900/[0.06] transition-shadow duration-300"
      aria-label={name}
      data-available={isAvailable}
    >
      {/* ── Image block ─────────────────────────────────────────────────── */}
      {/*
        The outer div has aspect-[4/3] which reserves the exact space the image
        will occupy, preventing layout shift (CLS = 0) regardless of whether
        the image has loaded.
      */}
      <div className="relative aspect-[4/3] overflow-hidden">
        {/* Warm gradient placeholder — always present, gives CLS-safe dimensions. */}
        <div
          className="absolute inset-0"
          style={{ background: pickGradient(id) }}
          aria-hidden="true"
        />

        {/* Pulse while in-flight. Uses standard animate-pulse (no custom keyframe). */}
        {showImage && !imgLoaded && (
          <div className="absolute inset-0 animate-pulse bg-zinc-200/20" aria-hidden="true" />
        )}

        {showImage && (
          <img
            src={imageUrl}
            alt={name}
            // Stable intrinsic dimensions prevent the browser from treating
            // this as an unknown-size resource. CSS controls the actual render size.
            width={400}
            height={300}
            // Above-fold LCP images: load eagerly with high browser priority.
            // fetchPriority signals the preload scanner before the image tag is parsed.
            // Available in React 18.3+ types; works as a DOM attribute in all versions.
            loading={isAboveFold ? 'eager' : 'lazy'}
            fetchPriority={isAboveFold ? 'high' : 'auto'}
            decoding="async"
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full object-cover
                       transition-[opacity,transform] duration-700
                       ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]"
            style={{ opacity: imgLoaded ? 1 : 0 }}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgErrored(true)}
          />
        )}

        {/* Bottom vignette for text legibility on image cards. */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-12"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.28), transparent)' }}
          aria-hidden="true"
        />

        {/* Diet / spice badges. */}
        {dietBadges.length > 0 && (
          <m.div {...childAnim(0.16)} className="absolute left-2.5 top-2.5 flex flex-wrap gap-1">
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

        {/*
          Unavailability overlay.
          AnimatePresence is appropriate here: this element is conditionally
          mounted/unmounted, not just animated on first render.
        */}
        <AnimatePresence>
          {!isAvailable && (
            <m.div
              key="overlay"
              className="absolute inset-0 flex items-center justify-center
                         bg-black/45 backdrop-blur-[2px]"
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

      {/* ── Text body ───────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3
            className="min-w-0 flex-1 font-semibold leading-snug text-zinc-900"
            style={{ fontSize: '1rem' }}
          >
            {name}
          </h3>

          {/*
            Price label.
            Above-fold: plain span, no animation cost on initial paint.
            Below-fold: slides in from right with staggered delay.
          */}
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

        {/*
          Low-stock badge.
          AnimatePresence is appropriate here: conditionally mounted,
          not present on initial render of most items.
        */}
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
            // min-h-[44px] satisfies WCAG 2.5.5 minimum touch target on mobile.
            className={`min-h-[44px] w-full ${
              isAvailable ? 'btn btn-primary' : 'btn btn-ghost-dark'
            }`}
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