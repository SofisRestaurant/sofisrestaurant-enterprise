// =============================================================================
// PATH: supabase/functions/admin-gateway/actions/modifier-groups.ts
// =============================================================================
// All DB operations for the modifier_groups table and the
// menu_item_modifier_groups join table.
// =============================================================================

import { service } from '../lib/service.ts';
import { nowIso, dbError } from '../lib/guards.ts';

import type {
  ModifierGroupCreatePayload,
  ModifierGroupUpdatePayload,
  ModifierGroupAttachPayload,
  ModifierGroupDetachPayload,
  ReorderItem,
} from '../types.ts';

/* -------------------------------------------------------------------------- */
/* READ                                                                       */
/* -------------------------------------------------------------------------- */

export async function listForItem(menuItemId: string): Promise<unknown[]> {
  // Join through the join table so results are ordered by that table's
  // sort_order, not the group's own sort_order — this is what the UI saved.
  const { data, error } = await service
    .from('menu_item_modifier_groups')
    .select('sort_order, modifier_groups(*)')
    .eq('menu_item_id', menuItemId)
    .order('sort_order', { ascending: true });

  if (error) dbError(error.message, 'DB_MOD_GROUPS_LIST');
  return (data ?? []) as unknown[];
}

export async function getById(id: string): Promise<unknown> {
  const { data, error } = await service
    .from('modifier_groups')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) dbError(error.message, 'DB_MOD_GROUP_GET');
  return data;
}

/* -------------------------------------------------------------------------- */
/* CREATE                                                                     */
/* -------------------------------------------------------------------------- */

export async function create(payload: ModifierGroupCreatePayload): Promise<unknown> {
  const { data, error } = await service
    .from('modifier_groups')
    .insert({
      name: payload.name,
      type: payload.type,
      description: payload.description ?? null,
      required: payload.required ?? false,
      min_selections: payload.min_selections ?? 0,
      max_selections: payload.max_selections ?? null,
      sort_order: payload.sort_order ?? 0,
      active: payload.active ?? true,
      created_at: nowIso(),
      updated_at: nowIso(),
    })
    .select()
    .single();

  if (error) dbError(error.message, 'DB_MOD_GROUP_CREATE');
  return data;
}

/* -------------------------------------------------------------------------- */
/* UPDATE                                                                     */
/* -------------------------------------------------------------------------- */

export async function update(
  id: string,
  patch: Omit<ModifierGroupUpdatePayload, 'id'>,
): Promise<unknown> {
  const set: Record<string, unknown> = { updated_at: nowIso() };

  if (patch.name !== undefined) set.name = patch.name;
  if (patch.type !== undefined) set.type = patch.type;
  if ('description' in patch) set.description = patch.description ?? null;
  if (patch.required !== undefined) set.required = patch.required;
  if (patch.min_selections !== undefined) set.min_selections = patch.min_selections;
  if ('max_selections' in patch) set.max_selections = patch.max_selections ?? null;
  if (patch.sort_order !== undefined) set.sort_order = patch.sort_order;
  if (patch.active !== undefined) set.active = patch.active;

  const { data, error } = await service
    .from('modifier_groups')
    .update(set)
    .eq('id', id)
    .select()
    .single();

  if (error) dbError(error.message, 'DB_MOD_GROUP_UPDATE');
  return data;
}

export async function toggleActive(id: string, active: boolean): Promise<void> {
  const { error } = await service
    .from('modifier_groups')
    .update({ active, updated_at: nowIso() })
    .eq('id', id);

  if (error) dbError(error.message, 'DB_MOD_GROUP_TOGGLE');
}

/* -------------------------------------------------------------------------- */
/* JOIN TABLE — attach / detach / reorder                                    */
/* -------------------------------------------------------------------------- */

/** Upsert on (menu_item_id, modifier_group_id) — idempotent. */
export async function attachToItem(payload: ModifierGroupAttachPayload): Promise<void> {
  const { error } = await service
    .from('menu_item_modifier_groups')
    .upsert(
      {
        menu_item_id: payload.menu_item_id,
        modifier_group_id: payload.modifier_group_id,
        sort_order: payload.sort_order ?? 0,
      },
      { onConflict: 'menu_item_id,modifier_group_id' },
    );

  if (error) dbError(error.message, 'DB_MOD_GROUP_ATTACH');
}

export async function detachFromItem(payload: ModifierGroupDetachPayload): Promise<void> {
  const { error } = await service
    .from('menu_item_modifier_groups')
    .delete()
    .eq('menu_item_id', payload.menu_item_id)
    .eq('modifier_group_id', payload.modifier_group_id);

  if (error) dbError(error.message, 'DB_MOD_GROUP_DETACH');
}

export async function reorderForItem(menuItemId: string, items: ReorderItem[]): Promise<void> {
  const results = await Promise.allSettled(
    items.map(({ id, sort_order }) =>
      service
        .from('menu_item_modifier_groups')
        .update({ sort_order })
        .eq('menu_item_id', menuItemId)
        .eq('modifier_group_id', id),
    ),
  );

  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length > 0) {
    dbError(`Reorder failed for ${failed.length} group(s)`, 'DB_MOD_GROUP_REORDER');
  }
}

/* -------------------------------------------------------------------------- */
/* DELETE                                                                     */
/* -------------------------------------------------------------------------- */

/** Detaches from all menu items before deleting the group itself. */
export async function deleteGroup(id: string): Promise<void> {
  const { error: detachError } = await service
    .from('menu_item_modifier_groups')
    .delete()
    .eq('modifier_group_id', id);

  if (detachError) dbError(detachError.message, 'DB_MOD_GROUP_DETACH_ALL');

  const { error } = await service.from('modifier_groups').delete().eq('id', id);
  if (error) dbError(error.message, 'DB_MOD_GROUP_DELETE');
}