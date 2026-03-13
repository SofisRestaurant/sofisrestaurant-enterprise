// =============================================================================
// PATH: src/modules/orders/components/kitchen/KitchenOrderCard.tsx
// =============================================================================

import { KitchenOrderItemList } from './KitchenOrderItemList';
import { formatCurrency } from './kitchen.formatters';
import type { KitchenOrderCardProps } from './kitchen.types';

export function KitchenOrderCard({
  order,
  onAction,
  actionLabel,
  actionColor,
  getTimeSince,
}: KitchenOrderCardProps) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-semibold">{order.customer_name || 'Guest'}</div>
          {order.customer_phone ? (
            <div className="text-xs text-neutral-500">{order.customer_phone}</div>
          ) : null}
          <div className="mt-1 text-xs text-neutral-500">#{order.id.slice(0, 8)}</div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold text-green-400">
            {formatCurrency(order.amount_total)}
          </div>
          <div className="text-xs text-neutral-500">{getTimeSince(order.created_at)}</div>
        </div>
      </div>

      <KitchenOrderItemList items={order.cart_items} orderId={order.id} />

      {onAction && actionLabel ? (
        <button
          type="button"
          onClick={() => onAction(order.id)}
          className={`mt-4 w-full rounded-lg py-2.5 font-bold ${actionColor ?? ''}`}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}