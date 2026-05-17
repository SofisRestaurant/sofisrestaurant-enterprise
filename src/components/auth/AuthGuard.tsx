// src/components/auth/AuthGuard.tsx
// ============================================================================
// AUTH GUARDS — PRODUCTION GRADE 2026
// ============================================================================
// Protect routes based on authentication and roles
// ============================================================================

import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useUserContext } from '@/contexts/useUserContext';
import type { UserRole } from '@/contexts/userTypes';

// ============================================================================
// TYPES
// ============================================================================

interface AuthGuardProps {
  children: ReactNode;
  requireAuth?: boolean;
  requireAdmin?: boolean;
  requireStaff?: boolean;
  fallback?: ReactNode;
  redirectTo?: string;
}

interface RoleGuardProps {
  children: ReactNode;
  allowedRoles: UserRole[];
  fallback?: ReactNode;
  redirectTo?: string;
}

// ============================================================================
// AUTH GUARD
// ============================================================================

/**
 * Protect routes that require authentication
 *
 * @example
 * ```tsx
 * <AuthGuard requireAuth>
 *   <ProfilePage />
 * </AuthGuard>
 * ```
 */
export function AuthGuard({
  children,
  requireAuth = true,
  requireAdmin = false,
  requireStaff = false,
  fallback,
  redirectTo = '/login',
}: AuthGuardProps) {
  const { loading, isAuthenticated, isAdmin, role } = useUserContext();
  const location = useLocation();

  // Show loading state
  if (loading) {
    return fallback || <LoadingScreen />;
  }

  // Check auth requirement
  if (requireAuth && !isAuthenticated) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // Check admin requirement
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/unauthorized" replace />;
  }

  // Check staff requirement
  if (requireStaff && role !== 'staff' && !isAdmin) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}

// ============================================================================
// ROLE GUARD
// ============================================================================

/**
 * Protect routes based on specific roles
 *
 * @example
 * ```tsx
 * <RoleGuard allowedRoles={['admin', 'staff']}>
 *   <AdminDashboard />
 * </RoleGuard>
 * ```
 */
export function RoleGuard({
  children,
  allowedRoles,
  fallback,
  redirectTo = '/unauthorized',
}: RoleGuardProps) {
  const { loading, role, isAuthenticated } = useUserContext();
  const location = useLocation();

  // Show loading state
  if (loading) {
    return fallback || <LoadingScreen />;
  }

  // Not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check role
  if (!allowedRoles.includes(role)) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}

// ============================================================================
// GUEST GUARD
// ============================================================================

/**
 * Protect routes that should only be accessible to guests (non-authenticated users)
 * Example: Login, Register pages
 *
 * @example
 * ```tsx
 * <GuestGuard>
 *   <LoginPage />
 * </GuestGuard>
 * ```
 */
export function GuestGuard({
  children,
  redirectTo = '/dashboard',
}: {
  children: ReactNode;
  redirectTo?: string;
}) {
  const { loading, isAuthenticated } = useUserContext();

  if (loading) {
    return <LoadingScreen />;
  }

  if (isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}

// ============================================================================
// LOADING SCREEN
// ============================================================================

function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <div
          className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600"
          aria-label="Loading..."
          role="status"
        />
        <p className="text-sm text-gray-600">Loading...</p>
      </div>
    </div>
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export default AuthGuard;
