// =============================================================================
// src/modules/menu/components/PopularRail.tsx
// =============================================================================
// Popular rail - Sofi's premium horizontal item rail.
// iOS 2026 glass design. Theme values live in tokens.css.
// Typography intentionally avoids <p> inside cards so global typography.css
// paragraph color rules cannot override component text colors.
// =============================================================================

import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Flame, Sparkles, Star } from 'lucide-react';

import { MenuFoodImage } from '@/modules/menu/components/MenuFoodImage';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

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

type PopularCardProps<TItem extends BaseItem> = {
  item: TItem;
  index: number;
  itemId: string;
  name: string;
  priceLabel: string;
  available: boolean;
  onOpenItem: (item: TItem) => void;
};

type RailArrowProps = {
  direction: 'left' | 'right';
  onClick: () => void;
};

type EmptyRailProps = {
  emptyHintActionLabel: string;
  onEmptyHintAction: () => void;
};

type PopularRailHeaderProps = {
  title: string;
  subtitle: string;
  showControls: boolean;
  onScrollLeft: () => void;
  onScrollRight: () => void;
};

type PreparedItem<TItem extends BaseItem> = {
  item: TItem;
  itemId: string;
  name: string;
  priceLabel: string;
  available: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SKELETON_KEYS = [
  'popular-skeleton-0',
  'popular-skeleton-1',
  'popular-skeleton-2',
  'popular-skeleton-3',
] as const;

const CARD_HEIGHT = 'h-[15.85rem]';
const CARD_WIDTH = 'w-[14.85rem] sm:w-[15.65rem]';
const IMAGE_HEIGHT = 'h-[8.25rem]';
const HEADER_HEIGHT = 'h-[3.65rem]';

export const POPULAR_SECTION_HEIGHT_CLASS = 'h-[20.5rem]';
export const POPULAR_SECTION_MIN_HEIGHT_CLASS = POPULAR_SECTION_HEIGHT_CLASS;

const DEFAULT_TITLE = 'Popular';
const DEFAULT_SUBTITLE = 'Fan favorites and top picks';
const DEFAULT_ARIA_LABEL = 'Popular items';
const MAX_RENDERED_ITEMS = 50;

const SCROLL_DESKTOP_AMOUNT = 360;
const SCROLL_KEYBOARD_AMOUNT = 240;

// ─────────────────────────────────────────────────────────────────────────────
// Class recipes
// ─────────────────────────────────────────────────────────────────────────────

const cardBaseClass = cx(
  CARD_HEIGHT,
  CARD_WIDTH,
  'group relative flex shrink-0 flex-col overflow-hidden rounded-[1.55rem] border text-left',
  'touch-manipulation select-none bg-[var(--popular-rail-card-bg)]',
  'border-[var(--popular-rail-card-border)] shadow-[var(--popular-rail-card-shadow)]',
  'backdrop-blur-2xl [-webkit-backdrop-filter:blur(22px)]',
  'transition-[transform,box-shadow,border-color,background-color] duration-300 ease-out',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--menu-modal-focus-ring)]',
  'focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0f0d0c]',
);

const cardAvailableClass = cx(
  'hover:-translate-y-0.5 hover:bg-[var(--popular-rail-card-bg-hover)]',
  'hover:shadow-[var(--popular-rail-card-shadow-hover)] active:scale-[0.985]',
);

const cardUnavailableClass = 'cursor-not-allowed opacity-55';

const glassSurfaceClass = cx(
  'border border-[var(--popular-rail-surface-border)] bg-[var(--popular-rail-surface-bg)]',
  'shadow-[var(--popular-rail-card-shadow)] backdrop-blur-2xl [-webkit-backdrop-filter:blur(22px)]',
);

const iconTileClass = cx(
  'flex items-center justify-center rounded-[1.15rem]',
  'bg-[var(--popular-rail-icon-bg)] text-[var(--popular-rail-icon-text)]',
  'shadow-[0_14px_30px_rgba(63,36,24,0.18),inset_0_1px_0_rgba(255,255,255,0.18)]',
);

const imageFadeClass =
  'pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-[var(--popular-rail-image-fade)]';

const imageShadeClass = 'pointer-events-none absolute inset-0 bg-[var(--popular-rail-image-shade)]';

const railListClass = cx(
  'scrollbar-hide flex h-full snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden',
  'overscroll-x-contain overscroll-y-none -mx-1 px-1 pb-1 [-webkit-overflow-scrolling:touch]',
);

const railTextBaseClass = cx('font-sans antialiased', '[font-feature-settings:"kern"_1,"liga"_1]');

const itemTitleClass = cx(
  railTextBaseClass,
  'block line-clamp-1 text-[1rem] font-black leading-[1.15] tracking-[-0.025em]',
  'text-[var(--popular-rail-text)]',
);

const itemPriceClass = cx(
  railTextBaseClass,
  'block min-w-0 truncate text-[1.15rem] font-black leading-none tabular-nums tracking-[-0.04em]',
  'text-[var(--popular-rail-accent)]',
);

const itemMetaClass = cx(
  railTextBaseClass,
  'inline-flex min-w-0 items-center gap-1.5 text-[10.75px] font-black leading-none',
  'text-[var(--popular-rail-muted)]',
);

const itemMutedClass = cx(
  railTextBaseClass,
  'block truncate text-[10.75px] font-black leading-none',
  'text-[var(--popular-rail-muted)]',
);

const headerTitleClass = cx(
  railTextBaseClass,
  'block truncate text-base font-black leading-none tracking-[-0.025em]',
  'text-[var(--popular-rail-text)]',
);

const headerSubtitleClass = cx(
  railTextBaseClass,
  'mt-1 block truncate text-xs font-bold leading-tight',
  'text-[var(--popular-rail-muted)]',
);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true;

  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;
  }
}

function safeStr(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function safeId(item: BaseItem, index: number): string {
  const id = safeStr(item.id).trim();
  if (id) return id;

  const name = safeStr(item.name).trim();
  return name ? `name:${name}:${index}` : `idx:${index}`;
}

function formatCents(cents: number): string {
  const safeCents = Number.isFinite(cents) ? Math.max(0, Math.round(cents)) : 0;

  return (safeCents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

function useHorizontalRail() {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduceMotionRef = useRef(prefersReducedMotion());

  const scrollBy = useCallback((left: number) => {
    ref.current?.scrollBy({
      left,
      behavior: reduceMotionRef.current ? 'auto' : 'smooth',
    });
  }, []);

  const scrollToStart = useCallback(() => {
    ref.current?.scrollTo({
      left: 0,
      behavior: reduceMotionRef.current ? 'auto' : 'smooth',
    });
  }, []);

  return { ref, scrollBy, scrollToStart };
}

// ─────────────────────────────────────────────────────────────────────────────
// Small UI pieces
// ─────────────────────────────────────────────────────────────────────────────

const PopularBadge = memo(function PopularBadge({ available }: { available: boolean }) {
  return (
    <span
      className={cx(
        railTextBaseClass,
        'inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1',
        'truncate text-[9.5px] font-black uppercase leading-none tracking-[0.11em]',
        'bg-[var(--popular-rail-pill-bg)] text-[var(--popular-rail-pill-text)]',
        'ring-1 ring-[var(--popular-rail-pill-border)]',
        'shadow-[0_10px_24px_rgba(0,0,0,0.10)] backdrop-blur-2xl',
      )}
    >
      <Flame className="h-3 w-3 shrink-0 text-current" aria-hidden="true" />
      <span className="truncate">{available ? 'Popular' : 'Sold out'}</span>
    </span>
  );
});

const FreshPill = memo(function FreshPill() {
  return (
    <span
      className={cx(
        railTextBaseClass,
        'inline-flex max-w-[5.35rem] shrink-0 items-center gap-1 rounded-full px-2.5 py-1',
        'border border-[var(--popular-rail-card-border)]',
        'bg-[var(--popular-rail-surface-bg)] text-[9.5px] font-black leading-none',
        'text-[var(--popular-rail-muted)] backdrop-blur-xl',
      )}
    >
      <Sparkles className="h-3 w-3 shrink-0 text-[var(--popular-rail-accent)]" aria-hidden="true" />
      <span className="truncate">Fresh</span>
    </span>
  );
});

const CardArrow = memo(function CardArrow() {
  return (
    <span
      className={cx(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
        'bg-[var(--popular-rail-icon-bg)] text-[var(--popular-rail-icon-text)]',
        'shadow-[0_10px_22px_rgba(63,36,24,0.20)]',
        'transition-transform duration-300 group-hover:translate-x-0.5',
      )}
      aria-hidden="true"
    >
      <ChevronRight className="h-3.5 w-3.5 text-current" strokeWidth={2.6} />
    </span>
  );
});

const SkeletonCard = memo(function SkeletonCard() {
  return (
    <div
      className={cx(
        CARD_HEIGHT,
        CARD_WIDTH,
        'shrink-0 overflow-hidden rounded-[1.55rem]',
        glassSurfaceClass,
      )}
      aria-hidden="true"
    >
      <div className={cx(IMAGE_HEIGHT, 'animate-pulse bg-black/[0.06] dark:bg-white/[0.07]')} />

      <div className="space-y-2.5 p-4">
        <div className="h-3.5 w-4/5 animate-pulse rounded-full bg-black/[0.08] dark:bg-white/[0.08]" />
        <div className="h-3 w-1/2 animate-pulse rounded-full bg-black/[0.06] dark:bg-white/[0.06]" />
        <div className="h-6 w-20 animate-pulse rounded-full bg-black/[0.06] dark:bg-white/[0.06]" />
      </div>
    </div>
  );
});

const RailArrow = memo(function RailArrow({ direction, onClick }: RailArrowProps) {
  const Icon = direction === 'left' ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'hidden h-9 w-9 items-center justify-center rounded-full border sm:inline-flex',
        'border-[var(--popular-rail-surface-border)] bg-[var(--popular-rail-surface-bg)]',
        'text-[var(--popular-rail-muted)] shadow-[0_10px_24px_rgba(46,24,12,0.08)]',
        'backdrop-blur-2xl [-webkit-backdrop-filter:blur(22px)]',
        'transition-[background-color,color,box-shadow,transform] duration-200 ease-out',
        'hover:bg-[var(--popular-rail-surface-bg-hover)] hover:text-[var(--popular-rail-text)] active:scale-[0.94]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--menu-modal-focus-ring)]',
        'focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0f0d0c]',
      )}
      aria-label={`Scroll popular items ${direction}`}
    >
      <Icon className="h-4 w-4 text-current" aria-hidden="true" />
    </button>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Card
// ─────────────────────────────────────────────────────────────────────────────

const PopularCard = memo(function PopularCard<TItem extends BaseItem>({
  item,
  index,
  itemId,
  name,
  priceLabel,
  available,
  onOpenItem,
}: PopularCardProps<TItem>) {
  const handleClick = useCallback(() => {
    onOpenItem(item);
  }, [item, onOpenItem]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!available}
      className={cx(cardBaseClass, available ? cardAvailableClass : cardUnavailableClass)}
      role="listitem"
      aria-label={`${name}${available ? '' : ', unavailable'} - ${priceLabel}`}
    >
      <div className={cx('relative w-full shrink-0 overflow-hidden', IMAGE_HEIGHT)}>
        <MenuFoodImage
          record={item as unknown as Record<string, unknown>}
          name={name}
          itemId={itemId}
          variant="rail"
          priority={index === 0}
          decorative
          enableHoverScale={index !== 0}
          className="h-full w-full"
        />

        <div className={imageFadeClass} aria-hidden="true" />
        <div className={imageShadeClass} aria-hidden="true" />

        <div className="absolute left-2.5 top-2.5 z-10 max-w-[calc(100%-1.25rem)]">
          <PopularBadge available={available} />
        </div>
      </div>

      {available ? (
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          aria-hidden="true"
        >
          <div className="absolute -right-8 top-8 h-28 w-28 rounded-full bg-[var(--popular-rail-accent)]/12 blur-3xl" />
          <div className="absolute -left-10 bottom-2 h-24 w-24 rounded-full bg-black/8 blur-3xl dark:bg-white/8" />
        </div>
      ) : null}

      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-3.5 pb-3.5 pt-3">
        <div className="min-w-0 shrink-0">
          <span className={itemTitleClass} title={name}>
            {name}
          </span>

          <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
            <span className={itemPriceClass}>{priceLabel}</span>
            {available ? <FreshPill /> : null}
          </div>
        </div>

        <div className="mt-auto min-w-0 pt-2.5">
          {available ? (
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span className={itemMetaClass}>
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--popular-rail-accent)] shadow-[0_0_0_3px_rgba(199,154,59,0.14)]"
                  aria-hidden="true"
                />
                <span className="truncate">Tap to customize</span>
              </span>

              <CardArrow />
            </div>
          ) : (
            <span className={itemMutedClass}>Currently unavailable</span>
          )}
        </div>
      </div>
    </button>
  );
}) as <TItem extends BaseItem>(props: PopularCardProps<TItem>) => React.ReactElement;

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────

const EmptyRail = memo(function EmptyRail({
  emptyHintActionLabel,
  onEmptyHintAction,
}: EmptyRailProps) {
  return (
    <div className={cx('flex h-full items-center rounded-[1.55rem] p-4 sm:p-5', glassSurfaceClass)}>
      <div className="flex w-full min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <span
            className={cx(
              railTextBaseClass,
              'block truncate text-sm font-black tracking-[-0.015em] text-[var(--popular-rail-text)]',
            )}
          >
            Nothing trending yet
          </span>

          <span
            className={cx(
              railTextBaseClass,
              'mt-1 block line-clamp-2 text-xs font-semibold leading-relaxed text-[var(--popular-rail-muted)]',
            )}
          >
            Browse the full menu or clear active filters.
          </span>
        </div>

        <button
          type="button"
          onClick={onEmptyHintAction}
          className={cx(
            railTextBaseClass,
            'shrink-0 rounded-full px-3.5 py-2 text-xs font-black',
            'bg-[var(--popular-rail-icon-bg)] text-[var(--popular-rail-icon-text)]',
            'shadow-[0_10px_22px_rgba(63,36,24,0.20)]',
            'transition-[background-color,color,box-shadow,transform] duration-200 ease-out',
            'hover:opacity-90 active:scale-[0.985]',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--menu-modal-focus-ring)]',
            'focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0f0d0c]',
          )}
        >
          {emptyHintActionLabel}
        </button>
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────────────────────

const PopularRailHeader = memo(function PopularRailHeader({
  title,
  subtitle,
  showControls,
  onScrollLeft,
  onScrollRight,
}: PopularRailHeaderProps) {
  return (
    <div className={cx(HEADER_HEIGHT, 'flex shrink-0 items-center justify-between gap-3')}>
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative shrink-0">
          <div className={cx('relative z-10 h-10 w-10', iconTileClass)}>
            <Star className="h-[18px] w-[18px] fill-current text-current" aria-hidden="true" />
          </div>

          <div
            className="pointer-events-none absolute inset-0 rounded-[1.15rem] bg-[var(--popular-rail-icon-glow)] blur-xl"
            aria-hidden="true"
          />
        </div>

        <div className="min-w-0">
          <span className={headerTitleClass}>{title}</span>
          <span className={headerSubtitleClass}>{subtitle}</span>
        </div>
      </div>

      <div className="flex h-9 min-w-[4.75rem] items-center justify-end gap-1.5">
        {showControls ? (
          <>
            <RailArrow direction="left" onClick={onScrollLeft} />
            <RailArrow direction="right" onClick={onScrollRight} />
          </>
        ) : null}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

function PopularRailImpl<TItem extends BaseItem>({
  items,
  onOpenItem,
  getPriceCents,
  getAvailable,
  emptyHintActionLabel,
  onEmptyHintAction,
  className,
  title = DEFAULT_TITLE,
  subtitle = DEFAULT_SUBTITLE,
  maxItems = 12,
  loading = false,
  ariaLabel = DEFAULT_ARIA_LABEL,
}: PopularRailProps<TItem>): React.ReactElement | null {
  const { ref, scrollBy, scrollToStart } = useHorizontalRail();

  const preparedItems = useMemo<Array<PreparedItem<TItem>>>(() => {
    const source = Array.isArray(items) ? items : [];
    const safeLimit = Math.max(0, Math.min(maxItems, MAX_RENDERED_ITEMS));

    return source.slice(0, safeLimit).map((item, index) => ({
      item,
      itemId: safeId(item, index),
      name: safeStr(item.name, 'Item'),
      priceLabel: formatCents(getPriceCents(item)),
      available: getAvailable(item),
    }));
  }, [items, maxItems, getPriceCents, getAvailable]);

  const hasItems = preparedItems.length > 0;
  const showControls = hasItems && !loading;

  const scrollLeft = useCallback(() => {
    scrollBy(-SCROLL_DESKTOP_AMOUNT);
  }, [scrollBy]);

  const scrollRight = useCallback(() => {
    scrollBy(SCROLL_DESKTOP_AMOUNT);
  }, [scrollBy]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        scrollBy(-SCROLL_KEYBOARD_AMOUNT);
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        scrollBy(SCROLL_KEYBOARD_AMOUNT);
        return;
      }

      if (event.key === 'Home') {
        event.preventDefault();
        scrollToStart();
      }
    },
    [scrollBy, scrollToStart],
  );

  useEffect(() => {
    if (hasItems) scrollToStart();
  }, [hasItems, preparedItems.length, scrollToStart]);

  return (
    <section
      className={cx(
        POPULAR_SECTION_HEIGHT_CLASS,
        'relative flex flex-col gap-4 overflow-hidden overscroll-contain',
        className,
      )}
      aria-label={ariaLabel}
      aria-busy={loading}
    >
      <PopularRailHeader
        title={title}
        subtitle={subtitle}
        showControls={showControls}
        onScrollLeft={scrollLeft}
        onScrollRight={scrollRight}
      />

      <div className={cx(CARD_HEIGHT, 'shrink-0 overflow-hidden')}>
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
            className={railListClass}
            style={{ scrollbarWidth: 'none' }}
            role="list"
            tabIndex={0}
            aria-label="Popular items list"
            onKeyDown={handleKeyDown}
          >
            {preparedItems.map((entry, index) => (
              <PopularCard
                key={entry.itemId}
                item={entry.item}
                index={index}
                itemId={entry.itemId}
                name={entry.name}
                priceLabel={entry.priceLabel}
                available={entry.available}
                onOpenItem={onOpenItem}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

export function PopularRail<TItem extends BaseItem>(props: PopularRailProps<TItem>) {
  return <PopularRailImpl {...props} />;
}

const PopularRailMemo = memo(PopularRail) as unknown as (props: Props) => React.ReactElement | null;

export default PopularRailMemo;