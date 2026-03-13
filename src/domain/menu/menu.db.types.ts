// src/domain/menu/menu.db.types.ts

import type { Database } from '@/types/supabase';
export type MenuItemPublicRow = Database['public']['Views']['menu_items_public']['Row'];

export type MenuItemAdminRow = Database['public']['Views']['menu_items_admin_full']['Row'];

export type MenuItemTableRow = Database['public']['Tables']['menu_items']['Row'];

export type MenuItemInsert = Database['public']['Tables']['menu_items']['Insert'];

export type MenuItemUpdate = Database['public']['Tables']['menu_items']['Update'];
