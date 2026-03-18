// src/modules/menu/components/MenuGrid.tsx
// ============================================================================
// MENU GRID — Production (2026) — Luxury UI + Customization Preserved
// ============================================================================

import { memo, useMemo } from 'react';
import type { ReactElement } from 'react';
import { AlertCircle } from 'lucide-react';
import { MenuItemCard } from '@/modules/menu/components/MenuItemCard';
import type { MenuItemPublic } from '@/domain/menu/menu.types';

// ─── Types ───────────────────────────────────────────────────────────────────

export type MenuGridProps<TItem extends MenuItemPublic = MenuItemPublic> = {
  items: TItem[];
  loading?: boolean;
  onOpenItem: (item: TItem) => void;
  getPriceCents: (item: TItem) => number;
  getAvailable: (item: TItem) => boolean;
  emptyHintActionLabel: string;
  onEmptyHintAction: () => void;
  className?: string;
  ariaLabel?: string;
};

/** Named `Props` for MenuPage.tsx compatibility. */
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

const SKELETON_KEYS = Array.from({ length: 9 }, (_, i) => `skeleton-${i}`) as readonly string[];

// ─── Component ───────────────────────────────────────────────────────────────

function MenuGridImpl<TItem extends MenuItemPublic>({
  items,
  loading = false,
  onOpenItem,
  getPriceCents,
  getAvailable,
  emptyHintActionLabel,
  onEmptyHintAction,
  className,
  ariaLabel = 'Menu items',
}: MenuGridProps<TItem>): ReactElement | null {
  const list = useMemo(() => (Array.isArray(items) ? items : []), [items]);

  if (loading) {
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
                <div className="h-3 w-1/3 animate-pulse rounded bg-white/8" />
                <div className="h-8 w-full animate-pulse rounded-xl bg-white/8" />
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (list.length === 0) {
    return (
      <section className={cx('space-y-3', className)} aria-label={ariaLabel}>
        <div className="rounded-2xl border border-white/10 bg-white/3 p-5">
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
                  className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-amber-500/25"
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

  return (
    <section className={cx('space-y-3', className)} aria-label={ariaLabel}>
      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((item, idx) => {
          const key = stableItemKey(item, idx);

          const handleContextMenu = (e: React.MouseEvent) => {
            e.preventDefault();
            onOpenItem(item);
          };

          return (
            <li key={key} className="list-none" onContextMenu={handleContextMenu}>
              <MenuItemCard item={item} getPriceCents={getPriceCents} getAvailable={getAvailable} />
            </li>
          );
        })}
      </ul>

      <p className="text-center text-[11px] text-neutral-500">
        Tip: press and hold (or right-click) an item for quick details.
      </p>
    </section>
  );
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export function MenuGrid<TItem extends MenuItemPublic>(
  props: MenuGridProps<TItem>
): ReactElement | null {
  return MenuGridImpl(props);
}

const MenuGridMemo = memo(MenuGrid) as typeof MenuGrid;
export default MenuGridMemo;