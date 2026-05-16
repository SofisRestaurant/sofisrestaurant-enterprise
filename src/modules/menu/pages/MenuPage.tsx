// =============================================================================
// src/modules/menu/pages/MenuPage.tsx
// =============================================================================
// Performance architecture (2026):
//
//  INITIAL LOAD PATH:
//    - MenuPage shell + CategoryTabs + MenuGrid skeleton only
//    - MenuFilters: lazy (Suspense) — panel JS deferred until opened
//    - MenuItemModal: lazy (Suspense) — modal JS deferred until first tap
//    - No stagger/variant wrappers that hold children at opacity:0 on mount
//    - PopularRail animates directly on mount because it sits above the fold
//
//  FILTER INTERACTION PATH:
//    - Filter/sort/category/search state changes wrapped in startTransition
//    - React keeps the current frame interactive during typing / tab switching
//    - isPending drives a subtle loading indicator on the grid
//
//  DATA FETCH PATH:
//    - AbortController per fetch prevents stale slow responses from overwriting
//      newer ones on fast retry
//    - loading={loading} is passed to MenuGrid so card skeletons show properly
//
//  MODAL OWNERSHIP:
//    - MenuGrid owns its own modal for main-grid item taps
//    - MenuPage owns a separate modal for PopularRail item taps
//    - Both use the same lazy MenuItemModal chunk
//
// DealsRail has been intentionally removed from this file.
// Dedicated deals now live on /deals.
// MenuPage keeps only the “Promo only” filter via menu item flags/tags.
// =============================================================================

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { AnimatePresence, m } from 'framer-motion';

import { Spinner } from '@/components/ui/Spinner';
import { MenuPublicService } from '@/domain/menu/menu.service.public';
import type { MenuCategory, MenuItemPublic } from '@/domain/menu/menu.types';
import { CategoryTabs } from '@/modules/menu/components/CategoryTabs';
import { MenuGrid } from '@/modules/menu/components/MenuGrid';
import { PopularRail } from '@/modules/menu/components/PopularRail';
import { useMenuUi } from '@/modules/menu/store/menuUi.store';
import type { MenuPriceRangeKey, MenuSortKey, MenuTagKey } from '@/types/menu-ui.types';

const MenuFilters = lazy(() => import('@/modules/menu/components/MenuFilters'));
const MenuItemModal = lazy(() => import('@/modules/menu/components/MenuItemModal'));

const EL = [0.16, 1, 0.3, 1] as const;

const BELOW_FOLD_VP = { once: true, amount: 0.08 } as const;

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EL } },
};

const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.45, ease: EL } },
};

type UnknownRecord = Record<string, unknown>;

type FilterState = {
  tags: Set<MenuTagKey>;
  priceRange: MenuPriceRangeKey;
  sort: MenuSortKey;
  promoOnly: boolean;
};

type ModalState = { open: false } | { open: true; item: MenuItemPublic };

const MENU_OPEN_FILTERS_EVENT = 'menu:open-filters';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeStr(value: unknown, fallback = '', max = 800): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function safeNum(value: unknown, fallback = 0): number {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeBool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readArrayItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;

  if (isRecord(raw)) {
    const items = raw.items;
    if (Array.isArray(items)) return items;
  }

  return [];
}

function normalizeMenuItemPublic(value: unknown): MenuItemPublic | null {
  if (!isRecord(value)) return null;

  const id = safeStr(value.id, '', 128);
  const name = safeStr(value.name, '', 180);
  const category = safeStr(value.category, '', 80);

  if (!id || !name || !category) return null;

  const merged: UnknownRecord = { ...value, id, name, category };
  return merged as unknown as MenuItemPublic;
}

function readId(item: MenuItemPublic): string {
  const record: UnknownRecord = isRecord(item) ? (item as UnknownRecord) : {};
  return safeStr(record.id, '', 128);
}

function readName(item: MenuItemPublic): string {
  const record: UnknownRecord = isRecord(item) ? (item as UnknownRecord) : {};
  return safeStr(record.name, 'Menu item', 180);
}

function readCategory(item: MenuItemPublic): MenuCategory | '' {
  const record: UnknownRecord = isRecord(item) ? (item as UnknownRecord) : {};
  const category = safeStr(record.category, '', 80);
  return category ? (category as unknown as MenuCategory) : '';
}

function readDescription(item: MenuItemPublic): string {
  const record: UnknownRecord = isRecord(item) ? (item as UnknownRecord) : {};
  return safeStr(record.description, '', 1200);
}

function readImageUrl(item: MenuItemPublic): string | null {
  const record: UnknownRecord = isRecord(item) ? (item as UnknownRecord) : {};
  const raw = record.image_url ?? record.imageUrl ?? record.photo_url ?? record.photoUrl;
  const value = safeStr(raw, '', 2000);
  return value ? value : null;
}

function readPriceCents(item: MenuItemPublic): number {
  const record: UnknownRecord = isRecord(item) ? (item as UnknownRecord) : {};

  const centsRaw =
    (typeof record.price_cents === 'number' ? record.price_cents : undefined) ??
    (typeof record.unit_price_cents === 'number' ? record.unit_price_cents : undefined);

  if (typeof centsRaw === 'number' && Number.isFinite(centsRaw) && centsRaw >= 0) {
    return Math.max(0, Math.round(centsRaw));
  }

  const dollars = safeNum(record.price, 0);
  return Math.max(0, Math.round(dollars * 100));
}

function readAvailable(item: MenuItemPublic): boolean {
  const record: UnknownRecord = isRecord(item) ? (item as UnknownRecord) : {};

  if (typeof record.available === 'boolean') return record.available;
  if (typeof record.is_available === 'boolean') return record.is_available;
  if (typeof record.isAvailable === 'boolean') return record.isAvailable;

  return true;
}

function readTagsRaw(item: MenuItemPublic): string[] {
  const record: UnknownRecord = isRecord(item) ? (item as UnknownRecord) : {};
  const raw = record.tags;

  if (Array.isArray(raw)) {
    const out: string[] = [];

    for (const tag of raw) {
      if (typeof tag !== 'string') continue;

      const trimmed = tag.trim();
      if (!trimmed) continue;

      out.push(trimmed);
      if (out.length >= 36) break;
    }

    return out;
  }

  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 36);
  }

  return [];
}

function normalizeTag(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

function hasTag(item: MenuItemPublic, tag: string): boolean {
  const needle = normalizeTag(tag);
  return readTagsRaw(item).map(normalizeTag).includes(needle);
}

function matchesTagKey(item: MenuItemPublic, key: MenuTagKey): boolean {
  const record: UnknownRecord = isRecord(item) ? (item as UnknownRecord) : {};

  if (key === 'spicy') {
    return (
      safeBool(record.spicy, false) || safeBool(record.is_spicy, false) || hasTag(item, 'spicy')
    );
  }

  if (key === 'vegetarian') {
    return safeBool(record.vegetarian, false) || hasTag(item, 'vegetarian');
  }

  if (key === 'gluten_free') {
    return (
      safeBool(record.gluten_free, false) ||
      safeBool(record.is_gluten_free, false) ||
      hasTag(item, 'gluten_free') ||
      hasTag(item, 'gluten-free')
    );
  }

  if (key === 'kids') {
    return (
      safeBool(record.kids, false) ||
      safeBool(record.is_kids, false) ||
      hasTag(item, 'kids') ||
      hasTag(item, 'kid')
    );
  }

  return false;
}

function readPopularityScore(item: MenuItemPublic): number {
  const record: UnknownRecord = isRecord(item) ? (item as UnknownRecord) : {};

  const score =
    safeNum(record.popularity_score, NaN) ||
    safeNum(record.popularityScore, NaN) ||
    safeNum(record.popularity, NaN) ||
    safeNum(record.rank, NaN);

  if (Number.isFinite(score)) return Math.max(0, score);

  if (
    safeBool(record.is_popular, false) ||
    safeBool(record.isPopular, false) ||
    hasTag(item, 'popular')
  ) {
    return 1000;
  }

  return 0;
}

function readIsPopular(item: MenuItemPublic): boolean {
  const record: UnknownRecord = isRecord(item) ? (item as UnknownRecord) : {};

  if (safeBool(record.is_popular, false) || safeBool(record.isPopular, false)) {
    return true;
  }

  return readPopularityScore(item) >= 80;
}

function readIsDeal(item: MenuItemPublic): boolean {
  const record: UnknownRecord = isRecord(item) ? (item as UnknownRecord) : {};

  const flagged =
    safeBool(record.is_deal, false) ||
    safeBool(record.deal, false) ||
    safeBool(record.promo, false) ||
    safeBool(record.is_promo, false) ||
    safeBool(record.isPromo, false);

  if (flagged) return true;

  return hasTag(item, 'deal') || hasTag(item, 'promo') || hasTag(item, 'special');
}

function matchesSearch(item: MenuItemPublic, queryText: string): boolean {
  const query = queryText.trim().toLowerCase();

  if (!query) return true;

  const name = readName(item).toLowerCase();
  const description = readDescription(item).toLowerCase();
  const category = String(readCategory(item)).toLowerCase();
  const tags = readTagsRaw(item).join(' ').toLowerCase();

  return (
    name.includes(query) ||
    description.includes(query) ||
    category.includes(query) ||
    tags.includes(query)
  );
}

function matchesPriceRange(priceCents: number, range: MenuPriceRangeKey): boolean {
  if (range === 'any') return true;
  if (range === 'under_10') return priceCents < 1000;
  if (range === '10_20') return priceCents >= 1000 && priceCents <= 2000;
  if (range === '20_30') return priceCents > 2000 && priceCents <= 3000;
  if (range === '30_plus') return priceCents > 3000;

  return true;
}

function stableSorted(items: MenuItemPublic[], sort: MenuSortKey): MenuItemPublic[] {
  const key = String(sort);
  const copy = [...items];

  copy.sort((a, b) => {
    const nameA = readName(a);
    const nameB = readName(b);
    const priceA = readPriceCents(a);
    const priceB = readPriceCents(b);
    const scoreA = readPopularityScore(a);
    const scoreB = readPopularityScore(b);

    if (key === 'price_low') return priceA - priceB || nameA.localeCompare(nameB);
    if (key === 'price_high') return priceB - priceA || nameA.localeCompare(nameB);
    if (key === 'name_az') return nameA.localeCompare(nameB);
    if (key === 'name_za') return nameB.localeCompare(nameA);

    if (key === 'featured') {
      const featuredA = readIsPopular(a) ? 1 : 0;
      const featuredB = readIsPopular(b) ? 1 : 0;
      return featuredB - featuredA || scoreB - scoreA || nameA.localeCompare(nameB);
    }

    if (key === 'popular') return scoreB - scoreA || nameA.localeCompare(nameB);

    return scoreB - scoreA || nameA.localeCompare(nameB);
  });

  return copy;
}

const NULL_FALLBACK = null;

function MenuPage() {
  const [items, setItems] = useState<MenuItemPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<MenuCategory | 'all'>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const searchText = useMenuUi((state) => state.searchText);
  const setSearchText = useMenuUi((state) => state.setSearchText);

  const [filters, setFilters] = useState<FilterState>({
    tags: new Set<MenuTagKey>(),
    priceRange: 'any',
    sort: 'recommended',
    promoOnly: false,
  });

  const [modal, setModal] = useState<ModalState>({ open: false });
  const [isPending, startTransition] = useTransition();

  const lastFocusForFiltersRef = useRef<HTMLElement | null>(null);
  const lastFocusForModalRef = useRef<HTMLElement | null>(null);
  const filtersBtnRef = useRef<HTMLButtonElement | null>(null);

  const loadMenu = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    setLoading(true);

    try {
      const raw = await MenuPublicService.getMenuItems();

      if (signal?.aborted) return;

      const rawItems = readArrayItems(raw);
      const nextItems: MenuItemPublic[] = [];

      for (const value of rawItems) {
        const item = normalizeMenuItemPublic(value);
        if (!item) continue;
        nextItems.push(item);
      }

      setItems(nextItems);
    } catch (_error: unknown) {
      if (signal?.aborted) return;

      setItems([]);
      setError("We couldn't load the menu right now.");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void loadMenu(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadMenu]);

  useEffect(() => {
    function handleOpenFilters() {
      lastFocusForFiltersRef.current =
        typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;

      setFiltersOpen(true);
    }

    window.addEventListener(MENU_OPEN_FILTERS_EVENT, handleOpenFilters);

    return () => {
      window.removeEventListener(MENU_OPEN_FILTERS_EVENT, handleOpenFilters);
    };
  }, []);

  const categoriesWithItems = useMemo<Set<MenuCategory>>(() => {
    const next = new Set<MenuCategory>();

    for (const item of items) {
      const category = readCategory(item);
      if (category) next.add(category);
    }

    return next;
  }, [items]);

  useEffect(() => {
    if (selectedCategory === 'all') return;

    if (!categoriesWithItems.has(selectedCategory)) {
      setSelectedCategory('all');
    }
  }, [categoriesWithItems, selectedCategory]);

  const popular = useMemo<MenuItemPublic[]>(() => {
    const scored = items
      .map((item) => ({ item, score: readPopularityScore(item) }))
      .filter((entry) => entry.score > 0);

    scored.sort((a, b) => b.score - a.score || readName(a.item).localeCompare(readName(b.item)));

    const primary = scored.map((entry) => entry.item).slice(0, 12);

    if (primary.length >= 6) return primary;

    const withImages = items.filter((item) => Boolean(readImageUrl(item)));

    withImages.sort((a, b) => readName(a).localeCompare(readName(b)));

    const deduped = withImages.filter(
      (item) => !primary.some((existing) => readId(existing) === readId(item)),
    );

    return [...primary, ...deduped.slice(0, Math.max(0, 12 - primary.length))];
  }, [items]);

  const filteredSortedItems = useMemo<MenuItemPublic[]>(() => {
    const selectedTags = Array.from(filters.tags.values());
    const out: MenuItemPublic[] = [];

    for (const item of items) {
      if (selectedCategory !== 'all' && readCategory(item) !== selectedCategory) continue;
      if (!matchesSearch(item, searchText)) continue;
      if (filters.promoOnly && !readIsDeal(item)) continue;

      let tagMatch = true;

      for (const key of selectedTags) {
        if (!matchesTagKey(item, key)) {
          tagMatch = false;
          break;
        }
      }

      if (!tagMatch) continue;

      const priceCents = readPriceCents(item);

      if (!matchesPriceRange(priceCents, filters.priceRange)) continue;

      out.push(item);
    }

    return stableSorted(out, filters.sort);
  }, [
    filters.priceRange,
    filters.promoOnly,
    filters.sort,
    filters.tags,
    items,
    searchText,
    selectedCategory,
  ]);

  const resultsCountText = useMemo(() => {
    const count = filteredSortedItems.length;
    const hasSearch = searchText.trim().length > 0;
    const hasCategory = selectedCategory !== 'all';
    const hasFilters =
      filters.tags.size > 0 ||
      filters.priceRange !== 'any' ||
      filters.promoOnly ||
      String(filters.sort) !== 'recommended';

    if (!hasSearch && !hasCategory && !hasFilters) return '';
    if (count === 0) return 'No matches — try clearing filters';

    return `Showing ${count} match${count === 1 ? '' : 'es'}`;
  }, [filteredSortedItems.length, searchText, selectedCategory, filters]);

  const getPriceCents = useCallback((item: MenuItemPublic): number => readPriceCents(item), []);
  const getAvailable = useCallback((item: MenuItemPublic): boolean => readAvailable(item), []);

  const handleFiltersOpenChange = useCallback((open: boolean) => {
    setFiltersOpen(open);

    if (!open) {
      queueMicrotask(() => {
        const element = lastFocusForFiltersRef.current;

        if (element && typeof document !== 'undefined' && document.contains(element)) {
          element.focus();
        } else {
          filtersBtnRef.current?.focus();
        }
      });
    }
  }, []);

  const openItem = useCallback((item: MenuItemPublic) => {
    lastFocusForModalRef.current =
      typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    setModal({ open: true, item });
  }, []);

  const closeItem = useCallback(() => {
    setModal({ open: false });

    queueMicrotask(() => {
      const element = lastFocusForModalRef.current;

      if (element && typeof document !== 'undefined' && document.contains(element)) {
        element.focus();
      }
    });
  }, []);

  const clearAll = useCallback(() => {
    setSearchText('');
    setSelectedCategory('all');
    setFilters({
      tags: new Set<MenuTagKey>(),
      priceRange: 'any',
      sort: 'recommended',
      promoOnly: false,
    });
  }, [setSearchText]);

  const handleSelectCategory = useCallback(
    (category: MenuCategory | 'all') => {
      startTransition(() => {
        setSelectedCategory(category);
      });
    },
    [startTransition],
  );

  const handleSearchTextChange = useCallback(
    (text: string) => {
      startTransition(() => {
        setSearchText(text);
      });
    },
    [startTransition, setSearchText],
  );

  const handleTagsChange = useCallback(
    (next: Set<MenuTagKey>) => {
      startTransition(() => {
        setFilters((current) => ({ ...current, tags: next }));
      });
    },
    [startTransition],
  );

  const handlePriceRangeChange = useCallback(
    (next: MenuPriceRangeKey) => {
      startTransition(() => {
        setFilters((current) => ({ ...current, priceRange: next }));
      });
    },
    [startTransition],
  );

  const handleSortChange = useCallback(
    (next: MenuSortKey) => {
      startTransition(() => {
        setFilters((current) => ({ ...current, sort: next }));
      });
    },
    [startTransition],
  );

  const handlePromoOnlyChange = useCallback(
    (next: boolean) => {
      startTransition(() => {
        setFilters((current) => ({ ...current, promoOnly: Boolean(next) }));
      });
    },
    [startTransition],
  );

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-10 pt-4">
      <AnimatePresence>
        {loading && (
          <m.div
            key="loading"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: EL }}
            className="flex flex-col items-center gap-4 py-24 text-zinc-500"
          >
            <Spinner />
            <p className="text-sm">Loading the menu</p>
          </m.div>
        )}

        {!loading && error && (
          <m.div
            key="error"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: EL }}
            className="py-16"
          >
            <div className="mx-auto max-w-lg rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-800">
              <p className="text-sm font-semibold">{error}</p>

              <div className="mt-5 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    void loadMenu();
                  }}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-orange-600 px-5 text-sm font-semibold text-white hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                >
                  Retry
                </button>
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {!loading && !error && (
        <>
          <m.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: EL }}
            className="mt-6"
          >
            <PopularRail
              items={popular}
              onOpenItem={openItem}
              getPriceCents={getPriceCents}
              getAvailable={getAvailable}
              emptyHintActionLabel="Clear all"
              onEmptyHintAction={clearAll}
            />
          </m.div>

          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EL, delay: 0.08 }}
            className="mt-8 flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">Browse categories</p>
              <p className="mt-0.5 text-xs text-gray-500">
                Want deals only? Open filters and turn on &quot;Promo only&quot;.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <m.button
                ref={filtersBtnRef}
                type="button"
                onClick={() => {
                  lastFocusForFiltersRef.current =
                    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
                      ? document.activeElement
                      : null;

                  setFiltersOpen(true);
                }}
                whileHover={{ scale: 1.03, y: -1 }}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.16, ease: EL }}
                className={cx(
                  'inline-flex h-10 min-w-[68px] items-center justify-center rounded-xl border px-4 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40',
                  filtersOpen
                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                    : 'border-gray-200 bg-white text-gray-900 hover:bg-gray-50',
                )}
                aria-label="Open filters"
                aria-expanded={filtersOpen}
              >
                Filters
              </m.button>

              <m.button
                type="button"
                onClick={() => {
                  startTransition(() => {
                    setFilters((current) => ({ ...current, promoOnly: true }));
                  });

                  setFiltersOpen(true);
                }}
                whileHover={{ scale: 1.03, y: -1 }}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.16, ease: EL }}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                aria-label="Show deals only"
              >
                Deals
              </m.button>
            </div>
          </m.div>

          <m.div variants={fadeIn} initial="hidden" animate="visible" className="mt-6">
            <CategoryTabs
              selectedCategory={selectedCategory}
              onSelectCategory={handleSelectCategory}
              availableCategories={categoriesWithItems}
            />
          </m.div>

          <AnimatePresence>
            {resultsCountText ? (
              <m.p
                key="results-count"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.28, ease: EL }}
                className="mt-2 text-xs text-zinc-500"
              >
                {resultsCountText}
              </m.p>
            ) : null}
          </AnimatePresence>

          <m.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={BELOW_FOLD_VP}
            className={cx(
              'mt-5 transition-opacity duration-300',
              isPending ? 'opacity-60' : 'opacity-100',
            )}
          >
            <MenuGrid
              items={filteredSortedItems}
              loading={loading}
              getPriceCents={getPriceCents}
              getAvailable={getAvailable}
              emptyHintActionLabel="Clear all"
              onEmptyHintAction={clearAll}
            />
          </m.div>

          <Suspense fallback={NULL_FALLBACK}>
            {filtersOpen && (
              <MenuFilters
                open={filtersOpen}
                onOpenChange={handleFiltersOpenChange}
                searchText={searchText}
                onSearchTextChange={handleSearchTextChange}
                selectedTags={filters.tags}
                onSelectedTagsChange={handleTagsChange}
                priceRange={filters.priceRange}
                onPriceRangeChange={handlePriceRangeChange}
                sort={filters.sort}
                onSortChange={handleSortChange}
                promoOnly={filters.promoOnly}
                onPromoOnlyChange={handlePromoOnlyChange}
                onClearAll={clearAll}
              />
            )}
          </Suspense>

          <Suspense fallback={NULL_FALLBACK}>
            {modal.open && <MenuItemModal item={modal.item} onClose={closeItem} />}
          </Suspense>
        </>
      )}
    </main>
  );
}

export { MenuPage };
export default MenuPage;