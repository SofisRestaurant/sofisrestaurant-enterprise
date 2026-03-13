// =============================================================================
// src/modules/menu/api/menu-search.api.ts
// MENU SEARCH API — client-safe search over public menu items
// =============================================================================
//
// Notes:
// - Depends on ./menu.api exporting:
//   - listMenuItems
//   - type ListMenuItemsOptions
//   - type PublicMenuItem
// - Pure client-side ranking over the already-sanitized public menu surface
// - No `any`, no unsafe casts, no index keys, no hidden mutations
// =============================================================================

import {
  listMenuItems,
  type ListMenuItemsOptions,
  type PublicMenuItem,
} from './menu.api';

export type MenuSearchField =
  | 'name'
  | 'category'
  | 'description'
  | 'shortDescription'
  | 'tags'
  | 'badges'
  | 'dietaryFlags';

export interface MenuSearchHit {
  item: PublicMenuItem;
  score: number;
  matchedFields: readonly MenuSearchField[];
}

export interface SearchMenuOptions
  extends Omit<ListMenuItemsOptions, 'limit' | 'offset'> {
  limit?: number;
  cacheTtlMs?: number;
  signal?: AbortSignal;
}

interface SearchCacheEntry {
  expiresAt: number;
  hits: MenuSearchHit[];
}

const DEFAULT_SEARCH_LIMIT = 24;
const DEFAULT_CACHE_TTL_MS = 15_000;
const MAX_FETCH_LIMIT = 500;
const MAX_RESULT_LIMIT = 100;
const MAX_SUGGESTIONS = 8;

const SEARCH_CACHE = new Map<string, SearchCacheEntry>();

function stripCombiningMarks(value: string): string {
  return value.replace(/[\u0300-\u036f]/g, '');
}

function normalizeText(value: string): string {
  return stripCombiningMarks(value.normalize('NFKD'))
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  const normalized = normalizeText(value);

  if (normalized.length === 0) {
    return [];
  }

  return Array.from(
    new Set(normalized.split(' ').filter((token) => token.length > 0)),
  );
}

function toStableKeyPart(
  part: string | number | boolean | null | undefined,
): string {
  return String(part ?? '');
}

function cxKeyParts(
  ...parts: Array<string | number | boolean | null | undefined>
): string {
  return parts.map(toStableKeyPart).join('::');
}

function scoreDefaultListingItem(item: PublicMenuItem): MenuSearchHit {
  return {
    item,
    score: (item.isFeatured ? 20 : 0) + (item.isAvailable ? 10 : 0) - item.sortOrder,
    matchedFields: [],
  };
}

function scoreItem(
  item: PublicMenuItem,
  query: string,
  tokens: readonly string[],
): MenuSearchHit | null {
  if (query.length === 0) {
    return scoreDefaultListingItem(item);
  }

  const matchedFields = new Set<MenuSearchField>();
  let score = 0;

  const name = normalizeText(item.name);
  const category = normalizeText(item.categoryName ?? '');
  const description = normalizeText(item.description ?? '');
  const shortDescription = normalizeText(item.shortDescription ?? '');
  const tags = item.tags.map(normalizeText);
  const badges = item.badges.map(normalizeText);
  const dietaryFlags = item.dietaryFlags.map(normalizeText);

  if (name === query) {
    score += 240;
    matchedFields.add('name');
  } else if (name.startsWith(query)) {
    score += 140;
    matchedFields.add('name');
  } else if (name.includes(query)) {
    score += 90;
    matchedFields.add('name');
  }

  if (category === query) {
    score += 120;
    matchedFields.add('category');
  } else if (category.length > 0 && category.includes(query)) {
    score += 45;
    matchedFields.add('category');
  }

  if (shortDescription.length > 0 && shortDescription.includes(query)) {
    score += 24;
    matchedFields.add('shortDescription');
  }

  if (description.length > 0 && description.includes(query)) {
    score += 18;
    matchedFields.add('description');
  }

  for (const token of tokens) {
    if (token.length === 0) {
      continue;
    }

    if (name.split(' ').includes(token)) {
      score += 32;
      matchedFields.add('name');
    } else if (name.includes(token)) {
      score += 18;
      matchedFields.add('name');
    }

    if (category.split(' ').includes(token)) {
      score += 24;
      matchedFields.add('category');
    } else if (category.length > 0 && category.includes(token)) {
      score += 12;
      matchedFields.add('category');
    }

    if (shortDescription.length > 0 && shortDescription.includes(token)) {
      score += 8;
      matchedFields.add('shortDescription');
    }

    if (description.length > 0 && description.includes(token)) {
      score += 6;
      matchedFields.add('description');
    }

    if (tags.some((entry: string) => entry === token)) {
      score += 18;
      matchedFields.add('tags');
    } else if (tags.some((entry: string) => entry.includes(token))) {
      score += 9;
      matchedFields.add('tags');
    }

    if (badges.some((entry: string) => entry === token)) {
      score += 14;
      matchedFields.add('badges');
    } else if (badges.some((entry: string) => entry.includes(token))) {
      score += 7;
      matchedFields.add('badges');
    }

    if (dietaryFlags.some((entry: string) => entry === token)) {
      score += 14;
      matchedFields.add('dietaryFlags');
    } else if (dietaryFlags.some((entry: string) => entry.includes(token))) {
      score += 7;
      matchedFields.add('dietaryFlags');
    }
  }

  if (score <= 0) {
    return null;
  }

  if (item.isFeatured) {
    score += 6;
  }

  if (item.isAvailable) {
    score += 4;
  }

  return {
    item,
    score,
    matchedFields: Array.from(matchedFields),
  };
}

function sortHits(hits: readonly MenuSearchHit[]): MenuSearchHit[] {
  return [...hits].sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }

    if (left.item.isFeatured !== right.item.isFeatured) {
      return left.item.isFeatured ? -1 : 1;
    }

    if (left.item.sortOrder !== right.item.sortOrder) {
      return left.item.sortOrder - right.item.sortOrder;
    }

    return left.item.name.localeCompare(right.item.name, undefined, {
      sensitivity: 'base',
      numeric: true,
    });
  });
}

function readCachedHits(cacheKey: string): MenuSearchHit[] | null {
  const cached = SEARCH_CACHE.get(cacheKey);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    SEARCH_CACHE.delete(cacheKey);
    return null;
  }

  return cached.hits;
}

export function clearMenuSearchCache(): void {
  SEARCH_CACHE.clear();
}

function clampLimit(value: number | undefined, fallback: number, max: number): number {
  const next = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;
  return Math.max(1, Math.min(next, max));
}

export async function searchMenu(
  query: string,
  options: SearchMenuOptions = {},
): Promise<MenuSearchHit[]> {
  const normalizedQuery = normalizeText(query);
  const tokens = tokenize(query);
  const limit = clampLimit(options.limit, DEFAULT_SEARCH_LIMIT, MAX_RESULT_LIMIT);
  const cacheTtlMs = Math.max(
    1_000,
    Math.min(options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS, 60_000),
  );

  const cacheKey = cxKeyParts(
    'menu-search',
    normalizedQuery,
    options.categoryId ?? '',
    options.categorySlug ?? '',
    options.featuredOnly ?? false,
    options.includeInactive ?? false,
    options.includeUnavailable ?? false,
    limit,
  );

  const cached = readCachedHits(cacheKey);
  if (cached) {
    return cached;
  }

  const items = await listMenuItems({
    categoryId: options.categoryId,
    categorySlug: options.categorySlug,
    featuredOnly: options.featuredOnly,
    includeInactive: options.includeInactive,
    includeUnavailable: options.includeUnavailable,
    cacheTtlMs,
    signal: options.signal,
    limit: MAX_FETCH_LIMIT,
  });

  const hits =
    normalizedQuery.length === 0
      ? sortHits(items.map((item: PublicMenuItem) => scoreDefaultListingItem(item))).slice(0, limit)
      : sortHits(
          items
            .map((item: PublicMenuItem) => scoreItem(item, normalizedQuery, tokens))
            .filter((hit): hit is MenuSearchHit => hit !== null),
        ).slice(0, limit);

  SEARCH_CACHE.set(cacheKey, {
    hits,
    expiresAt: Date.now() + cacheTtlMs,
  });

  return hits;
}

export async function getMenuSearchSuggestions(
  query: string,
  options: SearchMenuOptions = {},
): Promise<string[]> {
  const hits = await searchMenu(query, {
    ...options,
    limit: Math.min(options.limit ?? MAX_SUGGESTIONS, MAX_SUGGESTIONS),
  });

  const suggestions = new Set<string>();

  for (const hit of hits) {
    suggestions.add(hit.item.name);

    if (hit.item.categoryName) {
      suggestions.add(hit.item.categoryName);
    }

    for (const tag of hit.item.tags) {
      if (suggestions.size >= MAX_SUGGESTIONS) {
        break;
      }

      suggestions.add(tag);
    }

    if (suggestions.size >= MAX_SUGGESTIONS) {
      break;
    }
  }

  return Array.from(suggestions).slice(0, MAX_SUGGESTIONS);
}