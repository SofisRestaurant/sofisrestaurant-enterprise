// =============================================================================
// src/modules/menu/components/MenuGrid.tsx
// =============================================================================
// MENU GRID — Production 2026
// =============================================================================
//
// Bundle architecture:
//   MenuItemModal is LAZY — its chunk (useCart, useScrollLock, preflight,
//   modifiers, image gallery, 6 utility modules) is excluded from the initial
//   menu page bundle and deferred until the first item tap.
//
//   Initial parse budget savings:   ~600 lines of modal JS
//                                 + useCart hook tree
//                                 + all modifier utilities
//                                 + MenuItemModalImage
//
//   The <Suspense> fallback is <ModalLoadingFallback>: a CSS-only backdrop +
//   amber ring spinner that renders without any JS chunk. The user sees an
//   immediate visual response while the modal chunk streams in (~50–100 ms
//   on a fast connection; cached on every repeat tap).
//
// Skeleton design:
//   Each skeleton card mirrors the exact proportions of a real MenuItemCard:
//     - aspect-[4/3] image block (CLS = 0 when real card replaces it)
//     - name + price row at matching heights
//     - two description lines (line-clamp-2 territory)
//     - action button at h-11 (44 px, matches min-h-[44px])
//   A warm shimmer sweep (zinc-100 → amber-50 → zinc-100) replaces the cold
//   grey flat-pulse and communicates the restaurant brand during load.
//   The shimmer is a CSS keyframe injected once — no Tailwind config changes.
//
// Empty state:
//   Light-mode styling consistent with MenuItemCard's bg-white context.
//   Restaurant-appropriate copy + amber CTA matching the brand palette.
//
// All grid, modal, card, selection, and focus logic is unchanged.
// =============================================================================

import { lazy, memo, Suspense, useCallback, useState } from 'react';
import type { ReactElement } from 'react';

import { MenuItemCard } from '@/modules/menu/components/MenuItemCard';
import type { MenuItemPublic } from '@/domain/menu/menu.types';

// ── Lazy modal ─────────────────────────────────────────────────────────────
//
// Vite/webpack code-split boundary. The entire MenuItemModal module tree
// is excluded from the initial bundle and fetched on demand.
//
// MenuPage also references this same import path with lazy() (as of the
// MenuPage upgrade), so the module system shares one deduplicated chunk
// between both consumers — no double download.

const MenuItemModal = lazy(() => import('@/modules/menu/components/MenuItemModal'));

// ── Keyframe injection (idempotent, SSR-safe) ──────────────────────────────
//
// Three keyframes live here so zero Tailwind config changes are required:
//   sofi-shimmer          — warm skeleton sweep (zinc → amber-tinted → zinc)
//   sofi-backdrop-in      — modal fallback backdrop fade
//   sofi-modal-loading-in — modal fallback panel slide-up
//
// The style element id ensures idempotency across HMR reloads.

const GRID_STYLE_ID = 'sofi-grid-styles';
const GRID_KF = `
  @keyframes sofi-shimmer {
    0%   { background-position: 200% center }
    100% { background-position: -200% center }
  }
  .sofi-shimmer {
    background: linear-gradient(
      90deg,
      rgb(244 244 245 / 0.85) 20%,
      rgb(255 251 235 / 0.70) 50%,
      rgb(244 244 245 / 0.85) 80%
    );
    background-size: 200% auto;
    animation: sofi-shimmer 1.8s linear infinite;
  }
  @keyframes sofi-backdrop-in {
    from { opacity: 0 }
    to   { opacity: 1 }
  }
  @keyframes sofi-modal-loading-in {
    from { opacity: 0; transform: translateY(14px) }
    to   { opacity: 1; transform: translateY(0) }
  }
`;

(function injectGridStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(GRID_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = GRID_STYLE_ID;
  el.textContent = GRID_KF;
  document.head.appendChild(el);
})();

// ── Types ──────────────────────────────────────────────────────────────────

export type MenuGridProps<TItem extends MenuItemPublic = MenuItemPublic> = {
  items: TItem[];
  loading?: boolean;
  getPriceCents: (item: TItem) => number;
  getAvailable: (item: TItem) => boolean;
  /**
   * Label for the empty-state CTA (e.g. "Clear filters").
   * Only shown when items is empty and loading is false.
   */
  emptyHintActionLabel: string;
  onEmptyHintAction: () => void;
  className?: string;
  ariaLabel?: string;
};

/** Named `Props` for MenuPage.tsx back-compat. */
export type Props = MenuGridProps<MenuItemPublic>;

// ── Utilities ──────────────────────────────────────────────────────────────

function cx(...c: Array<string | false | null | undefined>): string {
  return c.filter(Boolean).join(' ');
}

function safeStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

/**
 * Stable React key: prefers item.id, falls back to name+index, then index.
 * Stable keys prevent React from unmounting/remounting cards during filter
 * transitions, keeping images in the browser cache across re-renders.
 */
function stableItemKey(item: MenuItemPublic, idx: number): string {
  const id = safeStr(item?.id, '').trim();
  if (id) return `id:${id}`;
  const name = safeStr(item?.name, '').trim();
  return name ? `name:${name}:${idx}` : `idx:${idx}`;
}

// Module-level constant — never recreated on re-render.
const SKELETON_KEYS = Array.from({ length: 9 }, (_, i) => `skeleton-${i}`) as readonly string[];

// ── Modal loading fallback ─────────────────────────────────────────────────
//
// Renders entirely from the initial bundle — zero dependency on the lazy chunk.
// Provides immediate visual feedback when the user taps "Customize" for the
// first time and the MenuItemModal JS is still being fetched.
//
// z-[100] matches MenuItemModal's own z-100 stack layer.
// Dimensions and shape mirror the real modal so there is no jump when the
// real component replaces the fallback.

function ModalLoadingFallback() {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-5"
      role="presentation"
      aria-label="Loading item details"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
        style={{ animation: 'sofi-backdrop-in 180ms ease both' }}
      />

      {/* Panel — mirrors modal shape for zero geometry shift on swap */}
      <div
        className={cx(
          'relative z-10 flex w-full flex-col items-center justify-center gap-3',
          'max-h-[94dvh] sm:max-h-[88vh] sm:max-w-xl',
          'rounded-t-3xl sm:rounded-3xl',
          'bg-neutral-950 border border-white/6',
          'shadow-[0_-8px_40px_rgb(0_0_0/0.6)] sm:shadow-[0_24px_64px_rgb(0_0_0/0.7)]',
          'py-16',
        )}
        style={{ animation: 'sofi-modal-loading-in 280ms cubic-bezier(0.16,1,0.3,1) both' }}
      >
        {/* Mobile drag handle */}
        <div className="absolute top-3 sm:hidden" aria-hidden="true">
          <div className="h-1 w-12 rounded-full bg-white/20" />
        </div>

        {/* Amber ring spinner — matches brand accent */}
        <div
          className="h-8 w-8 rounded-full border-2 border-white/10 border-t-amber-400"
          style={{ animation: 'spin 650ms linear infinite' }}
          aria-hidden="true"
        />
        <p className="text-xs font-medium tracking-wide text-zinc-500">Loading item&hellip;</p>
      </div>
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────
//
// Pixel-faithful replica of MenuItemCard's DOM shape:
//
//   ┌─────────────────────────────────────────────┐
//   │  [  aspect-[4/3] image shimmer block      ] │
//   ├─────────────────────────────────────────────┤
//   │  p4 content                                 │
//   │  ┌──── name (68%) ────────┐  ┌─ price ──┐  │
//   │  └──── sub (42%) ─────────┘  └──────────┘  │
//   │  ── description line 1 ──────────────────── │
//   │  ── description line 2 (80%) ─────────────  │
//   │  [──────────── action button h-11 ────────]  │
//   └─────────────────────────────────────────────┘
//
// Stagger delay on each card (i * 60 ms) prevents a wall of simultaneous
// animation starts and creates a natural cascade feel.

function GridSkeleton({ className, ariaLabel }: { className?: string; ariaLabel: string }) {
  return (
    <section
      className={cx('space-y-3', className)}
      aria-label={ariaLabel}
      aria-busy="true"
      aria-live="polite"
    >
      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {SKELETON_KEYS.map((key, i) => (
          <li
            key={key}
            className={cx(
              'list-none overflow-hidden rounded-2xl bg-white',
              'ring-1 ring-zinc-900/[0.06]',
              'shadow-[0_2px_12px_rgba(26,18,9,0.07),0_1px_3px_rgba(26,18,9,0.04)]',
            )}
            aria-hidden="true"
          >
            {/* Image block — aspect-[4/3] is identical to MenuItemCard */}
            <div
              className="relative aspect-[4/3] overflow-hidden bg-zinc-100"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="sofi-shimmer absolute inset-0" />
            </div>

            {/* Content body */}
            <div className="flex flex-col gap-3 p-4">
              {/* Name + price row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div
                    className="sofi-shimmer h-[18px] rounded-lg"
                    style={{ width: '66%', animationDelay: `${i * 60 + 60}ms` }}
                  />
                  <div
                    className="sofi-shimmer h-[13px] rounded-md"
                    style={{ width: '40%', animationDelay: `${i * 60 + 90}ms` }}
                  />
                </div>
                <div
                  className="sofi-shimmer h-[18px] w-14 shrink-0 rounded-lg"
                  style={{ animationDelay: `${i * 60 + 70}ms` }}
                />
              </div>

              {/* Description lines */}
              <div className="flex flex-col gap-1.5">
                <div
                  className="sofi-shimmer h-3 w-full rounded-md"
                  style={{ animationDelay: `${i * 60 + 100}ms` }}
                />
                <div
                  className="sofi-shimmer h-3 rounded-md"
                  style={{ width: '78%', animationDelay: `${i * 60 + 120}ms` }}
                />
              </div>

              {/* Action button — h-11 = 44 px, matches min-h-[44px] on real button */}
              <div
                className="sofi-shimmer h-11 w-full rounded-xl"
                style={{ animationDelay: `${i * 60 + 140}ms` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────
//
// Light-mode styling consistent with MenuItemCard (bg-white, ring-zinc-200).
// Restaurant-appropriate copy. Amber CTA matching the brand palette.

function GridEmpty({
  className,
  ariaLabel,
  emptyHintActionLabel,
  onEmptyHintAction,
}: {
  className?: string;
  ariaLabel: string;
  emptyHintActionLabel: string;
  onEmptyHintAction: () => void;
}) {
  return (
    <section className={cx('space-y-3', className)} aria-label={ariaLabel} aria-live="polite">
      <div
        className={cx(
          'overflow-hidden rounded-2xl border border-zinc-200/80 bg-white',
          'shadow-[0_2px_12px_rgba(26,18,9,0.06),0_1px_3px_rgba(26,18,9,0.03)]',
        )}
      >
        {/* Warm gradient header stripe */}
        <div
          className="h-1.5 w-full"
          style={{
            background:
              'linear-gradient(90deg, #f59e0b 0%, #fbbf24 40%, #fde68a 70%, #f59e0b 100%)',
          }}
          aria-hidden="true"
        />

        <div className="flex flex-col items-center gap-5 p-6 text-center sm:flex-row sm:text-left">
          {/* Icon */}
          <span
            className={cx(
              'inline-flex h-14 w-14 shrink-0 items-center justify-center',
              'rounded-2xl bg-amber-50 ring-1 ring-amber-200/70',
              'text-3xl leading-none select-none',
            )}
            aria-hidden="true"
          >
            🍽
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold leading-snug text-zinc-800">
              No items match those filters
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
              Try a different category, adjust your search, or remove a filter to see more of the
              menu.
            </p>

            <div className="mt-4">
              <button
                type="button"
                onClick={onEmptyHintAction}
                className={cx(
                  'inline-flex min-h-[40px] items-center rounded-xl px-5 py-2.5',
                  'bg-amber-500 text-sm font-semibold text-white',
                  'shadow-[0_2px_10px_rgba(245,158,11,0.28)]',
                  'hover:bg-amber-400 hover:shadow-[0_4px_16px_rgba(245,158,11,0.36)]',
                  'active:scale-[0.97]',
                  'transition-all duration-150',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40',
                )}
              >
                {emptyHintActionLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

function MenuGridImpl<TItem extends MenuItemPublic>({
  items,
  loading = false,
  getPriceCents,
  getAvailable,
  emptyHintActionLabel,
  onEmptyHintAction,
  className,
  ariaLabel = 'Menu items',
}: MenuGridProps<TItem>): ReactElement | null {
  // ── Modal state ──────────────────────────────────────────────────────
  // MenuGrid owns modal state for main-grid item taps.
  // MenuPage owns a separate modal instance for PopularRail taps.
  // Both use the same lazy MenuItemModal chunk (deduplicated by Vite).
  const [selectedItem, setSelectedItem] = useState<TItem | null>(null);

  const handleOpen = useCallback((item: TItem) => {
    setSelectedItem(item);
  }, []);

  const handleClose = useCallback(() => {
    setSelectedItem(null);
  }, []);

  // ── Item list ────────────────────────────────────────────────────────
  const list = Array.isArray(items) ? items : [];

  // ── Loading ──────────────────────────────────────────────────────────
  if (loading) {
    return <GridSkeleton className={className} ariaLabel={ariaLabel} />;
  }

  // ── Empty ────────────────────────────────────────────────────────────
  if (list.length === 0) {
    return (
      <GridEmpty
        className={className}
        ariaLabel={ariaLabel}
        emptyHintActionLabel={emptyHintActionLabel}
        onEmptyHintAction={onEmptyHintAction}
      />
    );
  }

  // ── Grid ─────────────────────────────────────────────────────────────
  return (
    <>
      <section
        className={cx('space-y-3', className)}
        aria-label={ariaLabel}
        // aria-live lets screen readers announce when filter results change.
        aria-live="polite"
        aria-relevant="additions removals"
      >
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((item, idx) => {
            const key = stableItemKey(item, idx);
            return (
              <li
                key={key}
                className="list-none"
                // Right-click / long-press shortcut — opens modal without
                // requiring the user to tap "Customize" first.
                onContextMenu={(e: React.MouseEvent) => {
                  e.preventDefault();
                  handleOpen(item);
                }}
              >
                <MenuItemCard
                  item={item}
                  index={idx}
                  getPriceCents={getPriceCents}
                  getAvailable={getAvailable}
                  onOpen={handleOpen}
                />
              </li>
            );
          })}
        </ul>
      </section>

      {/*
        Lazy modal boundary.

        selectedItem check is OUTSIDE Suspense so the boundary only mounts
        when there is actually an item to display. This keeps React's suspense
        tree lean — no idle Suspense boundary in the tree during normal browsing.

        When the user taps "Customize" for the first time:
          1. selectedItem becomes non-null → Suspense mounts
          2. React detects the lazy chunk is not yet loaded → shows <ModalLoadingFallback>
          3. ModalLoadingFallback renders backdrop + spinner from initial bundle (0 ms)
          4. MenuItemModal chunk arrives (~50–100 ms) → real modal replaces fallback
          5. On all subsequent taps: chunk is cached → fallback never shows

        Modal is rendered outside <section> so it sits above the grid in the
        stacking context. Scroll-lock token is managed inside MenuItemModal.
      */}
      {selectedItem !== null && (
        <Suspense fallback={<ModalLoadingFallback />}>
          <MenuItemModal item={selectedItem} onClose={handleClose} />
        </Suspense>
      )}
    </>
  );
}

// ── Exports ────────────────────────────────────────────────────────────────

export function MenuGrid<TItem extends MenuItemPublic>(
  props: MenuGridProps<TItem>,
): ReactElement | null {
  return MenuGridImpl(props);
}

// memo cast preserves the generic signature across the wrapper.
const MenuGridMemo = memo(MenuGrid) as typeof MenuGrid;
export default MenuGridMemo;
