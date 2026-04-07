// PATH: src/domain/menu/menu.service.public.ts

import { supabase } from '@/lib/supabase/supabaseClient';
import { parseModifierGroupsFromJson } from '@/domain/menu/parseModifierGroups';
import type { MenuItemPublic } from './menu.types';

// ─── Internal parser ──────────────────────────────────────────────────────────
// The RPC returns a plain jsonb object. We parse it into MenuItemPublic here,
// reusing the same parseModifierGroupsFromJson that was used with the old view.

function parseRpcItem(raw: unknown): MenuItemPublic | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  const id = typeof r.id === 'string' ? r.id.trim() : '';
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (!id || !name) return null;

  return {
    id,
    name,
    price: typeof r.price === 'number' ? r.price : 0,
    category: r.category as MenuItemPublic['category'],
    featured: typeof r.featured === 'boolean' ? r.featured : false,
    available: typeof r.available === 'boolean' ? r.available : true,
    sort_order: typeof r.sort_order === 'number' ? Math.trunc(r.sort_order) : 0,
    description: typeof r.description === 'string' ? r.description : null,
    image_url: typeof r.image_url === 'string' ? r.image_url : null,
    spicy_level: typeof r.spicy_level === 'number' ? r.spicy_level : null,
    is_vegetarian: typeof r.is_vegetarian === 'boolean' ? r.is_vegetarian : false,
    is_vegan: typeof r.is_vegan === 'boolean' ? r.is_vegan : false,
    is_gluten_free: typeof r.is_gluten_free === 'boolean' ? r.is_gluten_free : false,
    allergens: Array.isArray(r.allergens) ? (r.allergens as string[]) : [],
    pairs_with: Array.isArray(r.pairs_with) ? (r.pairs_with as string[]) : [],
    modifier_groups: parseModifierGroupsFromJson(r.modifier_groups),
    created_at: typeof r.created_at === 'string' ? r.created_at : '',
    updated_at: typeof r.updated_at === 'string' ? r.updated_at : null,
  };
}

export class MenuPublicService {
  static async getMenuItems(): Promise<MenuItemPublic[]> {
    const { data, error } = await supabase.rpc('get_menu_public');

    if (error) throw error;

    if (!Array.isArray(data)) return [];

    return (data as unknown[])
      .map(parseRpcItem)
      .filter((item): item is MenuItemPublic => item !== null);
  }

  static async getMenuItem(id: string): Promise<MenuItemPublic | null> {
    const { data, error } = await supabase.rpc('get_menu_item_public', {
      p_item_id: id,
    });

    if (error) throw error;
    if (!data) return null;

    return parseRpcItem(data);
  }
}