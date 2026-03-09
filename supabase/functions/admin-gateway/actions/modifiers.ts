// =============================================================================
// PATH: supabase/functions/admin-gateway/actions/modifiers.ts
// =============================================================================
// All DB operations for the modifiers table.
// =============================================================================

import { service } from '../lib/service.ts';
import { nowIso, dbError } from '../lib/guards.ts';

import type {
  ModifierCreatePayload,
  ModifierBatchEntry,
  ModifierUpdatePayload,
  ReorderItem,
} from '../types.ts';

/* -------------------------------------------------------------------------- */
/* READ                                                                       */
/* -------------------------------------------------------------------------- */

/** All modifiers in a group (includes unavailable). Admin-facing. */
export async function listForGroup(groupId: string): Promise<unknown[]> {
  const { data, error } = await service
    .from('modifiers')
    .select('*')
    .eq('modifier_group_id', groupId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) dbError(error.message, 'DB_MODIFIERS_LIST');
  return (data ?? []) as unknown[];
}

/** Available modifiers only. Customer-facing. */
export async function listAvailableForGroup(groupId: string): Promise<unknown[]> {
  const { data, error } = await service
    .from('modifiers')
    .select('*')
    .eq('modifier_group_id', groupId)
    .eq('available', true)
    .order('sort_order', { ascending: true });

  if (error) dbError(error.message, 'DB_MODIFIERS_LIST_AVAILABLE');
  return (data ?? []) as unknown[];
}

export async function getById(id: string): Promise<unknown> {
  const { data, error } = await service
    .from('modifiers')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) dbError(error.message, 'DB_MODIFIER_GET');
  return data;
}

/* -------------------------------------------------------------------------- */
/* CREATE                                                                     */
/* -------------------------------------------------------------------------- */

export async function create(payload: ModifierCreatePayload): Promise<unknown> {
  const { data, error } = await service
    .from('modifiers')
    .insert({
      modifier_group_id: payload.modifier_group_id,
      name: payload.name,
      price_adjustment: payload.price_adjustment ?? 0,
      available: payload.available ?? true,
      sort_order: payload.sort_order ?? 0,
      created_at: nowIso(),
      updated_at: nowIso(),
    })
    .select()
    .single();

  if (error) dbError(error.message, 'DB_MODIFIER_CREATE');
  return data;
}

export async function createBatch(groupId: string, modifiers: ModifierBatchEntry[]): Promise<unknown[]> {
  const rows = modifiers.map((m) => ({
    modifier_group_id: groupId,
    name: m.name,
    price_adjustment: m.price_adjustment ?? 0,
    available: m.available ?? true,
    sort_order: m.sort_order ?? 0,
    created_at: nowIso(),
    updated_at: nowIso(),
  }));

  const { data, error } = await service.from('modifiers').insert(rows).select();

  if (error) dbError(error.message, 'DB_MODIFIER_CREATE_BATCH');
  return (data ?? []) as unknown[];
}

/* -------------------------------------------------------------------------- */
/* UPDATE                                                                     */
/* -------------------------------------------------------------------------- */

export async function update(payload: ModifierUpdatePayload): Promise<unknown> {
  const set: Record<string, unknown> = { updated_at: nowIso() };

  if (payload.name !== undefined) set.name = payload.name;
  if (payload.price_adjustment !== undefined) set.price_adjustment = payload.price_adjustment;
  if (payload.available !== undefined) set.available = payload.available;
  if (payload.sort_order !== undefined) set.sort_order = payload.sort_order;

  const { data, error } = await service
    .from('modifiers')
    .update(set)
    .eq('id', payload.id)
    .select()
    .single();

  if (error) dbError(error.message, 'DB_MODIFIER_UPDATE');
  return data;
}

export async function toggleAvailability(id: string, available: boolean): Promise<void> {
  const { error } = await service
    .from('modifiers')
    .update({ available, updated_at: nowIso() })
    .eq('id', id);

  if (error) dbError(error.message, 'DB_MODIFIER_TOGGLE');
}

export async function toggleGroupAvailability(groupId: string, available: boolean): Promise<void> {
  const { error } = await service
    .from('modifiers')
    .update({ available, updated_at: nowIso() })
    .eq('modifier_group_id', groupId);

  if (error) dbError(error.message, 'DB_MODIFIER_BULK_TOGGLE');
}

/* -------------------------------------------------------------------------- */
/* DELETE                                                                     */
/* -------------------------------------------------------------------------- */

export async function deleteModifier(id: string): Promise<void> {
  const { error } = await service.from('modifiers').delete().eq('id', id);
  if (error) dbError(error.message, 'DB_MODIFIER_DELETE');
}

export async function deleteAllInGroup(groupId: string): Promise<void> {
  const { error } = await service
    .from('modifiers')
    .delete()
    .eq('modifier_group_id', groupId);

  if (error) dbError(error.message, 'DB_MODIFIER_DELETE_ALL');
}

/* -------------------------------------------------------------------------- */
/* REORDER                                                                    */
/* -------------------------------------------------------------------------- */

export async function reorder(items: ReorderItem[]): Promise<void> {
  const results = await Promise.allSettled(
    items.map(({ id, sort_order }) =>
      service
        .from('modifiers')
        .update({ sort_order, updated_at: nowIso() })
        .eq('id', id),
    ),
  );

  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length > 0) {
    dbError(`Reorder failed for ${failed.length} modifier(s)`, 'DB_MODIFIER_REORDER');
  }
}