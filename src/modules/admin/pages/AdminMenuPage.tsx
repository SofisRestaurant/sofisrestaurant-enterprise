import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Alert,
  Badge,
  EmptyState,
  KPICard,
  MetricGrid,
  Panel,
  ProgressBar,
  SkeletonBlock,
  Table,
} from '@/features/admin/ui/AdminPrimitives';
import {
  callAdminGateway,
  formatAdminGatewayError,
} from '@/features/admin/api/adminGateway.client';
import { formatCurrency } from '@/utils/currency';

interface MenuItemViewModel {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  sku: string | null;
  priceCents: number;
  isVisible: boolean;
  isAvailable: boolean;
  isFeatured: boolean;
  tags: string[];
  modifierGroupNames: string[];
  imageUrl: string | null;
  updatedAt: string | null;
  sortOrder: number | null;
}

interface MenuSnapshot {
  items: MenuItemViewModel[];
  categories: string[];
  topLevelModifierGroupCount: number;
}

type AvailabilityFilter = 'all' | 'visible' | 'hidden' | 'unavailable';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textFromUnknown(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function numberFromUnknown(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/[^0-9.-]/g, '').trim();
    if (normalized.length === 0) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function booleanFromUnknown(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (value === 1) {
      return true;
    }

    if (value === 0) {
      return false;
    }

    return null;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'yes' || normalized === '1') {
      return true;
    }

    if (normalized === 'false' || normalized === 'no' || normalized === '0') {
      return false;
    }
  }

  return null;
}

function readText(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    if (key in record) {
      const value = textFromUnknown(record[key]);
      if (value) {
        return value;
      }
    }
  }

  return null;
}

function readNumber(record: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    if (key in record) {
      const value = numberFromUnknown(record[key]);
      if (value !== null) {
        return value;
      }
    }
  }

  return null;
}

function readBoolean(record: Record<string, unknown>, keys: readonly string[]): boolean | null {
  for (const key of keys) {
    if (key in record) {
      const value = booleanFromUnknown(record[key]);
      if (value !== null) {
        return value;
      }
    }
  }

  return null;
}

function getPathValue(root: unknown, path: readonly string[]): unknown {
  let current: unknown = root;

  for (const segment of path) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();

  for (const item of value) {
    if (isRecord(item)) {
      const candidate = readText(item, ['name', 'title', 'label', 'tag']);
      if (candidate) {
        seen.add(candidate);
      }
      continue;
    }

    const text = textFromUnknown(item);
    if (text) {
      seen.add(text);
    }
  }

  return Array.from(seen);
}

function normalizeMoneyToCents(value: number): number {
  const absolute = Math.abs(value);

  if (absolute >= 1000 || (Number.isInteger(value) && absolute > 80)) {
    return Math.round(value);
  }

  return Math.round(value * 100);
}

function normalizePriceCents(record: Record<string, unknown>): number {
  const centsValue = readNumber(record, [
    'price_cents',
    'priceCents',
    'base_price_cents',
    'basePriceCents',
    'unit_price_cents',
    'unitPriceCents',
  ]);

  if (centsValue !== null) {
    return Math.max(0, Math.round(centsValue));
  }

  const genericValue = readNumber(record, [
    'price',
    'base_price',
    'basePrice',
    'unit_price',
    'unitPrice',
  ]);

  if (genericValue !== null) {
    return Math.max(0, normalizeMoneyToCents(genericValue));
  }

  return 0;
}

function normalizeMenuItem(
  raw: unknown,
  fallbackCategory: string | null,
): MenuItemViewModel | null {
  if (!isRecord(raw)) {
    return null;
  }

  const id = readText(raw, ['id', 'item_id', 'itemId', 'uuid', 'slug', 'sku']);
  const name = readText(raw, ['name', 'title', 'label']);

  if (!id || !name) {
    return null;
  }

  const modifierGroupsValue =
    getPathValue(raw, ['modifierGroups']) ??
    getPathValue(raw, ['modifiers']) ??
    getPathValue(raw, ['optionGroups']);

  const isVisible =
    readBoolean(raw, ['visible', 'isVisible', 'published', 'enabled', 'active']) ?? true;

  const isAvailable =
    readBoolean(raw, ['available', 'isAvailable', 'is_available', 'inStock', 'in_stock']) ??
    isVisible;

  return {
    id,
    name,
    description: readText(raw, ['description', 'subtitle', 'summary']),
    category:
      fallbackCategory ??
      readText(raw, ['category', 'category_name', 'categoryName', 'section', 'group']),
    sku: readText(raw, ['sku', 'code']),
    priceCents: normalizePriceCents(raw),
    isVisible,
    isAvailable,
    isFeatured:
      readBoolean(raw, ['featured', 'isFeatured', 'is_featured', 'highlight']) ?? false,
    tags: readStringArray(
      getPathValue(raw, ['tags']) ??
        getPathValue(raw, ['labels']) ??
        getPathValue(raw, ['badges']) ??
        getPathValue(raw, ['dietaryTags']) ??
        getPathValue(raw, ['dietary_tags']),
    ),
    modifierGroupNames: readStringArray(modifierGroupsValue),
    imageUrl: readText(raw, ['image_url', 'imageUrl', 'photo_url', 'photoUrl']),
    updatedAt: readText(raw, ['updated_at', 'updatedAt', 'modified_at', 'modifiedAt']),
    sortOrder: readNumber(raw, ['sort_order', 'sortOrder', 'position']),
  };
}

function addNormalizedItems(
  itemMap: Map<string, MenuItemViewModel>,
  items: unknown,
  fallbackCategory: string | null,
): void {
  if (!Array.isArray(items)) {
    return;
  }

  for (const rawItem of items) {
    const normalized = normalizeMenuItem(rawItem, fallbackCategory);
    if (normalized) {
      itemMap.set(normalized.id, normalized);
    }
  }
}

function extractMenuSnapshot(raw: unknown): MenuSnapshot {
  const itemMap = new Map<string, MenuItemViewModel>();
  const categoryNames = new Set<string>();

  if (Array.isArray(raw)) {
    addNormalizedItems(itemMap, raw, null);
  }

  const directItemPaths: Array<readonly string[]> = [
    ['items'],
    ['menuItems'],
    ['menu'],
    ['products'],
    ['catalog'],
    ['results'],
    ['entries'],
    ['data', 'items'],
    ['data', 'menuItems'],
    ['data', 'menu'],
  ];

  for (const path of directItemPaths) {
    addNormalizedItems(itemMap, getPathValue(raw, path), null);
  }

  const categoryContainerPaths: Array<readonly string[]> = [
    ['categories'],
    ['sections'],
    ['groups'],
    ['data', 'categories'],
    ['data', 'sections'],
  ];

  for (const path of categoryContainerPaths) {
    const categories = getPathValue(raw, path);
    if (!Array.isArray(categories)) {
      continue;
    }

    for (const entry of categories) {
      if (!isRecord(entry)) {
        continue;
      }

      const categoryName =
        readText(entry, ['name', 'title', 'label']) ?? readText(entry, ['slug']) ?? null;

      if (categoryName) {
        categoryNames.add(categoryName);
      }

      const nestedItems =
        getPathValue(entry, ['items']) ??
        getPathValue(entry, ['menuItems']) ??
        getPathValue(entry, ['products']) ??
        getPathValue(entry, ['entries']);

      addNormalizedItems(itemMap, nestedItems, categoryName);
    }
  }

  const items = Array.from(itemMap.values()).sort((left, right) => {
    const categoryCompare = (left.category ?? '').localeCompare(right.category ?? '');
    if (categoryCompare !== 0) {
      return categoryCompare;
    }

    const leftSort = left.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const rightSort = right.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (leftSort !== rightSort) {
      return leftSort - rightSort;
    }

    return left.name.localeCompare(right.name);
  });

  for (const item of items) {
    if (item.category) {
      categoryNames.add(item.category);
    }
  }

  const topLevelModifierGroupsValue =
    getPathValue(raw, ['modifierGroups']) ??
    getPathValue(raw, ['modifiers']) ??
    getPathValue(raw, ['optionGroups']) ??
    getPathValue(raw, ['data', 'modifierGroups']) ??
    getPathValue(raw, ['data', 'modifiers']) ??
    getPathValue(raw, ['data', 'optionGroups']);

  const topLevelModifierGroupCount = Array.isArray(topLevelModifierGroupsValue)
    ? topLevelModifierGroupsValue.length
    : 0;

  return {
    items,
    categories: Array.from(categoryNames).sort((left, right) => left.localeCompare(right)),
    topLevelModifierGroupCount,
  };
}

function availabilityTone(
  item: MenuItemViewModel,
): 'neutral' | 'success' | 'warning' | 'danger' {
  if (!item.isVisible) {
    return 'neutral';
  }

  if (!item.isAvailable) {
    return 'warning';
  }

  return 'success';
}

function updatedAtLabel(value: string | null): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export default function AdminMenuPage() {
  const [snapshot, setSnapshot] = useState<MenuSnapshot>({
    items: [],
    categories: [],
    topLevelModifierGroupCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>('all');
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const loadMenu = useCallback(async () => {
    try {
      setError(null);

      const raw: unknown = await callAdminGateway('menu:full', undefined);
      const normalized = extractMenuSnapshot(raw);

      setSnapshot(normalized);
      setLastUpdated(new Date());
    } catch (loadError) {
      setError(formatAdminGatewayError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMenu();
  }, [loadMenu]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadMenu();
    }, 60_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [loadMenu]);

  useEffect(() => {
    if (!announcement) {
      return;
    }

    const timer = window.setTimeout(() => {
      setAnnouncement('');
    }, 3_500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [announcement]);

  const selectedItem = useMemo(
    () => snapshot.items.find((item) => item.id === selectedItemId) ?? null,
    [selectedItemId, snapshot.items],
  );

  useEffect(() => {
    if (!selectedItemId) {
      return;
    }

    if (!selectedItem) {
      setSelectedItemId(null);
    }
  }, [selectedItem, selectedItemId]);

  useEffect(() => {
    if (!selectedItem) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedItemId(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedItem]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return snapshot.items.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) {
        return false;
      }

      if (availabilityFilter === 'visible' && !item.isVisible) {
        return false;
      }

      if (availabilityFilter === 'hidden' && item.isVisible) {
        return false;
      }

      if (availabilityFilter === 'unavailable' && item.isAvailable) {
        return false;
      }

      if (featuredOnly && !item.isFeatured) {
        return false;
      }

      if (normalizedSearch.length === 0) {
        return true;
      }

      const haystack = [
        item.name,
        item.description ?? '',
        item.category ?? '',
        item.sku ?? '',
        item.id,
        item.tags.join(' '),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [availabilityFilter, categoryFilter, featuredOnly, search, snapshot.items]);

  const visibleCount = useMemo(
    () => snapshot.items.filter((item) => item.isVisible).length,
    [snapshot.items],
  );

  const unavailableCount = useMemo(
    () => snapshot.items.filter((item) => !item.isAvailable).length,
    [snapshot.items],
  );

  const featuredCount = useMemo(
    () => snapshot.items.filter((item) => item.isFeatured).length,
    [snapshot.items],
  );

  const visiblePct = snapshot.items.length > 0 ? (visibleCount / snapshot.items.length) * 100 : 0;
  const availablePct =
    snapshot.items.length > 0
      ? ((snapshot.items.length - unavailableCount) / snapshot.items.length) * 100
      : 0;
  const featuredPct =
    snapshot.items.length > 0 ? (featuredCount / snapshot.items.length) * 100 : 0;

  const lastUpdatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : '—';

  const copyItemId = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setAnnouncement('Item id copied to clipboard.');
    } catch {
      setAnnouncement('Clipboard copy failed in this browser context.');
    }
  }, []);

  return (
    <div className="space-y-5">
      <div className="sr-only" aria-live="polite">
        {announcement || `Menu refreshed at ${lastUpdatedLabel}.`}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">Admin Menu</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Catalog visibility, availability, and featured-item health from the admin gateway.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge tone={error ? 'danger' : 'success'}>
            {error ? 'Degraded' : 'Gateway live'} · {lastUpdatedLabel}
          </Badge>
          <button
            type="button"
            onClick={() => void loadMenu()}
            className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-800"
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <Alert
          tone="danger"
          title="Menu error"
          message={error}
          action={
            <button
              type="button"
              onClick={() => void loadMenu()}
              className="rounded-lg border border-red-500/30 px-2.5 py-1 text-[11px] font-semibold text-red-100 transition hover:bg-red-500/10"
            >
              Retry
            </button>
          }
        />
      ) : null}

      {loading && snapshot.items.length === 0 ? (
        <div className="space-y-4">
          <MetricGrid columns={4}>
            <SkeletonBlock height={132} className="rounded-2xl" />
            <SkeletonBlock height={132} className="rounded-2xl" />
            <SkeletonBlock height={132} className="rounded-2xl" />
            <SkeletonBlock height={132} className="rounded-2xl" />
          </MetricGrid>
          <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
            <SkeletonBlock height={260} className="rounded-2xl" />
            <SkeletonBlock height={260} className="rounded-2xl" />
          </div>
        </div>
      ) : (
        <>
          <MetricGrid columns={4}>
            <KPICard
              label="Menu items"
              value={snapshot.items.length}
              sub={`${filteredItems.length} currently in view`}
              accent="amber"
              trend="flat"
              trendLabel="Catalog count"
              icon="🍽️"
            />
            <KPICard
              label="Categories"
              value={snapshot.categories.length}
              sub={`${snapshot.topLevelModifierGroupCount} modifier groups`}
              accent="sky"
              trend="flat"
              trendLabel="Information architecture"
              icon="📚"
            />
            <KPICard
              label="Featured items"
              value={featuredCount}
              sub={`${Math.round(featuredPct)}% of catalog`}
              accent="emerald"
              trend={featuredCount > 0 ? 'up' : 'flat'}
              trendLabel="Merchandising coverage"
              icon="⭐"
            />
            <KPICard
              label="Unavailable items"
              value={unavailableCount}
              sub={`${Math.round(availablePct)}% currently sellable`}
              accent={unavailableCount > 0 ? 'red' : 'slate'}
              trend={unavailableCount > 0 ? 'down' : 'flat'}
              trendLabel={unavailableCount > 0 ? 'Review availability flags' : 'Catalog ready'}
              icon="🚫"
            />
          </MetricGrid>

          <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
            <Panel title="Catalog health" subtitle="Quick ratios for visibility and sellability.">
              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
                    <span>Visible items</span>
                    <span>{Math.round(visiblePct)}%</span>
                  </div>
                  <ProgressBar value={visiblePct} color="primary" />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
                    <span>Available items</span>
                    <span>{Math.round(availablePct)}%</span>
                  </div>
                  <ProgressBar value={availablePct} color="success" />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
                    <span>Featured coverage</span>
                    <span>{Math.round(featuredPct)}%</span>
                  </div>
                  <ProgressBar value={featuredPct} color="warning" />
                </div>
              </div>
            </Panel>

            <Panel title="Filters" subtitle="Search and narrow the catalog safely in-page.">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label
                    htmlFor="admin-menu-search"
                    className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500"
                  >
                    Search
                  </label>
                  <input
                    id="admin-menu-search"
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Name, category, sku, tag, or item id"
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-amber-500/40"
                  />
                </div>

                <div>
                  <label
                    htmlFor="admin-menu-category"
                    className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500"
                  >
                    Category
                  </label>
                  <select
                    id="admin-menu-category"
                    value={categoryFilter}
                    onChange={(event) => setCategoryFilter(event.target.value)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-amber-500/40"
                  >
                    <option value="all">All categories</option>
                    {snapshot.categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="admin-menu-availability"
                    className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500"
                  >
                    Availability
                  </label>
                  <select
                    id="admin-menu-availability"
                    value={availabilityFilter}
                    onChange={(event) =>
                      setAvailabilityFilter(event.target.value as AvailabilityFilter)
                    }
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-amber-500/40"
                  >
                    <option value="all">All items</option>
                    <option value="visible">Visible only</option>
                    <option value="hidden">Hidden only</option>
                    <option value="unavailable">Unavailable only</option>
                  </select>
                </div>

                <label className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2.5 text-sm text-zinc-200">
                  <input
                    type="checkbox"
                    checked={featuredOnly}
                    onChange={(event) => setFeaturedOnly(event.target.checked)}
                    className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-amber-400 focus:ring-amber-500/40"
                  />
                  Featured only
                </label>
              </div>
            </Panel>
          </div>

          <Panel
            title="Catalog items"
            subtitle={`Showing ${filteredItems.length} of ${snapshot.items.length} items.`}
            noPad
          >
            {filteredItems.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="No matching menu items"
                  description="Change filters or search terms to reveal more catalog entries."
                  icon="🍔"
                />
              </div>
            ) : (
              <>
                <div className="md:hidden">
                  <div className="space-y-3 p-4">
                    {filteredItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedItemId(item.id)}
                        className="w-full rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 text-left transition hover:border-zinc-700"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-black text-zinc-100">{item.name}</div>
                            <div className="mt-1 text-xs text-zinc-500">
                              {item.category ?? 'Uncategorized'}
                            </div>
                          </div>
                          <div className="text-right text-sm font-black text-zinc-100">
                            {formatCurrency(item.priceCents / 100)}
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Badge tone={availabilityTone(item)}>
                            {item.isAvailable ? 'Available' : 'Unavailable'}
                          </Badge>
                          <Badge tone={item.isVisible ? 'info' : 'neutral'}>
                            {item.isVisible ? 'Visible' : 'Hidden'}
                          </Badge>
                          {item.isFeatured ? <Badge tone="warning">Featured</Badge> : null}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="hidden md:block">
                  <Table dense>
                    <thead className="bg-zinc-950/80 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Item</th>
                        <th className="px-4 py-3 font-semibold">Category</th>
                        <th className="px-4 py-3 font-semibold">Price</th>
                        <th className="px-4 py-3 font-semibold">Availability</th>
                        <th className="px-4 py-3 font-semibold">Visibility</th>
                        <th className="px-4 py-3 font-semibold">Updated</th>
                        <th className="px-4 py-3 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {filteredItems.map((item) => (
                        <tr key={item.id} className="bg-zinc-950/20">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-zinc-100">{item.name}</div>
                            {item.sku ? (
                              <div className="text-[11px] text-zinc-500">SKU {item.sku}</div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-zinc-400">{item.category ?? '—'}</td>
                          <td className="px-4 py-3 font-semibold text-zinc-100">
                            {formatCurrency(item.priceCents / 100)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge tone={availabilityTone(item)}>
                              {item.isAvailable ? 'Available' : 'Unavailable'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              <Badge tone={item.isVisible ? 'info' : 'neutral'}>
                                {item.isVisible ? 'Visible' : 'Hidden'}
                              </Badge>
                              {item.isFeatured ? <Badge tone="warning">Featured</Badge> : null}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-zinc-400">
                            {updatedAtLabel(item.updatedAt)}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => setSelectedItemId(item.id)}
                              className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-900"
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              </>
            )}
          </Panel>
        </>
      )}

      {selectedItem ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close menu item details"
            onClick={() => setSelectedItemId(null)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-menu-item-title"
            className="relative h-full w-full max-w-xl overflow-y-auto border-l border-zinc-800 bg-[#050509] p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="admin-menu-item-title" className="text-xl font-black text-white">
                  {selectedItem.name}
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  {selectedItem.category ?? 'Uncategorized'} ·{' '}
                  {formatCurrency(selectedItem.priceCents / 100)}
                </p>
              </div>

              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setSelectedItemId(null)}
                className="rounded-xl border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-900"
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge tone={availabilityTone(selectedItem)}>
                {selectedItem.isAvailable ? 'Available' : 'Unavailable'}
              </Badge>
              <Badge tone={selectedItem.isVisible ? 'info' : 'neutral'}>
                {selectedItem.isVisible ? 'Visible' : 'Hidden'}
              </Badge>
              {selectedItem.isFeatured ? <Badge tone="warning">Featured</Badge> : null}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                  Item id
                </div>
                <div className="mt-2 break-all text-sm font-semibold text-zinc-100">
                  {selectedItem.id}
                </div>
                <button
                  type="button"
                  onClick={() => void copyItemId(selectedItem.id)}
                  className="mt-3 rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-900"
                >
                  Copy id
                </button>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">SKU</div>
                <div className="mt-2 text-sm font-semibold text-zinc-100">
                  {selectedItem.sku ?? '—'}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                  Updated
                </div>
                <div className="mt-2 text-sm font-semibold text-zinc-100">
                  {selectedItem.updatedAt
                    ? new Date(selectedItem.updatedAt).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—'}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                  Sort order
                </div>
                <div className="mt-2 text-sm font-semibold text-zinc-100">
                  {selectedItem.sortOrder ?? '—'}
                </div>
              </div>
            </div>

            {selectedItem.description ? (
              <Panel title="Description" className="mt-5">
                <p className="text-sm leading-6 text-zinc-200">{selectedItem.description}</p>
              </Panel>
            ) : null}

            {selectedItem.tags.length > 0 ? (
              <Panel title="Tags" className="mt-5">
                <div className="flex flex-wrap gap-2">
                  {selectedItem.tags.map((tag) => (
                    <Badge key={tag} tone="neutral">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </Panel>
            ) : null}

            <Panel title="Modifier groups" className="mt-5">
              {selectedItem.modifierGroupNames.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedItem.modifierGroupNames.map((name) => (
                    <Badge key={name} tone="info">
                      {name}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">
                  No modifier groups were included in this payload.
                </p>
              )}
            </Panel>

            {selectedItem.imageUrl ? (
              <Panel title="Image" className="mt-5">
                <img
                  src={selectedItem.imageUrl}
                  alt={selectedItem.name}
                  className="w-full rounded-2xl border border-zinc-800 object-cover"
                />
              </Panel>
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}