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

// ─────────────────────────────────────────────────────────────────────────────
// Raw row aliases
// ─────────────────────────────────────────────────────────────────────────────
import type { Database } from '@/types/supabase'

type MenuItemRow       = Database['public']['Tables']['menu_items']['Row']
type ModifierRow       = Database['public']['Tables']['modifiers']['Row']
type ModifierGroupRow  = Database['public']['Tables']['modifier_groups']['Row']
type MenuItemPublicRow = Database['public']['Views']['menu_items_public']['Row']
type MenuItemAdminRow  = Database['public']['Views']['menu_items_admin_full']['Row']
type MenuCategory      = Database['public']['Enums']['menu_category']

// ─────────────────────────────────────────────────────────────────────────────
// Domain Models
// ─────────────────────────────────────────────────────────────────────────────

export interface ModifierDomain {
  id:              string
  groupId:         string
  name:            string
  /** Price adjustment in cents — matches modifiers.price_adjustment */
  priceAdjustment: number
  available:       boolean
  sortOrder:       number
}

export interface ModifierGroupDomain {
  id:            string
  name:          string
  description:   string | null
  type:          string
  required:      boolean
  minSelections: number | null
  maxSelections: number | null
  sortOrder:     number
  active:        boolean
  modifiers:     ModifierDomain[]
}

/**
 * Core menu item domain model.
 * Matches the shape consumed by cart, kitchen, and order history.
 * All monetary values are in cents.
 */
export interface MenuItemDomain {
  id:              string
  name:            string
  description:     string | null
  /** Price in cents — raw DB value is dollars (numeric), multiply by 100 */
  priceCents:      number
  category:        MenuCategory
  imageUrl:        string | null
  available:       boolean
  featured:        boolean
  allergens:       string[]
  isVegan:         boolean
  isVegetarian:    boolean
  isGlutenFree:    boolean
  spicyLevel:      number | null
  pairsWith:       string[]
  popularityScore: number | null
  sortOrder:       number | null
  createdAt:       string | null
  updatedAt:       string | null
}

/**
 * Admin-extended model — includes modifier groups from the admin view JSON blob.
 * modifier_groups is a JSON column in menu_items_admin_full view.
 */
export interface MenuItemAdminDomain extends MenuItemDomain {
  inventoryCount:    number | null
  lowStockThreshold: number | null
  modifierGroups:    ModifierGroupDomain[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Modifier mapper
// ─────────────────────────────────────────────────────────────────────────────

export function mapModifier(row: ModifierRow): ModifierDomain {
  return {
    id:              row.id,
    groupId:         row.modifier_group_id,
    name:            row.name,
    priceAdjustment: row.price_adjustment,
    available:       row.available,
    sortOrder:       row.sort_order,
  }
}

export function mapModifierGroup(
  row: ModifierGroupRow,
  modifiers: ModifierRow[] = [],
): ModifierGroupDomain {
  return {
    id:            row.id,
    name:          row.name,
    description:   row.description,
    type:          row.type,
    required:      row.required,
    minSelections: row.min_selections,
    maxSelections: row.max_selections,
    sortOrder:     row.sort_order,
    active:        row.active,
    modifiers:     modifiers
      .filter((m) => m.modifier_group_id === row.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(mapModifier),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Menu item mappers
// ─────────────────────────────────────────────────────────────────────────────
function readNullableNumber(obj: unknown, key: string): number | null {
  if (typeof obj !== 'object' || obj === null) return null
  const v = (obj as Record<string, unknown>)[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

export function mapMenuItem(row: MenuItemRow): MenuItemDomain {
  return {
    id:              row.id,
    name:            row.name,
    description:     row.description,
    priceCents:      Math.round(row.price * 100),
    category:        row.category,
    imageUrl:        row.image_url,
    available:       row.available,
    featured:        row.featured,
    allergens:       row.allergens ?? [],
    isVegan:         row.is_vegan ?? false,
    isVegetarian:    row.is_vegetarian ?? false,
    isGlutenFree:    row.is_gluten_free ?? false,
    spicyLevel:      row.spicy_level,
    pairsWith:       row.pairs_with ?? [],
    popularityScore: row.popularity_score,
    sortOrder:       row.sort_order,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
  }
}

/**
 * Maps menu_items_public view row → MenuItemDomain.
 * View nulls all inventory / admin-only fields; safe for client-side use.
 */
export function mapMenuItemPublic(row: MenuItemPublicRow): MenuItemDomain {
  return {
    id:              row.id ?? '',
    name:            row.name ?? '',
    description:     row.description ?? null,
    priceCents:      row.price != null ? Math.round(row.price * 100) : 0,
    category:        row.category ?? 'entrees',
    imageUrl:        row.image_url ?? null,
    available:       row.available ?? true,
    featured:        row.featured ?? false,
    allergens:       row.allergens ?? [],
    isVegan:         row.is_vegan ?? false,
    isVegetarian:    row.is_vegetarian ?? false,
    isGlutenFree:    row.is_gluten_free ?? false,
    spicyLevel:      row.spicy_level ?? null,
    pairsWith:       row.pairs_with ?? [],
    popularityScore: readNullableNumber(row, 'popularity_score'),
    sortOrder:       row.sort_order ?? null,
    createdAt:       row.created_at ?? null,
    updatedAt:       row.updated_at ?? null,
  }
}

/**
 * Maps menu_items_admin_full view row → MenuItemAdminDomain.
 * The view's modifier_groups column is an opaque JSON blob from Postgres.
 * We parse it defensively; malformed JSON falls back to [].
 */
export function mapMenuItemAdmin(row: MenuItemAdminRow): MenuItemAdminDomain {
  // MenuItemAdminRow extends the public view in supabase types; safe cast here
  const base = mapMenuItemPublic(row as unknown as MenuItemPublicRow)

  return {
    ...base,
    inventoryCount:    row.inventory_count ?? null,
    lowStockThreshold: row.low_stock_threshold ?? null,
    modifierGroups:    parseModifierGroupsJson(row.modifier_groups),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Collection mappers
// ─────────────────────────────────────────────────────────────────────────────

export function mapMenuItems(rows: MenuItemRow[]): MenuItemDomain[] {
  return rows
    .map(mapMenuItem)
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))
}

export function mapMenuItemsPublic(rows: MenuItemPublicRow[]): MenuItemDomain[] {
  return rows
    .map(mapMenuItemPublic)
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))
}

export function mapMenuItemsAdmin(rows: MenuItemAdminRow[]): MenuItemAdminDomain[] {
  return rows
    .map(mapMenuItemAdmin)
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))
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
): Database['public']['Tables']['menu_items']['Insert'] {
  return {
    name:            domain.name,
    price:           domain.priceCents / 100,
    category:        domain.category,
    description:     domain.description ?? null,
    image_url:       domain.imageUrl ?? null,
    available:       domain.available ?? true,
    featured:        domain.featured ?? false,
    allergens:       domain.allergens?.length ? domain.allergens : null,
    is_vegan:        domain.isVegan ?? null,
    is_vegetarian:   domain.isVegetarian ?? null,
    is_gluten_free:  domain.isGlutenFree ?? null,
    spicy_level:     domain.spicyLevel ?? null,
    pairs_with:      domain.pairsWith?.length ? domain.pairsWith : null,
    sort_order:      domain.sortOrder ?? null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility (safe JSON parsing + shape guards)
// ─────────────────────────────────────────────────────────────────────────────

type UnknownRecord = Record<string, unknown>

const notNull = <T>(v: T | null | undefined): v is T => v != null

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null
}

function asString(v: unknown): string | null {
  if (typeof v === 'string') return v
  if (v == null) return null
  return String(v)
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

/**
 * Parses the admin view JSON blob into strictly typed ModifierGroupDomain[].
 * Filters out nulls at every level so callers never see (T | null)[].
 */
export function parseModifierGroups(raw: unknown): ModifierGroupDomain[] {
  try {
    const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((g): ModifierGroupDomain | null => {
        if (!isRecord(g)) return null

        const id = asString(g['id'])
        const name = asString(g['name'])
        if (!id || !name) return null

        const modifiersRaw = Array.isArray(g['modifiers']) ? (g['modifiers'] as unknown[]) : []

        const modifiers: ModifierDomain[] = modifiersRaw
          .map((m): ModifierDomain | null => {
            if (!isRecord(m)) return null

            const mid = asString(m['id'])
            const mname = asString(m['name'])
            if (!mid || !mname) return null

            const groupId =
              asString(m['modifier_group_id']) ??
              asString(m['groupId']) ??
              asString(m['modifierGroupId']) ??
              id

            return {
              id: mid,
              groupId,
              name: mname,
              priceAdjustment:
                asNumber(m['price_adjustment']) ??
                asNumber(m['priceAdjustment']) ??
                0,
              available: asBool(m['available'], true),
              sortOrder:
                asNumber(m['sort_order']) ??
                asNumber(m['sortOrder']) ??
                0,
            }
          })
          .filter(notNull)

        return {
          id,
          name,
          description: asString(g['description']),
          type: asString(g['type']) ?? '',
          required: asBool(g['required'], false),
          minSelections:
            asNumber(g['min_selections']) ??
            asNumber(g['minSelections']),
          maxSelections:
            asNumber(g['max_selections']) ??
            asNumber(g['maxSelections']),
          sortOrder:
            asNumber(g['sort_order']) ??
            asNumber(g['sortOrder']) ??
            0,
          active: asBool(g['active'], true),
          modifiers,
        }
      })
      .filter(notNull)
  } catch {
    return []
  }
}

/**
 * Backward-compat export used across older code paths.
 * IMPORTANT: this is the ONLY `parseModifierGroupsJson` export in the file.
 */
export function parseModifierGroupsJson(raw: unknown): ModifierGroupDomain[] {
  return parseModifierGroups(raw)
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
]

export function groupByCategory(items: MenuItemDomain[]): Map<MenuCategory, MenuItemDomain[]> {
  const map = new Map<MenuCategory, MenuItemDomain[]>()

  for (const cat of CATEGORY_ORDER) {
    const group = items.filter((i) => i.category === cat)
    if (group.length > 0) map.set(cat, group)
  }

  return map
}

/**
 * Formats a cent value → dollar display string.
 * Kept here so menu-layer consumers don't need to import from formatters.
 */
export function formatMenuPrice(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style:                 'currency',
    currency:              'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
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
} as const