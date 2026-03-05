// src/modules/menu/components/MenuFilters.tsx
// ============================================================================
// MENU FILTERS — Production (2026) — MenuPage-compatible + Type-safe
// ----------------------------------------------------------------------------
// ✅ Fixes your current TS errors by exporting:
//   - Named export: MenuFilters
//   - Default export: MenuFilters
//   - Types: MenuTagKey, MenuPriceRangeKey, MenuSortKey
//
// ✅ Matches the props your MenuPage is passing:
//   open, onOpenChange, searchText, onSearchTextChange,
//   selectedTags, onSelectedTagsChange, priceRange, onPriceRangeChange,
//   sort, onSortChange, promoOnly, onPromoOnlyChange, onClearAll
//
// ✅ Drawer UX (mobile-first) with a11y:
//   ESC close, outside click close, focus restore, scroll lock
// ============================================================================

import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { X, Search, Flame, Leaf, WheatOff, Baby, SlidersHorizontal } from 'lucide-react'

export type MenuTagKey = 'spicy' | 'vegetarian' | 'gluten_free' | 'kids'
export type MenuPriceRangeKey = 'any' | 'under_10' | '10_20' | '20_30' | '30_plus'
export type MenuSortKey = 'recommended' | 'price_low' | 'price_high' | 'name_az' | 'name_za'

export type MenuFiltersProps = {
  open: boolean
  onOpenChange: (open: boolean) => void

  searchText: string
  onSearchTextChange: (next: string) => void

  selectedTags: Set<MenuTagKey>
  onSelectedTagsChange: (next: Set<MenuTagKey>) => void

  priceRange: MenuPriceRangeKey
  onPriceRangeChange: (next: MenuPriceRangeKey) => void

  sort: MenuSortKey
  onSortChange: (next: MenuSortKey) => void

  promoOnly: boolean
  onPromoOnlyChange: (next: boolean) => void

  onClearAll: () => void

  className?: string
  disabled?: boolean
}

function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(' ')
}

function cloneSet<T>(s: Set<T>): Set<T> {
  return new Set<T>(Array.from(s.values()))
}

function toggleTag(current: Set<MenuTagKey>, tag: MenuTagKey): Set<MenuTagKey> {
  const next = cloneSet(current)
  if (next.has(tag)) next.delete(tag)
  else next.add(tag)
  return next
}

function tagLabel(tag: MenuTagKey): string {
  switch (tag) {
    case 'spicy':
      return 'Spicy'
    case 'vegetarian':
      return 'Vegetarian'
    case 'gluten_free':
      return 'Gluten-Free'
    case 'kids':
      return 'Kids'
    default: {
      const _exhaustive: never = tag
      return _exhaustive
    }
  }
}

function tagIcon(tag: MenuTagKey) {
  switch (tag) {
    case 'spicy':
      return <Flame className="h-4 w-4" aria-hidden="true" />
    case 'vegetarian':
      return <Leaf className="h-4 w-4" aria-hidden="true" />
    case 'gluten_free':
      return <WheatOff className="h-4 w-4" aria-hidden="true" />
    case 'kids':
      return <Baby className="h-4 w-4" aria-hidden="true" />
    default:
      return null
  }
}

function priceLabel(p: MenuPriceRangeKey): string {
  switch (p) {
    case 'any':
      return 'Any'
    case 'under_10':
      return 'Under $10'
    case '10_20':
      return '$10–$20'
    case '20_30':
      return '$20–$30'
    case '30_plus':
      return '$30+'
    default: {
      const _exhaustive: never = p
      return _exhaustive
    }
  }
}

function sortLabel(s: MenuSortKey): string {
  switch (s) {
    case 'recommended':
      return 'Recommended'
    case 'price_low':
      return 'Price: Low → High'
    case 'price_high':
      return 'Price: High → Low'
    case 'name_az':
      return 'Name: A → Z'
    case 'name_za':
      return 'Name: Z → A'
    default: {
      const _exhaustive: never = s
      return _exhaustive
    }
  }
}

function hasActiveFilters(args: {
  searchText: string
  tags: Set<MenuTagKey>
  priceRange: MenuPriceRangeKey
  sort: MenuSortKey
  promoOnly: boolean
}) {
  return (
    args.searchText.trim().length > 0 ||
    args.tags.size > 0 ||
    args.priceRange !== 'any' ||
    args.sort !== 'recommended' ||
    args.promoOnly === true
  )
}

function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [locked])
}

function MenuFiltersImpl({
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
  className,
  disabled = false,
}: MenuFiltersProps) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null)
  const lastActiveRef = useRef<HTMLElement | null>(null)

  const active = useMemo(
    () =>
      hasActiveFilters({
        searchText,
        tags: selectedTags,
        priceRange,
        sort,
        promoOnly,
      }),
    [searchText, selectedTags, priceRange, sort, promoOnly],
  )

  useBodyScrollLock(open)

  // Focus management + ESC close
  useEffect(() => {
    if (!open) return

    lastActiveRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    window.setTimeout(() => closeBtnRef.current?.focus(), 0)

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onOpenChange(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

  // Restore focus when closing
  useEffect(() => {
    if (open) return
    const prev = lastActiveRef.current
    if (prev) window.setTimeout(() => prev.focus?.(), 0)
  }, [open])

  const onOutsideClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.currentTarget === e.target) onOpenChange(false)
    },
    [onOpenChange],
  )

  const setQuery = useCallback(
    (v: string) => {
      onSearchTextChange(v)
    },
    [onSearchTextChange],
  )

  const clearQuery = useCallback(() => {
    onSearchTextChange('')
  }, [onSearchTextChange])

  const onToggleTag = useCallback(
    (tag: MenuTagKey) => {
      onSelectedTagsChange(toggleTag(selectedTags, tag))
    },
    [onSelectedTagsChange, selectedTags],
  )

  if (!open) return null

  return (
    <div
      className={cx('fixed inset-0 z-50', className)}
      role="dialog"
      aria-modal="true"
      aria-label="Menu filters"
      onMouseDown={onOutsideClick}
    >
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" />

      {/* Drawer */}
      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-2xl">
        <div className="rounded-t-3xl border border-white/10 bg-neutral-950 text-white shadow-2xl">
          <div className="px-4 pb-6 pt-4 sm:px-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Filters</p>
                <p className="mt-0.5 text-[11px] text-neutral-400">
                  Deals and totals are verified server-side at checkout.
                </p>
              </div>

              <button
                ref={closeBtnRef}
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-xl border border-white/10 bg-white/5 p-2 text-neutral-200 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-amber-500/25"
                aria-label="Close filters"
                disabled={disabled}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {/* Search */}
            <div className="mt-4">
              <label className="sr-only" htmlFor="menu-filters-search">
                Search menu items
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <input
                  id="menu-filters-search"
                  type="search"
                  value={searchText}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={disabled}
                  placeholder="Search (tacos, fries, spicy…) "
                  autoComplete="off"
                  className={cx(
                    'w-full rounded-2xl border border-white/10 bg-white/5 px-10 py-3 text-sm',
                    'placeholder:text-neutral-500 outline-none',
                    'focus:ring-2 focus:ring-amber-500/25 focus:border-amber-500/30',
                    disabled && 'opacity-60 cursor-not-allowed',
                  )}
                />
                {searchText.trim() ? (
                  <button
                    type="button"
                    onClick={clearQuery}
                    disabled={disabled}
                    className={cx(
                      'absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-2 text-neutral-300',
                      'hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-amber-500/25',
                      disabled && 'opacity-60 cursor-not-allowed hover:bg-transparent',
                    )}
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>

            {/* Quick toggles */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPromoOnlyChange(!promoOnly)}
                className={cx(
                  'rounded-2xl border px-3 py-2 text-xs font-semibold transition',
                  promoOnly
                    ? 'border-amber-500/40 bg-amber-500/15 text-amber-200'
                    : 'border-white/10 bg-white/5 text-neutral-200 hover:bg-white/8',
                  disabled && 'opacity-60 cursor-not-allowed hover:bg-white/5',
                )}
              >
                Deals only
              </button>

              <button
                type="button"
                disabled={disabled}
                onClick={() => onOpenChange(false)}
                className={cx(
                  'rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-neutral-200',
                  'hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-amber-500/25',
                  disabled && 'opacity-60 cursor-not-allowed',
                )}
              >
                Done
              </button>
            </div>

            {/* Tags */}
            <div className="mt-4 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">Tags</p>
              <div className="flex flex-wrap gap-2">
                {(['spicy', 'vegetarian', 'gluten_free', 'kids'] as const).map((t) => {
                  const on = selectedTags.has(t)
                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={disabled}
                      onClick={() => onToggleTag(t)}
                      className={cx(
                        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                        on
                          ? 'border-amber-500/40 bg-amber-500/15 text-amber-200'
                          : 'border-white/10 bg-white/5 text-neutral-200 hover:bg-white/8',
                        disabled && 'opacity-60 cursor-not-allowed hover:bg-white/5',
                      )}
                    >
                      {tagIcon(t)}
                      {tagLabel(t)}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Price + Sort */}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500"
                  htmlFor="menu-price"
                >
                  Price
                </label>
                <div className="relative mt-2">
                  <select
                    id="menu-price"
                    value={priceRange}
                    disabled={disabled}
                    onChange={(e) => onPriceRangeChange(e.target.value as MenuPriceRangeKey)}
                    className={cx(
                      'w-full appearance-none rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-neutral-200',
                      'outline-none focus:ring-2 focus:ring-amber-500/25 focus:border-amber-500/30',
                      disabled && 'opacity-60 cursor-not-allowed',
                    )}
                  >
                    <option value="any">{priceLabel('any')}</option>
                    <option value="under_10">{priceLabel('under_10')}</option>
                    <option value="10_20">{priceLabel('10_20')}</option>
                    <option value="20_30">{priceLabel('20_30')}</option>
                    <option value="30_plus">{priceLabel('30_plus')}</option>
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500">
                    ▾
                  </span>
                </div>
              </div>

              <div>
                <label
                  className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500"
                  htmlFor="menu-sort"
                >
                  Sort
                </label>
                <div className="relative mt-2">
                  <select
                    id="menu-sort"
                    value={sort}
                    disabled={disabled}
                    onChange={(e) => onSortChange(e.target.value as MenuSortKey)}
                    className={cx(
                      'w-full appearance-none rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-neutral-200',
                      'outline-none focus:ring-2 focus:ring-amber-500/25 focus:border-amber-500/30',
                      disabled && 'opacity-60 cursor-not-allowed',
                    )}
                  >
                    <option value="recommended">{sortLabel('recommended')}</option>
                    <option value="price_low">{sortLabel('price_low')}</option>
                    <option value="price_high">{sortLabel('price_high')}</option>
                    <option value="name_az">{sortLabel('name_az')}</option>
                    <option value="name_za">{sortLabel('name_za')}</option>
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500">
                    ▾
                  </span>
                </div>
              </div>
            </div>

            {/* Footer summary + clear */}
            <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-white/3 px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-neutral-200">{active ? 'Filters active' : 'No filters'}</p>
                <p className="text-[11px] text-neutral-500">
                  {promoOnly ? 'Deals only • ' : ''}
                  {selectedTags.size ? `${selectedTags.size} tag(s) • ` : ''}
                  {priceLabel(priceRange)} • {sortLabel(sort)}
                </p>
              </div>

              <button
                type="button"
                disabled={!active || disabled}
                onClick={onClearAll}
                className={cx(
                  'inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold',
                  active
                    ? 'text-neutral-200 hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-amber-500/25'
                    : 'text-neutral-600',
                  (!active || disabled) && 'opacity-60 cursor-not-allowed hover:bg-transparent',
                )}
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                Clear
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export const MenuFilters = memo(MenuFiltersImpl)
export default MenuFilters