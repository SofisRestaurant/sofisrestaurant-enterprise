// =============================================================================
// PATH: src/modules/admin/orders/components/AdminOrderRow.tsx
// =============================================================================
// Desktop table row representation of a single order.
// =============================================================================

import { Badge } from '@/features/admin/ui/AdminPrimitives';
import { formatCurrency } from '@/utils/currency';
import type { AdminOrder } from '../types/admin-orders.types';
import {
  minutesSince,
  priorityLevel,
} from '../utils/admin-orders.priority';
import {
  statusLabel,
  statusTone,
  paymentTone,
  humanOrderType,
} from '../utils/admin-orders.status';

interface Props {
  order: AdminOrder;
  onSelect: (id: string) => void;
}

export function AdminOrderRow({ order, onSelect }: Props) {
  const priority = priorityLevel(order);

  return (
    <tr
      className={
        priority === 'urgent'
          ? 'bg-red-500/5'
          : priority === 'high'
            ? 'bg-amber-500/5'
            : 'bg-zinc-950/20'
      }
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-zinc-100">
            #{order.orderNumber ?? '—'}
          </span>
          {priority !== 'normal' && (
            <Badge tone={priority === 'urgent' ? 'danger' : 'warning'}>
              {priority === 'urgent' ? 'Urgent' : 'High'}
            </Badge>
          )}
        </div>
      </td>

      <td className="px-4 py-3">
        <div className="max-w-220px truncate text-zinc-300">
          {order.customerName ?? order.customerEmail ?? 'Guest'}
        </div>
      </td>

      <td className="px-4 py-3 text-zinc-400">
        {humanOrderType(order.orderType)}
      </td>

      <td className="px-4 py-3 text-zinc-400">
        {minutesSince(order.createdAt)}m
      </td>

      <td className="px-4 py-3">
        <Badge tone={paymentTone(order.paymentStatus)}>
          {order.paymentStatus}
        </Badge>
      </td>

      <td className="px-4 py-3">
        <Badge tone={statusTone(order.status)}>
          {statusLabel(order.status)}
        </Badge>
      </td>

      <td className="px-4 py-3 font-semibold text-zinc-100">
        {formatCurrency(order.amountTotalCents / 100)}
      </td>

      <td className="px-4 py-3">
        <button
          type="button"
          onClick={() => onSelect(order.id)}
          className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-900"
        >
          View
        </button>
      </td>
    </tr>
  );
}