import type { MenuItemPublicRow } from './menu.db.types';
import type { MenuItemPublic } from './menu.types';

export class MenuPublicMapper {
  static map(this: void, row: MenuItemPublicRow): MenuItemPublic {
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

      // ✅ KEEP snake_case (THIS FIXES EVERYTHING)
      modifier_groups: Array.isArray(row.modifier_groups)
        ? row.modifier_groups.map((group: any) => ({
            id: group.modifier_group_id,
            name: group.modifier_group_name,
            description: null,
            type: 'radio', // default (you can improve later)
            required: false,
            min_selections: 0,
            max_selections: null,
            sort_order: group.sort_order ?? 0,
            active: true,

            modifiers: Array.isArray(group.options)
              ? group.options
                  .filter((opt: any) => opt.is_active)
                  .map((opt: any) => ({
                    id: opt.modifier_option_id,
                    modifier_group_id: group.modifier_group_id,
                    name: opt.modifier_option_name,
                    price_adjustment: Number(opt.price_delta ?? 0),
                    available: opt.is_active ?? true,
                    sort_order: 0,
                  }))
              : [],
          }))
        : [],

      created_at: row.created_at ?? '',
    };
  }

  static mapMany(rows: MenuItemPublicRow[]): MenuItemPublic[] {
    return rows.map((row) => MenuPublicMapper.map(row));
  }
}