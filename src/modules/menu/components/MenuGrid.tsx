// src/modules/menu/components/MenuGrid.tsx
// ============================================================================
// MENU GRID — Production (2026)
// ============================================================================
// Responsibilities:
//   - Render the item grid (loading skeleton / empty state / item list)
//   - Own the selected-item modal state
//   - Mount <MenuItemModal> and wire open/close
//   - Thread getPriceCents / getAvailable / onOpen through to each card
//
// Architecture:
//   MenuGrid (owns selectedItem state)
//     ├─ MenuItemCard × N  (stateless except animation)
//     └─ MenuItemModal      (rendered when selectedItem !== null)
//
// The parent (MenuPage) no longer needs to manage modal state — it just passes
// items and the two accessor callbacks.
// ============================================================================

import { memo, useCallback, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { AlertCircle } from 'lucide-react';

import { MenuItemCard } from '@/modules/menu/components/MenuItemCard';
import MenuItemModal from '@/modules/menu/components/MenuItemModal';
import type { MenuItemPublic } from '@/domain/menu/menu.types';

// ─── Types ───────────────────────────────────────────────────────────────────

export type MenuGridProps<TItem extends MenuItemPublic = MenuItemPublic> = {
  items: TItem[];
  loading?: boolean;
  /** Called by each card's Customize button — opens the detail modal. */
  getPriceCents: (item: TItem) => number;
  getAvailable: (item: TItem) => boolean;
  /**
   * Label for the empty-state action button (e.g. "Clear filters").
   * Only shown when the grid has no items and loading is false.
   */
  emptyHintActionLabel: string;
  onEmptyHintAction: () => void;
  className?: string;
  ariaLabel?: string;
};

/** Named `Props` for MenuPage.tsx back-compat. */
export type Props = MenuGridProps<MenuItemPublic>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// Stable skeleton keys — never changes, safe to define at module level.
const SKELETON_KEYS = Array.from(
  { length: 9 },
  (_, i) => `skeleton-${i}`,
) as readonly string[];

// ─── Skeleton ────────────────────────────────────────────────────────────────

function GridSkeleton({ className, ariaLabel }: { className?: string; ariaLabel: string }) {
  return (
    <section className={cx('space-y-3', className)} aria-label={ariaLabel} aria-busy="true">
      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {SKELETON_KEYS.map((key) => (
          <li
            key={key}
            className="list-none overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-sm"
            aria-hidden="true"
          >
            <div className="h-40 animate-pulse bg-white/5" />
            <div className="space-y-2 p-4">
              <div className="h-4 w-2/3 animate-pulse rounded bg-white/10" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-white/0.08" />
              <div className="h-8 w-full animate-pulse rounded-xl bg-white/0.08" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

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
    <section className={cx('space-y-3', className)} aria-label={ariaLabel}>
      <div className="rounded-2xl border border-white/10 bg-white/0.03 p-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
            <AlertCircle className="h-4 w-4 text-neutral-200" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">No items match your filters</p>
            <p className="mt-1 text-xs text-neutral-500">
              Try clearing filters or searching for something else.
            </p>
            <div className="mt-3">
              <button
                type="button"
                onClick={onEmptyHintAction}
                className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25"
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

// ─── Component ───────────────────────────────────────────────────────────────

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
  // ── Modal state ────────────────────────────────────────────────────────────
  // MenuGrid owns the selected-item reference. The modal is mounted/unmounted
  // here so the parent (MenuPage) has zero modal concerns.
  const [selectedItem, setSelectedItem] = useState<TItem | null>(null);

  const handleOpen = useCallback((item: TItem) => {
    setSelectedItem(item);
  }, []);

  const handleClose = useCallback(() => {
    setSelectedItem(null);
  }, []);

  // ── Stable item list ───────────────────────────────────────────────────────
  const list = useMemo(() => (Array.isArray(items) ? items : []), [items]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <GridSkeleton className={className} ariaLabel={ariaLabel} />
    );
  }

  // ── Empty ──────────────────────────────────────────────────────────────────
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

  // ── Grid ───────────────────────────────────────────────────────────────────
  return (
    <>
      <section className={cx('space-y-3', className)} aria-label={ariaLabel}>
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((item, idx) => {
            const key = stableItemKey(item, idx);

            return (
              <li
                key={key}
                className="list-none"
                // Context-menu (long-press / right-click) also opens the modal
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

        <p className="text-center text-[11px] text-neutral-500">
          Tip: press and hold (or right-click) an item for quick details.
        </p>
      </section>

      {/* Modal — rendered outside the <section> so it sits above the grid in
          the stacking context and the scroll-lock token is always per-item. */}
      {selectedItem !== null ? <MenuItemModal item={selectedItem} onClose={handleClose} /> : null}
    </>
  );
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export function MenuGrid<TItem extends MenuItemPublic>(
  props: MenuGridProps<TItem>,
): ReactElement | null {
  return MenuGridImpl(props);
}

// memo cast preserves the generic signature
const MenuGridMemo = memo(MenuGrid) as typeof MenuGrid;
export default MenuGridMemo;