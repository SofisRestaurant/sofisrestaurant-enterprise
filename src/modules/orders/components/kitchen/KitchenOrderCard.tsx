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

  const now = Date.now();

  const pickupMs = order.pickup_time ? new Date(order.pickup_time).getTime() : null;

  const minutesUntil = pickupMs !== null ? Math.round((pickupMs - now) / 60_000) : null;

  const isUrgent = minutesUntil !== null && minutesUntil <= 15 && minutesUntil >= 0;

  const isPast = minutesUntil !== null && minutesUntil < 0;

  return (
    <div
      className={`rounded-xl border bg-neutral-900 p-4 ${
        isUrgent ? 'border-yellow-500' : isPast ? 'border-red-600' : 'border-neutral-800'
      }`}
    >
      {/* HEADER */}
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

      {/* 🕐 PICKUP TIME SECTION */}
      {order.pickup_time ? (
        <div
          className={`mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
            isPast
              ? 'bg-red-900/60 text-red-300'
              : isUrgent
                ? 'bg-yellow-900/60 text-yellow-300'
                : 'bg-neutral-800 text-neutral-300'
          }`}
        >
          <span>🕐</span>

          <span>
            Pickup{' '}
            {new Date(order.pickup_time).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>

          {minutesUntil !== null && (
            <span className="ml-auto text-xs font-normal opacity-75">
              {isPast
                ? `${Math.abs(minutesUntil)}m overdue`
                : minutesUntil === 0
                  ? 'now'
                  : `in ${minutesUntil}m`}
            </span>
          )}
        </div>
      ) : (
        <div className="mb-3 rounded-lg bg-neutral-800 px-3 py-1.5 text-xs text-neutral-500">
          ASAP
        </div>
      )}

      {/* ITEMS */}
      <KitchenOrderItemList items={order.cart_items} orderId={order.id} />

      {/* ACTION BUTTON */}
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