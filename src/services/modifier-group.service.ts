// src/services/modifier-group.service.ts
// ============================================================================
// MODIFIER GROUP SERVICE
// ============================================================================
// CRUD for modifier_groups table and menu_item_modifier_groups join table.
//
// Verified schema (database.types.ts Feb 2026):
//   modifier_groups: id, name, description, type, required, min_selections,
//                    max_selections, sort_order, active, created_at, updated_at
//   menu_item_modifier_groups: id, menu_item_id, modifier_group_id, sort_order
// ============================================================================

import { supabase }                     from '@/lib/supabase/supabaseClient'
import type { Database }                from '@/lib/supabase/database.types'
import type { ModifierGroup }           from '@/domain/menu/menu.types'
import type {
  AdminModifierGroup,
  ModifierGroupWritePayload,
  MenuItemModifierGroupWritePayload,
  ReorderPayload,
}                                       from '@/types/admin-menu'
import { validateModifierGroupPayload } from '@/domain/menu/modifier.schema'

// ─────────────────────────────────────────────────────────────────────────────
// DB types
// ─────────────────────────────────────────────────────────────────────────────

type GroupRow   = Database['public']['Tables']['modifier_groups']['Row']
type GroupInsert = Database['public']['Tables']['modifier_groups']['Insert']
type GroupUpdate = Database['public']['Tables']['modifier_groups']['Update']

// ─────────────────────────────────────────────────────────────────────────────
// Error
// ─────────────────────────────────────────────────────────────────────────────

export class ModifierGroupServiceError extends Error {
  constructor(message: string, public code?: string, public details?: unknown) {
    super(message)
    this.name = 'ModifierGroupServiceError'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapper
// ─────────────────────────────────────────────────────────────────────────────

function rowToModifierGroup(row: GroupRow, itemCount = 0): AdminModifierGroup {
  return {
    id:             row.id,
    name:           row.name,
    description:    row.description ?? undefined,
    type:           (row.type as ModifierGroup['type']) ?? 'radio',
    required:       row.required,
    min_selections: row.min_selections ?? 0,
    max_selections: row.max_selections ?? null,
    sort_order:     row.sort_order,
    active:         row.active ?? true,   // ← ADD THIS
    modifiers:      [],
    item_count:     itemCount,
    created_at:     row.created_at,
    updated_at:     row.updated_at,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class ModifierGroupService {

  // ── READ ───────────────────────────────────────────────────────────────────

  /** All modifier groups (admin view — includes inactive) */
  static async getAll(): Promise<AdminModifierGroup[]> {
    const { data, error } = await supabase
      .from('modifier_groups')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (error) throw new ModifierGroupServiceError('Failed to load modifier groups', error.code, error)
    return (data ?? []).map((r) => rowToModifierGroup(r))
  }

  /** All active modifier groups (customer-facing) */
  static async getAllActive(): Promise<AdminModifierGroup[]> {
    const { data, error } = await supabase
      .from('modifier_groups')
      .select('*')
      .eq('active', true)
      .order('sort_order', { ascending: true })

    if (error) throw new ModifierGroupServiceError('Failed to load modifier groups', error.code, error)
    return (data ?? []).map((r) => rowToModifierGroup(r))
  }

  /** Single group by ID */
  static async getById(id: string): Promise<AdminModifierGroup | null> {
    const { data, error } = await supabase
      .from('modifier_groups')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) throw new ModifierGroupServiceError('Failed to load modifier group', error.code, error)
    return data ? rowToModifierGroup(data) : null
  }

  /** Groups assigned to a specific menu item, ordered by join table sort_order */
  static async getForMenuItem(menuItemId: string): Promise<AdminModifierGroup[]> {
    const { data, error } = await supabase
      .from('menu_item_modifier_groups')
      .select(`
        sort_order,
        modifier_groups (*)
      `)
      .eq('menu_item_id', menuItemId)
      .order('sort_order', { ascending: true })

    if (error) throw new ModifierGroupServiceError('Failed to load item modifier groups', error.code, error)

    return (data ?? [])
      .filter((row): row is typeof row & { modifier_groups: GroupRow } => !!row.modifier_groups)
      .map((row) => ({
        ...rowToModifierGroup(row.modifier_groups as GroupRow),
        sort_order: row.sort_order,
      }))
  }

  /** How many menu items use a given group (safe-delete check) */
  static async getItemCount(groupId: string): Promise<number> {
    const { count, error } = await supabase
      .from('menu_item_modifier_groups')
      .select('*', { count: 'exact', head: true })
      .eq('modifier_group_id', groupId)

    if (error) return 0
    return count ?? 0
  }

  // ── CREATE ─────────────────────────────────────────────────────────────────

  static async create(payload: ModifierGroupWritePayload): Promise<AdminModifierGroup> {
    const validation = validateModifierGroupPayload(payload)
    if (!validation.valid) {
      const msg = Object.values(validation.errors).filter(Boolean).join('; ')
      throw new ModifierGroupServiceError(`Validation failed: ${msg}`)
    }

    const insert: GroupInsert = {
      name:           payload.name.trim(),
      description:    payload.description?.trim() || null,
      type:           payload.type,
      required:       payload.required,
      min_selections: payload.min_selections ?? 0,
      max_selections: payload.max_selections ?? null,
      sort_order:     payload.sort_order,
      active:         payload.active,
    }

    const { data, error } = await supabase
      .from('modifier_groups')
      .insert(insert)
      .select()
      .single()

    if (error) throw new ModifierGroupServiceError('Failed to create modifier group', error.code, error)
    return rowToModifierGroup(data)
  }

  // ── UPDATE ─────────────────────────────────────────────────────────────────

  static async update(id: string, payload: Partial<ModifierGroupWritePayload>): Promise<AdminModifierGroup> {
    const validation = validateModifierGroupPayload(payload)
    if (!validation.valid) {
      const msg = Object.values(validation.errors).filter(Boolean).join('; ')
      throw new ModifierGroupServiceError(`Validation failed: ${msg}`)
    }

    const update: GroupUpdate = {}
    if (payload.name           !== undefined) update.name           = payload.name.trim()
    if (payload.description    !== undefined) update.description    = payload.description?.trim() || null
    if (payload.type           !== undefined) update.type           = payload.type
    if (payload.required       !== undefined) update.required       = payload.required
    if (payload.min_selections !== undefined) update.min_selections = payload.min_selections
    if (payload.max_selections !== undefined) update.max_selections = payload.max_selections
    if (payload.sort_order     !== undefined) update.sort_order     = payload.sort_order
    if (payload.active         !== undefined) update.active         = payload.active

    const { data, error } = await supabase
      .from('modifier_groups')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) throw new ModifierGroupServiceError('Failed to update modifier group', error.code, error)
    return rowToModifierGroup(data)
  }

  static async toggleActive(id: string, active: boolean): Promise<void> {
    const { error } = await supabase
      .from('modifier_groups')
      .update({ active })
      .eq('id', id)

    if (error) throw new ModifierGroupServiceError('Failed to toggle group status', error.code, error)
  }

  // ── DELETE ─────────────────────────────────────────────────────────────────

  /**
   * Safe delete — refuses if any menu item still uses this group.
   * Pass force=true to delete regardless (also removes join table rows).
   */
  static async delete(id: string, force = false): Promise<void> {
    if (!force) {
      const count = await ModifierGroupService.getItemCount(id)
      if (count > 0) {
        throw new ModifierGroupServiceError(
          `Cannot delete: group is used by ${count} menu item${count !== 1 ? 's' : ''}. Deactivate it instead.`,
        )
      }
    }

    if (force) {
      const { error: joinError } = await supabase
        .from('menu_item_modifier_groups')
        .delete()
        .eq('modifier_group_id', id)
      if (joinError) throw new ModifierGroupServiceError('Failed to remove item links', joinError.code, joinError)
    }

    const { error } = await supabase
      .from('modifier_groups')
      .delete()
      .eq('id', id)

    if (error) throw new ModifierGroupServiceError('Failed to delete modifier group', error.code, error)
  }

  // ── REORDER ────────────────────────────────────────────────────────────────

  /** Batch update sort_orders for an array of groups */
  static async reorder(items: ReorderPayload[]): Promise<void> {
    const updates = items.map(({ id, sort_order }) =>
      supabase.from('modifier_groups').update({ sort_order }).eq('id', id),
    )
    await Promise.all(updates)
  }

  // ── ITEM LINKS ─────────────────────────────────────────────────────────────

  /** Attach a group to a menu item */
  static async attachToMenuItem(payload: MenuItemModifierGroupWritePayload): Promise<void> {
    const { error } = await supabase
      .from('menu_item_modifier_groups')
      .upsert({
        menu_item_id:      payload.menu_item_id,
        modifier_group_id: payload.modifier_group_id,
        sort_order:        payload.sort_order,
      }, { onConflict: 'menu_item_id,modifier_group_id' })

    if (error) throw new ModifierGroupServiceError('Failed to attach group to item', error.code, error)
  }

  /** Detach a group from a menu item */
  static async detachFromMenuItem(menuItemId: string, groupId: string): Promise<void> {
    const { error } = await supabase
      .from('menu_item_modifier_groups')
      .delete()
      .eq('menu_item_id', menuItemId)
      .eq('modifier_group_id', groupId)

    if (error) throw new ModifierGroupServiceError('Failed to detach group from item', error.code, error)
  }

  /** Replace all groups for a menu item at once (for bulk reorder/reassign) */
  static async setItemGroups(
    menuItemId: string,
    groupIds:   string[],
  ): Promise<void> {
    // Remove existing
    const { error: delError } = await supabase
      .from('menu_item_modifier_groups')
      .delete()
      .eq('menu_item_id', menuItemId)

    if (delError) throw new ModifierGroupServiceError('Failed to reset item groups', delError.code, delError)

    if (groupIds.length === 0) return

    const rows = groupIds.map((gid, idx) => ({
      menu_item_id:      menuItemId,
      modifier_group_id: gid,
      sort_order:        idx * 10,
    }))

    const { error: insError } = await supabase
      .from('menu_item_modifier_groups')
      .insert(rows)

    if (insError) throw new ModifierGroupServiceError('Failed to assign groups to item', insError.code, insError)
  }

  /** Reorder groups on a specific menu item */
  static async reorderForMenuItem(
    menuItemId: string,
    items:      ReorderPayload[],
  ): Promise<void> {
    const updates = items.map(({ id, sort_order }) =>
      supabase
        .from('menu_item_modifier_groups')
        .update({ sort_order })
        .eq('menu_item_id', menuItemId)
        .eq('modifier_group_id', id),
    )
    await Promise.all(updates)
  }
}