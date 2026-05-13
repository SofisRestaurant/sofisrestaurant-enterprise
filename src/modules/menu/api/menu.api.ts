// src/modules/menu/api/menu.api.ts
import { env } from '@/lib/config/env';
import { supabase } from '@/lib/supabase/supabaseClient';

type UnknownRecord = Record<string, unknown>;

export const MENU_API_ERROR_CODES = {
  INVALID_INPUT: 'MENU_INVALID_INPUT',
  INVALID_RESPONSE: 'MENU_INVALID_RESPONSE',
  MISSING_ENV: 'MENU_MISSING_ENV',   // retained — safe to keep, removal needs broader audit
  NOT_FOUND: 'MENU_NOT_FOUND',
  FETCH_FAILED: 'MENU_FETCH_FAILED',
  UNKNOWN: 'MENU_UNKNOWN',
} as const;

export type MenuApiErrorCode =
  | (typeof MENU_API_ERROR_CODES)[keyof typeof MENU_API_ERROR_CODES]
  | (string & {});

export interface MenuApiErrorShape {
  code: MenuApiErrorCode;
  message: string;
  status: number;
  details?: unknown;
}

export class MenuApiError extends Error implements MenuApiErrorShape {
  public readonly code: MenuApiErrorCode;
  public readonly status: number;
  public readonly details?: unknown;

  public constructor(input: MenuApiErrorShape) {
    super(input.message);
    this.name = 'MenuApiError';
    this.code = input.code;
    this.status = input.status;
    this.details = input.details;
  }
}

export interface PublicMenuCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  sortOrder: number;
  isActive: boolean;
  metadata: UnknownRecord;
}

export interface PublicMenuItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  shortDescription: string | null;
  categoryId: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  isActive: boolean;
  isFeatured: boolean;
  isAvailable: boolean;
  sortOrder: number;
  prepTimeMinutes: number | null;
  spiceLevel: number | null;
  badges: string[];
  tags: string[];
  dietaryFlags: string[];
  metadata: UnknownRecord;
}

export interface ListMenuCategoriesOptions {
  includeInactive?: boolean;
  cacheTtlMs?: number;
  signal?: AbortSignal;
}

export interface ListMenuItemsOptions {
  categoryId?: string;
  categorySlug?: string;
  featuredOnly?: boolean;
  includeInactive?: boolean;
  includeUnavailable?: boolean;
  limit?: number;
  offset?: number;
  cacheTtlMs?: number;
  signal?: AbortSignal;
}

export interface GetPublicMenuOptions
  extends ListMenuItemsOptions,
    ListMenuCategoriesOptions {}

export interface PublicMenuPayload {
  categories: PublicMenuCategory[];
  items: PublicMenuItem[];
  asOf: string;
  requestId: string;
}

export interface FetchMenuTableRowsOptions {
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
  cacheTtlMs?: number;
  allowMissing?: boolean;
}

interface CacheEntry<TData> {
  expiresAt: number;
  data: TData;
}

const DEFAULT_CACHE_TTL_MS = 30_000;
const DEFAULT_TABLE_LIMIT = 500;
const MAX_TABLE_LIMIT = 2_000;
const DEFAULT_CURRENCY = 'USD';
const CONTROL_MAX_CODE_POINT = 31;
const DELETE_CODE_POINT = 127;

const MENU_CACHE = new Map<string, CacheEntry<unknown>>();

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isControlCharacterCode(code: number): boolean {
  return code <= CONTROL_MAX_CODE_POINT || code === DELETE_CODE_POINT;
}

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (isControlCharacterCode(code)) {
      return true;
    }
  }

  return false;
}

function replaceControlCharacters(value: string, replacement = ' '): string {
  let output = '';

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const code = value.charCodeAt(index);
    output += isControlCharacterCode(code) ? replacement : char;
  }

  return output;
}

function sanitizePlainText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = replaceControlCharacters(value)
    .trim()
    .replace(/\s+/gu, ' ')
    .trim();

  if (normalized.length === 0) {
    return null;
  }

  return normalized.length <= maxLength
    ? normalized
    : normalized.slice(0, maxLength).trim();
}

function sanitizeUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 2_048 || hasControlCharacters(trimmed)) {
    return null;
  }

  if (trimmed.includes('\\')) {
    return null;
  }

  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString();
    }
  } catch {
    return null;
  }

  return null;
}

function sanitizeSlug(value: unknown, fallbackSource?: string): string | null {
  const candidate =
    sanitizePlainText(value, 160) ?? sanitizePlainText(fallbackSource, 160);

  if (!candidate) {
    return null;
  }

  const normalized = candidate
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .replace(/-{2,}/gu, '-');

  return normalized.length > 0 ? normalized : null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }

  return fallback;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^-?\d+(?:\.\d+)?$/u.test(trimmed)) {
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }

  return null;
}

function asInteger(value: unknown, fallback: number): number {
  const parsed = asFiniteNumber(value);
  return parsed === null ? fallback : Math.trunc(parsed);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

function pickFirst(record: UnknownRecord, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return undefined;
}

function pickText(
  record: UnknownRecord,
  keys: readonly string[],
  maxLength: number,
): string | null {
  for (const key of keys) {
    const value = sanitizePlainText(record[key], maxLength);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function pickUrl(record: UnknownRecord, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = sanitizeUrl(record[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function pickNumber(record: UnknownRecord, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = asFiniteNumber(record[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function pickBoolean(
  record: UnknownRecord,
  keys: readonly string[],
  fallback: boolean,
): boolean {
  for (const key of keys) {
    if (key in record) {
      return asBoolean(record[key], fallback);
    }
  }

  return fallback;
}

function pickStringArray(
  record: UnknownRecord,
  keys: readonly string[],
  maxItemLength = 48,
): string[] {
  for (const key of keys) {
    const raw = record[key];

    if (Array.isArray(raw)) {
      const values = raw
        .map((entry) => sanitizePlainText(entry, maxItemLength))
        .filter((entry): entry is string => entry !== null);

      if (values.length > 0) {
        return Array.from(new Set(values));
      }
    }

    if (typeof raw === 'string') {
      const values = raw
        .split(',')
        .map((entry) => sanitizePlainText(entry, maxItemLength))
        .filter((entry): entry is string => entry !== null);

      if (values.length > 0) {
        return Array.from(new Set(values));
      }
    }
  }

  return [];
}

function pickRecord(record: UnknownRecord, keys: readonly string[]): UnknownRecord {
  for (const key of keys) {
    const candidate = record[key];
    if (isRecord(candidate)) {
      return candidate;
    }
  }

  return {};
}

function readCurrency(record: UnknownRecord): string {
  const raw =
    pickText(record, ['currency', 'currency_code'], 8)?.toUpperCase() ??
    DEFAULT_CURRENCY;

  return /^[A-Z]{3}$/u.test(raw) ? raw : DEFAULT_CURRENCY;
}

function readMoney(
  record: UnknownRecord,
  majorKeys: readonly string[],
  minorKeys: readonly string[],
): number | null {
  const minor = pickNumber(record, minorKeys);
  if (minor !== null) {
    return Number((minor / 100).toFixed(2));
  }

  const major = pickNumber(record, majorKeys);
  if (major !== null) {
    return Number(major.toFixed(2));
  }

  return null;
}

function createRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `menu_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

// ─── Request headers ──────────────────────────────────────────────────────────
//
// Uses the central env helper (env.supabase.publishableKey, env.app.name).
// Attaches a Bearer token only when a real user session is active.
// Public menu reads succeed with the publishable key alone.

async function getRestHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    apikey: env.supabase.publishableKey,
    'x-application-name': env.app.name,
    'x-request-id': createRequestId(),
  };

  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token ?? null;

    if (isNonEmptyString(accessToken)) {
      headers.Authorization = `Bearer ${accessToken.trim()}`;
    }
  } catch {
    // Public menu reads should still work with the publishable key only.
  }

  return headers;
}

// ─── URL builder ──────────────────────────────────────────────────────────────

function buildRestUrl(table: string, searchParams: URLSearchParams): string {
  return `${env.supabase.url.replace(/\/+$/u, '')}/rest/v1/${table}?${searchParams.toString()}`;
}

// ─── Shared fetch helpers ─────────────────────────────────────────────────────

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => '');

  if (text.length === 0) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'string' && payload.trim().length > 0) {
    return payload.trim();
  }

  if (isRecord(payload)) {
    const message = sanitizePlainText(payload.message, 240);
    if (message !== null) {
      return message;
    }

    const error = sanitizePlainText(payload.error, 240);
    if (error !== null) {
      return error;
    }
  }

  return fallback;
}

function getErrorCode(
  payload: unknown,
  fallback: MenuApiErrorCode,
): MenuApiErrorCode {
  if (isRecord(payload)) {
    const code = sanitizePlainText(payload.code, 64);
    if (code !== null) {
      return code;
    }
  }

  return fallback;
}

function isMissingRelationPayload(payload: unknown): boolean {
  if (!isRecord(payload)) {
    return false;
  }

  const code = sanitizePlainText(payload.code, 64);
  return code === 'PGRST205';
}

async function fetchJsonWithCache<TData>(
  cacheKey: string,
  ttlMs: number,
  loader: () => Promise<TData>,
): Promise<TData> {
  const now = Date.now();
  const cached = MENU_CACHE.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.data as TData;
  }

  const data = await loader();

  MENU_CACHE.set(cacheKey, {
    data,
    expiresAt: now + ttlMs,
  });

  return data;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchMenuTableRows(
  table: string,
  options: FetchMenuTableRowsOptions = {},
): Promise<UnknownRecord[]> {
  const safeTable = sanitizePlainText(table, 128);

  if (!safeTable) {
    throw new MenuApiError({
      code: MENU_API_ERROR_CODES.INVALID_INPUT,
      message: 'Table name is required.',
      status: 400,
    });
  }

  const limit = clamp(options.limit ?? DEFAULT_TABLE_LIMIT, 1, MAX_TABLE_LIMIT);
  const offset = clamp(options.offset ?? 0, 0, 100_000);
  const cacheTtlMs = clamp(
    options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
    1_000,
    5 * 60_000,
  );

  const cacheKey = `table:${safeTable}:${limit}:${offset}:${
    options.allowMissing ? 'allow-missing' : 'strict'
  }`;

  return fetchJsonWithCache(cacheKey, cacheTtlMs, async () => {
    const params = new URLSearchParams();
    params.set('select', '*');
    params.set('limit', String(limit));
    params.set('offset', String(offset));

    const response = await fetch(buildRestUrl(safeTable, params), {
      method: 'GET',
      headers: await getRestHeaders(),
      signal: options.signal,
    });

    const payload = await safeJson(response);

    if (!response.ok) {
      if (
        options.allowMissing &&
        (response.status === 404 || isMissingRelationPayload(payload))
      ) {
        return [];
      }

      throw new MenuApiError({
        code: getErrorCode(payload, MENU_API_ERROR_CODES.FETCH_FAILED),
        message: getErrorMessage(payload, `Unable to load ${safeTable}.`),
        status: response.status,
        details: payload,
      });
    }

    if (!Array.isArray(payload)) {
      throw new MenuApiError({
        code: MENU_API_ERROR_CODES.INVALID_RESPONSE,
        message: `Invalid response while loading ${safeTable}.`,
        status: 502,
        details: payload,
      });
    }

    return payload.filter(isRecord);
  });
}

export function parseMenuCategory(record: unknown): PublicMenuCategory | null {
  if (!isRecord(record)) {
    return null;
  }

  const id = pickText(record, ['id', 'category_id'], 128);
  const name = pickText(record, ['name', 'title', 'category_name'], 120);

  if (!id || !name) {
    return null;
  }

  return {
    id,
    slug: sanitizeSlug(pickFirst(record, ['slug']), name) ?? id,
    name,
    description: pickText(record, ['description', 'subtitle', 'summary'], 280),
    imageUrl: pickUrl(record, ['image_url', 'image', 'thumbnail_url']),
    imageAlt: pickText(record, ['image_alt', 'alt_text'], 160),
    sortOrder: clamp(
      asInteger(pickFirst(record, ['sort_order', 'display_order', 'position']), 0),
      -10_000,
      10_000,
    ),
    isActive: pickBoolean(record, ['is_active', 'active', 'enabled'], true),
    metadata: pickRecord(record, ['metadata', 'meta']),
  };
}

export function parseMenuItem(record: unknown): PublicMenuItem | null {
  if (!isRecord(record)) {
    return null;
  }

  const id = pickText(record, ['id', 'item_id'], 128);
  const name = pickText(record, ['name', 'title', 'item_name'], 160);

  if (!id || !name) {
    return null;
  }

  const price =
    readMoney(
      record,
      ['price', 'base_price', 'unit_price'],
      ['price_cents', 'base_price_cents', 'unit_price_cents'],
    ) ?? 0;

  return {
    id,
    slug: sanitizeSlug(pickFirst(record, ['slug']), name) ?? id,
    name,
    description: pickText(record, ['description', 'details', 'long_description'], 800),
    shortDescription: pickText(record, ['short_description', 'summary', 'subtitle'], 240),
    categoryId: pickText(record, ['category_id', 'menu_category_id'], 128),
    categorySlug: sanitizeSlug(pickFirst(record, ['category_slug'])),
    categoryName: pickText(record, ['category_name'], 120),
    imageUrl: pickUrl(record, ['image_url', 'image', 'photo_url', 'thumbnail_url']),
    imageAlt: pickText(record, ['image_alt', 'alt_text'], 160),
    price,
    compareAtPrice: readMoney(
      record,
      ['compare_at_price', 'original_price'],
      ['compare_at_price_cents', 'original_price_cents'],
    ),
    currency: readCurrency(record),
    isActive: pickBoolean(record, ['is_active', 'active', 'enabled'], true),
    isFeatured: pickBoolean(record, ['is_featured', 'featured'], false),
    isAvailable: pickBoolean(record, ['is_available', 'available', 'in_stock'], true),
    sortOrder: clamp(
      asInteger(pickFirst(record, ['sort_order', 'display_order', 'position']), 0),
      -10_000,
      10_000,
    ),
    prepTimeMinutes: (() => {
      const value = pickNumber(record, ['prep_time_minutes', 'prep_minutes']);
      return value === null ? null : clamp(Math.trunc(value), 0, 720);
    })(),
    spiceLevel: (() => {
      const value = pickNumber(record, ['spice_level', 'heat_level']);
      return value === null ? null : clamp(Math.trunc(value), 0, 10);
    })(),
    badges: pickStringArray(record, ['badges']),
    tags: pickStringArray(record, ['tags', 'keywords']),
    dietaryFlags: pickStringArray(record, ['dietary_flags', 'dietary', 'allergens']),
    metadata: pickRecord(record, ['metadata', 'meta']),
  };
}

function sortCategories(categories: PublicMenuCategory[]): PublicMenuCategory[] {
  return [...categories].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    return left.name.localeCompare(right.name, undefined, {
      sensitivity: 'base',
      numeric: true,
    });
  });
}

function sortItems(items: PublicMenuItem[]): PublicMenuItem[] {
  return [...items].sort((left, right) => {
    if (left.isFeatured !== right.isFeatured) {
      return left.isFeatured ? -1 : 1;
    }

    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    return left.name.localeCompare(right.name, undefined, {
      sensitivity: 'base',
      numeric: true,
    });
  });
}

function hydrateItemsWithCategories(
  items: PublicMenuItem[],
  categories: PublicMenuCategory[],
): PublicMenuItem[] {
  const categoryById = new Map(
    categories.map((category): readonly [string, PublicMenuCategory] => [category.id, category]),
  );
  const categoryBySlug = new Map(
    categories.map((category): readonly [string, PublicMenuCategory] => [category.slug, category]),
  );

  return items.map((item) => {
    const categoryFromId = item.categoryId ? categoryById.get(item.categoryId) : undefined;
    const categoryFromSlug = item.categorySlug
      ? categoryBySlug.get(item.categorySlug)
      : undefined;
    const category = categoryFromId ?? categoryFromSlug;

    if (!category) {
      return item;
    }

    return {
      ...item,
      categoryId: item.categoryId ?? category.id,
      categorySlug: item.categorySlug ?? category.slug,
      categoryName: item.categoryName ?? category.name,
    };
  });
}

export function invalidateMenuApiCache(prefix?: string): void {
  if (!prefix) {
    MENU_CACHE.clear();
    return;
  }

  for (const key of MENU_CACHE.keys()) {
    if (key.startsWith(prefix)) {
      MENU_CACHE.delete(key);
    }
  }
}

export async function listMenuCategories(
  options: ListMenuCategoriesOptions = {},
): Promise<PublicMenuCategory[]> {
  const includeInactive = options.includeInactive ?? false;
  const cacheTtlMs = clamp(
    options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
    1_000,
    5 * 60_000,
  );
  const cacheKey = `categories:${includeInactive ? 'all' : 'active'}`;

  return fetchJsonWithCache(cacheKey, cacheTtlMs, async () => {
    const rows = await fetchMenuTableRows('menu_categories', {
      signal: options.signal,
      cacheTtlMs,
    });

    const categories = rows
      .map(parseMenuCategory)
      .filter((category): category is PublicMenuCategory => category !== null)
      .filter((category) => includeInactive || category.isActive);

    return sortCategories(categories);
  });
}

export async function listMenuItems(
  options: ListMenuItemsOptions = {},
): Promise<PublicMenuItem[]> {
  const includeInactive = options.includeInactive ?? false;
  const includeUnavailable = options.includeUnavailable ?? false;
  const featuredOnly = options.featuredOnly ?? false;
  const limit =
    typeof options.limit === 'number'
      ? clamp(options.limit, 1, MAX_TABLE_LIMIT)
      : undefined;
  const offset =
    typeof options.offset === 'number'
      ? clamp(options.offset, 0, 100_000)
      : 0;
  const cacheTtlMs = clamp(
    options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
    1_000,
    5 * 60_000,
  );
  const normalizedCategoryId = sanitizePlainText(options.categoryId, 128);
  const normalizedCategorySlug = sanitizeSlug(options.categorySlug);

  const cacheKey = [
    'items',
    includeInactive ? 'all' : 'active',
    includeUnavailable ? 'with-unavailable' : 'available-only',
    featuredOnly ? 'featured' : 'all',
    normalizedCategoryId ?? 'any-category-id',
    normalizedCategorySlug ?? 'any-category-slug',
    String(limit ?? 'all'),
    String(offset),
  ].join(':');

  return fetchJsonWithCache(cacheKey, cacheTtlMs, async () => {
    const requestedRowCount =
      typeof limit === 'number'
        ? clamp(limit + offset, DEFAULT_TABLE_LIMIT, MAX_TABLE_LIMIT)
        : DEFAULT_TABLE_LIMIT;

    const [rows, categories] = await Promise.all([
      fetchMenuTableRows('menu_items', {
        signal: options.signal,
        cacheTtlMs,
        limit: requestedRowCount,
      }),
      listMenuCategories({
        includeInactive: true,
        signal: options.signal,
        cacheTtlMs,
      }),
    ]);

    let items = rows
      .map(parseMenuItem)
      .filter((item): item is PublicMenuItem => item !== null);

    items = hydrateItemsWithCategories(items, categories)
      .filter((item) => includeInactive || item.isActive)
      .filter((item) => includeUnavailable || item.isAvailable)
      .filter((item) => !featuredOnly || item.isFeatured)
      .filter((item) => !normalizedCategoryId || item.categoryId === normalizedCategoryId)
      .filter((item) => !normalizedCategorySlug || item.categorySlug === normalizedCategorySlug);

    const sorted = sortItems(items);

    return typeof limit === 'number'
      ? sorted.slice(offset, offset + limit)
      : sorted.slice(offset);
  });
}

export async function getMenuItemById(
  itemId: string,
  options: Omit<
    ListMenuItemsOptions,
    'categoryId' | 'categorySlug' | 'featuredOnly'
  > = {},
): Promise<PublicMenuItem | null> {
  const normalizedItemId = sanitizePlainText(itemId, 128);

  if (!normalizedItemId) {
    throw new MenuApiError({
      code: MENU_API_ERROR_CODES.INVALID_INPUT,
      message: 'Menu item id is required.',
      status: 400,
    });
  }

  const items = await listMenuItems({
    ...options,
    includeInactive: true,
    includeUnavailable: true,
    limit: DEFAULT_TABLE_LIMIT,
  });

  return items.find((item) => item.id === normalizedItemId) ?? null;
}

export async function getMenuItemBySlug(
  slug: string,
  options: Omit<
    ListMenuItemsOptions,
    'categoryId' | 'categorySlug' | 'featuredOnly'
  > = {},
): Promise<PublicMenuItem | null> {
  const normalizedSlug = sanitizeSlug(slug);

  if (!normalizedSlug) {
    throw new MenuApiError({
      code: MENU_API_ERROR_CODES.INVALID_INPUT,
      message: 'Menu item slug is required.',
      status: 400,
    });
  }

  const items = await listMenuItems({
    ...options,
    includeInactive: true,
    includeUnavailable: true,
    limit: DEFAULT_TABLE_LIMIT,
  });

  return items.find((item) => item.slug === normalizedSlug) ?? null;
}

export async function getPublicMenu(
  options: GetPublicMenuOptions = {},
): Promise<PublicMenuPayload> {
  const cacheTtlMs = clamp(
    options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
    1_000,
    5 * 60_000,
  );

  const cacheKey = [
    'public-menu',
    options.includeInactive ? 'all' : 'active',
    options.includeUnavailable ? 'with-unavailable' : 'available-only',
    options.featuredOnly ? 'featured' : 'all',
    sanitizePlainText(options.categoryId, 128) ?? 'any-category-id',
    sanitizeSlug(options.categorySlug) ?? 'any-category-slug',
    String(options.limit ?? 'all'),
    String(options.offset ?? 0),
  ].join(':');

  return fetchJsonWithCache(cacheKey, cacheTtlMs, async () => {
    const [categories, items] = await Promise.all([
      listMenuCategories({
        includeInactive: options.includeInactive,
        signal: options.signal,
        cacheTtlMs,
      }),
      listMenuItems({
        ...options,
        cacheTtlMs,
      }),
    ]);

    return {
      categories,
      items,
      asOf: new Date().toISOString(),
      requestId: createRequestId(),
    };
  });
}