import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/supabaseClient';

export default function AuthBootstrapGuard({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        await supabase.auth.getSession();
      } finally {
        if (mounted) setReady(true);
      }
    }

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      if (mounted) setReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (!ready) {
    return null;
  }

  return <>{children}</>;
}
