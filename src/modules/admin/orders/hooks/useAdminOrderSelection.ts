// =============================================================================
// PATH: src/modules/admin/orders/useAdminOrderSelection.ts
// =============================================================================
// Manages which order is currently selected (drawer open), focus/scroll-lock
// side effects, ESC key handling, and the status mutation callback.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdminOrder } from '../types/admin-orders.types';
import { updateOrderStatus } from '../api/admin-orders.api';

export interface UseAdminOrderSelectionReturn {
  selectedOrder: AdminOrder | null;
  updatingOrderId: string | null;
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
  selectOrder: (id: string) => void;
  closeOrder: () => void;
  mutateStatus: (order: AdminOrder, nextStatus: string) => Promise<void>;
}

export function useAdminOrderSelection(
  orders: readonly AdminOrder[],
  setOrders: React.Dispatch<React.SetStateAction<AdminOrder[]>>,
  setLastUpdated: React.Dispatch<React.SetStateAction<Date | null>>,
  onError: (msg: string) => void,
): UseAdminOrderSelectionReturn {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // Derive selected order from the live orders list
  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );

  // If the selected order is deleted from the list, close the drawer
  useEffect(() => {
    if (selectedOrderId && !selectedOrder) setSelectedOrderId(null);
  }, [selectedOrder, selectedOrderId]);

  // Scroll lock, focus management, ESC key when drawer is open
  useEffect(() => {
    if (!selectedOrder) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(
      () => { closeButtonRef.current?.focus(); },
      0,
    );

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedOrderId(null);
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedOrder]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const selectOrder = useCallback((id: string) => { setSelectedOrderId(id); }, []);
  const closeOrder  = useCallback(() => { setSelectedOrderId(null); }, []);

  const mutateStatus = useCallback(
    async (order: AdminOrder, nextStatus: string) => {
      if (updatingOrderId) return;

      const previousStatus = order.status;
      setUpdatingOrderId(order.id);

      // Optimistic update
      setOrders((current) =>
        current.map((item) =>
          item.id === order.id ? { ...item, status: nextStatus } : item,
        ),
      );

      try {
        await updateOrderStatus(order.id, nextStatus);
        setLastUpdated(new Date());
      } catch (err) {
        // Rollback on failure
        setOrders((current) =>
          current.map((item) =>
            item.id === order.id ? { ...item, status: previousStatus } : item,
          ),
        );
        onError(err instanceof Error ? err.message : 'Status update failed.');
      } finally {
        setUpdatingOrderId(null);
      }
    },
    [updatingOrderId, setOrders, setLastUpdated, onError],
  );

  return {
    selectedOrder,
    updatingOrderId,
    closeButtonRef,
    selectOrder,
    closeOrder,
    mutateStatus,
  };
}