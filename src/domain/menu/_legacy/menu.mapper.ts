// =============================================================================
// src/domain/menu/_legacy/menu.mapper.ts
// Menu domain mapper — DB row → domain model, domain model → DB insert
//
// NOTE: This file is in _legacy/ because it predates the menu_items_public
// and menu_items_admin_full views. New code should prefer those views directly.
// This mapper remains for backward-compat with components that consume the
// MenuItemDomain shape (e.g. cart, order history, kitchen screen).
//
// Sources mapped:
//   menu_items              → MenuItemDomain
//   menu_items_public       → MenuItemDomain  (public subset)
//   menu_items_admin_full   → MenuItemAdminDomain (includes modifier_groups JSON)
//   modifiers               → ModifierDomain
//   modifier_groups         → ModifierGroupDomain
// =============================================================================

import type { Database } from '@/types/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Raw row aliases
// ─────────────────────────────────────────────────────────────────────────────

type MenuItemRow = Database['public']['Tables']['menu_items']['Row'];
type ModifierRow = Database['public']['Tables']['modifiers']['Row'];
type ModifierGroupRow = Database['public']['Tables']['modifier_groups']['Row'];
type MenuItemPublicRow = Database['public']['Views']['menu_items_public']['Row'];
type MenuItemAdminRow = Database['public']['Views']['menu_items_admin_full']['Row'];
type MenuCategory = Database['public']['Enums']['menu_category'];
type MenuItemInsert = Database['public']['Tables']['menu_items']['Insert'];

// ─────────────────────────────────────────────────────────────────────────────
// Domain Models
// ─────────────────────────────────────────────────────────────────────────────

export interface ModifierDomain {
  id: string;
  groupId: string;
  /** human readable label */
  name: string;
  /** Price adjustment in cents — matches modifiers.price_adjustment */
  priceAdjustment: number;
  available: boolean;
  sortOrder: number;
}

export interface ModifierGroupDomain {
  id: string;
  name: string;
  description: string | null;
  type: string;
  required: boolean;
  minSelections: number | null;
  maxSelections: number | null;
  sortOrder: number;
  active: boolean;
  modifiers: ModifierDomain[];
}

/**
 * Core menu item domain model.
 * Matches the shape consumed by cart, kitchen, and order history.
 * All monetary values are in cents.
 */
export interface MenuItemDomain {
  id: string;
  name: string;
  description: string | null;
  /** Price in cents — raw DB value is dollars (numeric), multiply by 100 */
  priceCents: number;
  category: MenuCategory;
  imageUrl: string | null;
  available: boolean;
  featured: boolean;
  allergens: string[];
  isVegan: boolean;
  isVegetarian: boolean;
  isGlutenFree: boolean;
  spicyLevel: number | null;
  pairsWith: string[];
  popularityScore: number | null;
  sortOrder: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * Admin-extended model — includes modifier groups from the admin view JSON blob.
 * modifier_groups is a JSON column in menu_items_admin_full view.
 */
export interface MenuItemAdminDomain extends MenuItemDomain {
  inventoryCount: number | null;
  lowStockThreshold: number | null;
  modifierGroups: ModifierGroupDomain[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal utility types / helpers
// ─────────────────────────────────────────────────────────────────────────────

type UnknownRecord = Record<string, unknown>;

const notNull = <T>(v: T | null | undefined): v is T => v != null;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Safely normalizes unknown list-like data into string[].
 * Used for DB arrays and defensive JSON parsing from admin/public views.
 */
function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => asString(entry))
    .filter(notNull)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function asMenuCategory(value: unknown, fallback: MenuCategory = 'entrees'): MenuCategory {
  switch (value) {
    case 'breakfast':
    case 'lunch':
    case 'appetizers':
    case 'entrees':
    case 'specials':
    case 'desserts':
    case 'drinks':
      return value;
    default:
      return fallback;
  }
}

function dollarsToCents(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

function safeSortOrderValue(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 999_999;
}

function sortByNullableSortOrder<T extends { sortOrder: number | null }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => safeSortOrderValue(a.sortOrder) - safeSortOrderValue(b.sortOrder),
  );
}

function readNullableNumber(obj: unknown, key: string): number | null {
  if (!isRecord(obj)) return null;
  return asFiniteNumber(obj[key]);
}

function applyOptionalNumberInsert<
  K extends keyof Pick<
    MenuItemInsert,
    'sort_order' | 'spicy_level'
  >,
>(target: MenuItemInsert, key: K, value: number | null | undefined): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    target[key] = value;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Modifier mapper
// ─────────────────────────────────────────────────────────────────────────────

export function mapModifier(row: ModifierRow): ModifierDomain {
  return {
    id: row.id,
    groupId: row.modifier_group_id,
    name: row.name,
    priceAdjustment: row.price_adjustment,
    available: row.available,
    sortOrder: row.sort_order,
  };
}

export function mapModifierGroup(
  row: ModifierGroupRow,
  modifiers: ModifierRow[] = [],
): ModifierGroupDomain {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    required: row.required,
    minSelections: row.min_selections,
    maxSelections: row.max_selections,
    sortOrder: row.sort_order,
    active: row.active,
    modifiers: modifiers
      .filter((modifier) => modifier.modifier_group_id === row.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(mapModifier),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Menu item mappers
// ─────────────────────────────────────────────────────────────────────────────

export function mapMenuItem(row: MenuItemRow): MenuItemDomain {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    priceCents: dollarsToCents(row.price),
    category: row.category,
    imageUrl: row.image_url,
    available: row.available,
    featured: row.featured,
    allergens: asStringArray(row.allergens),
    isVegan: row.is_vegan ?? false,
    isVegetarian: row.is_vegetarian ?? false,
    isGlutenFree: row.is_gluten_free ?? false,
    spicyLevel: row.spicy_level,
    pairsWith: asStringArray(row.pairs_with),
    popularityScore: row.popularity_score,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Maps menu_items_public view row → MenuItemDomain.
 * View nulls all inventory / admin-only fields; safe for client-side use.
 */
export function mapMenuItemPublic(row: MenuItemPublicRow): MenuItemDomain {
  return {
    id: row.id ?? '',
    name: row.name ?? '',
    description: row.description ?? null,
    priceCents: dollarsToCents(row.price),
    category: asMenuCategory(row.category),
    imageUrl: row.image_url ?? null,
    available: row.available ?? true,
    featured: row.featured ?? false,
    allergens: asStringArray(row.allergens),
    isVegan: row.is_vegan ?? false,
    isVegetarian: row.is_vegetarian ?? false,
    isGlutenFree: row.is_gluten_free ?? false,
    spicyLevel: row.spicy_level ?? null,
    pairsWith: asStringArray(row.pairs_with),
    popularityScore: readNullableNumber(row, 'popularity_score'),
    sortOrder: row.sort_order ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

/**
 * Maps menu_items_admin_full view row → MenuItemAdminDomain.
 * The view's modifier_groups column is an opaque JSON blob from Postgres.
 * We parse it defensively; malformed JSON falls back to [].
 */
export function mapMenuItemAdmin(row: MenuItemAdminRow): MenuItemAdminDomain {
  const base = mapMenuItemPublic(row);

  return {
    ...base,
    inventoryCount: row.inventory_count ?? null,
    lowStockThreshold: row.low_stock_threshold ?? null,
    modifierGroups: parseModifierGroupsJson(row.modifier_groups),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Collection mappers
// ─────────────────────────────────────────────────────────────────────────────

export function mapMenuItems(rows: MenuItemRow[]): MenuItemDomain[] {
  return sortByNullableSortOrder(rows.map(mapMenuItem));
}

export function mapMenuItemsPublic(rows: MenuItemPublicRow[]): MenuItemDomain[] {
  return sortByNullableSortOrder(rows.map(mapMenuItemPublic));
}

export function mapMenuItemsAdmin(rows: MenuItemAdminRow[]): MenuItemAdminDomain[] {
  return sortByNullableSortOrder(rows.map(mapMenuItemAdmin));
}

// ─────────────────────────────────────────────────────────────────────────────
// Reverse mapper — domain → DB insert shape
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a partial MenuItemDomain back to a menu_items Insert shape.
 * Price is converted back from cents → dollars for the DB.
 */
export function menuItemToInsert(
  domain: Partial<MenuItemDomain> & Pick<MenuItemDomain, 'name' | 'priceCents' | 'category'>,
): MenuItemInsert {
  const insert: MenuItemInsert = {
    name: domain.name,
    price: domain.priceCents / 100,
    category: domain.category,
    description: domain.description ?? null,
    image_url: domain.imageUrl ?? null,
    available: domain.available ?? true,
    featured: domain.featured ?? false,
    allergens: domain.allergens?.length ? domain.allergens : null,
    is_vegan: domain.isVegan ?? null,
    is_vegetarian: domain.isVegetarian ?? null,
    is_gluten_free: domain.isGlutenFree ?? null,
    pairs_with: domain.pairsWith?.length ? domain.pairsWith : null,
  };

  applyOptionalNumberInsert(insert, 'spicy_level', domain.spicyLevel);
  applyOptionalNumberInsert(insert, 'sort_order', domain.sortOrder);

  return insert;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility (safe JSON parsing + shape guards)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses the admin view JSON blob into strictly typed ModifierGroupDomain[].
 * Filters out nulls at every level so callers never see (T | null)[].
 *
 * `isRecord` and `asStringArray` are intentionally used here to keep parsing
 * defensive and lint-clean while handling opaque Postgres JSON safely.
 */
export function parseModifierGroups(raw: unknown): ModifierGroupDomain[] {
  try {
    const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((group): ModifierGroupDomain | null => {
        if (!isRecord(group)) return null;

        const id = asString(group.id);
        const name = asString(group.name);
        if (!id || !name) return null;

        const modifiersRaw = Array.isArray(group.modifiers) ? group.modifiers : [];

        const modifiers: ModifierDomain[] = modifiersRaw
          .map((modifier): ModifierDomain | null => {
            if (!isRecord(modifier)) return null;

            const modifierId = asString(modifier.id);
            const modifierName = asString(modifier.name);
            if (!modifierId || !modifierName) return null;

            const groupId =
              asString(modifier.modifier_group_id) ??
              asString(modifier.groupId) ??
              asString(modifier.modifierGroupId) ??
              id;

            return {
              id: modifierId,
              groupId,
              name: modifierName,
              priceAdjustment:
                asFiniteNumber(modifier.price_adjustment) ??
                asFiniteNumber(modifier.priceAdjustment) ??
                0,
              available: asBoolean(modifier.available, true),
              sortOrder:
                asFiniteNumber(modifier.sort_order) ??
                asFiniteNumber(modifier.sortOrder) ??
                0,
            };
          })
          .filter(notNull)
          .sort((a, b) => a.sortOrder - b.sortOrder);

        const normalizedType = asString(group.type) ?? '';
        const normalizedDescription = asString(group.description);
        const aliases = asStringArray(group.aliases);
        const description =
          normalizedDescription ?? (aliases.length > 0 ? aliases.join(' • ') : null);

        return {
          id,
          name,
          description,
          type: normalizedType,
          required: asBoolean(group.required, false),
          minSelections:
            asFiniteNumber(group.min_selections) ?? asFiniteNumber(group.minSelections),
          maxSelections:
            asFiniteNumber(group.max_selections) ?? asFiniteNumber(group.maxSelections),
          sortOrder:
            asFiniteNumber(group.sort_order) ?? asFiniteNumber(group.sortOrder) ?? 0,
          active: asBoolean(group.active, true),
          modifiers,
        };
      })
      .filter(notNull)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  } catch {
    return [];
  }
}

/**
 * Backward-compat export used across older code paths.
 * IMPORTANT: this is the ONLY `parseModifierGroupsJson` export in the file.
 */
export function parseModifierGroupsJson(raw: unknown): ModifierGroupDomain[] {
  return parseModifierGroups(raw);
}

/**
 * Groups a flat MenuItemDomain[] by category.
 * Returns a Map in the canonical enum order.
 */
const CATEGORY_ORDER: MenuCategory[] = [
  'breakfast',
  'lunch',
  'appetizers',
  'entrees',
  'specials',
  'desserts',
  'drinks',
];

export function groupByCategory(items: MenuItemDomain[]): Map<MenuCategory, MenuItemDomain[]> {
  const map = new Map<MenuCategory, MenuItemDomain[]>();

  for (const category of CATEGORY_ORDER) {
    const group = items.filter((item) => item.category === category);
    if (group.length > 0) {
      map.set(category, group);
    }
  }

  return map;
}

/**
 * Formats a cent value → dollar display string.
 * Kept here so menu-layer consumers don't need to import from formatters.
 */
export function formatMenuPrice(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export const MenuMapper = {
  mapModifier,
  mapModifierGroup,
  mapMenuItem,
  mapMenuItemPublic,
  mapMenuItemAdmin,
  mapMenuItems,
  mapMenuItemsPublic,
  mapMenuItemsAdmin,
  menuItemToInsert,
  parseModifierGroups,
  parseModifierGroupsJson,
  groupByCategory,
  formatMenuPrice,
} as const;