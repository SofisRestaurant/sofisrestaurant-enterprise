// src/security/permissions.ts
import type { UserRole } from '@/contexts/userTypes'

// ✅ Re-export UserRole so other files can import it
export type { UserRole }

// ============================================================================
// TYPES
// ============================================================================

export type Permission =
  // Orders
  | 'orders:read'
  | 'orders:write'
  | 'orders:update'
  | 'orders:manage'
  // Menu
  | 'menu:read'
  | 'menu:write'
  | 'menu:delete'
  // Profile
  | 'profile:read'
  | 'profile:write'
  // Admin
  | 'admin:access'
  | 'users:manage'
  | 'settings:manage'
  // Reviews
  | 'reviews:read'
  | 'reviews:write'
  | 'reviews:manage'

// ============================================================================
// PERMISSION MATRIX
// ============================================================================

/**
 * Role-based permission matrix
 * Defines what each role can do
 */
const rolePermissions: Record<UserRole, Permission[]> = {
  guest: ['menu:read', 'reviews:read'],
  staff: ['orders:read', 'orders:update', 'menu:read'],
  customer: [
    'menu:read',
    'orders:read',
    'orders:write',
    'profile:read',
    'profile:write',
    'reviews:read',
    'reviews:write',
  ],
  admin: [
    'menu:read',
    'menu:write',
    'menu:delete',
    'orders:read',
    'orders:write',
    'orders:update',
    'orders:manage',
    'profile:read',
    'profile:write',
    'admin:access',
    'users:manage',
    'settings:manage',
    'reviews:read',
    'reviews:write',
    'reviews:manage',
  ],
}

// ============================================================================
// PERMISSION FUNCTIONS
// ============================================================================

export function hasPermission(role: UserRole, permission: Permission): boolean {
  const permissions = rolePermissions[role]
  return permissions.includes(permission)
}

export function getPermissions(role: UserRole): Permission[] {
  return rolePermissions[role] || []
}

// Orders
export function canReadOrders(role: UserRole): boolean {
  return hasPermission(role, 'orders:read')
}

export function canWriteOrders(role: UserRole): boolean {
  return hasPermission(role, 'orders:write')
}

export function canUpdateOrders(role: UserRole): boolean {
  return hasPermission(role, 'orders:update')
}

export function canManageOrders(role: UserRole): boolean {
  return hasPermission(role, 'orders:manage')
}

// Menu
export function canEditMenu(role: UserRole): boolean {
  return hasPermission(role, 'menu:write')
}

// Admin
export function canAccessAdmin(role: UserRole): boolean {
  return hasPermission(role, 'admin:access')
}

export function canManageUsers(role: UserRole): boolean {
  return hasPermission(role, 'users:manage')
}

// Identity helpers
export function isAdmin(role: UserRole): boolean {
  return role === 'admin'
}

export function isCustomer(role: UserRole): boolean {
  return role === 'customer'
}

export function isGuest(role: UserRole): boolean {
  return role === 'guest'
}

export function isAuthenticated(role: UserRole): boolean {
  return role !== 'guest'
}