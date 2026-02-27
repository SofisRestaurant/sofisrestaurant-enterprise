import { useEffect, useMemo, useState, useCallback } from 'react'
import { MenuGrid } from '@/components/menu/MenuGrid'
import { CategoryTabs } from '@/components/menu/CategoryTabs'
import { menuService } from '@/services/menu.service';
import type { MenuItem, MenuCategory } from '@/types/menu'
import { Spinner } from '@/components/ui/Spinner'

/* ======================================================
   CATEGORY RUNTIME SAFETY (DO NOT TRUST DB STRINGS)
====================================================== */

const VALID_CATEGORIES: readonly MenuCategory[] = [
  'appetizers',
  'entrees',
  'desserts',
  'drinks',
]

function isMenuCategory(value: unknown): value is MenuCategory {
  return (
    typeof value === 'string' &&
    (VALID_CATEGORIES as readonly string[]).includes(value)
  )
}

/* ======================================================
   MENU PAGE
====================================================== */

export default function Menu() {
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedCategory, setSelectedCategory] =
    useState<MenuCategory | 'all'>('all')

  /* ================= LOAD MENU ================= */

  const loadMenu = useCallback(async () => {
    try {
      setError(null)
      setLoading(true)

      const data = await menuService.getMenuItems();
      setItems(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('Menu load failed', e)
      setError('We couldn’t load the menu right now.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMenu()
  }, [loadMenu])

  /* ================= SAFE CATEGORY EXTRACTION ================= */

  const categoriesWithItems = useMemo(() => {
    const set = new Set<MenuCategory>()

    for (const item of items) {
      if (isMenuCategory(item.category)) {
        set.add(item.category)
      }
    }

    return set
  }, [items])

  /* ================= AUTO RESET IF CATEGORY DISAPPEARS ================= */

  useEffect(() => {
    if (
      selectedCategory !== 'all' &&
      !categoriesWithItems.has(selectedCategory)
    ) {
      setSelectedCategory('all')
    }
  }, [categoriesWithItems, selectedCategory])

  /* ================= FILTERING ================= */

  const filteredItems = useMemo(() => {
    if (selectedCategory === 'all') return items

    return items.filter(
      (item) =>
        isMenuCategory(item.category) &&
        item.category === selectedCategory
    )
  }, [items, selectedCategory])

  /* ================= RENDER ================= */

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8">
      <CategoryTabs
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        availableCategories={categoriesWithItems}
      />

      {/* LOADING */}
      {loading && (
        <div className="flex flex-col items-center gap-4 py-20 text-gray-500">
          <Spinner />
          <p className="text-sm">Loading delicious food…</p>
        </div>
      )}

      {/* ERROR */}
      {error && (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <p className="text-red-500">{error}</p>
          <button
            onClick={loadMenu}
            className="rounded-lg bg-primary px-5 py-2 font-medium text-white transition hover:opacity-90"
          >
            Try Again
          </button>
        </div>
      )}

      {/* EMPTY */}
      {!loading && !error && filteredItems.length === 0 && (
        <div className="py-20 text-center text-gray-500">
          Nothing in this category yet.
        </div>
      )}

      {/* SUCCESS */}
      {!loading && !error && filteredItems.length > 0 && (
        <MenuGrid items={filteredItems} />
      )}
    </main>
  )
}