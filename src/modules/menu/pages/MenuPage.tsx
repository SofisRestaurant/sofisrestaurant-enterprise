// =============================================================================
// src/pages/Menu.tsx
// MENU PAGE — Production (2026) + Public View Safe Fetch
// ----------------------------------------------------------------------------
// ✅ Fetches from MenuPublicService (which should read `menu_items_public` view)
// ✅ Defensive parsing & stable UI states
// ✅ Category extraction + auto-reset if category disappears
// ✅ Sorted output (category + sort_order + name)
// ✅ Price display supports cents or dollars drift (prefers *_cents if present)
// =============================================================================

import { useEffect, useMemo, useState, useCallback } from 'react';
import { MenuGrid } from '@/modules/menu/components/MenuGrid';
import { CategoryTabs } from '@/modules/menu/components/CategoryTabs';
import { MenuPublicService } from '@/domain/menu/menu.service.public';
import type { MenuItemPublic, MenuCategory } from '@/domain/menu/menu.types';
import { Spinner } from '@/components/ui/Spinner';

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function safeStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function safeBool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function safeNum(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Pricing strategy (public UI):
 * - Prefer price_cents / unit_price_cents if present.
 * - Else fall back to item.price (commonly dollars in your DB/view).
 * - Always return cents for consistent rendering.
 */
function readPriceCents(item: MenuItemPublic): number {
  const r: UnknownRecord = isRecord(item) ? (item as UnknownRecord) : {};

  const centsRaw =
    (typeof r.price_cents === 'number' ? r.price_cents : undefined) ??
    (typeof r.unit_price_cents === 'number' ? r.unit_price_cents : undefined);

  if (typeof centsRaw === 'number' && Number.isFinite(centsRaw) && centsRaw >= 0) {
    return Math.round(centsRaw);
  }

  // fallback: item.price is usually dollars (number)
  const dollars = safeNum((item as unknown as any).price, 0);
  return Math.max(0, Math.round(dollars * 100));
}

/**
 * Sort order:
 * 1) category (stable)
 * 2) sort_order (if present)
 * 3) name
 */
function sortMenuItems(a: MenuItemPublic, b: MenuItemPublic): number {
  const ac = safeStr((a as any).category, '');
  const bc = safeStr((b as any).category, '');
  if (ac !== bc) return ac.localeCompare(bc);

  const ar: UnknownRecord = isRecord(a) ? (a as UnknownRecord) : {};
  const br: UnknownRecord = isRecord(b) ? (b as UnknownRecord) : {};
  const aso = safeNum(ar.sort_order, 9_999);
  const bso = safeNum(br.sort_order, 9_999);
  if (aso !== bso) return aso - bso;

  const an = safeStr((a as any).name, '');
  const bn = safeStr((b as any).name, '');
  return an.localeCompare(bn);
}

export default function Menu() {
  const [items, setItems] = useState<MenuItemPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<MenuCategory | 'all'>('all');

  const loadMenu = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);

      // Should be: supabase.from('menu_items_public').select('*')...
      const data = await MenuPublicService.getMenuItems();

      const list = Array.isArray(data) ? data : [];

      // Normalize + stable ordering (client-side; server can also order)
      const normalized = list
        .filter((x): x is MenuItemPublic => Boolean(x && typeof (x as any).id === 'string'))
        .map((x) => {
          // preserve your type, but compute derived fields safely if you want later
          return x;
        })
        .sort(sortMenuItems);

      setItems(normalized);
    } catch (err: unknown) {
      // keep UI calm: don’t crash, don’t spam
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
      if (item?.category) set.add(item.category);
    }
    return set;
  }, [items]);

  useEffect(() => {
    if (selectedCategory !== 'all' && !categoriesWithItems.has(selectedCategory)) {
      setSelectedCategory('all');
    }
  }, [categoriesWithItems, selectedCategory]);

  const filteredItems = useMemo(() => {
    const base =
      selectedCategory === 'all' ? items : items.filter((i) => i.category === selectedCategory);

    // Optional: hide unavailable items LAST, or keep them visible but disabled in the card.
    // We'll keep them visible so users can see “Out of Stock”.
    return base;
  }, [items, selectedCategory]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8">
      <CategoryTabs
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        availableCategories={categoriesWithItems}
      />

      {loading && (
        <div className="flex flex-col items-center gap-4 py-20 text-gray-500">
          <Spinner />
          <p className="text-sm">Loading delicious food…</p>
        </div>
      )}

      {error && !loading && (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <p className="text-red-500">{error}</p>
          <button
            onClick={loadMenu}
            className="rounded-lg bg-primary px-5 py-2 font-medium text-white transition hover:opacity-90"
            type="button"
          >
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && filteredItems.length === 0 && (
        <div className="py-20 text-center text-gray-500">Nothing in this category yet.</div>
      )}

      {!loading && !error && filteredItems.length > 0 && (
        <MenuGrid
          items={filteredItems}
          // Optional: if your MenuGrid supports it, you can pass a price resolver.
          // If it doesn't, ignore this prop and just update MenuGrid below.
          getPriceCents={readPriceCents}
          getAvailable={(i) => safeBool((i as any).available, true)}
        />
      )}
    </main>
  );
}
