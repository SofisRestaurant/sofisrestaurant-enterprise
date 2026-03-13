import type { ReactElement } from 'react';

import {
  QUICK_FILTERS,
  SORT_OPTIONS,
  STATUS_FILTER_OPTIONS,
  TYPE_FILTER_OPTIONS,
  type Filters,
  type QuickFilter,
  type SortKey,
  type StatusFilter,
} from '../promo-manager/promoManager.types';

export function FilterBar({
  filters,
  onChange,
  visibleCount,
  totalCount,
  quickCounts,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  visibleCount: number;
  totalCount: number;
  quickCounts: Record<QuickFilter, number>;
}): ReactElement {
  const hasFilters =
    filters.q.trim().length > 0 ||
    filters.type.length > 0 ||
    filters.status.length > 0 ||
    filters.quick !== 'all';

  return (
    <div className="space-y-4 border-b border-zinc-800 px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold text-zinc-100">Promo Inventory</p>
          <p className="mt-0.5 text-xs text-zinc-600">
            {visibleCount === totalCount
              ? `${totalCount} total records`
              : `${visibleCount} of ${totalCount} matching`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {QUICK_FILTERS.map((chip) => {
            const active = filters.quick === chip.value;
            return (
              <button
                key={chip.value}
                type="button"
                onClick={() => onChange({ ...filters, quick: chip.value })}
                aria-pressed={active}
                className={[
                  'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                  active
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                    : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
                ].join(' ')}
              >
                {chip.label}{' '}
                <span className="ml-1 font-mono text-[10px]">{quickCounts[chip.value]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <label htmlFor="promo-search" className="sr-only">
            Search promo codes
          </label>
          <input
            id="promo-search"
            type="search"
            value={filters.q}
            onChange={(e) => onChange({ ...filters, q: e.target.value })}
            placeholder="Search code, name, type, or status…"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus-visible:border-amber-500/60"
          />
        </div>

        <div>
          <label htmlFor="promo-type" className="sr-only">
            Filter by type
          </label>
          <select
            id="promo-type"
            value={filters.type}
            onChange={(e) => onChange({ ...filters, type: e.target.value })}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none focus-visible:border-amber-500/60"
          >
            {TYPE_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value || 'all-types'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="promo-status" className="sr-only">
            Filter by status
          </label>
          <select
            id="promo-status"
            value={filters.status}
            onChange={(e) =>
              onChange({
                ...filters,
                status: e.target.value as StatusFilter,
              })
            }
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none focus-visible:border-amber-500/60"
          >
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value || 'all-statuses'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:w-56">
          <label htmlFor="promo-sort" className="sr-only">
            Sort promos
          </label>
          <select
            id="promo-sort"
            value={filters.sort}
            onChange={(e) => onChange({ ...filters, sort: e.target.value as SortKey })}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none focus-visible:border-amber-500/60"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                Sort: {opt.label}
              </option>
            ))}
          </select>
        </div>

        {hasFilters ? (
          <button
            type="button"
            onClick={() =>
              onChange({
                q: '',
                type: '',
                status: '',
                sort: 'recent',
                quick: 'all',
              })
            }
            className="self-start rounded-lg border border-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}