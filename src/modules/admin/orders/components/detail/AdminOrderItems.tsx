import { Panel } from '@/features/admin/ui/AdminPrimitives';
import { formatCurrency } from '@/utils/currency';
import type { CartItem } from '../../types/admin-orders.types';
import { cartItemKey } from '@/modules/cart/types/cart.types';

interface Props {
  items: CartItem[];
}

export function AdminOrderItems({ items }: Props) {
  if (items.length === 0) {
    return (
      <Panel title="Items" className="mt-5">
        <p className="text-sm text-zinc-500">
          No cart items were stored on this order.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Items" className="mt-5">
      <div className="space-y-2">
        {items.map((item) => {
          const key = cartItemKey(item.menuItemId, item.modifiers ?? []);

          return (
            <div
              key={key}
              className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2.5"
              aria-label={`${item.quantity} × ${item.name}`}
            >
              <div>
                <div className="text-sm font-semibold text-zinc-100">{item.name}</div>
                <div className="text-xs text-zinc-500">{item.quantity} × item</div>
              </div>
              <div className="text-sm font-semibold text-zinc-100">
                {formatCurrency((item.unitPriceCents * item.quantity) / 100)}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}