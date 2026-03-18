// =============================================================================
// PATH: src/modules/admin/orders/AdminOrderDetailHeader.tsx
// =============================================================================
// Header section of the order detail drawer.
// Shows order number, customer summary, age, and the close button.
// =============================================================================

import { type RefObject } from 'react';
import { Badge } from '@/features/admin/ui/AdminPrimitives';
import type { AdminOrder } from '../../types/admin-orders.types';
import { statusLabel, statusTone, paymentTone, humanOrderType } from '../../utils/admin-orders.status';
import { minutesSince, priorityLevel } from '../../utils/admin-orders.priority';
interface Props {
  order: AdminOrder;
  /** Forwarded from the drawer so focus lands here when the drawer opens. */
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}

export function AdminOrderDetailHeader({ order, closeButtonRef, onClose }: Props) {
  const priority = priorityLevel(order);

  return (
    <>
      {/* ── Title row ── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="admin-order-detail-title"
            className="text-xl font-black text-white"
          >
            Order #{order.orderNumber ?? '—'}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {order.customerName ?? order.customerEmail ?? 'Guest'}
            {' · '}
            {minutesSince(order.createdAt)} minutes old
          </p>
        </div>

        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="rounded-xl border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-900"
        >
          Close
        </button>
      </div>

      {/* ── Badge row ── */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone={statusTone(order.status)}>
          {statusLabel(order.status)}
        </Badge>

        <Badge tone={paymentTone(order.paymentStatus)}>
          {order.paymentStatus}
        </Badge>

        <Badge tone="neutral">
          {humanOrderType(order.orderType)}
        </Badge>

        {priority !== 'normal' ? (
          <Badge tone={priority === 'urgent' ? 'danger' : 'warning'}>
            {priority === 'urgent' ? 'Urgent' : 'High priority'}
          </Badge>
        ) : null}
      </div>
    </>
  );
}