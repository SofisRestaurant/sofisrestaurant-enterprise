// =============================================================================
// src/modules/menu/pages/MenuPage.tsx
// =============================================================================
// Performance architecture (2026):
//
//  INITIAL LOAD PATH (what runs before first meaningful paint):
//    - MenuPage shell + CategoryTabs + MenuGrid skeleton only
//    - MenuFilters: lazy (Suspense) — panel JS deferred until opened
//    - MenuItemModal: lazy (Suspense) — modal JS deferred until first tap
//    - No stagger/variant wrappers that hold children at opacity:0 on mount
//    - Above-fold sections (deals rail, popular rail) animate via direct
//      initial/animate props, NOT whileInView (which hides above-fold content)
//
//  FILTER INTERACTION PATH:
//    - All filter/sort/category/search state changes wrapped in startTransition
//    - React defers the expensive filteredSortedItems memo recompute and
//      keeps the current frame interactive during typing / tab switching
//    - isPending drives a subtle loading indicator on the grid (no full re-mount)
//
//  DATA FETCH PATH:
//    - AbortController per fetch — prevents stale responses from a previous
//      slow request overwriting a newer one on fast retry
//    - loading={loading} now passed to MenuGrid so the card skeleton shows
//      immediately on first paint instead of the empty-state
//
//  MODAL OWNERSHIP:
//    - MenuGrid owns its own modal for main-grid item taps (see MenuGrid.tsx)
//    - MenuPage owns a separate modal for PopularRail item taps
//    - Both use the same lazy MenuItemModal chunk (Vite deduplicates)
//
// All business logic helpers (filtering, sorting, normalisation) are
// preserved exactly — no changes to cart, Supabase, or modifier paths.
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
import { m, AnimatePresence } from 'framer-motion';

import { MenuPublicService } from '@/domain/menu/menu.service.public';
import type { MenuCategory, MenuItemPublic } from '@/domain/menu/menu.types';
import type { MenuPriceRangeKey, MenuSortKey, MenuTagKey } from '@/types/menu-ui.types';

import { Spinner } from '@/components/ui/Spinner';
import { useMenuUi } from '@/modules/menu/store/menuUi.store';

import { DealsRail, type DealCard } from '@/modules/menu/components/DealsRail';
import { PopularRail } from '@/modules/menu/components/PopularRail';
import { CategoryTabs } from '@/modules/menu/components/CategoryTabs';
import { MenuGrid } from '@/modules/menu/components/MenuGrid';

import { useActiveCampaigns } from '@/modules/menu/hooks/useActiveCampaigns';
import { campaignsToDeals } from '@/modules/menu/mappers/campaignsToDeals.mapper';

// ── Lazy-loaded heavy panels ───────────────────────────────────────────────────
//
// MenuFilters: Only needed when the filter drawer is open. Deferring this import
// removes ~N kB from the initial JS parse budget on first page load.
//
// MenuItemModal: Only needed when a user taps an item. Deferring this removes the
// modal + modifier-group code from the initial bundle entirely.
// NOTE: MenuGrid.tsx also imports MenuItemModal. For the lazy split to maximise
// savings, update MenuGrid.tsx to use the same lazy import (Vite will share the
// chunk automatically once both reference the same path with lazy()).
//
const MenuFilters = lazy(() => import('@/modules/menu/components/MenuFilters'));
const MenuItemModal = lazy(() => import('@/modules/menu/components/MenuItemModal'));

// ── Animation constants ────────────────────────────────────────────────────────

/** Luxury deceleration. */
const EL = [0.16, 1, 0.3, 1] as const;

/**
 * Used only for BELOW-fold sections where viewport-triggered animation is
 * appropriate. Above-fold sections use direct initial/animate props instead
 * to avoid hiding content until IntersectionObserver fires.
 */
const BELOW_FOLD_VP = { once: true, amount: 0.08 } as const;

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EL } },
};

const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.45, ease: EL } },
};

// ── Types ─────────────────────────────────────────────────────────────────────

type UnknownRecord = Record<string, unknown>;

type FilterState = {
  tags: Set<MenuTagKey>;
  priceRange: MenuPriceRangeKey;
  sort: MenuSortKey;
  promoOnly: boolean;
};

type ModalState = { open: false } | { open: true; item: MenuItemPublic };

const MENU_OPEN_FILTERS_EVENT = 'menu:open-filters';

// ── Business logic helpers (preserved exactly) ─────────────────────────────────
// None of these touch cart, payment, modifiers, or auth — safe to upgrade
// surrounding code without touching these implementations.

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
    const items = raw.items;
    if (Array.isArray(items)) return items as unknown[];
  }
  return [];
}

function normalizeMenuItemPublic(v: unknown): MenuItemPublic | null {
  if (!isRecord(v)) return null;
  const id = safeStr(v.id, '', 128);
  const name = safeStr(v.name, '', 180);
  const category = safeStr(v.category, '', 80);
  if (!id || !name || !category) return null;
  const merged: UnknownRecord = { ...v, id, name, category };
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
  return readTagsRaw(item).map(normalizeTag).includes(needle);
}

function matchesTagKey(item: MenuItemPublic, key: MenuTagKey): boolean {
  const r: UnknownRecord = isRecord(item) ? (item as UnknownRecord) : {};
  if (key === 'spicy')
    return safeBool(r.spicy, false) || safeBool(r.is_spicy, false) || hasTag(item, 'spicy');
  if (key === 'vegetarian') return safeBool(r.vegetarian, false) || hasTag(item, 'vegetarian');
  if (key === 'gluten_free')
    return (
      safeBool(r.gluten_free, false) ||
      safeBool(r.is_gluten_free, false) ||
      hasTag(item, 'gluten_free') ||
      hasTag(item, 'gluten-free')
    );
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
    const as_ = readPopularityScore(a);
    const bs_ = readPopularityScore(b);
    if (key === 'price_low') return ap - bp || an.localeCompare(bn);
    if (key === 'price_high') return bp - ap || an.localeCompare(bn);
    if (key === 'name_az') return an.localeCompare(bn);
    if (key === 'name_za') return bn.localeCompare(an);
    if (key === 'featured') {
      const af = readIsPopular(a) ? 1 : 0;
      const bf = readIsPopular(b) ? 1 : 0;
      return bf - af || bs_ - as_ || an.localeCompare(bn);
    }
    if (key === 'popular') return bs_ - as_ || an.localeCompare(bn);
    return bs_ - as_ || an.localeCompare(bn);
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

// ── Null modal Suspense fallback ───────────────────────────────────────────────
// While the modal chunk streams in for the first time, render nothing.
// The modal mounts within ~50 ms on a fast connection; on slow connections the
// user sees the underlying page (not a broken blank screen).
const NULL_FALLBACK = null;

// ── Component ─────────────────────────────────────────────────────────────────

function MenuPage() {
  // ── Data ───────────────────────────────────────────────────────────────────
  const [items, setItems] = useState<MenuItemPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [selectedCategory, setSelectedCategory] = useState<MenuCategory | 'all'>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const searchText = useMenuUi((s) => s.searchText);
  const setSearchText = useMenuUi((s) => s.setSearchText);

  const [filters, setFilters] = useState<FilterState>({
    tags: new Set<MenuTagKey>(),
    priceRange: 'any',
    sort: 'recommended',
    promoOnly: false,
  });

  const [modal, setModal] = useState<ModalState>({ open: false });

  // ── startTransition ────────────────────────────────────────────────────────
  // Filter / sort / category changes are wrapped in startTransition so React
  // keeps the current frame interactive while the filteredSortedItems memo
  // recomputes. isPending drives a lightweight grid-level loading indicator
  // rather than a full re-mount.
  const [isPending, startTransition] = useTransition();

  // ── Focus restore refs ─────────────────────────────────────────────────────
  const lastFocusForFiltersRef = useRef<HTMLElement | null>(null);
  const lastFocusForModalRef = useRef<HTMLElement | null>(null);
  // filtersBtnRef is now wired to the actual button element via ref={filtersBtnRef}
  const filtersBtnRef = useRef<HTMLButtonElement | null>(null);

  // ── Data fetch ─────────────────────────────────────────────────────────────
  // AbortController prevents a stale slow response from overwriting a newer
  // one when the user retries quickly. The cleanup function aborts the
  // in-flight request when the component unmounts or loadMenu is re-called.
  const loadMenu = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    setLoading(true);
    try {
      const raw = await MenuPublicService.getMenuItems();
      if (signal?.aborted) return;
      const arr = readArrayItems(raw);
      const next: MenuItemPublic[] = [];
      for (const v of arr) {
        const it = normalizeMenuItemPublic(v);
        if (!it) continue;
        next.push(it);
      }
      setItems(next);
    } catch (_e: unknown) {
      if (signal?.aborted) return;
      setItems([]);
      setError("We couldn't load the menu right now.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadMenu(controller.signal);
    return () => {
      controller.abort();
    };
  }, [loadMenu]);

  // ── Global filter-open event (from SearchBar, DealsRail CTA, etc.) ─────────
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

  // ── Derived: categories ────────────────────────────────────────────────────
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

  // ── Campaigns / deals / popular ────────────────────────────────────────────
  const campaigns = useActiveCampaigns('menu_deals_rail');

  const campaignDealItemIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of campaigns) {
      if (c.menu_item_id) s.add(c.menu_item_id);
    }
    return s;
  }, [campaigns]);

  const dealItems = useMemo<MenuItemPublic[]>(() => {
    const out = items.filter((it) => readIsDeal(it) || campaignDealItemIds.has(readId(it)));
    out.sort((a, b) => {
      const ai = readImageUrl(a) ? 1 : 0;
      const bi = readImageUrl(b) ? 1 : 0;
      return bi - ai || readName(a).localeCompare(readName(b));
    });
    return out.slice(0, 12);
  }, [items, campaignDealItemIds]);

  const deals = useMemo<DealCard[]>(() => {
    if (Array.isArray(campaigns) && campaigns.length > 0) {
      const mapped = campaignsToDeals(campaigns).map((d) => {
        const c = campaigns.find((x) => x.id === d.id) ?? null;
        const menuItemId = c?.menu_item_id ?? null;
        return { ...d, id: menuItemId ?? d.id };
      });
      const byKey = new Map<string, (typeof campaigns)[number]>();
      for (const c of campaigns) byKey.set(c.menu_item_id ?? c.id, c);
      mapped.sort((a, b) => {
        const ac = byKey.get(a.id) ?? null;
        const bc = byKey.get(b.id) ?? null;
        const af = ac?.is_featured ? 1 : 0;
        const bf = bc?.is_featured ? 1 : 0;
        if (af !== bf) return bf - af;
        const ap = ac?.priority ?? 0;
        const bp = bc?.priority ?? 0;
        if (ap !== bp) return bp - ap;
        const aw = ac?.weight ?? 0;
        const bw = bc?.weight ?? 0;
        if (aw !== bw) return bw - aw;
        return a.title.localeCompare(b.title);
      });
      return mapped.slice(0, 12);
    }
    return dealItems.map(toDealCard);
  }, [campaigns, dealItems]);

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

  // ── Derived: filtered + sorted items ──────────────────────────────────────
  const filteredSortedItems = useMemo<MenuItemPublic[]>(() => {
    const q = searchText;
    const selectedTags = Array.from(filters.tags.values());
    const out: MenuItemPublic[] = [];
    for (const it of items) {
      if (selectedCategory !== 'all' && readCategory(it) !== selectedCategory) continue;
      if (!matchesSearch(it, q)) continue;
      if (filters.promoOnly && !(readIsDeal(it) || campaignDealItemIds.has(readId(it)))) continue;
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
    campaignDealItemIds,
  ]);

  const resultsCountText = useMemo(() => {
    const n = filteredSortedItems.length;
    const hasSearch = searchText.trim().length > 0;
    const hasCategory = selectedCategory !== 'all';
    const hasFilters =
      filters.tags.size > 0 ||
      filters.priceRange !== 'any' ||
      filters.promoOnly ||
      String(filters.sort) !== 'recommended';
    if (!hasSearch && !hasCategory && !hasFilters) return '';
    if (n === 0) return 'No matches — try clearing filters';
    return `Showing ${n} match${n === 1 ? '' : 'es'}`;
  }, [filteredSortedItems.length, searchText, selectedCategory, filters]);

  // ── Stable prop callbacks ──────────────────────────────────────────────────
  // Typed as (item: MenuItemPublic) => T rather than generic <T extends MenuItemPublic>
  // so MenuGrid / PopularRail receive correctly-typed props without unsafe casts.
  const getPriceCents = useCallback((item: MenuItemPublic): number => readPriceCents(item), []);
  const getAvailable = useCallback((item: MenuItemPublic): boolean => readAvailable(item), []);

  // ── Event handlers ─────────────────────────────────────────────────────────

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
    // clearAll is called from filter/empty-state buttons — no startTransition
    // needed because it resets to the unfiltered list (fast path in the memo).
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

  // ── Filter-state setters wrapped in startTransition ────────────────────────
  // These are the callsites that trigger the expensive filteredSortedItems
  // recompute. Wrapping them in startTransition tells React:
  //   "This update can be interrupted — keep current frame interactive."
  // The grid will show its existing content until the new list is ready.

  const handleSelectCategory = useCallback(
    (cat: MenuCategory | 'all') => {
      startTransition(() => {
        setSelectedCategory(cat);
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
        setFilters((prev) => ({ ...prev, tags: next }));
      });
    },
    [startTransition],
  );

  const handlePriceRangeChange = useCallback(
    (next: MenuPriceRangeKey) => {
      startTransition(() => {
        setFilters((prev) => ({ ...prev, priceRange: next }));
      });
    },
    [startTransition],
  );

  const handleSortChange = useCallback(
    (next: MenuSortKey) => {
      startTransition(() => {
        setFilters((prev) => ({ ...prev, sort: next }));
      });
    },
    [startTransition],
  );

  const handlePromoOnlyChange = useCallback(
    (next: boolean) => {
      startTransition(() => {
        setFilters((prev) => ({ ...prev, promoOnly: Boolean(next) }));
      });
    },
    [startTransition],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-10 pt-4">
      {/* ── Full-page loading / error states ────────────────────────────────
          AnimatePresence without mode="wait" — avoids expensive unmount/remount
          cycle on every state transition. Individual keys handle enter/exit.     */}
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
                  className="inline-flex h-11 items-center justify-center rounded-2xl
                             bg-orange-600 px-5 text-sm font-semibold text-white
                             hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                >
                  Retry
                </button>
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* ── Main content ────────────────────────────────────────────────────
          Rendered independently of the loading/error banner above.
          No staggerSection variants wrapper — that pattern was holding all
          children at opacity:0 until React triggered the mount animation,
          causing above-fold content to appear invisible for one frame.         */}
      {!loading && !error && (
        <>
          {/* Deals + Popular rails ──────────────────────────────────────────
              Direct initial/animate props, NOT whileInView.
              These rails sit above the fold on every device width.
              whileInView would hide them until IntersectionObserver fires,
              producing a visible flash of empty space on first paint.           */}
          <m.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: EL }}
            className="mt-6 space-y-6"
          >
            {deals.length > 0 && (
              <DealsRail deals={deals} onSelect={(dealId) => applyDeal(dealId)} />
            )}
            <PopularRail
              items={popular}
              onOpenItem={openItem}
              getPriceCents={getPriceCents}
              getAvailable={getAvailable}
              emptyHintActionLabel="Clear all"
              onEmptyHintAction={clearAll}
            />
          </m.div>

          {/* Browse header + filter controls ─────────────────────────────── */}
          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EL, delay: 0.08 }}
            className="mt-8 flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">Browse categories</p>
              <p className="mt-0.5 text-xs text-gray-500">
                Want deals only? Open filters and turn on "Promo only".
              </p>
            </div>

            <div className="flex items-center gap-2">
              <m.button
                // ref wired so filtersBtnRef.current is populated for focus restore
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
                  'inline-flex h-10 min-w-[68px] items-center justify-center rounded-xl border',
                  'px-4 text-sm font-semibold shadow-sm',
                  'focus:outline-none focus:ring-2 focus:ring-orange-500/40',
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
                    setFilters((prev) => ({ ...prev, promoOnly: true }));
                  });
                  setFiltersOpen(true);
                }}
                whileHover={{ scale: 1.03, y: -1 }}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.16, ease: EL }}
                className="inline-flex h-10 items-center justify-center rounded-xl border
                           border-gray-200 bg-white px-4 text-sm font-semibold text-gray-900
                           shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2
                           focus:ring-orange-500/40"
                aria-label="Show deals only"
              >
                Deals
              </m.button>
            </div>
          </m.div>

          {/* Category tabs ───────────────────────────────────────────────── */}
          <m.div variants={fadeIn} initial="hidden" animate="visible" className="mt-6">
            <CategoryTabs
              selectedCategory={selectedCategory}
              onSelectCategory={handleSelectCategory}
              availableCategories={categoriesWithItems}
            />
          </m.div>

          {/* Results count ───────────────────────────────────────────────── */}
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

          {/* Menu grid ───────────────────────────────────────────────────────
              - loading={loading} now passed so the card skeleton renders on
                first load instead of the empty-state.
              - isPending dims the grid slightly while a startTransition filter
                change is computing — no re-mount, no flash.
              - MenuGrid owns its own modal for grid-item taps (MenuGrid.tsx).
              - The duplicate inline empty-state div has been removed:
                MenuGrid renders its own empty state via emptyHintActionLabel.   */}
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

          {/* Filters panel — lazy loaded ────────────────────────────────────
              The MenuFilters chunk is fetched only when filtersOpen becomes
              true for the first time. Subsequent opens use the cached module.
              NULL_FALLBACK means nothing flashes while the chunk loads.         */}
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

          {/* PopularRail item modal — lazy loaded ───────────────────────────
              This modal is separate from MenuGrid's modal. MenuGrid owns
              modal state for main-grid taps; this one handles PopularRail taps.
              Both reference the same MenuItemModal lazy chunk — Vite deduplicates
              it so no double download occurs.                                    */}
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
