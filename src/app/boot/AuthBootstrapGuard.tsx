import { useEffect, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase/supabaseClient';

/**
 * Renders the app shell immediately. Session hydration runs in the background
 * so FCP/LCP are not blocked on supabase.auth.getSession().
 */
export default function AuthBootstrapGuard({ children }: { children: ReactNode }) {
  useEffect(() => {
    void supabase.auth.getSession().catch(() => {
      // UserProvider + AppBoot own session recovery; never block paint here.
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      // no-op — listeners live in UserProvider / AppBoot
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return <>{children}</>;
}
