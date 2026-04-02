import type { MenuItemPublicRow } from './menu.db.types';
import type { MenuItemPublic } from './menu.types';

// Type cast needed because database.types.ts may be stale (generated before
// updated_at and created_at were added to the menu_items select type).
// Run `supabase gen types typescript --linked` to remove this cast.
type MenuItemPublicRowExtended = MenuItemPublicRow & {
  updated_at?: string | null;
  created_at?: string | null;
};

export class MenuPublicMapper {
  static map(this: void, row: MenuItemPublicRow): MenuItemPublic {
    const r = row as MenuItemPublicRowExtended;
    return {
      id: r.id ?? '',
      name: r.name ?? '',
      price: Number(r.price),
      category: r.category ?? 'entrees',
      featured: r.featured ?? false,
      available: r.available ?? true,
      sort_order: r.sort_order ?? 0,

      is_vegetarian: r.is_vegetarian ?? false,
      is_vegan: r.is_vegan ?? false,
      is_gluten_free: r.is_gluten_free ?? false,

      description: r.description ?? null,
      image_url: r.image_url ?? null,
      spicy_level: r.spicy_level ?? null,
      updated_at: r.updated_at ?? null,

      allergens: r.allergens ?? [],
      pairs_with: r.pairs_with ?? [],

      // ✅ KEEP snake_case (THIS FIXES EVERYTHING)
      modifier_groups: Array.isArray(r.modifier_groups)
        ? r.modifier_groups.map((group: any) => ({
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

      created_at: r.created_at ?? '',
    };
  }

  static mapMany(rows: MenuItemPublicRow[]): MenuItemPublic[] {
    return rows.map((row) => MenuPublicMapper.map(row));
  }
}