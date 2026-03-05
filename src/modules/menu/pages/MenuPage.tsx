import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MenuPublicService } from '@/domain/menu/menu.service.public';
import type { MenuCategory, MenuItemPublic } from '@/domain/menu/menu.types';
import { Spinner } from '@/components/ui/Spinner';

import { DealsRail, type DealCard } from '@/modules/menu/components/DealsRail';
import { PopularRail } from '@/modules/menu/components/PopularRail';
import { CategoryTabs } from '@/modules/menu/components/CategoryTabs';
import { MenuGrid } from '@/modules/menu/components/MenuGrid';
import MenuFilters from '@/modules/menu/components/MenuFilters';

// ─────────────────────────────────────────────────────────────────────────────
// Local types (kept local to avoid “missing exported member” TS errors)
// These unions match the switch-cases used in this file.
// ─────────────────────────────────────────────────────────────────────────────

export type MenuTagKey = 'spicy' | 'vegetarian' | 'gluten_free' | 'kids';

export type MenuPriceRangeKey = 'any' | 'under_10' | '10_20' | '20_30' | '30_plus';

export type MenuSortKey = 'recommended' | 'price_low' | 'price_high' | 'name_az' | 'name_za';

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function safeStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function safeNum(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function safeBool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

/**
 * Pricing strategy (public UI):
 * - Prefer price_cents / unit_price_cents if present.
 * - Else fall back to item.price (commonly dollars in your DB/view).
 * - Always return cents for consistent rendering.
 */
function readPriceCents(item: MenuItemPublic): number {
  const r: UnknownRecord = isRecord(item) ? item : {};

  const centsRaw =
    (typeof r.price_cents === 'number' ? r.price_cents : undefined) ??
    (typeof r.unit_price_cents === 'number' ? r.unit_price_cents : undefined);

  if (typeof centsRaw === 'number' && Number.isFinite(centsRaw) && centsRaw >= 0) {
    return Math.round(centsRaw);
  }

  // fallback: item.price is usually dollars (number)
  const dollars = safeNum(r.price, 0);
  return Math.max(0, Math.round(dollars * 100));
}

function getImageUrl(item: MenuItemPublic): string | null {
  const r: UnknownRecord = isRecord(item) ? item : {};
  const v = r.image_url ?? r.imageUrl ?? r.photo_url ?? r.photoUrl;
  const s = safeStr(v, '');
  return s.length > 0 ? s : null;
}

function getTags(item: MenuItemPublic): string[] {
  const r: UnknownRecord = isRecord(item) ? item : {};
  const raw = r.tags;

  if (Array.isArray(raw)) {
    const out: string[] = [];
    for (const t of raw) {
      if (typeof t === 'string' && t.trim().length > 0) out.push(t.trim());
    }
    return out;
  }

  // sometimes stored as CSV
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
  }

  return [];
}

function hasTag(item: MenuItemPublic, tag: string): boolean {
  const tags = getTags(item).map((t) => t.toLowerCase());
  return tags.includes(tag.toLowerCase());
}

function isDealItem(item: MenuItemPublic): boolean {
  const r: UnknownRecord = isRecord(item) ? item : {};
  const flag =
    safeBool(r.is_deal, false) ||
    safeBool(r.deal, false) ||
    safeBool(r.promo, false) ||
    safeBool(r.is_promo, false);
  if (flag) return true;

  // allow tags like "deal", "promo", "special"
  return hasTag(item, 'deal') || hasTag(item, 'promo') || hasTag(item, 'special');
}

function popularityScore(item: MenuItemPublic): number {
  const r: UnknownRecord = isRecord(item) ? item : {};
  const score =
    safeNum(r.popularity_score, NaN) ||
    safeNum(r.popularity, NaN) ||
    safeNum(r.popularityScore, NaN) ||
    safeNum(r.rank, NaN);

  if (Number.isFinite(score)) return score;

  // fallback: if explicitly flagged popular
  if (safeBool(r.is_popular, false) || hasTag(item, 'popular')) return 1000;

  return 0;
}

function matchesSearch(item: MenuItemPublic, q: string): boolean {
  const query = q.trim().toLowerCase();
  if (query.length === 0) return true;

  const r: UnknownRecord = isRecord(item) ? item : {};
  const name = safeStr(r.name, '').toLowerCase();
  const desc = safeStr(r.description, '').toLowerCase();
  const category = safeStr(r.category, '').toLowerCase();
  const tags = getTags(item).join(' ').toLowerCase();

  return (
    name.includes(query) || desc.includes(query) || category.includes(query) || tags.includes(query)
  );
}

function matchesPriceRange(priceCents: number, range: MenuPriceRangeKey): boolean {
  switch (range) {
    case 'any':
      return true;
    case 'under_10':
      return priceCents < 1000;
    case '10_20':
      return priceCents >= 1000 && priceCents <= 2000;
    case '20_30':
      return priceCents > 2000 && priceCents <= 3000;
    case '30_plus':
      return priceCents > 3000;
    default: {
      const _exhaustive: never = range;
      return _exhaustive;
    }
  }
}

function compareBySort(a: MenuItemPublic, b: MenuItemPublic, sort: MenuSortKey): number {
  const ar: UnknownRecord = isRecord(a) ? a : {};
  const br: UnknownRecord = isRecord(b) ? b : {};

  const an = safeStr(ar.name, '');
  const bn = safeStr(br.name, '');

  const ap = readPriceCents(a);
  const bp = readPriceCents(b);

  const as = popularityScore(a);
  const bs = popularityScore(b);

  // stable secondary sort by name
  switch (sort) {
    case 'recommended':
      return bs - as || an.localeCompare(bn);
    case 'price_low':
      return ap - bp || an.localeCompare(bn);
    case 'price_high':
      return bp - ap || an.localeCompare(bn);
    case 'name_az':
      return an.localeCompare(bn);
    case 'name_za':
      return bn.localeCompare(an);
    default: {
      const _exhaustive: never = sort;
      return _exhaustive;
    }
  }
}

type FilterState = {
  tags: Set<MenuTagKey>;
  priceRange: MenuPriceRangeKey;
  sort: MenuSortKey;
  promoOnly: boolean;
};

type ModalState = { open: false } | { open: true; item: MenuItemPublic };

function getId(item: MenuItemPublic): string {
  const r: UnknownRecord = isRecord(item) ? item : {};
  return safeStr(r.id, '');
}

function getName(item: MenuItemPublic): string {
  const r: UnknownRecord = isRecord(item) ? item : {};
  return safeStr(r.name, 'Item');
}

function getDescription(item: MenuItemPublic): string {
  const r: UnknownRecord = isRecord(item) ? item : {};
  return safeStr(r.description, '');
}

function getCategory(item: MenuItemPublic): MenuCategory | '' {
  const r: UnknownRecord = isRecord(item) ? item : {};
  return safeStr(r.category, '') as MenuCategory | '';
}

function getAvailable(item: MenuItemPublic): boolean {
  const r: UnknownRecord = isRecord(item) ? item : {};
  // default: available unless explicitly false
  return safeBool(r.available, true);
}

function stableFilterTag(t: string): MenuTagKey | null {
  const k = t.trim().toLowerCase();
  if (k === 'spicy') return 'spicy';
  if (k === 'vegetarian') return 'vegetarian';
  if (k === 'gluten_free' || k === 'gluten-free' || k === 'glutenfree') return 'gluten_free';
  if (k === 'kids' || k === 'kid') return 'kids';
  return null;
}

function toDealCard(it: MenuItemPublic): DealCard {
  const r: UnknownRecord = isRecord(it) ? it : {};
  const startsAt =
    typeof r.starts_at === 'string'
      ? r.starts_at
      : typeof r.startsAt === 'string'
        ? r.startsAt
        : null;
  const endsAt =
    typeof r.ends_at === 'string' ? r.ends_at : typeof r.endsAt === 'string' ? r.endsAt : null;

  return {
    id: getId(it) || `deal_${Math.random().toString(16).slice(2)}`,
    title: getName(it),
    subtitle: getDescription(it) || null,
    badge: 'DEAL',
    startsAt,
    endsAt,
    ctaLabel: 'See deal',
  };
}

export default function MenuPage() {
  const [items, setItems] = useState<MenuItemPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<MenuCategory | 'all'>('all');
  const [searchText, setSearchText] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [filters, setFilters] = useState<FilterState>({
    tags: new Set<MenuTagKey>(),
    priceRange: 'any',
    sort: 'recommended',
    promoOnly: false,
  });

  const [modal, setModal] = useState<ModalState>({ open: false });
  const lastFocusRef = useRef<HTMLElement | null>(null);

  const loadMenu = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);

      const data = await MenuPublicService.getMenuItems();
      const list = Array.isArray(data) ? data : [];

      const normalized: MenuItemPublic[] = [];
      for (const x of list) {
        if (!x) continue;
        if (!isRecord(x)) continue;
        const id = safeStr(x.id, '');
        if (id.length === 0) continue;
        normalized.push(x as MenuItemPublic);
      }

      setItems(normalized);
    } catch (_err: unknown) {
      setItems([]);
      setError('We couldn’t load the menu right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  const categoriesWithItems = useMemo(() => {
    const set = new Set<MenuCategory>();
    for (const item of items) {
      const c = getCategory(item);
      if (c) set.add(c);
    }
    return set;
  }, [items]);

  useEffect(() => {
    if (selectedCategory !== 'all' && !categoriesWithItems.has(selectedCategory)) {
      setSelectedCategory('all');
    }
  }, [categoriesWithItems, selectedCategory]);

  const deals = useMemo(() => {
    const out: MenuItemPublic[] = [];
    for (const it of items) if (isDealItem(it)) out.push(it);
    // prefer items with images + deterministic order
    out.sort((a, b) => {
      const ai = getImageUrl(a) ? 1 : 0;
      const bi = getImageUrl(b) ? 1 : 0;
      if (ai !== bi) return bi - ai;
      return getName(a).localeCompare(getName(b));
    });
    return out.slice(0, 12);
  }, [items]);

  const popular = useMemo(() => {
    const scored = items
      .map((it) => ({ it, score: popularityScore(it) }))
      .filter((x) => x.score > 0);

    scored.sort((a, b) => b.score - a.score || getName(a.it).localeCompare(getName(b.it)));
    const primary = scored.map((x) => x.it).slice(0, 12);

    if (primary.length >= 6) return primary;

    // fallback: pick visually appealing items
    const withImages = items.filter((it) => Boolean(getImageUrl(it)));
    withImages.sort((a, b) => getName(a).localeCompare(getName(b)));
    const fallback = withImages
      .filter((it) => !primary.some((p) => getId(p) === getId(it)))
      .slice(0, 12 - primary.length);
    return [...primary, ...fallback];
  }, [items]);

  const filteredSortedItems = useMemo(() => {
    const q = searchText;
    const tagKeys = Array.from(filters.tags.values());
    const promoOnly = filters.promoOnly;

    const base: MenuItemPublic[] = [];
    for (const it of items) {
      if (selectedCategory !== 'all' && getCategory(it) !== selectedCategory) continue;
      if (!matchesSearch(it, q)) continue;

      if (promoOnly && !isDealItem(it)) continue;

      // tag toggles
      let ok = true;
      for (const k of tagKeys) {
        if (!hasTag(it, k)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      const price = readPriceCents(it);
      if (!matchesPriceRange(price, filters.priceRange)) continue;

      base.push(it);
    }

    base.sort((a, b) => compareBySort(a, b, filters.sort));
    return base;
  }, [
    filters.priceRange,
    filters.promoOnly,
    filters.sort,
    filters.tags,
    items,
    searchText,
    selectedCategory,
  ]);

  const openItem = useCallback((item: MenuItemPublic) => {
    lastFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setModal({ open: true, item });
  }, []);

  const closeItem = useCallback(() => {
    setModal({ open: false });
    queueMicrotask(() => {
      lastFocusRef.current?.focus?.();
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
  }, []);

  const onClickFilterButton = useCallback(() => {
    lastFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setFiltersOpen(true);
  }, []);

  const applyDeal = useCallback(
    (intent: {
      category?: MenuCategory | 'all';
      promoOnly?: boolean;
      openItem?: MenuItemPublic;
    }) => {
      if (intent.category) setSelectedCategory(intent.category);
      if (typeof intent.promoOnly === 'boolean') {
        // ✅ keep promoOnly strictly boolean (fixes boolean|undefined error)
        setFilters((prev): FilterState => ({ ...prev, promoOnly: Boolean(intent.promoOnly) }));
      }
      if (intent.openItem) openItem(intent.openItem);
    },
    [openItem],
  );

  // MenuFilters expects tags as a Set; we keep that as-is.
  // We also keep the parent-controlled open state.
  const selectedTags = filters.tags;

  // Derive a safe “tag set” from menu data for the filters UI (optional enhancement).
  const availableTags = useMemo(() => {
    const s = new Set<MenuTagKey>();
    for (const it of items) {
      const tags = getTags(it);
      for (const t of tags) {
        const k = stableFilterTag(t);
        if (k) s.add(k);
      }
    }
    return s;
  }, [items]);

  const dealsRailCards = useMemo<DealCard[]>(() => deals.map(toDealCard), [deals]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6">
      {/* 1) Top bar: title + search + filter button */}
      <header className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-gray-900">Menu</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Deals, popular picks, and everything else.
            </p>
          </div>

          <button
            type="button"
            onClick={onClickFilterButton}
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-haspopup="dialog"
            aria-expanded={filtersOpen ? 'true' : 'false'}
          >
            Filters
          </button>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <label className="relative block w-full">
            <span className="sr-only">Search menu</span>
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search (e.g., tacos, vegetarian, spicy)…"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              type="search"
              inputMode="search"
              autoComplete="off"
            />
          </label>
        </div>
      </header>

      {/* Loading / error */}
      {loading && (
        <div className="flex flex-col items-center gap-4 py-16 text-gray-500">
          <Spinner />
          <p className="text-sm">Loading delicious food…</p>
        </div>
      )}

      {error && !loading && (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <p className="text-red-500">{error}</p>
          <button
            onClick={loadMenu}
            className="rounded-lg bg-primary px-5 py-2 font-medium text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            type="button"
          >
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* 2) DealsRail (adapted to DealsRailProps: deals + onSelect) */}
          <DealsRail
            deals={dealsRailCards}
            onSelect={(dealId) => {
              const hit = deals.find((d) => getId(d) === dealId) ?? null;
              const c = hit ? getCategory(hit) : '';
              applyDeal({
                category: c ? c : 'all',
                promoOnly: true,
                openItem: hit ?? undefined,
              });
            }}
            onViewAll={() => {
              // “View all deals”: keep UX, no deletion; just turn on promoOnly and close filters.
              setFilters((prev): FilterState => ({ ...prev, promoOnly: true }));
            }}
          />

          {/* 3) PopularRail (pass required props; use correct handler name) */}
          <PopularRail<MenuItemPublic>
            items={popular}
            onOpenItem={openItem}
            getPriceCents={readPriceCents}
            getAvailable={getAvailable}
            emptyHintActionLabel="Browse menu"
            onEmptyHintAction={() => {
              // Keep behavior: clear promoOnly but preserve other filters
              setFilters((prev): FilterState => ({ ...prev, promoOnly: false }));
            }}
          />

          {/* 4) CategoryTabs */}
          <div className="mt-4">
            <CategoryTabs
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              availableCategories={categoriesWithItems}
            />
          </div>

          {/* 5) MenuGrid */}
          <div className="mt-4">
            <MenuGrid
              items={filteredSortedItems}
              onOpenItem={openItem}
              getPriceCents={readPriceCents}
              getAvailable={getAvailable}
              emptyHintActionLabel="Clear filters"
              onEmptyHintAction={clearAll}
            />
          </div>

          {/* 6) MenuFilters (keep your wiring; add explicit param types to fix implicit-any) */}
          <MenuFilters
            open={filtersOpen}
            onOpenChange={(v: boolean) => {
              setFiltersOpen(v);
              if (!v) queueMicrotask(() => lastFocusRef.current?.focus?.());
            }}
            searchText={searchText}
            onSearchTextChange={setSearchText}
            selectedTags={selectedTags}
            onSelectedTagsChange={(next: Set<MenuTagKey>) =>
              setFilters((prev): FilterState => ({ ...prev, tags: next }))
            }
            priceRange={filters.priceRange}
            onPriceRangeChange={(next: MenuPriceRangeKey) =>
              setFilters((prev): FilterState => ({ ...prev, priceRange: next }))
            }
            sort={filters.sort}
            onSortChange={(next: MenuSortKey) =>
              setFilters((prev): FilterState => ({ ...prev, sort: next }))
            }
            promoOnly={filters.promoOnly}
            onPromoOnlyChange={(next: boolean) =>
              setFilters((prev): FilterState => ({ ...prev, promoOnly: Boolean(next) }))
            }
            onClearAll={clearAll}
            // Optional: if your MenuFilters supports rendering available tags, keep it safe:
            // availableTags={availableTags}
            // If the prop doesn't exist, TS will tell you — leave it commented.
          />

          {/* Item modal (simple, controlled by page) */}
          {modal.open && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`${getName(modal.item)} details`}
              className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center"
              onMouseDown={(e) => {
                if (e.currentTarget === e.target) closeItem();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') closeItem();
              }}
            >
              <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold text-gray-900">
                      {getName(modal.item)}
                    </h2>
                    <p className="mt-0.5 text-sm text-gray-500">
                      ${(readPriceCents(modal.item) / 100).toFixed(2)}
                      {!getAvailable(modal.item) ? ' • Out of stock' : ''}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={closeItem}
                    autoFocus
                  >
                    Close
                  </button>
                </div>

                {getImageUrl(modal.item) && (
                  <img
                    src={getImageUrl(modal.item) ?? undefined}
                    alt=""
                    className="mt-3 h-44 w-full rounded-xl object-cover"
                    loading="lazy"
                  />
                )}

                {getDescription(modal.item).trim().length > 0 && (
                  <p className="mt-3 text-sm text-gray-700">{getDescription(modal.item)}</p>
                )}

                {getTags(modal.item).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {getTags(modal.item)
                      .slice(0, 10)
                      .map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700"
                        >
                          {t}
                        </span>
                      ))}
                  </div>
                )}

                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
                    disabled={!getAvailable(modal.item)}
                    onClick={() => {
                      closeItem();
                    }}
                  >
                    Quick add
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
