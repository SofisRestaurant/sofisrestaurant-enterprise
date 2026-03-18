// =============================================================================
// PATH: src/modules/admin/orders/AdminOrderCard.tsx
// =============================================================================
// Mobile card representation of a single order.
// Tappable — clicking opens the order drawer.
// =============================================================================

import { Badge } from '@/features/admin/ui/AdminPrimitives';
import { formatCurrency } from '@/utils/currency';
import type { AdminOrder } from '../../types/admin-orders.types';
import {
  minutesSince,
  priorityLevel,
  statusLabel,
  statusTone,
  paymentTone,
  humanOrderType,
} from '../../utils/admin-orders.status';

interface Props {
  order: AdminOrder;
  onSelect: (id: string) => void;
}

export function AdminOrderCard({ order, onSelect }: Props) {
  const priority = priorityLevel(order);

  return (
    <button
      type="button"
      onClick={() => onSelect(order.id)}
      className={[
        'w-full rounded-2xl border p-4 text-left transition',
        priority === 'urgent'
          ? 'border-red-500/30 bg-red-500/5'
          : priority === 'high'
            ? 'border-amber-500/25 bg-amber-500/5'
            : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black text-zinc-100">
            #{order.orderNumber ?? '—'}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {order.customerName ?? order.customerEmail ?? 'Guest'}
          </div>
        </div>

        <div className="text-right">
          <div className="text-sm font-black text-zinc-100">
            {formatCurrency(order.amountTotalCents / 100)}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            {minutesSince(order.createdAt)}m ago
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge>
        <Badge tone={paymentTone(order.paymentStatus)}>{order.paymentStatus}</Badge>
        {priority !== 'normal' ? (
          <Badge tone={priority === 'urgent' ? 'danger' : 'warning'}>
            {priority === 'urgent' ? 'Urgent' : 'High'}
          </Badge>
        ) : null}
        <Badge tone="neutral">{humanOrderType(order.orderType)}</Badge>
      </div>
    </button>
  );
}