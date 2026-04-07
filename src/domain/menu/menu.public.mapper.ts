import type { MenuItemPublicRow } from './menu.db.types';
import type { MenuItemPublic } from './menu.types';

// MenuItemPublicRow is now an alias for MenuItemTableRow (menu_items_public
// view was dropped and replaced with get_menu_public / get_menu_item_public RPCs).
// The table row does not have a modifier_groups column — that field is hydrated
// at the service layer by parseModifierGroupsFromJson on the RPC response.
// This mapper is kept for any code that builds a MenuItemPublic from a raw
// table row (e.g. admin read-back after create/update).

export class MenuPublicMapper {
  static map(this: void, row: MenuItemPublicRow): MenuItemPublic {
    return {
      id: row.id ?? '',
      name: row.name ?? '',
      price: Number(row.price),
      category: (row.category as MenuItemPublic['category']) ?? 'entrees',
      featured: row.featured ?? false,
      available: row.available ?? true,
      sort_order: row.sort_order ?? 0,

      is_vegetarian: row.is_vegetarian ?? false,
      is_vegan: row.is_vegan ?? false,
      is_gluten_free: row.is_gluten_free ?? false,

      description: row.description ?? null,
      image_url: row.image_url ?? null,
      spicy_level: row.spicy_level ?? null,
      updated_at: row.updated_at ?? null,

      allergens: Array.isArray(row.allergens) ? (row.allergens as string[]) : [],
      pairs_with: Array.isArray(row.pairs_with) ? (row.pairs_with as string[]) : [],

      // modifier_groups is not present on the table row — it is hydrated by the
      // RPC service layer. Default to empty array here so the type is satisfied.
      modifier_groups: [],

      created_at: row.created_at ?? '',
    };
  }

  static mapMany(rows: MenuItemPublicRow[]): MenuItemPublic[] {
    return rows.map((row) => MenuPublicMapper.map(row));
  }
}