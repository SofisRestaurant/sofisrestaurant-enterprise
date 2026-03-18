// =============================================================================
// PATH: src/modules/admin/orders/AdminOrderDrawer.tsx
// =============================================================================
// Slide-in drawer for order detail. Composes all AdminOrderDetail* sub-components.
// Handles its own backdrop, scroll-lock, focus trap, and ESC key via props
// passed down from the page — no store access here.
// =============================================================================

import { type RefObject } from 'react';
import type { AdminOrder } from '../../types/admin-orders.types';
import { AdminOrderDetailHeader } from './AdminOrderDetailHeader';
import { AdminOrderDetailMeta } from './AdminOrderDetailMeta';
import { AdminOrderItems } from './AdminOrderItems';
import { AdminOrderNotes } from './AdminOrderNotes';
import { AdminOrderFinancials } from './AdminOrderFinancials';
import { AdminOrderActions } from './AdminOrderActions';

interface Props {
  order: AdminOrder;
  isUpdating: boolean;
  closeButtonRef: RefObject<HTMLButtonElement | null>; // <-- allow null
  onClose: () => void;
  onMutateStatus: (order: AdminOrder, nextStatus: string) => void;
}
export function AdminOrderDrawer({
  order,
  isUpdating,
  closeButtonRef,
  onClose,
  onMutateStatus,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
      {/* Backdrop — click to close */}
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close order details"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-order-detail-title"
        className="relative h-full w-full max-w-xl overflow-y-auto border-l border-zinc-800 bg-[#050509] p-5 shadow-2xl"
      >
        <AdminOrderDetailHeader
          order={order}
          closeButtonRef={closeButtonRef}
          onClose={onClose}
        />

        <AdminOrderDetailMeta order={order} />

        <AdminOrderItems items={order.cartItems} />

        <AdminOrderNotes notes={order.notes} />

        <AdminOrderFinancials order={order} />

        <AdminOrderActions
          order={order}
          isUpdating={isUpdating}
          onMutateStatus={onMutateStatus}
        />
      </aside>
    </div>
  );
}