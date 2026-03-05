// src/modules/menu/pages/MenuPage.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { MenuPublicService } from '@/domain/menu/menu.service.public';
import type { MenuCategory, MenuItemPublic } from '@/domain/menu/menu.types';
import type {
  MenuPriceRangeKey,
  MenuSortKey,
  MenuTagKey,
} from '@/modules/menu/types/menu-ui.types';

import { Spinner } from '@/components/ui/Spinner';
import { useMenuUi } from '@/modules/menu/store/menuUi.store';

import { DealsRail, type DealCard } from '@/modules/menu/components/DealsRail';
import { PopularRail } from '@/modules/menu/components/PopularRail';
import { CategoryTabs } from '@/modules/menu/components/CategoryTabs';
import { MenuGrid } from '@/modules/menu/components/MenuGrid';
import MenuFilters from '@/modules/menu/components/MenuFilters';
import MenuItemModal from '@/modules/menu/components/MenuItemModal';

type UnknownRecord = Record<string, unknown>;

function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(' ');
}

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function safeStr(v: unknown, fallback = '', max = 800): string {
  if (typeof v !== 'string') return fallback;
  const s = v.trim();
  if (!s) return fallback;
  return s.length > max ? s.slice(0, max) : s;
}

function safeNum(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function safeBool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function readArrayItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (isRecord(raw)) {
    const items = (raw as UnknownRecord).items;
    if (Array.isArray(items)) return items as unknown[];
  }
  return [];
}

function normalizeMenuItemPublic(v: unknown): MenuItemPublic | null {
  if (!isRecord(v)) return null;

  const id = safeStr((v as UnknownRecord).id, '', 128);
  const name = safeStr((v as UnknownRecord).name, '', 180);
  const category = safeStr((v as UnknownRecord).category, '', 80);

  if (!id || !name || !category) return null;

  const merged: UnknownRecord = { ...(v as UnknownRecord), id, name, category };
  return merged as unknown as MenuItemPublic;
}

function readId(item: MenuItemPublic): string {
  const r: UnknownRecord = isRecord(item) ? (item as UnknownRecord) : {};
  return safeStr(r.id, '', 128);
}

function readName(item: MenuItemPublic): string {
  const r: UnknownRecord = isRecord(item) ? (item as UnknownRecord) : {};
  return safeStr(r.name, 'Menu item', 180);
}

function readCategory(item: MenuItemPublic): MenuCategory | '' {
  const r: UnknownRecord = isRecord(item) ? (item as UnknownRecord) : {};
  const c = safeStr(r.category, '', 80);
  return c ? (c as unknown as MenuCategory) : '';
}

function readDescription(item: MenuItemPublic): string {
  const r: UnknownRecord = isRecord(item) ? (item as UnknownRecord) : {};
  return safeStr(r.description, '', 1200);
}

function readImageUrl(item: MenuItemPublic): string | null {
  const r: UnknownRecord = isRecord(item) ? (item as UnknownRecord) : {};
  const raw = r.image_url ?? r.imageUrl ?? r.photo_url ?? r.photoUrl;
  const s = safeStr(raw, '', 2000);
  return s ? s : null;
}

function readPriceCents(item: MenuItemPublic): number {
  const r: UnknownRecord = isRecord(item) ? (item as UnknownRecord) : {};

  const centsRaw =
    (typeof r.price_cents === 'number' ? r.price_cents : undefined) ??
    (typeof r.unit_price_cents === 'number' ? r.unit_price_cents : undefined);

  if (typeof centsRaw === 'number' && Number.isFinite(centsRaw) && centsRaw >= 0) {
    return Math.max(0, Math.round(centsRaw));
  }

  const dollars = safeNum(r.price, 0);
  return Math.max(0, Math.round(dollars * 100));
}

function readAvailable(item: MenuItemPublic): boolean {
  const r: UnknownRecord = isRecord(item) ? (item as UnknownRecord) : {};
  if (typeof r.available === 'boolean') return r.available;
  if (typeof r.is_available === 'boolean') return r.is_available;
  if (typeof r.isAvailable === 'boolean') return r.isAvailable;
  return true;
}

function readTagsRaw(item: MenuItemPublic): string[] {
  const r: UnknownRecord = isRecord(item) ? (item as UnknownRecord) : {};
  const raw = r.tags;

  if (Array.isArray(raw)) {
    const out: string[] = [];
    for (const t of raw) {
      if (typeof t !== 'string') continue;
      const s = t.trim();
      if (!s) continue;
      out.push(s);
      if (out.length >= 36) break;
    }
    return out;
  }

  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 36);
  }

  return [];
}

function normalizeTag(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

function hasTag(item: MenuItemPublic, tag: string): boolean {
  const needle = normalizeTag(tag);
  const tags = readTagsRaw(item).map(normalizeTag);
  return tags.includes(needle);
}

function matchesTagKey(item: MenuItemPublic, key: MenuTagKey): boolean {
  const r: UnknownRecord = isRecord(item) ? (item as UnknownRecord) : {};

  if (key === 'spicy')
    return safeBool(r.spicy, false) || safeBool(r.is_spicy, false) || hasTag(item, 'spicy');
  if (key === 'vegetarian') return safeBool(r.vegetarian, false) || hasTag(item, 'vegetarian');
  if (key === 'gluten_free') {
    return (
      safeBool(r.gluten_free, false) ||
      safeBool(r.is_gluten_free, false) ||
      hasTag(item, 'gluten_free') ||
      hasTag(item, 'gluten-free')
    );
  }
  if (key === 'kids')
    return (
      safeBool(r.kids, false) ||
      safeBool(r.is_kids, false) ||
      hasTag(item, 'kids') ||
      hasTag(item, 'kid')
    );
  return false;
}

function readPopularityScore(item: MenuItemPublic): number {
  const r: UnknownRecord = isRecord(item) ? (item as UnknownRecord) : {};
  const score =
    safeNum(r.popularity_score, NaN) ||
    safeNum(r.popularityScore, NaN) ||
    safeNum(r.popularity, NaN) ||
    safeNum(r.rank, NaN);

  if (Number.isFinite(score)) return Math.max(0, score);

  if (safeBool(r.is_popular, false) || safeBool(r.isPopular, false) || hasTag(item, 'popular'))
    return 1000;
  return 0;
}

function readIsPopular(item: MenuItemPublic): boolean {
  const r: UnknownRecord = isRecord(item) ? (item as UnknownRecord) : {};
  if (safeBool(r.is_popular, false) || safeBool(r.isPopular, false)) return true;
  return readPopularityScore(item) >= 80;
}

function readIsDeal(item: MenuItemPublic): boolean {
  const r: UnknownRecord = isRecord(item) ? (item as UnknownRecord) : {};
  const flagged =
    safeBool(r.is_deal, false) ||
    safeBool(r.deal, false) ||
    safeBool(r.promo, false) ||
    safeBool(r.is_promo, false) ||
    safeBool(r.isPromo, false);

  if (flagged) return true;
  return hasTag(item, 'deal') || hasTag(item, 'promo') || hasTag(item, 'special');
}

function matchesSearch(item: MenuItemPublic, q: string): boolean {
  const query = q.trim().toLowerCase();
  if (!query) return true;

  const name = readName(item).toLowerCase();
  const desc = readDescription(item).toLowerCase();
  const cat = String(readCategory(item)).toLowerCase();
  const tags = readTagsRaw(item).join(' ').toLowerCase();

  return (
    name.includes(query) || desc.includes(query) || cat.includes(query) || tags.includes(query)
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
    const an = readName(a);
    const bn = readName(b);

    const ap = readPriceCents(a);
    const bp = readPriceCents(b);

    const as = readPopularityScore(a);
    const bs = readPopularityScore(b);

    if (key === 'price_low') return ap - bp || an.localeCompare(bn);
    if (key === 'price_high') return bp - ap || an.localeCompare(bn);
    if (key === 'name_az') return an.localeCompare(bn);
    if (key === 'name_za') return bn.localeCompare(an);

    if (key === 'featured') {
      const af = readIsPopular(a) ? 1 : 0;
      const bf = readIsPopular(b) ? 1 : 0;
      return bf - af || bs - as || an.localeCompare(bn);
    }

    if (key === 'popular') return bs - as || an.localeCompare(bn);

    return bs - as || an.localeCompare(bn);
  });

  return copy;
}

function toDealCard(item: MenuItemPublic): DealCard {
  const r: UnknownRecord = isRecord(item) ? (item as UnknownRecord) : {};
  const startsAt =
    typeof r.starts_at === 'string'
      ? r.starts_at
      : typeof r.startsAt === 'string'
        ? r.startsAt
        : null;
  const endsAt =
    typeof r.ends_at === 'string' ? r.ends_at : typeof r.endsAt === 'string' ? r.endsAt : null;

  return {
    id: readId(item),
    title: readName(item),
    subtitle: safeStr(r.description, '', 240) || null,
    badge: 'DEAL',
    startsAt,
    endsAt,
    ctaLabel: 'See deal',
  };
}

type FilterState = {
  tags: Set<MenuTagKey>;
  priceRange: MenuPriceRangeKey;
  sort: MenuSortKey;
  promoOnly: boolean;
};

type ModalState = { open: false } | { open: true; item: MenuItemPublic };

// Header (or anywhere) can dispatch this to open filters without prop drilling.
const MENU_OPEN_FILTERS_EVENT = 'menu:open-filters';

export default function MenuPage() {
  const [items, setItems] = useState<MenuItemPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<MenuCategory | 'all'>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Search comes from Header via store
  const searchText = useMenuUi((s) => s.searchText);
  const setSearchText = useMenuUi((s) => s.setSearchText);

  const [filters, setFilters] = useState<FilterState>({
    tags: new Set<MenuTagKey>(),
    priceRange: 'any',
    sort: 'recommended',
    promoOnly: false,
  });

  const [modal, setModal] = useState<ModalState>({ open: false });

  const lastFocusForFiltersRef = useRef<HTMLElement | null>(null);
  const lastFocusForModalRef = useRef<HTMLElement | null>(null);
  const filtersBtnRef = useRef<HTMLButtonElement | null>(null);

  const loadMenu = useCallback(async () => {
    setError(null);
    setLoading(true);

    try {
      const raw = await MenuPublicService.getMenuItems();
      const arr = readArrayItems(raw);

      const next: MenuItemPublic[] = [];
      for (const v of arr) {
        const it = normalizeMenuItemPublic(v);
        if (!it) continue;
        next.push(it);
      }

      setItems(next);
    } catch (_e: unknown) {
      setItems([]);
      setError('We couldn’t load the menu right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMenu();
  }, [loadMenu]);

  // Listen for Header-triggered filter open
  useEffect(() => {
    const onOpen = () => {
      lastFocusForFiltersRef.current =
        typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setFiltersOpen(true);
    };

    window.addEventListener(MENU_OPEN_FILTERS_EVENT, onOpen as EventListener);
    return () => window.removeEventListener(MENU_OPEN_FILTERS_EVENT, onOpen as EventListener);
  }, []);

  const categoriesWithItems = useMemo<Set<MenuCategory>>(() => {
    const set = new Set<MenuCategory>();
    for (const it of items) {
      const c = readCategory(it);
      if (c) set.add(c);
    }
    return set;
  }, [items]);

  useEffect(() => {
    if (selectedCategory === 'all') return;
    if (!categoriesWithItems.has(selectedCategory)) setSelectedCategory('all');
  }, [categoriesWithItems, selectedCategory]);

  const dealItems = useMemo<MenuItemPublic[]>(() => {
    const out = items.filter((it) => readIsDeal(it));
    out.sort((a, b) => {
      const ai = readImageUrl(a) ? 1 : 0;
      const bi = readImageUrl(b) ? 1 : 0;
      return bi - ai || readName(a).localeCompare(readName(b));
    });
    return out.slice(0, 12);
  }, [items]);

  const deals = useMemo<DealCard[]>(() => dealItems.map(toDealCard), [dealItems]);

  const popular = useMemo<MenuItemPublic[]>(() => {
    const scored = items
      .map((it) => ({ it, score: readPopularityScore(it) }))
      .filter((x) => x.score > 0);

    scored.sort((a, b) => b.score - a.score || readName(a.it).localeCompare(readName(b.it)));
    const primary = scored.map((x) => x.it).slice(0, 12);

    if (primary.length >= 6) return primary;

    const withImages = items.filter((it) => Boolean(readImageUrl(it)));
    withImages.sort((a, b) => readName(a).localeCompare(readName(b)));
    const deduped = withImages.filter((it) => !primary.some((p) => readId(p) === readId(it)));

    return [...primary, ...deduped.slice(0, Math.max(0, 12 - primary.length))];
  }, [items]);

  const filteredSortedItems = useMemo<MenuItemPublic[]>(() => {
    const q = searchText;
    const selectedTags = Array.from(filters.tags.values());
    const out: MenuItemPublic[] = [];

    for (const it of items) {
      if (selectedCategory !== 'all' && readCategory(it) !== selectedCategory) continue;
      if (!matchesSearch(it, q)) continue;
      if (filters.promoOnly && !readIsDeal(it)) continue;

      let ok = true;
      for (const k of selectedTags) {
        if (!matchesTagKey(it, k)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      const price = readPriceCents(it);
      if (!matchesPriceRange(price, filters.priceRange)) continue;

      out.push(it);
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
    const n = filteredSortedItems.length;

    // Only show when it adds value (active search/filters/category)
    const hasSearch = searchText.trim().length > 0;
    const hasCategory = selectedCategory !== 'all';
    const hasFilters =
      filters.tags.size > 0 ||
      filters.priceRange !== 'any' ||
      filters.promoOnly ||
      String(filters.sort) !== 'recommended';

    if (!hasSearch && !hasCategory && !hasFilters) return ''; // don't clutter

    if (n === 0) return 'No matches — try clearing filters';
    return `Showing ${n} match${n === 1 ? '' : 'es'}`;
  }, [filteredSortedItems.length, searchText, selectedCategory, filters]);

  const handleFiltersOpenChange = useCallback((open: boolean) => {
    setFiltersOpen(open);
    if (!open) {
      queueMicrotask(() => {
        const el = lastFocusForFiltersRef.current;
        if (el && typeof document !== 'undefined' && document.contains(el)) el.focus();
        else filtersBtnRef.current?.focus();
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
      const el = lastFocusForModalRef.current;
      if (el && typeof document !== 'undefined' && document.contains(el)) el.focus();
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

  const applyDeal = useCallback(
    (dealId: string) => {
      const hit = items.find((it) => readId(it) === dealId) ?? null;
      if (!hit) return;

      const c = readCategory(hit);
      setSelectedCategory(c ? c : 'all');
      setFilters((prev) => ({ ...prev, promoOnly: true }));
      openItem(hit);
    },
    [items, openItem],
  );

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-10 pt-4">
      {loading ? (
        <div className="flex flex-col items-center gap-4 py-16 text-gray-500">
          <Spinner />
          <p className="text-sm">Loading the menu…</p>
        </div>
      ) : error ? (
        <div className="py-16">
          <div className="mx-auto max-w-lg rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-800">
            <p className="text-sm font-semibold">{error}</p>
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={loadMenu}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-orange-600 px-5 text-sm font-semibold text-white hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6 space-y-6">
            <DealsRail deals={deals} onSelect={(dealId) => applyDeal(dealId)} />

            <PopularRail
              items={popular}
              onOpenItem={openItem}
              getPriceCents={readPriceCents}
              getAvailable={readAvailable}
              emptyHintActionLabel="Clear all"
              onEmptyHintAction={clearAll}
            />
          </div>

          <div className="mt-8 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">Browse categories</p>
              <p className="mt-0.5 text-xs text-gray-500">
                Want deals only? Open filters and turn on “Promo only”.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                aria-label="Open filters"
              >
                Filters
              </button>

              <button
                type="button"
                onClick={() => {
                  setFilters((prev) => ({ ...prev, promoOnly: true }));
                  setFiltersOpen(true);
                }}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                aria-label="Open filters and show deals only"
              >
                Deals
              </button>
            </div>
          </div>

          <div className="mt-6">
            <CategoryTabs
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              availableCategories={categoriesWithItems}
            />
          </div>
          {filteredSortedItems.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              No matches for your current filters.
              <button
                type="button"
                onClick={clearAll}
                className="ml-2 font-semibold text-orange-700 underline underline-offset-4 hover:text-orange-800"
              >
                Clear all
              </button>
            </div>
          ) : null}
          <div className="mt-5">
            <MenuGrid
              items={filteredSortedItems}
              onOpenItem={openItem}
              getPriceCents={readPriceCents}
              getAvailable={readAvailable}
              emptyHintActionLabel="Clear all"
              onEmptyHintAction={clearAll}
            />
          </div>

          <MenuFilters
            open={filtersOpen}
            onOpenChange={handleFiltersOpenChange}
            searchText={searchText}
            onSearchTextChange={setSearchText}
            selectedTags={filters.tags}
            onSelectedTagsChange={(next: Set<MenuTagKey>) =>
              setFilters((prev) => ({ ...prev, tags: next }))
            }
            priceRange={filters.priceRange}
            onPriceRangeChange={(next: MenuPriceRangeKey) =>
              setFilters((prev) => ({ ...prev, priceRange: next }))
            }
            sort={filters.sort}
            onSortChange={(next: MenuSortKey) => setFilters((prev) => ({ ...prev, sort: next }))}
            promoOnly={filters.promoOnly}
            onPromoOnlyChange={(next: boolean) =>
              setFilters((prev) => ({ ...prev, promoOnly: Boolean(next) }))
            }
            onClearAll={clearAll}
          />

          {modal.open ? <MenuItemModal item={modal.item} onClose={closeItem} /> : null}
        </>
      )}
    </main>
  );
}
