// src/domain/menu/modifier-sync.engine.ts
// ============================================================================
// MODIFIER SYNC ENGINE
// ============================================================================
// Reconciles in-memory modifier state when realtime DB changes arrive.
//
// Problem: Admin A edits modifier prices while Customer B has item in cart.
// Solution: This engine detects drift between cached state and live DB state,
//   invalidates stale cart items, and surfaces warnings to the customer.
//
// Realtime events come from useModifierRealtime.ts hook.
// ============================================================================

import type { ModifierGroup, SelectedModifier } from '@/domain/menu/menu.types'
import { hashModifierGroup } from './modifier-hash.util'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE'

export interface RealtimeModifierGroupEvent {
  type:  RealtimeEventType
  table: 'modifier_groups'
  new:   ModifierGroupRow | null
  old:   { id: string } | null
}

export interface RealtimeModifierEvent {
  type:  RealtimeEventType
  table: 'modifiers'
  new:   ModifierRow | null
  old:   { id: string; modifier_group_id: string } | null
}

export type RealtimeModifierEvent_ = RealtimeModifierGroupEvent | RealtimeModifierEvent

// Raw DB row shapes (matches database.types.ts)
interface ModifierGroupRow {
  id: string; name: string; description: string | null; type: string
  required: boolean; min_selections: number | null; max_selections: number | null
  sort_order: number; active: boolean; created_at: string; updated_at: string
}
interface ModifierRow {
  id: string; modifier_group_id: string; name: string
  price_adjustment: number; available: boolean; sort_order: number
  created_at: string; updated_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync result types
// ─────────────────────────────────────────────────────────────────────────────

export interface SyncResult {
  /** Groups whose configs changed and need cache invalidation */
  invalidated_group_ids: string[]
  /** Modifier IDs that were deleted — selections referencing them must be cleared */
  deleted_modifier_ids:  string[]
  /** Modifier IDs whose availability changed to false */
  newly_unavailable:     string[]
  /** Whether any prices changed (cart items may need re-validation) */
  price_changed:         boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────────────────────

export class ModifierSyncEngine {

  /**
   * Process a realtime event and return what changed.
   * Called by useModifierRealtime when a change arrives.
   */
  static processEvent(
    event:         RealtimeModifierEvent_,
    currentGroups: ModifierGroup[],
  ): SyncResult {
    const result: SyncResult = {
      invalidated_group_ids: [],
      deleted_modifier_ids:  [],
      newly_unavailable:     [],
      price_changed:         false,
    }

    if (event.table === 'modifier_groups') {
      return ModifierSyncEngine.processGroupEvent(event as RealtimeModifierGroupEvent, result)
    } else if (event.table === 'modifiers') {
      return ModifierSyncEngine.processModifierEvent(
        event as RealtimeModifierEvent, currentGroups, result,
      )
    }

    return result
  }

  private static processGroupEvent(
    event:  RealtimeModifierGroupEvent,
    result: SyncResult,
  ): SyncResult {
    if (event.type === 'UPDATE' && event.new) {
      result.invalidated_group_ids.push(event.new.id)
    } else if (event.type === 'DELETE' && event.old) {
      result.invalidated_group_ids.push(event.old.id)
    }
    return result
  }

  private static processModifierEvent(
    event:         RealtimeModifierEvent,
    currentGroups: ModifierGroup[],
    result:        SyncResult,
  ): SyncResult {
    const groupId = event.new?.modifier_group_id ?? event.old?.modifier_group_id

    if (groupId) result.invalidated_group_ids.push(groupId)

    if (event.type === 'DELETE' && event.old) {
      result.deleted_modifier_ids.push(event.old.id)
    }

    if (event.type === 'UPDATE' && event.new) {
      const newMod = event.new
      const group  = currentGroups.find((g) => g.id === newMod.modifier_group_id)
      const oldMod = group?.modifiers.find((m) => m.id === newMod.id)

      if (oldMod) {
        if (oldMod.price_adjustment !== newMod.price_adjustment) {
          result.price_changed = true
        }
        if (oldMod.available && !newMod.available) {
          result.newly_unavailable.push(newMod.id)
        }
      }
    }

    return result
  }

  /**
   * Prune stale selections after a sync event.
   * Removes selections for deleted or newly-unavailable modifiers.
   */
  static pruneStaleSelections(
    selections:    Record<string, SelectedModifier[]>,
    syncResult:    SyncResult,
  ): { pruned: Record<string, SelectedModifier[]>; removed: string[] } {
    const blockedIds = new Set([
      ...syncResult.deleted_modifier_ids,
      ...syncResult.newly_unavailable,
    ])

    const pruned: Record<string, SelectedModifier[]> = {}
    const removed: string[] = []

    for (const [groupId, sels] of Object.entries(selections)) {
      const filtered = sels.filter((s) => {
        if (blockedIds.has(s.id)) { removed.push(s.id); return false }
        return true
      })
      pruned[groupId] = filtered
    }

    return { pruned, removed }
  }

  /**
   * Detect drift between cached group hash and live group hash.
   * Returns true if the cached version is stale.
   */
  static isGroupStale(cached: ModifierGroup, live: ModifierGroup): boolean {
    return hashModifierGroup(cached) !== hashModifierGroup(live)
  }
}