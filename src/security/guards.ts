// src/security/guards.ts
import { hasPermission, type UserRole, type Permission } from './permissions';

// ============================================================================
// Types
// ============================================================================

export interface RouteGuard {
  path: string;
  permission: Permission;
  exact?: boolean;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Route permission mappings
 * Define which permissions are required for each route
 */
const routeGuards: RouteGuard[] = [
  // Checkout routes
  { path: '/checkout', permission: 'orders:write', exact: false },
  
  // Admin routes
  { path: '/admin', permission: 'admin:access', exact: false },
  { path: '/admin/dashboard', permission: 'admin:access', exact: false },
  { path: '/admin/orders', permission: 'orders:manage', exact: false },
  { path: '/admin/menu', permission: 'menu:write', exact: false },
  { path: '/admin/users', permission: 'users:manage', exact: false },
  { path: '/admin/settings', permission: 'settings:manage', exact: false },
  
  // Order routes
  { path: '/orders', permission: 'orders:read', exact: false },
  { path: '/orders/:id', permission: 'orders:read', exact: false },
  
  // Profile routes
  { path: '/profile', permission: 'profile:read', exact: false },
  { path: '/profile/edit', permission: 'profile:write', exact: false },
];

// ============================================================================
// Guard Functions
// ============================================================================

/**
 * Check if a user can access a specific route
 * @param role - User's role
 * @param routePath - Route path to check
 * @returns true if user can access the route
 */
export function canAccessRoute(role: UserRole, routePath: string): boolean {
  // Normalize route path
  const normalizedPath = routePath.startsWith('/') ? routePath : `/${routePath}`;
  
  // Find matching route guard
  const guard = routeGuards.find((guard) => {
    if (guard.exact) {
      return normalizedPath === guard.path;
    }
    return normalizedPath.startsWith(guard.path);
  });

  // If no guard found, route is public
  if (!guard) {
    return true;
  }

  // Check if user has required permission
  return hasPermission(role, guard.permission);
}

/**
 * Get required permission for a route
 * @param routePath - Route path to check
 * @returns Required permission or null if route is public
 */
export function getRequiredPermission(routePath: string): Permission | null {
  const normalizedPath = routePath.startsWith('/') ? routePath : `/${routePath}`;
  
  const guard = routeGuards.find((guard) => {
    if (guard.exact) {
      return normalizedPath === guard.path;
    }
    return normalizedPath.startsWith(guard.path);
  });

  return guard?.permission || null;
}

/**
 * Check if a route is protected
 * @param routePath - Route path to check
 * @returns true if route requires authentication
 */
export function isProtectedRoute(routePath: string): boolean {
  return getRequiredPermission(routePath) !== null;
}

/**
 * Get all routes accessible by a role
 * @param role - User's role
 * @returns Array of accessible route paths
 */
export function getAccessibleRoutes(role: UserRole): string[] {
  return routeGuards
    .filter((guard) => hasPermission(role, guard.permission))
    .map((guard) => guard.path);
}

/**
 * Validate multiple permissions at once
 * @param role - User's role
 * @param permissions - Array of permissions to check
 * @returns true if user has ALL permissions
 */
export function hasAllPermissions(role: UserRole, permissions: Permission[]): boolean {
  return permissions.every((permission) => hasPermission(role, permission));
}

/**
 * Validate at least one permission
 * @param role - User's role
 * @param permissions - Array of permissions to check
 * @returns true if user has ANY of the permissions
 */
export function hasAnyPermission(role: UserRole, permissions: Permission[]): boolean {
  return permissions.some((permission) => hasPermission(role, permission));
}

// Force module mode
export {};