// =============================================================================
// src/pages/Admin/hooks/useAdminLayoutAuth.ts
// =============================================================================

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase/supabaseClient';
import {
  subscribeToAdminSession,
  verifyAdminAccess,
} from '@/pages/Admin/admin.auth';
import { bustCache } from '../admin-layout.utils';
import type { AuthStatus } from '../admin-layout.types';

export interface UseAdminLayoutAuthResult {
  authStatus: AuthStatus;
  adminName: string;
  handleSignOut: () => Promise<void>;
}

export function useAdminLayoutAuth(): UseAdminLayoutAuthResult {
  const navigate = useNavigate();

  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking');
  const [adminName, setAdminName] = useState('Admin');

  useEffect(() => {
    let alive = true;

    async function verify() {
      const result = await verifyAdminAccess();
      if (!alive) return;

      if (!result.ok) {
        setAuthStatus('denied');
        void navigate(result.redirectTo, { replace: true });
        return;
      }

      setAdminName(result.firstName);
      setAuthStatus('authorized');
    }

    void verify();

    return () => {
      alive = false;
    };
  }, [navigate]);

  useEffect(() => {
    return subscribeToAdminSession(() => {
      setAuthStatus('denied');
      void navigate('/login', { replace: true });
    });
  }, [navigate]);

  const handleSignOut = useCallback(async () => {
    bustCache();
    await supabase.auth.signOut();
    await Promise.resolve(navigate('/login'));
  }, [navigate]);

  return { authStatus, adminName, handleSignOut };
}