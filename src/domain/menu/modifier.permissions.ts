// src/domain/menu/modifier.permissions.ts
// ============================================================================
// MODIFIER FIELD-LEVEL PERMISSIONS
// ============================================================================
// Defines which fields each role can read or write on modifier entities.
// Integrated with the security/permissions.ts role system.
// ============================================================================

import type { UserRole } from '@/security/permissions'
import type { ModifierGroupWritePayload, ModifierWritePayload } from '@/types/admin-menu'

// ─────────────────────────────────────────────────────────────────────────────
// Field permission matrices
// ─────────────────────────────────────────────────────────────────────────────

type GroupField   = keyof ModifierGroupWritePayload
type ModField     = keyof Omit<ModifierWritePayload, 'modifier_group_id'>

type FieldPermissionMatrix<F extends string> = {
  [role in UserRole]?: {
    readable: F[] | '*'
    writable: F[] | '*'
  }
}

const GROUP_FIELD_PERMISSIONS: FieldPermissionMatrix<GroupField> = {
  admin: {
    readable: '*',
    writable: '*',
  },
  staff: {
    readable: ['name', 'description', 'type', 'required', 'min_selections', 'max_selections', 'sort_order', 'active'],
    writable: ['active', 'sort_order'],      // staff can toggle active, reorder; cannot change rules
  },
  customer: {
    readable: ['name', 'description', 'type', 'required', 'min_selections', 'max_selections'],
    writable: [],
  },
  guest: {
    readable: ['name', 'type', 'required'],
    writable: [],
  },
}

const MODIFIER_FIELD_PERMISSIONS: FieldPermissionMatrix<ModField> = {
  admin: {
    readable: '*',
    writable: '*',
  },
  staff: {
    readable: ['name', 'price_adjustment', 'available', 'sort_order'],
    writable: ['available'],                  // staff can toggle availability only
  },
  customer: {
    readable: ['name', 'price_adjustment', 'available'],
    writable: [],
  },
  guest: {
    readable: ['name', 'price_adjustment', 'available'],
    writable: [],
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Permission query functions
// ─────────────────────────────────────────────────────────────────────────────

export function canReadGroupField(role: UserRole, field: GroupField): boolean {
  const perm = GROUP_FIELD_PERMISSIONS[role]
  if (!perm) return false
  return perm.readable === '*' || (perm.readable as GroupField[]).includes(field)
}

export function canWriteGroupField(role: UserRole, field: GroupField): boolean {
  const perm = GROUP_FIELD_PERMISSIONS[role]
  if (!perm) return false
  return perm.writable === '*' || (perm.writable as GroupField[]).includes(field)
}

export function canReadModifierField(role: UserRole, field: ModField): boolean {
  const perm = MODIFIER_FIELD_PERMISSIONS[role]
  if (!perm) return false
  return perm.readable === '*' || (perm.readable as ModField[]).includes(field)
}

export function canWriteModifierField(role: UserRole, field: ModField): boolean {
  const perm = MODIFIER_FIELD_PERMISSIONS[role]
  if (!perm) return false
  return perm.writable === '*' || (perm.writable as ModField[]).includes(field)
}

/** Returns all fields a role can write on a modifier group */
export function getWritableGroupFields(role: UserRole): GroupField[] | '*' {
  const perm = GROUP_FIELD_PERMISSIONS[role]
  if (!perm) return []
  return perm.writable
}

/** Returns all fields a role can write on a modifier */
export function getWritableModifierFields(role: UserRole): ModField[] | '*' {
  const perm = MODIFIER_FIELD_PERMISSIONS[role]
  if (!perm) return []
  return perm.writable
}

/** Strips fields the role cannot write from a group payload */
export function sanitizeGroupPayload(
  role:    UserRole,
  payload: Partial<ModifierGroupWritePayload>,
): Partial<ModifierGroupWritePayload> {
  const writable = getWritableGroupFields(role)
  if (writable === '*') return payload

  const sanitized: Partial<ModifierGroupWritePayload> = {}
  for (const field of writable) {
    if (field in payload) {
      (sanitized as Record<string, unknown>)[field] = payload[field]
    }
  }
  return sanitized
}

/** Strips fields the role cannot write from a modifier payload */
export function sanitizeModifierPayload(
  role:    UserRole,
  payload: Partial<Omit<ModifierWritePayload, 'modifier_group_id'>>,
): Partial<Omit<ModifierWritePayload, 'modifier_group_id'>> {
  const writable = getWritableModifierFields(role)
  if (writable === '*') return payload

  const sanitized: Partial<Omit<ModifierWritePayload, 'modifier_group_id'>> = {}
  for (const field of writable) {
    if (field in payload) {
      (sanitized as Record<string, unknown>)[field] = payload[field]
    }
  }
  return sanitized
}