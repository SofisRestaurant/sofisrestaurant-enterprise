// =============================================================================
// PATH: src/modules/admin/orders/AdminOrderActions.tsx
// =============================================================================
// Action buttons at the bottom of the order detail drawer.
// Handles cancel and status-advance — calls back up to the page via props.
// =============================================================================

import type { AdminOrder } from '../../types/admin-orders.types';
import { statusLabel } from '../../utils/admin-orders.status';
import { NEXT_STATUS } from '../../utils/admin-orders.constants';

interface Props {
  order: AdminOrder;
  isUpdating: boolean;
  onMutateStatus: (order: AdminOrder, nextStatus: string) => void;
}

export function AdminOrderActions({ order, isUpdating, onMutateStatus }: Props) {
  const nextStatus = NEXT_STATUS[order.status] ?? null;
  const isTerminal = order.status === 'cancelled' || order.status === 'delivered';

  return (
    <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
      {!isTerminal ? (
        <button
          type="button"
          onClick={() => onMutateStatus(order, 'cancelled')}
          disabled={isUpdating}
          className="rounded-xl border border-red-500/30 px-3 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel order
        </button>
      ) : null}

      {nextStatus ? (
        <button
          type="button"
          onClick={() => onMutateStatus(order, nextStatus)}
          disabled={isUpdating}
          className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isUpdating ? 'Updating…' : `Mark as ${statusLabel(nextStatus)}`}
        </button>
      ) : null}
    </div>
  );
}