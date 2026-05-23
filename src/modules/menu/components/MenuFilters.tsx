import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { SlidersHorizontal, X } from 'lucide-react';

import { MenuPriceRangeKey, MenuSortKey, MenuTagKey } from '@/types/menu-ui.types';

const EL = [0.16, 1, 0.3, 1] as const;
const ES = [0.34, 1.56, 0.64, 1] as const;

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

  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
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
      return 'Gluten-Free';
    case 'kids':
      return 'Kids';
    default:
      return tag;
  }
}

function labelForPriceRange(key: MenuPriceRangeKey): string {
  switch (key) {
    case 'any':
      return 'Any price';
    case 'under_10':
      return 'Under $10';
    case '10_20':
      return '$10-$20';
    case '20_30':
      return '$20-$30';
    case '30_plus':
      return '$30+';
    default:
      return key;
  }
}

function labelForSort(key: MenuSortKey): string {
  switch (key) {
    case 'recommended':
      return 'Recommended';
    case 'price_low':
      return 'Price: Low to High';
    case 'price_high':
      return 'Price: High to Low';
    case 'name_az':
      return 'Name: A to Z';
    case 'name_za':
      return 'Name: Z to A';
    default:
      return key;
  }
}

function isPriceRangeKey(value: string): value is MenuPriceRangeKey {
  return (
    value === 'any' ||
    value === 'under_10' ||
    value === '10_20' ||
    value === '20_30' ||
    value === '30_plus'
  );
}

function isSortKey(value: string): value is MenuSortKey {
  return (
    value === 'recommended' ||
    value === 'price_low' ||
    value === 'price_high' ||
    value === 'name_az' ||
    value === 'name_za'
  );
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
  const priceRangeId = useId();
  const sortId = useId();

  const lastFocusRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const allTags = useMemo<MenuTagKey[]>(() => ['spicy', 'vegetarian', 'gluten_free', 'kids'], []);
  const allPriceRanges = useMemo<MenuPriceRangeKey[]>(
    () => ['any', 'under_10', '10_20', '20_30', '30_plus'],
    [],
  );
  const allSorts = useMemo<MenuSortKey[]>(
    () => ['recommended', 'price_low', 'price_high', 'name_az', 'name_za'],
    [],
  );

  const hasAnyFilters = useMemo(() => {
    return (
      searchText.trim().length > 0 ||
      selectedTags.size > 0 ||
      priceRange !== 'any' ||
      promoOnly ||
      sort !== 'recommended'
    );
  }, [searchText, selectedTags, priceRange, promoOnly, sort]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const openPanel = useCallback(() => onOpenChange(true), [onOpenChange]);

  const handleClearAll = useCallback(() => {
    onClearAll();
  }, [onClearAll]);

  const toggleTag = useCallback(
    (tag: MenuTagKey) => {
      const next = new Set<MenuTagKey>(selectedTags);

      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }

      onSelectedTagsChange(next);
    },
    [selectedTags, onSelectedTagsChange],
  );

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
      } else if (idx === -1 || idx >= lastIdx) {
        e.preventDefault();
        focusables[0]?.focus();
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
    <section aria-label="Menu filters" className="w-full" data-ui-component>
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden min-w-0 flex-1 sm:block">
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
              placeholder="Search dishes..."
              className={cx(
                'h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-4 pr-10 text-sm text-white outline-none',
                'placeholder:text-zinc-500 focus-visible:border-amber-500/30 focus-visible:ring-2 focus-visible:ring-amber-500/25',
                'transition-[border-color,box-shadow] duration-200',
              )}
            />

            <AnimatePresence>
              {searchText.trim().length > 0 ? (
                <m.button
                  type="button"
                  onClick={() => onSearchTextChange('')}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  transition={{ duration: 0.18, ease: ES }}
                  className={cx(
                    'absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl',
                    'border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25',
                  )}
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </m.button>
              ) : null}
            </AnimatePresence>
          </div>
        </div>

        <m.button
          type="button"
          onClick={openPanel}
          whileHover={{ scale: 1.04, y: -1 }}
          whileTap={{ scale: 0.96 }}
          transition={{ duration: 0.18, ease: ES }}
          className={cx(
            'inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white sm:w-auto',
            'hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25',
            'transition-colors duration-200',
          )}
          aria-haspopup="dialog"
          aria-expanded={open ? 'true' : 'false'}
          aria-controls={dialogId}
          aria-label="Open filters"
        >
          <SlidersHorizontal className="h-4 w-4 text-zinc-300" aria-hidden="true" />
          Filters
          <AnimatePresence>
            {hasAnyFilters ? (
              <m.span
                key="dot"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: ES }}
                className="ml-1 inline-flex h-2 w-2 rounded-full bg-amber-400"
                aria-hidden="true"
              />
            ) : null}
          </AnimatePresence>
        </m.button>
      </div>

      <AnimatePresence>
        {open ? (
          <m.div
            key="filters-overlay"
            className="fixed inset-0 z-50"
            data-modal-root="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            <m.div
              className="absolute inset-0 bg-black/60"
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            />

            <div
              className="absolute inset-0 flex items-end justify-center p-3 sm:items-center"
              onMouseDown={(e) => {
                if (e.target !== e.currentTarget) return;
                e.preventDefault();
                close();
              }}
            >
              <m.div
                id={dialogId}
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label="Filter menu items"
                className={cx(
                  'flex max-h-[88vh] min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-2xl',
                  'border border-white/10 bg-neutral-950 text-white shadow-2xl',
                )}
                initial={{ opacity: 0, y: 40, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 32, scale: 0.97 }}
                transition={{ duration: 0.35, ease: EL }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="shrink-0 border-b border-white/10 bg-neutral-950/90 backdrop-blur supports-backdrop-filter:bg-neutral-950/70">
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-black text-white">Filters</h2>
                      <p className="mt-0.5 text-xs font-medium text-zinc-400">
                        Find what you are craving.
                      </p>
                    </div>

                    <m.button
                      ref={closeBtnRef}
                      type="button"
                      onClick={close}
                      whileHover={{ scale: 1.08, rotate: 90 }}
                      whileTap={{ scale: 0.92 }}
                      transition={{ duration: 0.2, ease: ES }}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25"
                      aria-label="Close filters"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </m.button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 [-webkit-overflow-scrolling:touch]">
                  <div className="space-y-5">
                    <div>
                      <p className="text-sm font-black text-white">Tags</p>

                      <div className="mt-2 flex flex-wrap gap-2">
                        {allTags.map((tag, index) => {
                          const active = selectedTags.has(tag);

                          return (
                            <m.button
                              key={tag}
                              type="button"
                              onClick={() => toggleTag(tag)}
                              aria-pressed={active ? 'true' : 'false'}
                              initial={{ opacity: 0, scale: 0.85 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ duration: 0.25, ease: ES, delay: index * 0.04 }}
                              whileHover={{ scale: 1.06, y: -1 }}
                              whileTap={{ scale: 0.94 }}
                              className={cx(
                                'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-200',
                                active
                                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                                  : 'border-white/10 bg-white/5 text-zinc-200 hover:bg-white/8',
                                'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25',
                              )}
                            >
                              {active ? <span className="mr-1">✓</span> : null}
                              {labelForTag(tag)}
                            </m.button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-black text-white" htmlFor={priceRangeId}>
                        Price range
                      </label>

                      <select
                        id={priceRangeId}
                        value={priceRange}
                        onChange={(e) => {
                          const value = e.target.value;
                          onPriceRangeChange(isPriceRangeKey(value) ? value : 'any');
                        }}
                        className={cx(
                          'mt-2 h-11 w-full appearance-none rounded-2xl border border-white/10 bg-neutral-900 px-3 text-sm font-semibold text-white outline-none',
                          'focus-visible:border-amber-500/30 focus-visible:ring-2 focus-visible:ring-amber-500/25',
                          'transition-[border-color,box-shadow] duration-200',
                        )}
                        aria-label="Price range"
                      >
                        {allPriceRanges.map((key) => (
                          <option key={key} value={key} className="bg-neutral-950 text-white">
                            {labelForPriceRange(key)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-sm font-black text-white" htmlFor={sortId}>
                        Sort
                      </label>

                      <select
                        id={sortId}
                        value={sort}
                        onChange={(e) => {
                          const value = e.target.value;

                          if (isSortKey(value)) {
                            onSortChange(value);
                          }
                        }}
                        className={cx(
                          'mt-2 h-11 w-full appearance-none rounded-2xl border border-white/10 bg-neutral-900 px-3 text-sm font-semibold text-white outline-none',
                          'focus-visible:border-amber-500/30 focus-visible:ring-2 focus-visible:ring-amber-500/25',
                          'transition-[border-color,box-shadow] duration-200',
                        )}
                        aria-label="Sort menu items"
                      >
                        {allSorts.map((key) => (
                          <option key={key} value={key} className="bg-neutral-950 text-white">
                            {labelForSort(key)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <m.button
                      type="button"
                      onClick={() => onPromoOnlyChange(!promoOnly)}
                      aria-pressed={promoOnly ? 'true' : 'false'}
                      whileTap={{ scale: 0.98 }}
                      className={cx(
                        'flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left',
                        'transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25',
                        promoOnly
                          ? 'border-amber-500/30 bg-amber-500/10'
                          : 'border-white/10 bg-white/5 hover:bg-white/8',
                      )}
                    >
                      <span className="text-sm font-black text-zinc-100">Promo only</span>

                      <span
                        className={cx(
                          'inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200',
                          promoOnly
                            ? 'border-amber-400/40 bg-amber-400/25'
                            : 'border-white/10 bg-white/5',
                        )}
                        aria-hidden="true"
                      >
                        <span
                          className={cx(
                            'ml-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
                            promoOnly ? 'translate-x-5' : 'translate-x-0',
                          )}
                        />
                      </span>
                    </m.button>
                  </div>
                </div>

                <div className="shrink-0 border-t border-white/10 bg-neutral-950/90 backdrop-blur supports-backdrop-filter:bg-neutral-950/70">
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <m.button
                      type="button"
                      onClick={handleClearAll}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      transition={{ duration: 0.15 }}
                      className={cx(
                        'inline-flex h-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white',
                        'hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25',
                      )}
                      aria-label="Clear all filters"
                    >
                      Clear
                    </m.button>

                    <m.button
                      type="button"
                      onClick={close}
                      whileHover={{ scale: 1.04, y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      transition={{ duration: 0.18, ease: ES }}
                      className={cx(
                        'inline-flex h-10 items-center justify-center rounded-2xl bg-amber-500 px-5 text-sm font-black text-black',
                        'hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25',
                      )}
                      aria-label="Apply filters"
                    >
                      Done
                    </m.button>
                  </div>
                </div>
              </m.div>
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}