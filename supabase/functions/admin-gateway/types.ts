// =============================================================================
// PATH: supabase/functions/admin-gateway/types.ts
// =============================================================================
// Single source of truth for all action names, payload types, and the
// discriminated GatewayRequest union.
//
// Rules:
//   - Adding a new action → add to AdminAction, GatewayRequest, parsers, dispatch
//   - Never import from lib/* here (would create circular deps)
//   - Campaign/promo payload types are re-exported from their action modules
// =============================================================================

import type {
  TogglePayload as ToggleCampaignPayload,
  CreatePayload as CreateCampaignPayload,
  UpdatePayload as UpdateCampaignPayload,
  PinFeaturedPayload,
} from './actions/campaigns.ts';

import type { TogglePromoPayload } from './actions/promos.ts';

export type {
  ToggleCampaignPayload,
  CreateCampaignPayload,
  UpdateCampaignPayload,
  PinFeaturedPayload,
  TogglePromoPayload,
};

/* -------------------------------------------------------------------------- */
/* Action union                                                               */
/* -------------------------------------------------------------------------- */

export type AdminAction =
  // Core
  | 'metrics'
  | 'layout'
  | 'orders:list'
  | 'menu:full'
  // Modifier groups
  | 'menu:modifier-groups:list-for-item'
  | 'menu:modifier-groups:get'
  | 'menu:modifier-groups:create'
  | 'menu:modifier-groups:update'
  | 'menu:modifier-groups:attach'
  | 'menu:modifier-groups:detach'
  | 'menu:modifier-groups:toggle-active'
  | 'menu:modifier-groups:reorder-for-item'
  | 'menu:modifier-groups:delete'
  // Modifiers
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
  // Campaigns
  | 'campaigns:list'
  | 'campaigns:create'
  | 'campaigns:update'
  | 'campaigns:pin-featured'
  | 'campaigns:toggle'
  | 'campaigns:run-rotation'
  // Promos
  | 'promos:list'
  | 'promos:toggle';

/* -------------------------------------------------------------------------- */
/* Shared primitives                                                          */
/* -------------------------------------------------------------------------- */

export type ReorderItem = {
  id: string;
  sort_order: number;
};

/* -------------------------------------------------------------------------- */
/* Modifier group payload types                                               */
/* -------------------------------------------------------------------------- */

export type ModifierGroupType = 'radio' | 'checkbox' | 'quantity';

export type ModifierGroupCreatePayload = {
  name: string;
  type: ModifierGroupType;
  description?: string | null;
  required?: boolean;
  min_selections?: number;
  max_selections?: number | null;
  sort_order?: number;
  active?: boolean;
};

export type ModifierGroupUpdatePayload = {
  id: string;
  name?: string;
  description?: string | null;
  type?: ModifierGroupType;
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
  menu_item_id: string;
  items: ReorderItem[];
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

/** Single entry in a batch create — group_id is provided at the action level. */
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

export type GatewayRequest =
  // Core
  | { action: 'metrics' }
  | { action: 'layout' }
  | { action: 'orders:list'; payload?: { page?: number } }
  | { action: 'menu:full'; payload?: { page?: number; pageSize?: number } }
  // Modifier groups
  | { action: 'menu:modifier-groups:list-for-item'; payload: { menu_item_id: string } }
  | { action: 'menu:modifier-groups:get'; payload: { id: string } }
  | { action: 'menu:modifier-groups:create'; payload: ModifierGroupCreatePayload }
  | { action: 'menu:modifier-groups:update'; payload: ModifierGroupUpdatePayload }
  | { action: 'menu:modifier-groups:attach'; payload: ModifierGroupAttachPayload }
  | { action: 'menu:modifier-groups:detach'; payload: ModifierGroupDetachPayload }
  | { action: 'menu:modifier-groups:toggle-active'; payload: ModifierGroupTogglePayload }
  | { action: 'menu:modifier-groups:reorder-for-item'; payload: ModifierGroupReorderPayload }
  | { action: 'menu:modifier-groups:delete'; payload: { id: string } }
  // Modifiers
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
  // Campaigns
  | { action: 'campaigns:list' }
  | { action: 'campaigns:run-rotation' }
  | { action: 'campaigns:toggle'; payload: ToggleCampaignPayload }
  | { action: 'campaigns:create'; payload: CreateCampaignPayload }
  | { action: 'campaigns:update'; payload: UpdateCampaignPayload }
  | { action: 'campaigns:pin-featured'; payload: PinFeaturedPayload }
  // Promos
  | { action: 'promos:list' }
  | { action: 'promos:toggle'; payload: TogglePromoPayload };