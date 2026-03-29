// =============================================================================
// PATH: supabase/functions/admin-gateway/types.ts
// =============================================================================

import type {
  TogglePayload as ToggleCampaignPayload,
  CreatePayload as CreateCampaignPayload,
  UpdatePayload as UpdateCampaignPayload,
  PinFeaturedPayload,
} from './actions/campaigns.ts';

import type { TogglePromoPayload, CreatePromoPayload } from './actions/promos.ts';

import type { Database } from '../_shared/database.types.ts';

export type {
  ToggleCampaignPayload,
  CreateCampaignPayload,
  UpdateCampaignPayload,
  PinFeaturedPayload,
  TogglePromoPayload,
  CreatePromoPayload,
};

/* -------------------------------------------------------------------------- */
/* Action union                                                               */
/* -------------------------------------------------------------------------- */

export type AdminAction =
  | 'metrics'
  | 'layout'
  | 'orders:list'
  | 'menu:full'
  | 'menu:create'
  | 'menu:update'
  | 'menu:delete'
  | 'menu:duplicate'
  | 'menu:modifier-groups:list'
  | 'menu:modifier-groups:list-for-item'
  | 'menu:modifier-groups:get'
  | 'menu:modifier-groups:item-count'
  | 'menu:modifier-groups:create'
  | 'menu:modifier-groups:update'
  | 'menu:modifier-groups:attach'
  | 'menu:modifier-groups:detach'
  | 'menu:modifier-groups:toggle-active'
  | 'menu:modifier-groups:reorder'
  | 'menu:modifier-groups:reorder-for-item'
  | 'menu:modifier-groups:set-item-groups'
  | 'menu:modifier-groups:delete'
  | 'menu:modifiers:list-for-group'
  | 'menu:modifiers:list-available-for-group'
  | 'menu:modifiers:get'
  | 'menu:modifiers:create'
  | 'menu:modifiers:create-batch'
  | 'menu:modifiers:update'
  | 'menu:modifiers:toggle-availability'
  | 'menu:modifiers:toggle-group-availability'
  | 'menu:modifiers:delete'
  | 'menu:modifiers:delete-all-in-group'
  | 'menu:modifiers:reorder'
  | 'campaigns:list'
  | 'campaigns:create'
  | 'campaigns:update'
  | 'campaigns:pin-featured'
  | 'campaigns:toggle'
  | 'campaigns:run-rotation'
  | 'promos:list'
  | 'promos:toggle'
  | 'promos:create';

/* -------------------------------------------------------------------------- */
/* Menu item CRUD payload types                                               */
/* -------------------------------------------------------------------------- */

export type MenuItemInsert = Database['public']['Tables']['menu_items']['Insert'];
export type MenuItemUpdate = Database['public']['Tables']['menu_items']['Update'];

export type MenuItemDeletePayload = {
  id: string;
};

/* -------------------------------------------------------------------------- */
/* Shared primitives                                                          */
/* -------------------------------------------------------------------------- */

export type ReorderItem = {
  id: string;
  sort_order: number;
};

export interface MenuItemAdminRow {
  id: string | null;
  name: string | null;
  description: string | null;
  price: number | null;
  category: string | null;
  created_at: string | null;
  image_url: string | null;
  available: boolean | null;
  featured: boolean | null;
  allergens: string[] | null;
  spicy_level: number | null;
  is_vegetarian: boolean | null;
  is_vegan: boolean | null;
  is_gluten_free: boolean | null;
  sort_order: number | null;
  inventory_count: number | null;
  low_stock_threshold: number | null;
  popularity_score: number | null;
  pairs_with: string[] | null;
  updated_at: string | null;
  modifier_groups: unknown | null;
}

/* -------------------------------------------------------------------------- */
/* Modifier group payload types                                               */
/* -------------------------------------------------------------------------- */

/**
 * 'single' is what your DB actually stores for single-pick groups.
 * 'radio' is the UI/domain alias. Both are accepted everywhere.
 */
export type ModifierGroupType = 'radio' | 'single' | 'checkbox' | 'quantity';

export type ModifierGroupListPayload = {
  activeOnly?: boolean;
};

export type ModifierGroupCreatePayload = {
  name: string;
  type: ModifierGroupType;
  // description omitted — column does not exist in modifier_groups table
  required?: boolean;
  min_selections?: number;
  max_selections?: number | null;
  sort_order?: number;
  active?: boolean;
};

export type ModifierGroupUpdatePayload = {
  id: string;
  name?: string;
  type?: ModifierGroupType;
  // description omitted — column does not exist in modifier_groups table
  required?: boolean;
  min_selections?: number;
  max_selections?: number | null;
  sort_order?: number;
  active?: boolean;
};

export type ModifierGroupAttachPayload = {
  menu_item_id: string;
  modifier_group_id: string;
  sort_order?: number;
};

export type ModifierGroupDetachPayload = {
  menu_item_id: string;
  modifier_group_id: string;
};

export type ModifierGroupTogglePayload = {
  id: string;
  active: boolean;
};

export type ModifierGroupReorderPayload = {
  items: ReorderItem[];
};

export type ModifierGroupReorderForItemPayload = {
  menu_item_id: string;
  items: ReorderItem[];
};

export type ModifierGroupSetItemGroupsPayload = {
  menu_item_id: string;
  group_ids: string[];
};

/* -------------------------------------------------------------------------- */
/* Modifier payload types                                                     */
/* -------------------------------------------------------------------------- */

export type ModifierCreatePayload = {
  modifier_group_id: string;
  name: string;
  price_adjustment?: number;
  available?: boolean;
  sort_order?: number;
};

export type ModifierBatchEntry = {
  name: string;
  price_adjustment?: number;
  available?: boolean;
  sort_order?: number;
};

export type ModifierCreateBatchPayload = {
  group_id: string;
  modifiers: ModifierBatchEntry[];
};

export type ModifierUpdatePayload = {
  id: string;
  name?: string;
  price_adjustment?: number;
  available?: boolean;
  sort_order?: number;
};

export type ModifierTogglePayload = {
  id: string;
  available: boolean;
};

export type ModifierGroupToggleAvailabilityPayload = {
  group_id: string;
  available: boolean;
};

export type ModifierReorderPayload = {
  items: ReorderItem[];
};

/* -------------------------------------------------------------------------- */
/* Discriminated request union                                                */
/* -------------------------------------------------------------------------- */

export type MenuItemCreatePayload = Database['public']['Tables']['menu_items']['Insert'];
export type MenuItemUpdatePayload = Database['public']['Tables']['menu_items']['Update'];

export type GatewayRequest =
  | { action: 'metrics' }
  | { action: 'layout' }
  | { action: 'orders:list'; payload?: { page?: number } }
  | { action: 'menu:full'; payload?: { page?: number; pageSize?: number } }
  | { action: 'menu:create'; payload: unknown }
  | { action: 'menu:update'; payload: { id: string; data: MenuItemUpdatePayload } }
  | { action: 'menu:delete'; payload: { id: string } }
  | { action: 'menu:duplicate'; payload: { source_id: string; overrides: Record<string, unknown> } }
  | { action: 'menu:modifier-groups:list'; payload?: ModifierGroupListPayload }
  | { action: 'menu:modifier-groups:list-for-item'; payload: { menu_item_id: string } }
  | { action: 'menu:modifier-groups:get'; payload: { id: string } }
  | { action: 'menu:modifier-groups:item-count'; payload: { id: string } }
  | { action: 'menu:modifier-groups:create'; payload: ModifierGroupCreatePayload }
  | { action: 'menu:modifier-groups:update'; payload: ModifierGroupUpdatePayload }
  | { action: 'menu:modifier-groups:attach'; payload: ModifierGroupAttachPayload }
  | { action: 'menu:modifier-groups:detach'; payload: ModifierGroupDetachPayload }
  | { action: 'menu:modifier-groups:toggle-active'; payload: ModifierGroupTogglePayload }
  | { action: 'menu:modifier-groups:reorder'; payload: ModifierGroupReorderPayload }
  | { action: 'menu:modifier-groups:reorder-for-item'; payload: ModifierGroupReorderForItemPayload }
  | { action: 'menu:modifier-groups:set-item-groups'; payload: ModifierGroupSetItemGroupsPayload }
  | { action: 'menu:modifier-groups:delete'; payload: { id: string } }
  | { action: 'menu:modifiers:list-for-group'; payload: { group_id: string } }
  | { action: 'menu:modifiers:list-available-for-group'; payload: { group_id: string } }
  | { action: 'menu:modifiers:get'; payload: { id: string } }
  | { action: 'menu:modifiers:create'; payload: ModifierCreatePayload }
  | { action: 'menu:modifiers:create-batch'; payload: ModifierCreateBatchPayload }
  | { action: 'menu:modifiers:update'; payload: ModifierUpdatePayload }
  | { action: 'menu:modifiers:toggle-availability'; payload: ModifierTogglePayload }
  | { action: 'menu:modifiers:toggle-group-availability'; payload: ModifierGroupToggleAvailabilityPayload }
  | { action: 'menu:modifiers:delete'; payload: { id: string } }
  | { action: 'menu:modifiers:delete-all-in-group'; payload: { group_id: string } }
  | { action: 'menu:modifiers:reorder'; payload: ModifierReorderPayload }
  | { action: 'campaigns:list' }
  | { action: 'campaigns:run-rotation' }
  | { action: 'campaigns:toggle'; payload: ToggleCampaignPayload }
  | { action: 'campaigns:create'; payload: CreateCampaignPayload }
  | { action: 'campaigns:update'; payload: UpdateCampaignPayload }
  | { action: 'campaigns:pin-featured'; payload: PinFeaturedPayload }
  | { action: 'promos:list' }
  | { action: 'promos:toggle'; payload: TogglePromoPayload }
  | { action: 'promos:create'; payload: CreatePromoPayload };