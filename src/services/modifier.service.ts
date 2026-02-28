// src/services/modifier.service.ts
// ============================================================================
// MODIFIER SERVICE (Domain-Aligned)
// ============================================================================
// CRUD for modifiers table.
//
// Returns DOMAIN type `Modifier`.
// No admin DTO leakage.
// Maps DB → Domain only.
//
// Verified schema (database.types.ts Feb 2026):
//   modifiers: id, modifier_group_id, name, price_adjustment,
//              available, sort_order, created_at, updated_at
// ============================================================================
import type { AdminModifier } from '@/types/admin-menu'
import { supabase } from '@/lib/supabase/supabaseClient'
import type { Database } from '@/lib/supabase/database.types'
import type { Modifier } from '@/domain/menu/menu.types'
import type {
  ModifierWritePayload,
  ReorderPayload,
} from '@/types/admin-menu'
import { validateModifierPayload } from '@/domain/menu/modifier.schema'

// ─────────────────────────────────────────────────────────────────────────────
// DB Types
// ─────────────────────────────────────────────────────────────────────────────

type ModifierRow = Database['public']['Tables']['modifiers']['Row']
type ModifierInsert = Database['public']['Tables']['modifiers']['Insert']
type ModifierUpdate = Database['public']['Tables']['modifiers']['Update']

// ─────────────────────────────────────────────────────────────────────────────
// Error
// ─────────────────────────────────────────────────────────────────────────────

export class ModifierServiceError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'ModifierServiceError'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapper (DB → Domain)
// ─────────────────────────────────────────────────────────────────────────────

function rowToModifier(row: ModifierRow): Modifier {
  return {
    id: row.id,
    modifier_group_id: row.modifier_group_id,
    name: row.name,
    price_adjustment: Number(row.price_adjustment ?? 0),
    available: row.available,
    sort_order: row.sort_order,
  }
}
function rowToAdminModifier(row: ModifierRow): AdminModifier {
  return {
    id: row.id,
    modifier_group_id: row.modifier_group_id,
    name: row.name,
    price_adjustment: row.price_adjustment,
    available: row.available,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}
// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class ModifierService {

  // ─────────────────────────────────────────────────────────────
  // READ
  // ─────────────────────────────────────────────────────────────

  /** All modifiers for a group (includes unavailable) */
  static async getForGroup(groupId: string): Promise<Modifier[]> {
    const { data, error } = await supabase
      .from('modifiers')
      .select('*')
      .eq('modifier_group_id', groupId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (error) {
      throw new ModifierServiceError(
        'Failed to load modifiers',
        error.code,
        error,
      )
    }

    return (data ?? []).map(rowToModifier)
  }

  /** Available modifiers only (customer-facing) */
  static async getAvailableForGroup(groupId: string): Promise<Modifier[]> {
    const { data, error } = await supabase
      .from('modifiers')
      .select('*')
      .eq('modifier_group_id', groupId)
      .eq('available', true)
      .order('sort_order', { ascending: true })

    if (error) {
      throw new ModifierServiceError(
        'Failed to load modifiers',
        error.code,
        error,
      )
    }

    return (data ?? []).map(rowToModifier)
  }

  /** Single modifier */
  static async getById(id: string): Promise<Modifier | null> {
    const { data, error } = await supabase
      .from('modifiers')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      throw new ModifierServiceError(
        'Failed to load modifier',
        error.code,
        error,
      )
    }

    return data ? rowToModifier(data) : null
  }

  // ─────────────────────────────────────────────────────────────
  // CREATE
  // ─────────────────────────────────────────────────────────────

  static async create(payload: ModifierWritePayload): Promise<AdminModifier> {
    const validation = validateModifierPayload(payload)

    if (!validation.valid) {
      const message = Object.values(validation.errors)
        .filter(Boolean)
        .join('; ')
      throw new ModifierServiceError(`Validation failed: ${message}`)
    }

    const insert: ModifierInsert = {
      modifier_group_id: payload.modifier_group_id,
      name: payload.name.trim(),
      price_adjustment: payload.price_adjustment,
      available: payload.available ?? true,
      sort_order: payload.sort_order ?? 0,
    }

    const { data, error } = await supabase
      .from('modifiers')
      .insert(insert)
      .select()
      .single()

    if (error) {
      throw new ModifierServiceError(
        'Failed to create modifier',
        error.code,
        error,
      )
    }

    return rowToAdminModifier(data)
  }

  /** Batch create */
  static async createBatch(
    groupId: string,
    modifiers: Omit<ModifierWritePayload, 'modifier_group_id'>[],
  ): Promise<AdminModifier[]> {

    if (modifiers.length === 0) return []

    const inserts: ModifierInsert[] = modifiers.map((m) => ({
      modifier_group_id: groupId,
      name: m.name.trim(),
      price_adjustment: m.price_adjustment,
      available: m.available ?? true,
      sort_order: m.sort_order ?? 0,
    }))

    const { data, error } = await supabase
      .from('modifiers')
      .insert(inserts)
      .select()

    if (error) {
      throw new ModifierServiceError(
        'Failed to batch create modifiers',
        error.code,
        error,
      )
    }

    return (data ?? []).map(rowToAdminModifier)
  }

  // ─────────────────────────────────────────────────────────────
  // UPDATE
  // ─────────────────────────────────────────────────────────────

  static async update(
    id: string,
    payload: Partial<Omit<ModifierWritePayload, 'modifier_group_id'>>,
  ): Promise<AdminModifier> {

    const validation = validateModifierPayload(payload)

    if (!validation.valid) {
      const message = Object.values(validation.errors)
        .filter(Boolean)
        .join('; ')
      throw new ModifierServiceError(`Validation failed: ${message}`)
    }

    const update: ModifierUpdate = {}

    if (payload.name !== undefined)
      update.name = payload.name.trim()

    if (payload.price_adjustment !== undefined)
      update.price_adjustment = payload.price_adjustment

    if (payload.available !== undefined)
      update.available = payload.available

    if (payload.sort_order !== undefined)
      update.sort_order = payload.sort_order

    const { data, error } = await supabase
      .from('modifiers')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw new ModifierServiceError(
        'Failed to update modifier',
        error.code,
        error,
      )
    }

    return rowToAdminModifier(data)
  }

  static async toggleAvailability(
    id: string,
    available: boolean,
  ): Promise<void> {

    const { error } = await supabase
      .from('modifiers')
      .update({ available })
      .eq('id', id)

    if (error) {
      throw new ModifierServiceError(
        'Failed to toggle availability',
        error.code,
        error,
      )
    }
  }

  static async toggleGroupAvailability(
    groupId: string,
    available: boolean,
  ): Promise<void> {

    const { error } = await supabase
      .from('modifiers')
      .update({ available })
      .eq('modifier_group_id', groupId)

    if (error) {
      throw new ModifierServiceError(
        'Failed to bulk toggle availability',
        error.code,
        error,
      )
    }
  }

  // ─────────────────────────────────────────────────────────────
  // DELETE
  // ─────────────────────────────────────────────────────────────

  static async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('modifiers')
      .delete()
      .eq('id', id)

    if (error) {
      throw new ModifierServiceError(
        'Failed to delete modifier',
        error.code,
        error,
      )
    }
  }

  static async deleteAllInGroup(groupId: string): Promise<void> {
    const { error } = await supabase
      .from('modifiers')
      .delete()
      .eq('modifier_group_id', groupId)

    if (error) {
      throw new ModifierServiceError(
        'Failed to delete group modifiers',
        error.code,
        error,
      )
    }
  }

  // ─────────────────────────────────────────────────────────────
  // REORDER
  // ─────────────────────────────────────────────────────────────

  static async reorder(items: ReorderPayload[]): Promise<void> {
    if (items.length === 0) return

    await Promise.all(
      items.map(({ id, sort_order }) =>
        supabase
          .from('modifiers')
          .update({ sort_order })
          .eq('id', id),
      ),
    )
  }
}