// src/domain/menu/menu.mapper.ts
// ============================================================================
// MENU MAPPER — MenuItemDTO → MenuItem domain model
// ============================================================================
// The menu_items_full VIEW returns modifier_groups as a Json | null column.
// Supabase client auto-parses Json columns, so it arrives as:
//   - A JS array of ModifierGroupDTO objects (when item has modifier groups)
//   - null (when item has no modifier groups)
//   - Possibly a raw string in edge cases (defensive parse below)
//
// This mapper is the ONLY place that touches raw DTOs. Everything above
// this layer works with fully-typed MenuItem domain objects.
// ============================================================================
import type { Database } from '@/lib/supabase/database.types'
import type { MenuItem, ModifierGroup, Modifier } from '@/domain/menu/menu.types'

type MenuItemViewRow =
  Database['public']['Views']['menu_items_full']['Row']

type ModifierRow = {
  id: string
  modifier_group_id: string
  name: string
  price_adjustment: number
  available: boolean
  sort_order: number
}

type ModifierGroupRow = {
  id: string
  name: string
  description: string | null
  type: string
  required: boolean
  min_selections: number | null
  max_selections: number | null
  active: boolean
  sort_order: number
  modifiers: ModifierRow[]
}
export class MenuMapper {


  
  // ── Modifier ───────────────────────────────────────────────────────────────

  static mapModifier(raw: ModifierRow): Modifier {
    return {
      id:                raw.id,
      modifier_group_id: raw.modifier_group_id,
      name:              raw.name,
      price_adjustment:  Number(raw.price_adjustment ?? 0),
      available:         raw.available ?? true,
      sort_order:        raw.sort_order ?? 0,
    }
  }

  // ── Modifier group ─────────────────────────────────────────────────────────

  static mapModifierGroup(raw: ModifierGroupRow): ModifierGroup {
  return {
    id:             raw.id,
    name:           raw.name,
    description:    raw.description ?? undefined,
    type:           (raw.type as ModifierGroup['type']) ?? 'radio',
    required:       raw.required ?? false,
    min_selections: raw.min_selections ?? 0,
    max_selections: raw.max_selections ?? null,
    sort_order:     raw.sort_order ?? 0,
    active:         raw.active ?? true,
    modifiers: (raw.modifiers ?? [])
      .filter((m) => m.available !== false)
      .map((m) => this.mapModifier(m))
      .sort((a: Modifier, b: Modifier) => a.sort_order - b.sort_order),
  }
}
  // ── Parse modifier_groups Json from view ───────────────────────────────────

  /**
   * Safely parse the modifier_groups Json column.
   *
   * Supabase delivers this as an already-parsed JS array. However, we guard
   * against: null, empty string, raw JSON string, and malformed objects.
   *
   * Rules:
   *   - Filters groups where active === false
   *   - Filters groups with no modifiers after availability filter
   *   - Sorts by sort_order ascending
   */
  private static parseModifierGroups(raw: unknown): ModifierGroup[] {
    if (!raw) return []

    // Guard: occasionally arrives as JSON string in some Supabase versions
    let parsed = raw
    if (typeof raw === 'string') {
      try { parsed = JSON.parse(raw) } catch { return [] }
    }

    if (!Array.isArray(parsed)) return []

    const groups = parsed as ModifierGroupRow[];

return groups
  .filter((g) =>
    g &&
    typeof g === 'object' &&
    typeof g.id === 'string' &&
    typeof g.name === 'string' &&
    g.active !== false
  )
  .map((g) => this.mapModifierGroup(g))
  .sort((a, b) => a.sort_order - b.sort_order);
  }

  // ── Menu item ──────────────────────────────────────────────────────────────

static mapMenuItem(row: MenuItemViewRow): MenuItem {
  return {
    id: row.id ?? '',
    name: row.name ?? '',
    price: Number(row.price ?? 0),
    category: row.category ?? 'entrees',
    featured: row.featured ?? false,
    available: row.available ?? true,
    sort_order: row.sort_order ?? 0,

    description: row.description ?? undefined,
    image_url: row.image_url ?? undefined,
    spicy_level: row.spicy_level ?? undefined,
    is_vegetarian: row.is_vegetarian ?? false,
    is_vegan: row.is_vegan ?? false,
    is_gluten_free: row.is_gluten_free ?? false,
    allergens: row.allergens ?? undefined,

    inventory_count: row.inventory_count ?? undefined,
    low_stock_threshold: row.low_stock_threshold ?? 0,
    popularity_score: row.popularity_score ?? undefined,
    pairs_with: row.pairs_with ?? undefined,

    modifier_groups: MenuMapper.parseModifierGroups(row.modifier_groups),

    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? undefined,
  }
}

  // ── Batch ──────────────────────────────────────────────────────────────────
static mapMenuItems(rows: MenuItemViewRow[]): MenuItem[] {
  return rows.map((row) => MenuMapper.mapMenuItem(row))
}
  // ── Category validation ────────────────────────────────────────────────────

// ── Category validation ────────────────────────────────────────────────────
private static validateCategory(raw: string): MenuItem['category'] {
  return raw as MenuItem['category']
}
}