// =============================================================================
// PATH: src/modules/orders/components/kitchen/KitchenColumn.tsx
// =============================================================================

import { memo } from 'react';
import { KitchenOrderCard } from './KitchenOrderCard';
import type { KitchenColumnProps } from './kitchen.types';

export const KitchenColumn = memo(function KitchenColumn({
  title,
  color,
  orders,
  onAction,
  actionLabel,
  actionColor,
  getTimeSince,
}: KitchenColumnProps) {
  const hasOrders = orders.length > 0;

  return (
    <section className="flex h-full flex-col" aria-label={`${title} kitchen column`}>
      {/* Header */}
      <header
        className={[
          'mb-4 flex items-center justify-between rounded-lg px-3 py-2 font-bold shadow-sm',
          color,
        ].join(' ')}
      >
        <span className="truncate">{title}</span>

        <span
          className="ml-3 rounded-full bg-black/20 px-2 py-0.5 text-xs font-semibold"
          aria-label="order count"
        >
          {orders.length}
        </span>
      </header>

      {/* Body */}
      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {/* Empty state */}
        {!hasOrders && (
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-neutral-700 text-center text-sm text-neutral-500">
            No active orders
          </div>
        )}

        {/* Orders */}
        {hasOrders &&
          orders.map((order) => (
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
    </section>
  );
});