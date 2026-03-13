// =============================================================================
// PATH: src/modules/orders/components/kitchen/KitchenColumn.tsx
// =============================================================================

import { KitchenOrderCard } from './KitchenOrderCard';
import type { KitchenColumnProps } from './kitchen.types';

export function KitchenColumn({
  title,
  color,
  orders,
  onAction,
  actionLabel,
  actionColor,
  getTimeSince,
}: KitchenColumnProps) {
  return (
    <div>
      <div className={`${color} mb-4 rounded-lg p-3 font-bold`}>
        {title} ({orders.length})
      </div>

      <div className="space-y-4">
        {orders.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-neutral-800 p-8 text-center text-neutral-600">
            No orders
          </div>
        ) : null}

        {orders.map((order) => (
          <KitchenOrderCard
            key={order.id}
            order={order}
            onAction={onAction}
            actionLabel={actionLabel}
            actionColor={actionColor}
            getTimeSince={getTimeSince}
          />
        ))}
      </div>
    </div>
  );
}