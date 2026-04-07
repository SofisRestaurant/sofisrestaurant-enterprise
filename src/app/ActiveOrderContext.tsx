// src/app/ActiveOrderContext.tsx
// =============================================================================
// Calls useActiveOrder ONCE at the app shell level.
// TopBar and BottomNav read from useActiveOrderId() instead of calling
// useActiveOrder() directly — prevents duplicate Supabase channels.
// =============================================================================

import { createContext, useContext, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useActiveOrder } from '@/modules/orders/hooks/useActiveOrder';

const ActiveOrderContext = createContext<string | null>(null);

export function ActiveOrderProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const activeOrderId = useActiveOrder(user?.id ?? null);

  return (
    <ActiveOrderContext.Provider value={activeOrderId}>
      {children}
    </ActiveOrderContext.Provider>
  );
}

export function useActiveOrderId(): string | null {
  return useContext(ActiveOrderContext);
}