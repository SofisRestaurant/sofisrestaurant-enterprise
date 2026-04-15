// PATH: src/domain/menu/menu.service.public.ts

import { supabase } from '@/lib/supabase/supabaseClient';
import type { MenuItemPublic } from './menu.types';
import { toMenuItemBase } from './menu.gateway';

// ─── Internal parser ──────────────────────────────────────────────────────────
// Delegates all validation and normalization to menu.gateway.ts.
// Returns null when the gateway throws — invalid items are silently dropped
// from list results, which matches the original contract of this service.
//
// The gateway handles: id, name, price, category (fail-fast), inventory_count
// (explicit null), modifier_groups (via parseModifierGroupsFromJson), and all
// other fields. No validation logic lives here.

function parseRpcItem(raw: unknown): MenuItemPublic | null {
  try {
    return toMenuItemBase(raw);
  } catch {
    return null;
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

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