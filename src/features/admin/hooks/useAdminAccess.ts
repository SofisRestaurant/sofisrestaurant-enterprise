// src/features/admin/hooks/useAdminAccess.ts
// ============================================================================
// USE ADMIN ACCESS
// ============================================================================
// Import path updated:
//   '@/modules/auth/api/session.api' → '@/features/auth/auth.api'
// Everything else unchanged.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';

import {
  getSessionStateSnapshot,
  subscribeToSessionChanges,
  type SessionStateSnapshot,
} from '@/features/auth/auth.api';
import { useMountedRef, useStableCallback } from '@/shared/hooks';

import type { AdminAccessSnapshot } from '../types/admin-common.types';

export interface UseAdminAccessOptions {
  enabled?: boolean;
  allowedRoles?: readonly string[];
}

export interface UseAdminAccessResult extends AdminAccessSnapshot {
  isLoading: boolean;
  refresh: () => Promise<AdminAccessSnapshot>;
  requireAdmin: () => Promise<AdminAccessSnapshot>;
}

const DEFAULT_ALLOWED_ROLES = ['admin'] as const;

function normalizeRole(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeAllowedRoles(input: readonly string[] | undefined): readonly string[] {
  const source = input && input.length > 0 ? input : DEFAULT_ALLOWED_ROLES;
  return source
    .map((role) => normalizeRole(role))
    .filter((role): role is string => role !== null);
}

function toSnapshot(
  session: SessionStateSnapshot | null,
  allowedRoles: readonly string[],
  error: string | null,
): AdminAccessSnapshot {
  const role            = normalizeRole(session?.user?.role);
  const isAuthenticated = session?.status === 'authenticated';
  const isAdmin         = Boolean(isAuthenticated && role && allowedRoles.includes(role));
  return {
    checkedAt: new Date().toISOString(),
    isAuthenticated,
    isAdmin,
    role,
    userId: session?.user?.id    ?? null,
    email:  session?.user?.email ?? null,
    error,
  };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  if (typeof error === 'string' && error.trim().length > 0) return error.trim();
  return 'Unable to verify admin access.';
}

export function useAdminAccess(options: UseAdminAccessOptions = {}): UseAdminAccessResult {
  const mountedRef = useMountedRef();
  const [state, setState] = useState<{ loading: boolean; snapshot: AdminAccessSnapshot }>({
    loading: options.enabled === false ? false : true,
    snapshot: {
      checkedAt:       new Date().toISOString(),
      isAuthenticated: false,
      isAdmin:         false,
      role:            null,
      userId:          null,
      email:           null,
      error:           null,
    },
  });

  const allowedRoles = useMemo(
    () => normalizeAllowedRoles(options.allowedRoles),
    [options.allowedRoles],
  );

  const resolveSnapshot = useStableCallback(
    async (source?: SessionStateSnapshot | null): Promise<AdminAccessSnapshot> => {
      if (options.enabled === false) {
        return {
          checkedAt: new Date().toISOString(),
          isAuthenticated: false,
          isAdmin: false,
          role: null,
          userId: null,
          email: null,
          error: null,
        };
      }
      try {
        const session = source ?? (await getSessionStateSnapshot());
        return toSnapshot(session, allowedRoles, null);
      } catch (error) {
        return toSnapshot(null, allowedRoles, toErrorMessage(error));
      }
    },
  );

  const applySnapshot = useStableCallback((snapshot: AdminAccessSnapshot) => {
    if (!mountedRef.current) return;
    setState({ loading: false, snapshot });
  });

  const refresh = useStableCallback(async (): Promise<AdminAccessSnapshot> => {
    const snapshot = await resolveSnapshot();
    applySnapshot(snapshot);
    return snapshot;
  });

  const requireAdmin = useStableCallback(async (): Promise<AdminAccessSnapshot> => {
    const snapshot = await refresh();
    if (!snapshot.isAdmin) {
      throw new Error(
        snapshot.error ??
          (snapshot.isAuthenticated
            ? 'You do not have permission to access this admin area.'
            : 'You must be signed in as an admin to continue.'),
      );
    }
    return snapshot;
  });

  useEffect(() => {
    if (options.enabled === false) return undefined;

    let active = true;

    void resolveSnapshot().then((snapshot) => {
      if (!active) return;
      applySnapshot(snapshot);
    });

    const unsubscribe = subscribeToSessionChanges((sessionSnapshot) => {
      void resolveSnapshot(sessionSnapshot).then((next) => {
        if (!active) return;
        applySnapshot(next);
      });
    });

    return () => { active = false; unsubscribe(); };
  }, [applySnapshot, options.enabled, resolveSnapshot]);

  return {
    ...state.snapshot,
    isLoading: state.loading,
    refresh,
    requireAdmin,
  };
}

export default useAdminAccess;