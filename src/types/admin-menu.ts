// src/types/admin-menu.ts
// ============================================================================
// ADMIN MENU DOMAIN TYPES
// ============================================================================
// Extended types for the admin modifier management system.
// All DB column references verified against real database.types.ts (Feb 2026).
//
// modifier_groups table columns:
//   id, name, description, type, required, min_selections, max_selections,
//   sort_order, active, created_at, updated_at
//
// modifiers table columns:
//   id, modifier_group_id, name, price_adjustment, available,
//   sort_order, created_at, updated_at
//   ❌ inventory_count — NOT in current schema (V2 forward field only)
//
// menu_item_modifier_groups join table:
//   id, menu_item_id, modifier_group_id, sort_order
// ============================================================================

import type { ModifierGroup, Modifier, ModifierGroupType } from '@/domain/menu/menu.types'

// ─────────────────────────────────────────────────────────────────────────────
// Re-exports for convenience
// ─────────────────────────────────────────────────────────────────────────────

export type { ModifierGroup, Modifier, ModifierGroupType }

// ─────────────────────────────────────────────────────────────────────────────
// Admin write payloads — match DB Insert/Update shapes exactly
// ─────────────────────────────────────────────────────────────────────────────

export interface ModifierGroupWritePayload {
  name:           string
  description?:   string
  type:           ModifierGroupType
  required:       boolean
  min_selections: number
  max_selections: number | null
  sort_order:     number
  active:         boolean
}

export interface ModifierWritePayload {
  modifier_group_id: string
  name:              string
  price_adjustment:  number
  available:         boolean
  sort_order:        number
}

export interface MenuItemModifierGroupWritePayload {
  menu_item_id:      string
  modifier_group_id: string
  sort_order:        number
}

// ─────────────────────────────────────────────────────────────────────────────
// Enriched admin views (read-only projections)
// ─────────────────────────────────────────────────────────────────────────────

/** A modifier group as seen in the admin editor — includes linked item count */
export interface AdminModifierGroup extends ModifierGroup {
  item_count:   number    // how many menu items reference this group
  created_at:   string
  updated_at:   string
}

/** A modifier as seen in the admin editor */
export interface AdminModifier extends Modifier {
  created_at: string
  updated_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Reorder payloads
// ─────────────────────────────────────────────────────────────────────────────

export interface ReorderPayload {
  id:         string
  sort_order: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Template system
// ─────────────────────────────────────────────────────────────────────────────

/** A named template representing a reusable modifier group with its modifiers */
export interface ModifierTemplate {
  id:          string
  name:        string
  description: string
  category:    string
  icon?:       string        // ✅ ADD HERE
  group:       ModifierGroupWritePayload
  modifiers:   Omit<ModifierWritePayload, 'modifier_group_id'>[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation results
// ─────────────────────────────────────────────────────────────────────────────

export interface ModifierGroupValidationResult {
  valid:  boolean
  errors: Partial<Record<keyof ModifierGroupWritePayload, string>>
}

export interface ModifierValidationResult {
  valid:  boolean
  errors: Partial<Record<keyof Omit<ModifierWritePayload, 'modifier_group_id'>, string>>
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit / history
// ─────────────────────────────────────────────────────────────────────────────

export type ModifierChangeType = 'created' | 'updated' | 'deleted' | 'reordered' | 'toggled'

export interface ModifierAuditEntry {
  id:           string
  entity_type:  'modifier_group' | 'modifier' | 'menu_item_modifier_groups'
  entity_id:    string
  change_type:  ModifierChangeType
  old_value:    Record<string, unknown> | null
  new_value:    Record<string, unknown> | null
  changed_by:   string
  changed_at:   string
}

// ─────────────────────────────────────────────────────────────────────────────
// UI state helpers
// ─────────────────────────────────────────────────────────────────────────────

export type DirtyState = {
  isDirty:   boolean
  fields:    Set<string>
  lastSaved: string | null
}

export type AsyncStatus = 'idle' | 'loading' | 'saving' | 'success' | 'error'