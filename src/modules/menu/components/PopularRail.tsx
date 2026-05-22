// =============================================================================
// src/modules/menu/components/PopularRail.tsx
// =============================================================================
// POPULAR RAIL — Sofi's Premium 2026
// =============================================================================
//
// Goals:
//   1. Mobile-first, thumb-friendly horizontal rail.
//   2. Matches the upgraded TopBar / CategoryTabs visual system.
//   3. Cream glass, espresso text, soft gold accents.
//   4. CLS-safe fixed section/card heights.
//   5. No render-time random keys.
//   6. No heavy entrance animations that delay above-fold content.
//   7. All visible card content stays inside the card before click.
// =============================================================================

import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Flame, Sparkles, Star } from 'lucide-react';

import { MenuFoodImage } from '@/modules/menu/components/MenuFoodImage';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BaseItem = {
  id?: string;
  name?: string;
  image_url?: string | null;
  imageUrl?: string | null;
  photo_url?: string | null;
  photoUrl?: string | null;
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

export type Props = PopularRailProps<BaseItem>;

// ── Constants ─────────────────────────────────────────────────────────────────

const SKELETON_KEYS = ['skel-0', 'skel-1', 'skel-2', 'skel-3'] as const;

/**
 * Card and section heights are fixed to stay CLS-safe.
 * The previous card was too short, so lower content could clip.
 */
const POPULAR_CARD_HEIGHT_CLASS = 'h-[15.75rem]';
const POPULAR_CARD_WIDTH_CLASS = 'w-[14.75rem] sm:w-[15.5rem]';
const POPULAR_IMAGE_HEIGHT_CLASS = 'h-[8.25rem]';
const POPULAR_HEADER_HEIGHT_CLASS = 'h-[3.5rem]';

export const POPULAR_SECTION_HEIGHT_CLASS = 'h-[20.25rem]';
export const POPULAR_SECTION_MIN_HEIGHT_CLASS = POPULAR_SECTION_HEIGHT_CLASS;

// ── Helpers ───────────────────────────────────────────────────────────────────

function cx(...c: Array<string | false | null | undefined>): string {
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

  return (n / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

// ── Shared visual classes ─────────────────────────────────────────────────────

const cardIdleClass = cx(
  'border border-[rgba(61,42,32,0.08)] bg-[rgba(255,255,255,0.62)] text-[#2f1f18]',
  'shadow-[0_12px_28px_rgba(46,24,12,0.08)] backdrop-blur-xl',
  'hover:border-[rgba(61,42,32,0.13)] hover:bg-white/86 hover:shadow-[0_18px_36px_rgba(46,24,12,0.13)]',
  'dark:border-white/10 dark:bg-white/[0.065] dark:text-white/86',
  'dark:hover:bg-white/10 dark:hover:text-white',
);

const cardDisabledClass = cx(
  'cursor-not-allowed border-[rgba(61,42,32,0.06)] bg-white/34 text-[#8a7468] opacity-60',
  'dark:border-white/10 dark:bg-white/[0.04] dark:text-white/40',
);

// ── Rail scroll hook ──────────────────────────────────────────────────────────

function useHorizontalRail() {
  const ref = useRef<HTMLDivElement | null>(null);

  const scrollBy = useCallback((dx: number) => {
    ref.current?.scrollBy({
      left: dx,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, []);

  const scrollToStart = useCallback(() => {
    ref.current?.scrollTo({
      left: 0,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, []);

  return { ref, scrollBy, scrollToStart };
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className={cx(
        POPULAR_CARD_HEIGHT_CLASS,
        POPULAR_CARD_WIDTH_CLASS,
        'shrink-0 overflow-hidden rounded-[1.35rem]',
        'border border-[rgba(61,42,32,0.08)] bg-white/48',
        'shadow-[0_10px_24px_rgba(46,24,12,0.055)]',
        'dark:border-white/10 dark:bg-white/[0.055]',
      )}
      aria-hidden="true"
    >
      <div
        className={cx(
          POPULAR_IMAGE_HEIGHT_CLASS,
          'animate-pulse bg-[rgba(61,42,32,0.06)] dark:bg-white/[0.07]',
        )}
      />

      <div className="space-y-2.5 p-4">
        <div className="h-3.5 w-4/5 animate-pulse rounded-full bg-[rgba(61,42,32,0.08)] dark:bg-white/[0.08]" />
        <div className="h-3 w-1/2 animate-pulse rounded-full bg-[rgba(61,42,32,0.06)] dark:bg-white/[0.06]" />
        <div className="h-6 w-20 animate-pulse rounded-full bg-[rgba(61,42,32,0.06)] dark:bg-white/[0.06]" />
      </div>
    </div>
  );
}

// ── Popular item card ─────────────────────────────────────────────────────────

type PopularCardProps = {
  name: string;
  priceCents: number;
  available: boolean;
  itemId: string;
  record: Record<string, unknown>;
  isPriority: boolean;
  onClick: () => void;
};

function PopularCard({
  name,
  priceCents,
  available,
  itemId,
  record,
  isPriority,
  onClick,
}: PopularCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!available}
      className={cx(
        POPULAR_CARD_HEIGHT_CLASS,
        POPULAR_CARD_WIDTH_CLASS,
        'group relative flex shrink-0 flex-col overflow-hidden rounded-[1.35rem] text-left',
        'transition-[transform,box-shadow,border-color,background-color] duration-300 ease-out',
        'touch-manipulation select-none',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c79a3b]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
        'dark:focus-visible:ring-offset-[#0f0d0c]',
        available ? cx(cardIdleClass, 'active:scale-[0.985]') : cardDisabledClass,
      )}
      role="listitem"
      aria-label={`${name}${available ? '' : ', unavailable'} — ${formatCents(priceCents)}`}
    >
      <div className={cx('relative w-full shrink-0 overflow-hidden', POPULAR_IMAGE_HEIGHT_CLASS)}>
        <MenuFoodImage
          record={record}
          name={name}
          itemId={itemId}
          variant="rail"
          priority={isPriority}
          decorative
          enableHoverScale={!isPriority}
          className="h-full w-full"
        />

        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-[linear-gradient(180deg,transparent,rgba(255,250,244,0.96))] dark:bg-[linear-gradient(180deg,transparent,rgba(15,13,12,0.92))]"
          aria-hidden="true"
        />

        <div
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.02),transparent_48%,rgba(46,24,12,0.10))] dark:bg-[linear-gradient(180deg,rgba(0,0,0,0.08),transparent_48%,rgba(0,0,0,0.28))]"
          aria-hidden="true"
        />

        <div className="absolute left-2.5 top-2.5 max-w-[calc(100%-1.25rem)]">
          <span
            className={cx(
              'inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1',
              'truncate text-[9.5px] font-semibold uppercase tracking-[0.11em]',
              available
                ? 'bg-[rgba(255,250,244,0.88)] text-[#3f2418] shadow-[0_8px_18px_rgba(46,24,12,0.12)] ring-1 ring-[rgba(61,42,32,0.08)] backdrop-blur-xl'
                : 'bg-white/70 text-[#8a7468] ring-1 ring-[rgba(61,42,32,0.06)]',
              'dark:bg-black/30 dark:text-[#f4dec0] dark:ring-white/10',
            )}
          >
            <Flame className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{available ? 'Popular' : 'Sold out'}</span>
          </span>
        </div>
      </div>

      {available ? (
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          aria-hidden="true"
        >
          <div className="absolute -right-8 top-8 h-28 w-28 rounded-full bg-[#c79a3b]/12 blur-3xl" />
          <div className="absolute -left-10 bottom-2 h-24 w-24 rounded-full bg-[#3f2418]/8 blur-3xl" />
        </div>
      ) : null}

      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-3.5 pb-3.5 pt-3">
        <div className="min-w-0 shrink-0">
          <p
            className={cx(
              'line-clamp-1 text-[0.95rem] font-semibold leading-snug tracking-[-0.015em]',
              available ? 'text-[#2f1f18] dark:text-white/90' : 'text-[#8a7468] dark:text-white/40',
            )}
            title={name}
          >
            {name}
          </p>

          <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
            <p
              className={cx(
                'min-w-0 truncate text-[1.05rem] font-semibold leading-none tabular-nums tracking-[-0.02em]',
                available
                  ? 'text-[#3f2418] dark:text-[#f4dec0]'
                  : 'text-[#8a7468] dark:text-white/36',
              )}
            >
              {formatCents(priceCents)}
            </p>

            {available ? (
              <span className="inline-flex max-w-[5.25rem] shrink-0 items-center gap-1 rounded-full bg-[#3f2418]/8 px-2 py-1 text-[9.5px] font-semibold leading-none text-[#3f2418] dark:bg-[#f4dec0]/10 dark:text-[#f4dec0]">
                <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">Fresh</span>
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-auto min-w-0 pt-2.5">
          {available ? (
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span className="inline-flex min-w-0 items-center gap-1.5 text-[10.5px] font-semibold leading-none text-[#7c6559] transition-colors group-hover:text-[#3f2418] dark:text-white/48 dark:group-hover:text-[#f4dec0]">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#8a5a24] shadow-[0_0_0_3px_rgba(199,154,59,0.14)] dark:bg-[#f4dec0]"
                  aria-hidden="true"
                />
                <span className="truncate">Tap to customize</span>
              </span>

              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#3f2418] text-[#fff8ee] shadow-[0_8px_18px_rgba(63,36,24,0.18)] transition-transform duration-300 group-hover:translate-x-0.5 dark:bg-[#f4dec0] dark:text-[#21130d]"
                aria-hidden="true"
              >
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
            </div>
          ) : (
            <span className="block truncate text-[10.5px] font-semibold leading-none text-[#8a3a24] dark:text-[#f4dec0]/60">
              Currently unavailable
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Scroll arrow button ───────────────────────────────────────────────────────

function ScrollArrow({ direction, onClick }: { direction: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'hidden h-9 w-9 items-center justify-center rounded-full sm:inline-flex',
        'border border-[rgba(61,42,32,0.08)] bg-[rgba(255,255,255,0.58)] text-[#4d382e]',
        'shadow-[0_8px_18px_rgba(46,24,12,0.055)] backdrop-blur-xl',
        'transition-[background-color,color,box-shadow,transform] duration-200 ease-out',
        'hover:bg-white/78 hover:text-[#2f1f18] active:scale-[0.94]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c79a3b]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
        'dark:border-white/10 dark:bg-white/[0.065] dark:text-white/72 dark:hover:bg-white/10 dark:hover:text-white dark:focus-visible:ring-offset-[#0f0d0c]',
      )}
      aria-label={`Scroll popular items ${direction}`}
    >
      {direction === 'left' ? (
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      ) : (
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyRail({
  emptyHintActionLabel,
  onEmptyHintAction,
}: {
  emptyHintActionLabel: string;
  onEmptyHintAction: () => void;
}) {
  return (
    <div
      className={cx(
        'flex h-full items-center rounded-[1.35rem] p-4 sm:p-5',
        'border border-[rgba(61,42,32,0.08)] bg-[rgba(255,255,255,0.58)]',
        'shadow-[0_10px_24px_rgba(46,24,12,0.055)] backdrop-blur-xl',
        'dark:border-white/10 dark:bg-white/[0.055]',
      )}
    >
      <div className="flex w-full min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-[-0.01em] text-[#2f1f18] dark:text-white/90">
            Nothing trending yet
          </p>

          <p className="mt-1 line-clamp-2 text-xs font-medium leading-relaxed text-[#7c6559] dark:text-white/52">
            Browse the full menu or clear active filters.
          </p>
        </div>

        <button
          type="button"
          onClick={onEmptyHintAction}
          className={cx(
            'shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold',
            'bg-[#3f2418] text-[#fff8ee] shadow-[0_8px_18px_rgba(63,36,24,0.18)]',
            'transition-[background-color,color,box-shadow,transform] duration-200 ease-out',
            'hover:bg-[#2f1f18] active:scale-[0.985]',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c79a3b]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
            'dark:bg-[#f4dec0] dark:text-[#21130d] dark:focus-visible:ring-offset-[#0f0d0c]',
          )}
        >
          {emptyHintActionLabel}
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

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
    if (hasItems) scrollToStart();
  }, [hasItems, list.length, scrollToStart]);

  return (
    <section
      className={cx(POPULAR_SECTION_HEIGHT_CLASS, 'flex flex-col gap-4 overflow-hidden', className)}
      aria-label={ariaLabel}
      aria-busy={loading}
    >
      <div
        className={cx(
          POPULAR_HEADER_HEIGHT_CLASS,
          'flex shrink-0 items-center justify-between gap-3',
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative shrink-0">
            <div
              className={cx(
                'flex h-10 w-10 items-center justify-center rounded-[1rem]',
                'bg-[#3f2418] text-[#fff8ee]',
                'shadow-[0_10px_24px_rgba(63,36,24,0.18),inset_0_1px_0_rgba(255,255,255,0.16)]',
                'dark:bg-[#f4dec0] dark:text-[#21130d]',
              )}
            >
              <Star className="h-[18px] w-[18px] fill-current" aria-hidden="true" />
            </div>

            <div
              className="pointer-events-none absolute inset-0 rounded-[1rem] bg-[#c79a3b]/22 blur-xl"
              aria-hidden="true"
            />
          </div>

          <div className="min-w-0">
            <p className="truncate text-base font-semibold leading-none tracking-[-0.02em] text-[#2f1f18] dark:text-white">
              {title}
            </p>

            <p className="mt-1 truncate text-xs font-medium text-[#7c6559] dark:text-white/50">
              {subtitle}
            </p>
          </div>
        </div>

        <div className="flex h-9 min-w-[4.75rem] items-center justify-end gap-1.5">
          {hasItems && !loading ? (
            <>
              <ScrollArrow direction="left" onClick={() => scrollBy(-360)} />
              <ScrollArrow direction="right" onClick={() => scrollBy(360)} />
            </>
          ) : null}
        </div>
      </div>

      <div className={cx(POPULAR_CARD_HEIGHT_CLASS, 'shrink-0 overflow-hidden')}>
        {loading ? (
          <div className="flex h-full gap-3 overflow-hidden" aria-hidden="true">
            {SKELETON_KEYS.map((key) => (
              <SkeletonCard key={key} />
            ))}
          </div>
        ) : !hasItems ? (
          <EmptyRail
            emptyHintActionLabel={emptyHintActionLabel}
            onEmptyHintAction={onEmptyHintAction}
          />
        ) : (
          <div
            ref={ref}
            className={cx(
              'scrollbar-hide flex h-full snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain',
              '-mx-1 px-1 pb-1 [-webkit-overflow-scrolling:touch]',
            )}
            style={{ scrollbarWidth: 'none' }}
            role="list"
            tabIndex={0}
            aria-label="Popular items list"
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') {
                e.preventDefault();
                scrollBy(-240);
              }

              if (e.key === 'ArrowRight') {
                e.preventDefault();
                scrollBy(240);
              }

              if (e.key === 'Home') {
                e.preventDefault();
                scrollToStart();
              }
            }}
          >
            {list.map((it, idx) => {
              const id = safeId(it, idx);

              return (
                <PopularCard
                  key={id}
                  name={safeStr(it?.name, 'Item')}
                  priceCents={getPriceCents(it)}
                  available={getAvailable(it)}
                  itemId={id}
                  record={it as unknown as Record<string, unknown>}
                  isPriority={idx === 0}
                  onClick={() => onOpenItem(it)}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Exports ───────────────────────────────────────────────────────────────────

export function PopularRail<TItem extends BaseItem>(props: PopularRailProps<TItem>) {
  return <PopularRailImpl {...props} />;
}

const PopularRailMemo = memo(PopularRail) as unknown as (props: Props) => React.ReactElement | null;

export default PopularRailMemo;