import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import type {
  MenuPriceRangeKey,
  MenuSortKey,
  MenuTagKey,
} from '@/modules/menu/types/menu-ui.types';

export type MenuFiltersProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  searchText: string;
  onSearchTextChange: (v: string) => void;

  selectedTags: Set<MenuTagKey>;
  onSelectedTagsChange: (next: Set<MenuTagKey>) => void;

  priceRange: MenuPriceRangeKey;
  onPriceRangeChange: (next: MenuPriceRangeKey) => void;

  sort: MenuSortKey;
  onSortChange: (next: MenuSortKey) => void;

  promoOnly: boolean;
  onPromoOnlyChange: (next: boolean) => void;

  onClearAll: () => void;
};

function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(' ');
}

function getFocusable(container: HTMLElement): HTMLElement[] {
  const selector =
    'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(selector));
  return nodes.filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
  );
}

function labelForTag(tag: MenuTagKey): string {
  switch (tag) {
    case 'spicy':
      return 'Spicy';
    case 'vegetarian':
      return 'Vegetarian';
    case 'gluten_free':
      return 'Gluten Free';
    case 'kids':
      return 'Kids';
  }
}

function labelForPriceRange(key: MenuPriceRangeKey): string {
  switch (key) {
    case 'any':
      return 'Any price';
    case 'under_10':
      return 'Under $10';
    case '10_20':
      return '$10–$20';
    case '20_30':
      return '$20–$30';
    case '30_plus':
      return '$30+';
  }
}

function labelForSort(key: MenuSortKey): string {
  switch (key) {
    case 'recommended':
      return 'Recommended';
    case 'featured':
      return 'Featured';
    case 'popular':
      return 'Popular';
    case 'price_low':
      return 'Price: Low to High';
    case 'price_high':
      return 'Price: High to Low';
    case 'name_az':
      return 'Name: A to Z';
    case 'name_za':
      return 'Name: Z to A';
  }
}

export default function MenuFilters(props: MenuFiltersProps) {
  const {
    open,
    onOpenChange,
    searchText,
    onSearchTextChange,
    selectedTags,
    onSelectedTagsChange,
    priceRange,
    onPriceRangeChange,
    sort,
    onSortChange,
    promoOnly,
    onPromoOnlyChange,
    onClearAll,
  } = props;

  const searchId = useId();
  const dialogId = useId();
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const allTags = useMemo<MenuTagKey[]>(() => ['spicy', 'vegetarian', 'gluten_free', 'kids'], []);
  const allPriceRanges = useMemo<MenuPriceRangeKey[]>(
    () => ['any', 'under_10', '10_20', '20_30', '30_plus'],
    [],
  );
  const allSorts = useMemo<MenuSortKey[]>(
    () => ['recommended', 'featured', 'popular', 'price_low', 'price_high', 'name_az', 'name_za'],
    [],
  );

  const hasAnyFilters = useMemo(() => {
    const hasSearch = searchText.trim().length > 0;
    const hasTags = selectedTags.size > 0;
    const hasPrice = priceRange !== 'any';
    const hasPromo = promoOnly;
    const hasSort = sort !== 'recommended';
    return hasSearch || hasTags || hasPrice || hasPromo || hasSort;
  }, [searchText, selectedTags, priceRange, promoOnly, sort]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const openPanel = useCallback(() => onOpenChange(true), [onOpenChange]);

  const toggleTag = useCallback(
    (tag: MenuTagKey) => {
      const next = new Set<MenuTagKey>(selectedTags);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      onSelectedTagsChange(next);
    },
    [selectedTags, onSelectedTagsChange],
  );

  // Focus restore + focus trap + ESC close
  useEffect(() => {
    if (!open) return;

    lastFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    queueMicrotask(() => {
      closeBtnRef.current?.focus();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }

      if (e.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusables = getFocusable(dialog);
      if (focusables.length === 0) return;

      const active = document.activeElement;
      const idx = focusables.findIndex((x) => x === active);
      const lastIdx = focusables.length - 1;

      if (e.shiftKey) {
        if (idx <= 0) {
          e.preventDefault();
          focusables[lastIdx]?.focus();
        }
      } else {
        if (idx === -1 || idx >= lastIdx) {
          e.preventDefault();
          focusables[0]?.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      queueMicrotask(() => {
        const el = lastFocusRef.current;
        if (el && document.contains(el)) el.focus();
      });
    };
  }, [open, close]);

  return (
    <section aria-label="Menu filters" className="w-full">
      {/* Top bar (mobile-first) */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label htmlFor={searchId} className="sr-only">
            Search menu
          </label>
          <div className="relative">
            <input
              id={searchId}
              type="search"
              inputMode="search"
              autoComplete="off"
              value={searchText}
              onChange={(e) => onSearchTextChange(e.target.value)}
              placeholder="Search dishes…"
              className={cx(
                'h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-4 pr-10 text-sm text-white outline-none',
                'placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-amber-500/25 focus-visible:border-amber-500/30',
              )}
            />
            {searchText.trim().length > 0 ? (
              <button
                type="button"
                onClick={() => onSearchTextChange('')}
                className={cx(
                  'absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl',
                  'border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25',
                )}
                aria-label="Clear search"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={openPanel}
          className={cx(
            'inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 text-sm font-semibold text-white',
            'hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25',
          )}
          aria-haspopup="dialog"
          aria-expanded={open ? 'true' : 'false'}
          aria-controls={dialogId}
          aria-label="Open filters"
        >
          <SlidersHorizontal className="h-4 w-4 text-zinc-300" aria-hidden="true" />
          Filters
          {hasAnyFilters ? (
            <span
              className="ml-1 inline-flex h-2 w-2 rounded-full bg-amber-400"
              aria-hidden="true"
            />
          ) : null}
        </button>
      </div>

      {/* Overlay / dialog */}
      {open ? (
        <div className="fixed inset-0 z-50" data-modal-root="true">
          <div className="absolute inset-0 bg-black/60" aria-hidden="true" />

          {/* Click-outside closes ONLY when the click lands on this container itself */}
          <div
            className="absolute inset-0 flex items-end justify-center p-3 sm:items-center"
            onMouseDown={(e) => {
              if (e.target !== e.currentTarget) return;
              e.preventDefault();
              close();
            }}
          >
            <div
              id={dialogId}
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-label="Filter menu items"
              className={cx(
                'w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-neutral-950 text-white shadow-2xl',
                'max-h-[92vh] flex flex-col min-h-0',
              )}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="shrink-0 border-b border-white/10 bg-neutral-950/90 backdrop-blur supports-backdrop-filter:bg-neutral-950/70">
                <div className="flex items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold">Filters</h2>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Refine by tags, price, sort, and promos.
                    </p>
                  </div>

                  <button
                    ref={closeBtnRef}
                    type="button"
                    onClick={close}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25"
                    aria-label="Close filters"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-5 [-webkit-overflow-scrolling:touch]">
                {/* Tags */}
                <div>
                  <p className="text-sm font-semibold text-white">Tags</p>
                  <p className="mt-1 text-xs text-zinc-500">Pick any that match what you want.</p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {allTags.map((t) => {
                      const active = selectedTags.has(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => toggleTag(t)}
                          aria-pressed={active ? 'true' : 'false'}
                          className={cx(
                            'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                            active
                              ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                              : 'border-white/10 bg-white/5 text-zinc-200 hover:bg-white/8',
                            'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25',
                          )}
                        >
                          {labelForTag(t)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Price range */}
                <div className="mt-6">
                  <label className="text-sm font-semibold text-white" htmlFor="menu-price-range">
                    Price range
                  </label>
                  <p className="mt-1 text-xs text-zinc-500">Quickly narrow by typical price.</p>

                  <select
                    id="menu-price-range"
                    value={priceRange}
                    onChange={(e) => {
                      const v = e.target.value as string;
                      if (
                        v === 'any' ||
                        v === 'under_10' ||
                        v === '10_20' ||
                        v === '20_30' ||
                        v === '30_plus'
                      ) {
                        onPriceRangeChange(v);
                      } else {
                        onPriceRangeChange('any');
                      }
                    }}
                    className={cx(
                      'mt-2 h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none',
                      'focus-visible:ring-2 focus-visible:ring-amber-500/25 focus-visible:border-amber-500/30',
                    )}
                    aria-label="Price range"
                  >
                    {allPriceRanges.map((k) => (
                      <option key={k} value={k}>
                        {labelForPriceRange(k)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sort */}
                <div className="mt-6">
                  <label className="text-sm font-semibold text-white" htmlFor="menu-sort">
                    Sort
                  </label>
                  <p className="mt-1 text-xs text-zinc-500">Choose how items are ordered.</p>

                  <select
                    id="menu-sort"
                    value={sort}
                    onChange={(e) => {
                      const v = e.target.value as string;
                      const allowed = new Set<MenuSortKey>(allSorts);
                      if (allowed.has(v as MenuSortKey)) onSortChange(v as MenuSortKey);
                    }}
                    className={cx(
                      'mt-2 h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none',
                      'focus-visible:ring-2 focus-visible:ring-amber-500/25 focus-visible:border-amber-500/30',
                    )}
                    aria-label="Sort menu items"
                  >
                    {allSorts.map((k) => (
                      <option key={k} value={k}>
                        {labelForSort(k)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Promo only */}
                <div className="mt-6">
                  <p className="text-sm font-semibold text-white">Promotions</p>
                  <p className="mt-1 text-xs text-zinc-500">Show only items with promos.</p>

                  <label className="mt-3 inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={promoOnly}
                      onChange={(e) => onPromoOnlyChange(e.target.checked)}
                      className="h-4 w-4"
                      aria-label="Promo only"
                    />
                    <span className="text-sm font-semibold text-zinc-200">Promo only</span>
                  </label>
                </div>
              </div>

              {/* Footer */}
              <div className="shrink-0 border-t border-white/10 bg-neutral-950/90 backdrop-blur supports-backdrop-filter:bg-neutral-950/70">
                <div className="flex items-center justify-between gap-3 px-5 py-4">
                  <button
                    type="button"
                    onClick={onClearAll}
                    className={cx(
                      'inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white',
                      'hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25',
                    )}
                    aria-label="Clear all filters"
                  >
                    Clear all
                  </button>

                  <button
                    type="button"
                    onClick={close}
                    className={cx(
                      'inline-flex h-11 items-center justify-center rounded-2xl bg-amber-500 px-5 text-sm font-semibold text-black',
                      'hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25',
                    )}
                    aria-label="Apply filters"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
