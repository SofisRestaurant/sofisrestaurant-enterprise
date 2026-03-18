// =============================================================================
// PATH: src/modules/admin/orders/useAdminOrdersFilters.ts
// =============================================================================
// Manages filter UI state (active tab + search query) and applies them to
// the orders list. The page never filters directly — it uses this hook.
// =============================================================================

import { useMemo, useState } from 'react';
import type { AdminOrder } from '../types/admin-orders.types';
import { type FilterTab, FILTER_TABS, NEW_STATUSES } from '../utils/admin-orders.constants';
import { filterAndSortOrders } from '../utils/admin-orders.filters';

export interface OrderCounts {
  all: number;
  new: number;
  preparing: number;
  ready: number;
  delivered: number;
  cancelled: number;
}

export interface TabOption {
  key: FilterTab;
  label: string;
  count: number;
}

export interface UseAdminOrdersFiltersReturn {
  activeTab: FilterTab;
  setActiveTab: (tab: FilterTab) => void;
  search: string;
  setSearch: (query: string) => void;
  filteredOrders: AdminOrder[];
  counts: OrderCounts;
  tabOptions: TabOption[];
}

export function useAdminOrdersFilters(
  orders: readonly AdminOrder[],
): UseAdminOrdersFiltersReturn {
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');

  const counts = useMemo(
    (): OrderCounts => ({
      all:       orders.length,
      new:       orders.filter((o) => NEW_STATUSES.has(o.status)).length,
      preparing: orders.filter((o) => o.status === 'preparing').length,
      ready:     orders.filter((o) => o.status === 'ready').length,
      delivered: orders.filter((o) => o.status === 'delivered').length,
      cancelled: orders.filter((o) => o.status === 'cancelled').length,
    }),
    [orders],
  );

  const filteredOrders = useMemo(
    () => filterAndSortOrders(orders, activeTab, search),
    [orders, activeTab, search],
  );

  const tabOptions = useMemo(
    (): TabOption[] =>
      FILTER_TABS.map((tab) => ({ ...tab, count: counts[tab.key] })),
    [counts],
  );

  return {
    activeTab,
    setActiveTab,
    search,
    setSearch,
    filteredOrders,
    counts,
    tabOptions,
  };
}