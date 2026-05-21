// =============================================================================
// PATH: src/domain/menu/menu.gateway.ts
// =============================================================================
// THE ONLY PLACE WHERE RAW DATA BECOMES A VALID MenuItemBase.
//
// Contract:
//   - Every caller passes unknown data in, gets MenuItemBase out.
//   - If the data cannot satisfy the contract, this function throws.
//   - No caller outside this file decides what "valid" means.
//   - No ?? fallbacks for identity, price, or category fields.
//   - inventory_count null = untracked (valid). Never default to 0.
//
// Dependency direction:
//   raw DB row / RPC response / any unknown source
//     → toMenuItemBase()   ← THE ONLY ENTRY POINT
//     → MenuItemBase
//     → mappers / services / UI
//
// After this file exists:
//   - menu.public.mapper.ts    calls toMenuItemBase(row)
//   - menu.service.public.ts   calls toMenuItemBase(raw)
//   - menu-ordering.service.ts calls toMenuItemBase(data)
//   - Nothing else constructs MenuItemBase manually.
// =============================================================================

import { pickMenuImageUrlFromRecord } from '@/lib/images/menuImageDelivery';
import type { MenuItemBase, MenuCategory, ModifierGroup } from './menu.types';
import { parseModifierGroupsFromJson } from './parseModifierGroups';

// ─── Valid categories ─────────────────────────────────────────────────────────
// Must exactly match the MenuCategory union in menu.types.ts.
// Add values here when the union is extended — nowhere else.

const VALID_CATEGORIES: ReadonlySet<MenuCategory> = new Set<MenuCategory>([
  'appetizers',
  'entrees',
  'desserts',
  'drinks',
  'lunch',
  'breakfast',
  'specials',
]);

// ─── Private field validators ─────────────────────────────────────────────────
// These throw with a descriptive message — never return a fallback value.
// Callers must handle the thrown error at the appropriate boundary.

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(
      `menu.gateway: "${field}" must be a non-empty string (got ${JSON.stringify(value)})`,
    );
  }
  return value.trim();
}

function requireFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(
      `menu.gateway: "${field}" must be a finite number (got ${JSON.stringify(value)})`,
    );
  }
  return value;
}

function requireCategory(value: unknown): MenuCategory {
  if (typeof value !== 'string' || !VALID_CATEGORIES.has(value as MenuCategory)) {
    throw new Error(
      `menu.gateway: unrecognised category "${String(value)}". ` +
        `Expected one of: ${[...VALID_CATEGORIES].join(', ')}`,
    );
  }
  return value as MenuCategory;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Convert any raw record (DB row, RPC jsonb, unknown payload) into a validated
 * MenuItemBase.
 *
 * Throws if any required field is missing, wrong type, or out of range.
 * Never silently patches corrupt data.
 *
 * modifier_groups:
 *   When the source is an RPC response that includes modifier data, pass
 *   the raw modifier_groups field — this function delegates to
 *   parseModifierGroupsFromJson to produce readonly ModifierGroup[].
 *   When the source is a plain table row (no modifier join), pass nothing
 *   or undefined — the field defaults to [].
 *
 * inventory_count:
 *   null  → item does not track inventory (valid, not an error)
 *   number → current tracked count
 *   absent / non-numeric → explicitly null (never defaults to 0)
 */
export function toMenuItemBase(
  raw: unknown,
  options: { modifierGroups?: unknown } = {},
): MenuItemBase {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('menu.gateway: input must be a non-null object');
  }

  const r = raw as Record<string, unknown>;

  // Identity — non-negotiable; a nameless or ID-less item must never be mapped
  const id   = requireString(r.id,   'id');
  const name = requireString(r.name, 'name');

  // Price — corrupt if not finite; 0 is a valid price, absence is not
  const price = requireFiniteNumber(r.price, 'price');

  // Category — must match the domain enum; silently defaulting would mis-route the item
  const category = requireCategory(r.category);

  // inventory_count: null = untracked (valid). Never default to 0.
  const inventory_count: number | null =
    typeof r.inventory_count === 'number' && Number.isFinite(r.inventory_count)
      ? r.inventory_count
      : null;

  // modifier_groups: caller may pass the raw field explicitly (RPC path) or
  // rely on the default empty array (table-row path with no modifier join)
  const modifierGroupsSource =
    options.modifierGroups !== undefined ? options.modifierGroups : r.modifier_groups;
  const modifier_groups: readonly ModifierGroup[] =
    parseModifierGroupsFromJson(modifierGroupsSource);

  // created_at: required by the type but does not affect domain logic.
  // Empty string is the honest representation of a missing audit field.
  const created_at = typeof r.created_at === 'string' ? r.created_at : '';

  return {
    id,
    name,
    price,
    category,
    inventory_count,

    featured:   typeof r.featured  === 'boolean' ? r.featured  : false,
    available:  typeof r.available === 'boolean' ? r.available : true,
    sort_order: typeof r.sort_order === 'number' && Number.isFinite(r.sort_order)
      ? Math.trunc(r.sort_order)
      : 0,

    description: typeof r.description === 'string' ? r.description : null,
    image_url: pickMenuImageUrlFromRecord(r),
    spicy_level: typeof r.spicy_level === 'number' && Number.isFinite(r.spicy_level)
      ? r.spicy_level
      : null,

    is_vegetarian:  typeof r.is_vegetarian  === 'boolean' ? r.is_vegetarian  : false,
    is_vegan:       typeof r.is_vegan       === 'boolean' ? r.is_vegan       : false,
    is_gluten_free: typeof r.is_gluten_free === 'boolean' ? r.is_gluten_free : false,

    allergens:  Array.isArray(r.allergens)  ? (r.allergens  as string[]) : [],
    pairs_with: Array.isArray(r.pairs_with) ? (r.pairs_with as string[]) : [],

    modifier_groups,

    created_at,
    updated_at: typeof r.updated_at === 'string' ? r.updated_at : null,
  };
}