// src/modules/menu/components/PopularRail.tsx
// ============================================================================
// POPULAR RAIL — Production (2026) — Repo-Compatible, A11y-first
// ----------------------------------------------------------------------------
// Fixes your MenuPage.tsx error:
// ✅ The component props type is literally named `Props` and INCLUDES `onOpenItem`.
//    (Your TS error references `IntrinsicAttributes & Props` — so we match that.)
// ✅ No `JSX.Element` usage (avoids "Cannot find namespace 'JSX'").
// ✅ Exports BOTH:
//    - Named export:  import { PopularRail } from ...
//    - Default export: import PopularRail from ...
// ----------------------------------------------------------------------------
// Design goals:
// - Presentational only (parent decides what "popular" means)
// - Horizontal rail with keyboard support (← → Home)
// - Safe defaults + no crashes on odd data
// ============================================================================

import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Flame, Star } from 'lucide-react';

export type BaseItem = {
  id?: string;
  name?: string;
};

export type PopularRailProps<TItem extends BaseItem = BaseItem> = {
  items: TItem[];
  onOpenItem: (item: TItem) => void;
  getPriceCents: (item: TItem) => number;
  getAvailable: (item: TItem) => boolean;

  emptyHintActionLabel: string;
  onEmptyHintAction: () => void;

  className?: string;
  title?: string;
  subtitle?: string;
  maxItems?: number;
  loading?: boolean;
  ariaLabel?: string;
};

// IMPORTANT: Your TS error expects the component's props type name to be `Props`.
export type Props = PopularRailProps<BaseItem>;

function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(' ');
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
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

function formatCents(cents: number): string {
  const n = Number.isFinite(cents) ? Math.max(0, Math.round(cents)) : 0;
  return (n / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function useHorizontalRail() {
  const ref = useRef<HTMLDivElement | null>(null);

  const scrollBy = useCallback((dx: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dx, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, []);

  const scrollToStart = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ left: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, []);

  return { ref, scrollBy, scrollToStart };
}

function PopularRailImpl<TItem extends BaseItem>({
  items,
  onOpenItem,
  getPriceCents,
  getAvailable,
  emptyHintActionLabel,
  onEmptyHintAction,
  className,
  title = 'Popular',
  subtitle = 'Fan favorites and top picks',
  maxItems = 12,
  loading = false,
  ariaLabel = 'Popular items',
}: PopularRailProps<TItem>): React.ReactElement | null {
  const { ref, scrollBy, scrollToStart } = useHorizontalRail();

  const list = useMemo(() => {
    const arr = Array.isArray(items) ? items : [];
    const cap = Math.max(0, Math.min(maxItems, 50));
    return arr.slice(0, cap);
  }, [items, maxItems]);

  const hasItems = list.length > 0;

  useEffect(() => {
    if (!hasItems) return;
    scrollToStart();
  }, [hasItems, list.length, scrollToStart]);

  const headerRight = useMemo(() => {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => scrollBy(-360)}
          className={cx(
            'hidden sm:inline-flex',
            'rounded-lg border border-white/10 bg-white/5 p-2 text-neutral-200',
            'hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-amber-500/25',
          )}
          aria-label="Scroll popular items left"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => scrollBy(360)}
          className={cx(
            'hidden sm:inline-flex',
            'rounded-lg border border-white/10 bg-white/5 p-2 text-neutral-200',
            'hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-amber-500/25',
          )}
          aria-label="Scroll popular items right"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  }, [scrollBy]);

  return (
    <section className={cx('space-y-3', className)} aria-label={ariaLabel}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/15 ring-1 ring-amber-500/25">
            <Star className="h-4 w-4 text-amber-300" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">{title}</p>
            <p className="text-[11px] text-neutral-500">{subtitle}</p>
          </div>
        </div>
        {headerRight}
      </div>

      {loading ? (
        <div className="flex gap-3 overflow-hidden" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-28 w-56 shrink-0 animate-pulse rounded-2xl border border-white/10 bg-white/5"
            />
          ))}
        </div>
      ) : !hasItems ? (
        <div className="rounded-2xl border border-white/10 bg-white/3 p-4 text-sm text-neutral-300">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-white">Nothing popular to show yet</p>
              <p className="mt-1 text-xs text-neutral-500">
                Try browsing the full menu or clear filters.
              </p>
            </div>
            <button
              type="button"
              onClick={onEmptyHintAction}
              className="shrink-0 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-amber-500/25"
            >
              {emptyHintActionLabel}
            </button>
          </div>
        </div>
      ) : (
        <div
          ref={ref}
          className={cx(
            'flex gap-3 overflow-x-auto pb-2',
            'scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent',
          )}
          role="list"
          tabIndex={0}
          aria-label="Popular list"
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              scrollBy(-240);
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              scrollBy(240);
            } else if (e.key === 'Home') {
              e.preventDefault();
              scrollToStart();
            }
          }}
        >
          {list.map((it, idx) => {
            const name = safeStr(it?.name, 'Item');
            const priceCents = getPriceCents(it);
            const available = getAvailable(it);

            return (
              <button
                key={safeId(it, idx)}
                type="button"
                onClick={() => onOpenItem(it)}
                disabled={!available}
                className={cx(
                  'group relative w-56 shrink-0 overflow-hidden rounded-2xl border border-white/10',
                  'bg-white/5 p-4 text-left shadow-sm transition',
                  'hover:bg-white/8 hover:border-white/15',
                  'focus:outline-none focus:ring-2 focus:ring-amber-500/25',
                  !available &&
                    'cursor-not-allowed opacity-60 hover:bg-white/5 hover:border-white/10',
                )}
                role="listitem"
                aria-label={`Popular item: ${name}${available ? '' : ', unavailable'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{name}</p>
                    <p className="mt-1 text-xs text-neutral-500 tabular-nums">
                      {formatCents(priceCents)}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 text-[10px] font-bold text-neutral-200">
                    <Flame className="h-3 w-3" aria-hidden="true" />
                    POPULAR
                  </span>
                </div>

                {!available ? (
                  <p className="mt-3 text-[11px] font-semibold text-red-200">Out of stock</p>
                ) : (
                  <p className="mt-3 text-[11px] text-neutral-500">Tap for details</p>
                )}

                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/5 blur-2xl transition group-hover:bg-white/8"
                />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ✅ Named export (generic-friendly)
export function PopularRail<TItem extends BaseItem>(props: PopularRailProps<TItem>) {
  return <PopularRailImpl {...props} />;
}

// ✅ Default export (memoized). If you need generics at call sites, prefer the named export.
const PopularRailMemo = memo(PopularRail) as unknown as (props: Props) => React.ReactElement | null;
export default PopularRailMemo;
