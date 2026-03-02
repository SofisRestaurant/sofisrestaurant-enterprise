import type { MenuItemPublicRow } from './menu.db.types'
import type { MenuItemPublic } from './menu.types'

export class MenuPublicMapper {
  static map(row: MenuItemPublicRow): MenuItemPublic {
    return {
      id: row.id ?? '',
    name: row.name ?? '',
      price: Number(row.price),
      category: row.category ?? 'entrees',
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
allergens: row.allergens ?? [],
pairs_with: row.pairs_with ?? [],

      modifier_groups:
   (row.modifier_groups as unknown as MenuItemPublic['modifier_groups']) ?? [],

      created_at: row.created_at ?? '',
    }
  }

  static mapMany(rows: MenuItemPublicRow[]): MenuItemPublic[] {
    return rows.map(this.map)
  }
}