// =============================================================================
// PATH: src/features/admin/hooks/useAdminFilters.ts
// =============================================================================
// Generic filter hook for all admin sections (orders, menu, marketing).
//
// Supports:
//   - Controlled filter state with typed partial updates
//   - Debounced search query
//   - localStorage persistence (persistKey)
//   - URL sync via replaceState (syncToUrl)
//   - Dirty detection (hasActiveFilters)
//   - Page / pageSize / sort setters
//
// Usage: pass a domain-specific coerceState function (e.g. coerceAdminOrdersFilters)
// so that persisted or URL-derived values are safely normalized back to TState.
// =============================================================================

import { useEffect, useMemo, useState } from 'react';

import { useMountedRef, useStableCallback } from '@/shared/hooks';

import type {
  AdminFilterStateShape,
  AdminMarketingFilterState,
  AdminMenuFilterState,
  AdminOrdersFilterState,
} from '../types/admin-filters.types';

// ─────────────────────────────────────────────────────────────────────────────
// Public interfaces
// ─────────────────────────────────────────────────────────────────────────────

export interface UseAdminFiltersOptions<TState extends AdminFilterStateShape> {
  initialState: TState;
  enabled?: boolean;
  debounceMs?: number;
  persistKey?: string;
  syncToUrl?: boolean;
  urlParamKey?: string;
  queryKey?: keyof TState;
  pageKey?: keyof TState;
  pageSizeKey?: keyof TState;
  sortKey?: keyof TState;
  coerceState?: (value: unknown, initialState: TState) => TState;
  isDirty?: (state: TState, initialState: TState) => boolean;
}

export interface UseAdminFiltersResult<TState extends AdminFilterStateShape> {
  state: TState;
  debouncedQuery: string;
  hasActiveFilters: boolean;
  setState: (next: TState) => void;
  update: (next: Partial<TState> | ((current: TState) => TState)) => void;
  reset: () => void;
  clearQuery: () => void;
  setQuery: (value: string) => void;
  setPage: (value: number) => void;
  setPageSize: (value: number) => void;
  setSort: (value: TState[keyof TState]) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readStorageValue(key: string): unknown {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? parseJson(raw) : null;
  } catch {
    return null;
  }
}

function writeStorageValue(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota / privacy failures.
  }
}

function readUrlValue(paramKey: string): unknown {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const raw = url.searchParams.get(paramKey);
  return raw ? parseJson(raw) : null;
}

function writeUrlValue(paramKey: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set(paramKey, JSON.stringify(value));
  window.history.replaceState(
    window.history.state,
    document.title,
    `${url.pathname}${url.search}${url.hash}`,
  );
}

/**
 * Returns a new state object with a single key replaced.
 * Typed so callers never need to cast.
 */
function setKey<TState extends AdminFilterStateShape, TKey extends keyof TState>(
  state: TState,
  key: TKey,
  value: TState[TKey],
): TState {
  return { ...state, [key]: value };
}

// ─────────────────────────────────────────────────────────────────────────────
// Safe coercion primitives
// ─────────────────────────────────────────────────────────────────────────────

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain-specific coercers
// ─────────────────────────────────────────────────────────────────────────────

export function coerceAdminOrdersFilters(
  value: unknown,
  initialState: AdminOrdersFilterState,
): AdminOrdersFilterState {
  if (!isRecord(value)) return initialState;

  return {
    ...initialState,
    query:            asString(value.query, initialState.query),
    statuses:         asStringArray(value.statuses) as AdminOrdersFilterState['statuses'],
    paymentStatuses:  asStringArray(value.paymentStatuses) as AdminOrdersFilterState['paymentStatuses'],
    priorities:       asStringArray(value.priorities) as AdminOrdersFilterState['priorities'],
    orderTypes:       asStringArray(value.orderTypes),
    assignedTo:       asStringArray(value.assignedTo),
    includeDeleted:   asBoolean(value.includeDeleted, initialState.includeDeleted),
    dateRange:
      isRecord(value.dateRange) &&
      typeof value.dateRange.preset === 'string' &&
      ('from' in value.dateRange || 'to' in value.dateRange)
        ? {
            preset: value.dateRange.preset as AdminOrdersFilterState['dateRange']['preset'],
            from: typeof value.dateRange.from === 'string' ? value.dateRange.from : null,
            to:   typeof value.dateRange.to   === 'string' ? value.dateRange.to   : null,
          }
        : initialState.dateRange,
    page:     Math.max(0, Math.floor(asNumber(value.page,     initialState.page))),
    pageSize: Math.max(1, Math.floor(asNumber(value.pageSize, initialState.pageSize))),
    sort:
      isRecord(value.sort) &&
      typeof value.sort.columnKey === 'string' &&
      (value.sort.direction === 'asc' || value.sort.direction === 'desc')
        ? {
            columnKey: value.sort.columnKey as AdminOrdersFilterState['sort'] extends infer TSort
              ? TSort extends { columnKey: infer TColumn }
                ? TColumn
                : never
              : never,
            direction: value.sort.direction,
          }
        : initialState.sort,
  };
}

export function coerceAdminMenuFilters(
  value: unknown,
  initialState: AdminMenuFilterState,
): AdminMenuFilterState {
  if (!isRecord(value)) return initialState;

  return {
    ...initialState,
    query:       asString(value.query, initialState.query),
    categoryIds: asStringArray(value.categoryIds),
    visibility:
      value.visibility === 'active' ||
      value.visibility === 'inactive' ||
      value.visibility === 'all'
        ? value.visibility
        : initialState.visibility,
    availability:
      value.availability === 'available' ||
      value.availability === 'unavailable' ||
      value.availability === 'all'
        ? value.availability
        : initialState.availability,
    featured:
      value.featured === 'featured' ||
      value.featured === 'not_featured' ||
      value.featured === 'all'
        ? value.featured
        : initialState.featured,
    page:     Math.max(0, Math.floor(asNumber(value.page,     initialState.page))),
    pageSize: Math.max(1, Math.floor(asNumber(value.pageSize, initialState.pageSize))),
    sort:
      isRecord(value.sort) &&
      typeof value.sort.columnKey === 'string' &&
      (value.sort.direction === 'asc' || value.sort.direction === 'desc')
        ? {
            columnKey: value.sort.columnKey as AdminMenuFilterState['sort'] extends infer TSort
              ? TSort extends { columnKey: infer TColumn }
                ? TColumn
                : never
              : never,
            direction: value.sort.direction,
          }
        : initialState.sort,
  };
}

export function coerceAdminMarketingFilters(
  value: unknown,
  initialState: AdminMarketingFilterState,
): AdminMarketingFilterState {
  if (!isRecord(value)) return initialState;

  return {
    ...initialState,
    query:           asString(value.query, initialState.query),
    campaignStatuses: asStringArray(value.campaignStatuses) as AdminMarketingFilterState['campaignStatuses'],
    promoStatuses:   asStringArray(value.promoStatuses) as AdminMarketingFilterState['promoStatuses'],
    placements:      asStringArray(value.placements),
    page:     Math.max(0, Math.floor(asNumber(value.page,     initialState.page))),
    pageSize: Math.max(1, Math.floor(asNumber(value.pageSize, initialState.pageSize))),
    sort:
      isRecord(value.sort) &&
      typeof value.sort.columnKey === 'string' &&
      (value.sort.direction === 'asc' || value.sort.direction === 'desc')
        ? {
            columnKey: value.sort.columnKey as AdminMarketingFilterState['sort'] extends infer TSort
              ? TSort extends { columnKey: infer TColumn }
                ? TColumn
                : never
              : never,
            direction: value.sort.direction,
          }
        : initialState.sort,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useAdminFilters<TState extends AdminFilterStateShape>(
  options: UseAdminFiltersOptions<TState>,
): UseAdminFiltersResult<TState> {
  const mountedRef = useMountedRef();

  const {
    initialState,
    enabled = true,
    debounceMs = 250,
    persistKey,
    syncToUrl = false,
    urlParamKey = 'adminFilters',
    queryKey,
    pageKey,
    pageSizeKey,
    sortKey,
    coerceState,
    isDirty,
  } = options;

  // ── Initial state resolution ───────────────────────────────────────────────
  // Priority: URL params > localStorage > initialState
  const readInitialState = useStableCallback((): TState => {
    if (!enabled) return initialState;

    if (syncToUrl) {
      const fromUrl = readUrlValue(urlParamKey);
      if (fromUrl !== null && coerceState) return coerceState(fromUrl, initialState);
    }

    if (persistKey) {
      const fromStorage = readStorageValue(persistKey);
      if (fromStorage !== null && coerceState) return coerceState(fromStorage, initialState);
    }

    return initialState;
  });

  const [state, setState] = useState<TState>(() => readInitialState());

  const [debouncedQuery, setDebouncedQuery] = useState<string>(() => {
    if (!queryKey) return '';
    const value = state[queryKey];
    return typeof value === 'string' ? value : '';
  });

  // ── Updaters ───────────────────────────────────────────────────────────────

  const update = useStableCallback(
    (next: Partial<TState> | ((current: TState) => TState)) => {
      setState((current) =>
        typeof next === 'function' ? next(current) : { ...current, ...next },
      );
    },
  );

  const reset = useStableCallback(() => {
    setState(initialState);
  });

  const clearQuery = useStableCallback(() => {
    if (!queryKey) return;
    setState((current) => setKey(current, queryKey, '' as TState[typeof queryKey]));
  });

  const setQuery = useStableCallback((value: string) => {
    if (!queryKey) return;
    setState((current) => {
      let next = setKey(current, queryKey, value as TState[typeof queryKey]);
      if (pageKey) next = setKey(next, pageKey, 0 as TState[typeof pageKey]);
      return next;
    });
  });

  const setPage = useStableCallback((value: number) => {
    if (!pageKey) return;
    setState((current) =>
      setKey(current, pageKey, Math.max(0, Math.floor(value)) as TState[typeof pageKey]),
    );
  });

  const setPageSize = useStableCallback((value: number) => {
    if (!pageSizeKey) return;
    const safeValue = Math.max(1, Math.floor(value));
    setState((current) => {
      let next = setKey(current, pageSizeKey, safeValue as TState[typeof pageSizeKey]);
      if (pageKey) next = setKey(next, pageKey, 0 as TState[typeof pageKey]);
      return next;
    });
  });

  // FIX: setSort was missing its setState call and closing });
  // The stray `function setKey` nested inside it was a duplicate — removed.
  const setSort = useStableCallback((value: TState[keyof TState]) => {
    if (!sortKey) return;
    setState((current) => setKey(current, sortKey, value));
  });

  // ── Debounced query sync ───────────────────────────────────────────────────

  useEffect(() => {
    if (!queryKey) return undefined;

    const currentValue = state[queryKey];
    const query = typeof currentValue === 'string' ? currentValue : '';

    const timeoutId = window.setTimeout(() => {
      if (!mountedRef.current) return;
      setDebouncedQuery(query);
    }, debounceMs);

    return () => { window.clearTimeout(timeoutId); };
  }, [debounceMs, mountedRef, queryKey, state]);

  // ── Persistence / URL sync ─────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) return;
    if (persistKey) writeStorageValue(persistKey, state);
    if (syncToUrl)  writeUrlValue(urlParamKey, state);
  }, [enabled, persistKey, state, syncToUrl, urlParamKey]);

  // ── Dirty detection ────────────────────────────────────────────────────────

  const hasActiveFilters = useMemo(() => {
    if (isDirty) return isDirty(state, initialState);
    return JSON.stringify(state) !== JSON.stringify(initialState);
  }, [initialState, isDirty, state]);

  // ── Return ─────────────────────────────────────────────────────────────────

  return {
    state,
    debouncedQuery,
    hasActiveFilters,
    setState,
    update,
    reset,
    clearQuery,
    setQuery,
    setPage,
    setPageSize,
    setSort,
  };
}

export default useAdminFilters;