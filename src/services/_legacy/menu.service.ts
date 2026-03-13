// src/services/_legacy/menu.service.ts
// ============================================================================
// MENU SERVICE (Legacy-compatible, 2026 hardened)
// - READ:  menu_items_public (customer-safe view)
// - READ+: menu_items_admin_full (admin view w/ modifier_groups JSON)
// - WRITE: admin-gateway Edge Function (service-role owned mutations)
// - Mapper: src/domain/menu/_legacy/menu.mapper.ts (MenuMapper object export)
// ============================================================================

import type { PostgrestError } from '@supabase/supabase-js';

import { MenuMapper } from '@/domain/menu/_legacy/menu.mapper';
import { supabase } from '@/lib/supabase/supabaseClient';
import { invokeEdge } from '@/lib/supabase/invoke';
import type { Database, Enums, TablesInsert, TablesUpdate } from '@/types/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Domain types used by your app (keep aligned with mapper outputs)
// ─────────────────────────────────────────────────────────────────────────────

export type MenuCategory = Enums<'menu_category'>;

export type MenuItem = ReturnType<(typeof MenuMapper)['mapMenuItemPublic']>;
export type MenuItemAdmin = ReturnType<(typeof MenuMapper)['mapMenuItemAdmin']>;

// Writable shapes
type MenuItemInsert = TablesInsert<'menu_items'>;
type MenuItemUpdate = TablesUpdate<'menu_items'>;

// View row types
type MenuItemPublicRow = Database['public']['Views']['menu_items_public']['Row'];
type MenuItemAdminRow = Database['public']['Views']['menu_items_admin_full']['Row'];

type UnknownRecord = Record<string, unknown>;

type AdminGatewayAction =
  | 'menu:items:create'
  | 'menu:items:update'
  | 'menu:items:delete'
  | 'menu:items:toggle-availability';

type AdminGatewayMenuItemPayload = MenuItemWritePayload | Partial<MenuItemWritePayload>;

const MAX_ID_LENGTH = 128;
const MAX_NAME_LENGTH = 180;
const MAX_LONG_TEXT_LENGTH = 4_000;
const MAX_URL_LENGTH = 2_000;
const MAX_TAG_ITEM_LENGTH = 120;
const MAX_TAG_ITEMS = 50;
const MAX_SORT_ORDER = 1_000_000;
const MAX_STOCK = 1_000_000;
const MAX_SPICY_LEVEL = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Error class
// ─────────────────────────────────────────────────────────────────────────────

export class MenuServiceError extends Error {
  public readonly code?: string;
  public readonly details?: unknown;

  constructor(message: string, code?: string, details?: unknown) {
    super(message);
    this.name = 'MenuServiceError';
    this.code = code;
    this.details = details;
  }
}

function throwPg(message: string, error: PostgrestError): never {
  throw new MenuServiceError(message, error.code, error);
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime guards / normalization
// ─────────────────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasStringId(value: unknown): value is { id: string } {
  return isRecord(value) && typeof value.id === 'string' && value.id.trim().length > 0;
}

function isMenuItemPublicRow(value: unknown): value is MenuItemPublicRow {
  return hasStringId(value);
}

function isMenuItemAdminRow(value: unknown): value is MenuItemAdminRow {
  return hasStringId(value);
}

function toMenuItemPublicRows(data: unknown): MenuItemPublicRow[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.filter(isMenuItemPublicRow);
}

function toMenuItemAdminRows(data: unknown): MenuItemAdminRow[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.filter(isMenuItemAdminRow);
}

function toMenuItemPublicRow(data: unknown): MenuItemPublicRow | null {
  return isMenuItemPublicRow(data) ? data : null;
}

function toMenuItemAdminRow(data: unknown): MenuItemAdminRow | null {
  return isMenuItemAdminRow(data) ? data : null;
}

function extractErrorCode(error: unknown): string | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  return typeof error.code === 'string' && error.code.trim().length > 0
    ? error.code.trim()
    : undefined;
}

function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }

  if (isRecord(error) && typeof error.message === 'string' && error.message.trim().length > 0) {
    return error.message.trim();
  }

  return fallback;
}

function sanitizeString(value: string, field: string, max = 300): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new MenuServiceError(`${field} is required`);
  }

  if (normalized.length > max) {
    throw new MenuServiceError(`${field} is too long`);
  }

  return normalized;
}

function sanitizeNullableString(
  value: string | null | undefined,
  field: string,
  max = 2_000,
): string | null {
  if (value == null) {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length > max) {
    throw new MenuServiceError(`${field} is too long`);
  }

  return normalized;
}

function sanitizeOptionalBoolean(value: boolean | null | undefined): boolean | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return Boolean(value);
}

function sanitizeOptionalInt(
  value: number | null | undefined,
  field: string,
  opts: { min?: number; max?: number } = {},
): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Number.isFinite(value)) {
    throw new MenuServiceError(`${field} must be a valid number`);
  }

  const normalized = Math.trunc(value);

  if (opts.min !== undefined && normalized < opts.min) {
    throw new MenuServiceError(`${field} must be at least ${opts.min}`);
  }

  if (opts.max !== undefined && normalized > opts.max) {
    throw new MenuServiceError(`${field} must be at most ${opts.max}`);
  }

  return normalized;
}

function sanitizePrice(value: number, field = 'price'): number {
  if (!Number.isFinite(value)) {
    throw new MenuServiceError(`${field} must be a valid number`);
  }

  if (value < 0) {
    throw new MenuServiceError(`${field} must be non-negative`);
  }

  return Number(value.toFixed(2));
}

function sanitizeNullableStringArray(
  value: string[] | null | undefined,
  field: string,
  maxItems = MAX_TAG_ITEMS,
  maxItemLen = MAX_TAG_ITEM_LENGTH,
): string[] | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (!Array.isArray(value)) {
    throw new MenuServiceError(`${field} must be an array`);
  }

  const normalized = Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
          if (entry.length > maxItemLen) {
            throw new MenuServiceError(`${field} contains an item that is too long`);
          }

          return entry;
        }),
    ),
  );

  if (normalized.length > maxItems) {
    throw new MenuServiceError(`${field} has too many entries`);
  }

  return normalized;
}

function sanitizeWritePayload(payload: MenuItemWritePayload): MenuItemInsert {
  return {
    name: sanitizeString(payload.name, 'name', MAX_NAME_LENGTH),
    category: payload.category,
    price: sanitizePrice(payload.price),
    description: sanitizeNullableString(payload.description, 'description', MAX_LONG_TEXT_LENGTH),
    image_url: sanitizeNullableString(payload.image_url, 'image_url', MAX_URL_LENGTH),
    available: payload.available ?? true,
    featured: payload.featured ?? false,
    sort_order: sanitizeOptionalInt(payload.sort_order, 'sort_order', {
      min: 0,
      max: MAX_SORT_ORDER,
    }),
    spicy_level: sanitizeOptionalInt(payload.spicy_level, 'spicy_level', {
      min: 0,
      max: MAX_SPICY_LEVEL,
    }),
    is_vegan: sanitizeOptionalBoolean(payload.is_vegan) ?? null,
    is_vegetarian: sanitizeOptionalBoolean(payload.is_vegetarian) ?? null,
    is_gluten_free: sanitizeOptionalBoolean(payload.is_gluten_free) ?? null,
    allergens:
      sanitizeNullableStringArray(
        payload.allergens,
        'allergens',
        MAX_TAG_ITEMS,
        MAX_TAG_ITEM_LENGTH,
      ) ?? null,
    inventory_count: sanitizeOptionalInt(payload.inventory_count, 'inventory_count', {
      min: 0,
      max: MAX_STOCK,
    }),
    low_stock_threshold: sanitizeOptionalInt(
      payload.low_stock_threshold,
      'low_stock_threshold',
      {
        min: 0,
        max: MAX_STOCK,
      },
    ),
    popularity_score: sanitizeOptionalInt(payload.popularity_score, 'popularity_score', {
      min: 0,
      max: MAX_STOCK,
    }),
    pairs_with:
      sanitizeNullableStringArray(
        payload.pairs_with,
        'pairs_with',
        MAX_TAG_ITEMS,
        MAX_TAG_ITEM_LENGTH,
      ) ?? null,
  };
}

function sanitizePartialWritePayload(payload: Partial<MenuItemWritePayload>): MenuItemUpdate {
  const update: MenuItemUpdate = {};

  if (payload.name !== undefined) {
    update.name = sanitizeString(payload.name, 'name', MAX_NAME_LENGTH);
  }

  if (payload.category !== undefined) {
    update.category = payload.category;
  }

  if (payload.price !== undefined) {
    update.price = sanitizePrice(payload.price);
  }

  if (payload.description !== undefined) {
    update.description = sanitizeNullableString(
      payload.description,
      'description',
      MAX_LONG_TEXT_LENGTH,
    );
  }

  if (payload.image_url !== undefined) {
    update.image_url = sanitizeNullableString(payload.image_url, 'image_url', MAX_URL_LENGTH);
  }

  if (payload.available !== undefined) {
    update.available = Boolean(payload.available);
  }

  if (payload.featured !== undefined) {
    update.featured = Boolean(payload.featured);
  }

  if (payload.sort_order !== undefined) {
    update.sort_order = sanitizeOptionalInt(payload.sort_order, 'sort_order', {
      min: 0,
      max: MAX_SORT_ORDER,
    });
  }

  if (payload.spicy_level !== undefined) {
    update.spicy_level = sanitizeOptionalInt(payload.spicy_level, 'spicy_level', {
      min: 0,
      max: MAX_SPICY_LEVEL,
    });
  }

  if (payload.is_vegan !== undefined) {
    update.is_vegan = sanitizeOptionalBoolean(payload.is_vegan) ?? null;
  }

  if (payload.is_vegetarian !== undefined) {
    update.is_vegetarian = sanitizeOptionalBoolean(payload.is_vegetarian) ?? null;
  }

  if (payload.is_gluten_free !== undefined) {
    update.is_gluten_free = sanitizeOptionalBoolean(payload.is_gluten_free) ?? null;
  }

  if (payload.allergens !== undefined) {
    update.allergens =
      sanitizeNullableStringArray(
        payload.allergens,
        'allergens',
        MAX_TAG_ITEMS,
        MAX_TAG_ITEM_LENGTH,
      ) ?? null;
  }

  if (payload.inventory_count !== undefined) {
    update.inventory_count = sanitizeOptionalInt(payload.inventory_count, 'inventory_count', {
      min: 0,
      max: MAX_STOCK,
    });
  }

  if (payload.low_stock_threshold !== undefined) {
    update.low_stock_threshold = sanitizeOptionalInt(
      payload.low_stock_threshold,
      'low_stock_threshold',
      {
        min: 0,
        max: MAX_STOCK,
      },
    );
  }

  if (payload.popularity_score !== undefined) {
    update.popularity_score = sanitizeOptionalInt(
      payload.popularity_score,
      'popularity_score',
      {
        min: 0,
        max: MAX_STOCK,
      },
    );
  }

  if (payload.pairs_with !== undefined) {
    update.pairs_with =
      sanitizeNullableStringArray(
        payload.pairs_with,
        'pairs_with',
        MAX_TAG_ITEMS,
        MAX_TAG_ITEM_LENGTH,
      ) ?? null;
  }

  return update;
}

function ensureItemId(id: string): string {
  return sanitizeString(id, 'id', MAX_ID_LENGTH);
}

function isMenuItemWritePayload(
  payload: AdminGatewayMenuItemPayload,
): payload is MenuItemWritePayload {
  return 'name' in payload && 'category' in payload && 'price' in payload;
}

function toGatewayPayload(
  payload: AdminGatewayMenuItemPayload,
): MenuItemInsert | MenuItemUpdate {
  return isMenuItemWritePayload(payload)
    ? sanitizeWritePayload(payload)
    : sanitizePartialWritePayload(payload);
}

// ─────────────────────────────────────────────────────────────────────────────
// Write payload
// ─────────────────────────────────────────────────────────────────────────────

export interface MenuItemWritePayload {
  name: string;
  category: MenuCategory;
  price: number;
  description?: string | null;
  image_url?: string | null;
  available?: boolean;
  featured?: boolean;
  sort_order?: number | null;
  spicy_level?: number | null;
  is_vegan?: boolean | null;
  is_vegetarian?: boolean | null;
  is_gluten_free?: boolean | null;
  allergens?: string[] | null;
  inventory_count?: number | null;
  low_stock_threshold?: number | null;
  popularity_score?: number | null;
  pairs_with?: string[] | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gateway helpers
// ─────────────────────────────────────────────────────────────────────────────

async function callAdminGateway<T>(
  action: AdminGatewayAction,
  payload: UnknownRecord,
): Promise<T> {
  try {
    return await invokeEdge<T>('admin-gateway', {
      action,
      payload,
    });
  } catch (error) {
    throw new MenuServiceError(
      extractErrorMessage(error, `Admin gateway request failed for ${action}`),
      extractErrorCode(error),
      error,
    );
  }
}

function extractMenuItemIdFromGatewayResult(result: unknown, fallbackId?: string): string | null {
  if (typeof fallbackId === 'string' && fallbackId.trim().length > 0) {
    return fallbackId;
  }

  if (hasStringId(result)) {
    return result.id.trim();
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class MenuService {
  /** All available items (public). */
  static async getMenuItems(): Promise<MenuItem[]> {
    const { data, error } = await supabase
      .from('menu_items_public')
      .select('*')
      .eq('available', true)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true });

    if (error) {
      throwPg('Failed to fetch menu items', error);
    }

    const rows = toMenuItemPublicRows(data);
    return MenuMapper.mapMenuItemsPublic(rows);
  }

  /** Admin-safe list (includes unavailable). */
  static async getMenuItemsAdmin(): Promise<MenuItemAdmin[]> {
    const { data, error } = await supabase
      .from('menu_items_admin_full')
      .select('*')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true });

    if (error) {
      throwPg('Failed to fetch admin menu items', error);
    }

    const rows = toMenuItemAdminRows(data);
    return MenuMapper.mapMenuItemsAdmin(rows);
  }

  /**
   * Single item WITH modifiers graph.
   * Uses admin view because that’s where modifier_groups JSON exists.
   */
  static async getMenuItemWithModifiers(itemId: string): Promise<MenuItemAdmin | null> {
    const safeId = ensureItemId(itemId);

    const { data, error } = await supabase
      .from('menu_items_admin_full')
      .select('*')
      .eq('id', safeId)
      .maybeSingle();

    if (error) {
      throwPg('Failed to fetch menu item with modifiers', error);
    }

    const row = toMenuItemAdminRow(data);
    if (!row) {
      return null;
    }

    return MenuMapper.mapMenuItemAdmin(row);
  }

  /** Public single-item lookup. */
  static async getMenuItem(itemId: string): Promise<MenuItem | null> {
    const safeId = ensureItemId(itemId);

    const { data, error } = await supabase
      .from('menu_items_public')
      .select('*')
      .eq('id', safeId)
      .maybeSingle();

    if (error) {
      throwPg('Failed to fetch menu item', error);
    }

    const row = toMenuItemPublicRow(data);
    if (!row) {
      return null;
    }

    return MenuMapper.mapMenuItemPublic(row);
  }

  static async getMenuItemsByCategory(category: MenuCategory): Promise<MenuItem[]> {
    const { data, error } = await supabase
      .from('menu_items_public')
      .select('*')
      .eq('category', category)
      .eq('available', true)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true });

    if (error) {
      throwPg('Failed to fetch category items', error);
    }

    const rows = toMenuItemPublicRows(data);
    return MenuMapper.mapMenuItemsPublic(rows);
  }

  static async searchMenuItems(query: string): Promise<MenuItem[]> {
    const q = query.trim();
    if (!q) {
      return [];
    }

    const { data, error } = await supabase
      .from('menu_items_public')
      .select('*')
      .eq('available', true)
      .or(`name.ilike.%${q}%,description.ilike.%${q}%`)
      .order('popularity_score', { ascending: false, nullsFirst: false })
      .limit(20);

    if (error) {
      throwPg('Search failed', error);
    }

    const rows = toMenuItemPublicRows(data);
    return MenuMapper.mapMenuItemsPublic(rows);
  }

  static async getFeaturedItems(): Promise<MenuItem[]> {
    const { data, error } = await supabase
      .from('menu_items_public')
      .select('*')
      .eq('featured', true)
      .eq('available', true)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true });

    if (error) {
      throwPg('Failed to fetch featured items', error);
    }

    const rows = toMenuItemPublicRows(data);
    return MenuMapper.mapMenuItemsPublic(rows);
  }

  static async getPopularItems(limit = 6): Promise<MenuItem[]> {
    const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit || 0)));

    const { data, error } = await supabase
      .from('menu_items_public')
      .select('*')
      .eq('available', true)
      .order('popularity_score', { ascending: false, nullsFirst: false })
      .limit(safeLimit);

    if (error) {
      throwPg('Failed to fetch popular items', error);
    }

    const rows = toMenuItemPublicRows(data);
    return MenuMapper.mapMenuItemsPublic(rows);
  }

  static async createMenuItem(payload: MenuItemWritePayload): Promise<MenuItemAdmin> {
    const result = await callAdminGateway<unknown>('menu:items:create', {
      ...toGatewayPayload(payload),
    });

    const createdId = extractMenuItemIdFromGatewayResult(result);

    if (!createdId) {
      throw new MenuServiceError(
        'Menu item was created but no id was returned by admin-gateway.',
        'MENU_CREATE_NO_ID',
        result,
      );
    }

    const full = await MenuService.getMenuItemWithModifiers(createdId);

    if (!full) {
      throw new MenuServiceError('Item not found after create', 'MENU_CREATE_READBACK_FAILED', {
        id: createdId,
      });
    }

    return full;
  }

  static async updateMenuItem(
    id: string,
    payload: Partial<MenuItemWritePayload>,
  ): Promise<MenuItemAdmin> {
    const safeId = ensureItemId(id);
    const sanitized = toGatewayPayload(payload);

    await callAdminGateway<unknown>('menu:items:update', {
      id: safeId,
      ...sanitized,
    });

    const full = await MenuService.getMenuItemWithModifiers(safeId);

    if (!full) {
      throw new MenuServiceError('Item not found after update', 'MENU_UPDATE_READBACK_FAILED', {
        id: safeId,
      });
    }

    return full;
  }

  static async deleteMenuItem(id: string): Promise<void> {
    const safeId = ensureItemId(id);

    await callAdminGateway<unknown>('menu:items:delete', {
      id: safeId,
    });
  }

  static async toggleAvailability(id: string, available: boolean): Promise<void> {
    const safeId = ensureItemId(id);

    await callAdminGateway<unknown>('menu:items:toggle-availability', {
      id: safeId,
      available: Boolean(available),
    });
  }
}