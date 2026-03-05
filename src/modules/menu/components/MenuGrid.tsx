// src/modules/menu/components/MenuGrid.tsx
// ============================================================================
// MENU GRID — Production (2026) — Luxury UI + Customization Preserved
// ----------------------------------------------------------------------------
// ✅ Repo-compatible with MenuPage.tsx (does NOT break your page):
//    - Props type name is literally `Props`
//    - Supports MenuPage usage exactly:
//      items, loading?, onOpenItem, getPriceCents, getAvailable,
//      emptyHintActionLabel, onEmptyHintAction
//
// ✅ Restores “Customize” behavior by rendering MenuItemCard (your customizer UI)
//    - MenuItemCard is assumed to own “open item / modifiers / add to cart”
//    - MenuGrid stays presentational (no fetching)
//
// ✅ Still uses onOpenItem safely:
//    - Right-click / long-press (context menu) opens the MenuPage modal details,
//      without interfering with normal tap-to-customize behavior.
//
// A11y + UX:
// - Uses <ul>/<li> semantics
// - Premium empty/loading states
// - Never crashes on weird shapes
// ============================================================================

import React, { memo, useMemo } from 'react';
import { AlertCircle } from 'lucide-react';

import { MenuItemCard } from '@/modules/menu/components/MenuItemCard';

export type BaseItem = {
  id?: string;
  name?: string;
};

export type MenuGridProps<TItem extends BaseItem = BaseItem> = {
  items: TItem[];
  loading?: boolean;

  // NOTE: kept for MenuPage compatibility
  onOpenItem: (item: TItem) => void;

  getPriceCents: (item: TItem) => number;
  getAvailable: (item: TItem) => boolean;

  emptyHintActionLabel: string;
  onEmptyHintAction: () => void;

  className?: string;
  ariaLabel?: string;
};

// IMPORTANT: Your TS error expects the component's props type name to be `Props`.
export type Props = MenuGridProps<BaseItem>;

type UnknownRecord = Record<string, unknown>;

function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(' ');
}

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function safeStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function safeId(item: BaseItem, idx: number): string {
  const id = safeStr(item?.id, '').trim();
  if (id) return id;
  const name = safeStr(item?.name, '').trim();
  return name ? `name:${name}:${idx}` : `idx:${idx}`;
}

function MenuGridImpl<TItem extends BaseItem>({
  items,
  loading = false,
  onOpenItem,
  getPriceCents,
  getAvailable,
  emptyHintActionLabel,
  onEmptyHintAction,
  className,
  ariaLabel = 'Menu items',
}: MenuGridProps<TItem>): React.ReactElement | null {
  const list = useMemo(() => (Array.isArray(items) ? items : []), [items]);
  const hasItems = list.length > 0;

  if (loading) {
    return (
      <section className={cx('space-y-3', className)} aria-label={ariaLabel}>
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 9 }).map((_, i) => (
            <li
              key={i}
              className="list-none overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-sm"
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

  if (!hasItems) {
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
      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label={ariaLabel}>
        {list.map((item, idx) => {
          const key = safeId(item, idx);

          // Context menu / long-press “details”
          const onContextMenu = (e: React.MouseEvent) => {
            // Don’t show browser menu; use as “More details”
            e.preventDefault();
            onOpenItem(item);
          };

          // Avoid passing unsafe props into MenuItemCard unless they exist
          // (MenuItemCard already works in your repo with these optional props in your older grid.)
          const cardItem = item as unknown;

          return (
            <li
              key={key}
              className="list-none"
              onContextMenu={onContextMenu}
              aria-label="Menu item"
            >
              <MenuItemCard
                // MenuItemCard is expected to handle “customize” + add-to-cart
                item={cardItem as any}
                getPriceCents={getPriceCents as any}
                getAvailable={getAvailable as any}
              />
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

export function MenuGrid<TItem extends BaseItem>(props: MenuGridProps<TItem>) {
  return <MenuGridImpl {...props} />;
}

const MenuGridMemo = memo(MenuGrid) as unknown as (props: Props) => React.ReactElement | null;
export default MenuGridMemo;
