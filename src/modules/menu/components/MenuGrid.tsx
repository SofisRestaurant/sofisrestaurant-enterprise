// =============================================================================
// src/modules/menu/components/MenuGrid.tsx
// =============================================================================
// MENU GRID — Production 2026 (compact list-card redesign)
// =============================================================================
//
// Bundle architecture (unchanged):
//   MenuItemModal is LAZY — chunk deferred until first item tap.
//   <Suspense> fallback is <ModalLoadingFallback> — CSS-only, zero JS dep.
//
// Skeleton design (updated for list-card):
//   Each skeleton mirrors the compact horizontal list-card shape:
//     - Left text block: name + 2 desc lines + price/button row
//     - Right thumbnail: fixed w-24 / sm:w-[120px]
//     - rounded-[18px] corners matching real cards
//   Warm shimmer sweep (unchanged from prior version).
//
// Grid layout:
//   - Mobile:  single column, tight 12px gap
//   - Desktop: 2-column grid, 16px gap
//   - More items visible above the fold than the old 3-col card grid
//
// Empty state:
//   Light-mode styling, amber brand CTA (unchanged).
//
// All modal, selection, and focus logic unchanged.
// =============================================================================

import { lazy, memo, Suspense, useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import { MenuItemCard } from '@/modules/menu/components/MenuItemCard';
import type { MenuItemPublic } from '@/domain/menu/menu.types';
import { useMenuUi } from '@/modules/menu/store/menuUi.store';

// ── Lazy modal ─────────────────────────────────────────────────────────────

const MenuItemModal = lazy(() => import('@/modules/menu/components/MenuItemModal'));

// ── Keyframe injection (idempotent, SSR-safe) ──────────────────────────────

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

function stableItemKey(item: MenuItemPublic, idx: number): string {
  const id = safeStr(item?.id, '').trim();
  if (id) return `id:${id}`;
  const name = safeStr(item?.name, '').trim();
  return name ? `name:${name}:${idx}` : `idx:${idx}`;
}

const SKELETON_KEYS = Array.from({ length: 8 }, (_, i) => `skeleton-${i}`) as readonly string[];

// ── Modal loading fallback ─────────────────────────────────────────────────

function ModalLoadingFallback() {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-5"
      role="presentation"
      aria-label="Loading item details"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
        style={{ animation: 'sofi-backdrop-in 180ms ease both' }}
      />
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
        <div className="absolute top-3 sm:hidden" aria-hidden="true">
          <div className="h-1 w-12 rounded-full bg-white/20" />
        </div>
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
// Mirrors the compact horizontal list-card shape:
//
//   ┌──────────────────────────────────┬──────────┐
//   │  name shimmer (60%)             │          │
//   │  desc line 1 (100%)             │ thumb    │
//   │  desc line 2 (75%)              │ shimmer  │
//   │  [price] ................ [+btn]│          │
//   └──────────────────────────────────┴──────────┘

function GridSkeleton({ className, ariaLabel }: { className?: string; ariaLabel: string }) {
  return (
    <section
      className={cx('space-y-3', className)}
      aria-label={ariaLabel}
      aria-busy="true"
      aria-live="polite"
    >
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        {SKELETON_KEYS.map((key, i) => (
          <li
            key={key}
            className={cx(
              'list-none flex items-stretch overflow-hidden rounded-[18px] bg-white',
              'ring-1 ring-zinc-900/[0.05]',
              'shadow-[0_1px_4px_rgba(26,18,9,0.06),0_0.5px_1.5px_rgba(26,18,9,0.03)]',
            )}
            aria-hidden="true"
          >
            {/* Text block */}
            <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 p-3.5 sm:p-4">
              <div
                className="sofi-shimmer h-[16px] rounded-lg"
                style={{ width: '58%', animationDelay: `${i * 50}ms` }}
              />
              <div className="flex flex-col gap-1.5">
                <div
                  className="sofi-shimmer h-[11px] w-full rounded-md"
                  style={{ animationDelay: `${i * 50 + 40}ms` }}
                />
                <div
                  className="sofi-shimmer h-[11px] rounded-md"
                  style={{ width: '72%', animationDelay: `${i * 50 + 60}ms` }}
                />
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <div
                  className="sofi-shimmer h-[16px] w-12 rounded-lg"
                  style={{ animationDelay: `${i * 50 + 80}ms` }}
                />
                <div
                  className="sofi-shimmer h-9 w-9 rounded-full"
                  style={{ animationDelay: `${i * 50 + 90}ms` }}
                />
              </div>
            </div>

            {/* Thumbnail placeholder */}
            <div className="relative w-24 shrink-0 overflow-hidden bg-zinc-100 sm:w-[120px]">
              <div
                className="sofi-shimmer absolute inset-0"
                style={{ animationDelay: `${i * 50 + 30}ms` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────

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
          'overflow-hidden rounded-[18px] border border-zinc-200/80 bg-white',
          'shadow-[0_1px_4px_rgba(26,18,9,0.06),0_0.5px_1.5px_rgba(26,18,9,0.03)]',
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
  const [selectedItem, setSelectedItem] = useState<TItem | null>(null);
  const setMenuItemModalOpen = useMenuUi((s) => s.setMenuItemModalOpen);

  useEffect(() => {
    setMenuItemModalOpen(selectedItem !== null);
    return () => setMenuItemModalOpen(false);
  }, [selectedItem, setMenuItemModalOpen]);

  const handleOpen = useCallback((item: TItem) => {
    setSelectedItem(item);
  }, []);

  const handleClose = useCallback(() => {
    setSelectedItem(null);
  }, []);

  const list = Array.isArray(items) ? items : [];

  if (loading) {
    return <GridSkeleton className={className} ariaLabel={ariaLabel} />;
  }

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

  return (
    <>
      <section
        className={cx('space-y-3', className)}
        aria-label={ariaLabel}
        aria-live="polite"
        aria-relevant="additions removals"
      >
        {/* 1-col mobile, 2-col sm+. Tighter gap than old 3-col card grid. */}
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          {list.map((item, idx) => {
            const key = stableItemKey(item, idx);
            return (
              <li
                key={key}
                className="list-none"
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

const MenuGridMemo = memo(MenuGrid) as typeof MenuGrid;
export default MenuGridMemo;