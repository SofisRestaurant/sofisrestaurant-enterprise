// =============================================================================
// PATH: src/modules/admin/orders/AdminOrdersMobileList.tsx
// =============================================================================
// Mobile-only stacked card list. Hidden on md+ screens.
// Delegates per-row rendering to AdminOrderCard.
// =============================================================================

import type { AdminOrder } from '../../types/admin-orders.types';
import { AdminOrderCard } from '../detail/AdminOrderCard';

interface Props {
  orders: AdminOrder[];
  onSelect: (id: string) => void;
}

export function AdminOrdersMobileList({ orders, onSelect }: Props) {
  return (
    <div className="md:hidden">
      <div className="space-y-3 p-4">
        {orders.map((order) => (
          <AdminOrderCard key={order.id} order={order} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}