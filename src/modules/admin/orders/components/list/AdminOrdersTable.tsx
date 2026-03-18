// =============================================================================
// PATH: src/modules/admin/orders/AdminOrdersTable.tsx
// =============================================================================
// Desktop-only table view of orders. Hidden on mobile.
// Delegates per-row rendering to AdminOrderRow — no logic lives here.
// =============================================================================

import { Table } from '@/features/admin/ui/AdminPrimitives';
import type { AdminOrder } from '../../types/admin-orders.types';
import { AdminOrderRow } from '../AdminOrderRow';

interface Props {
  orders: AdminOrder[];
  onSelect: (id: string) => void;
}

export function AdminOrdersTable({ orders, onSelect }: Props) {
  return (
    <div className="hidden md:block">
      <Table dense>
        <thead className="bg-zinc-950/80 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
          <tr>
            <th className="px-4 py-3 font-semibold">Order</th>
            <th className="px-4 py-3 font-semibold">Customer</th>
            <th className="px-4 py-3 font-semibold">Type</th>
            <th className="px-4 py-3 font-semibold">Age</th>
            <th className="px-4 py-3 font-semibold">Payment</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold">Total</th>
            <th className="px-4 py-3 font-semibold">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {orders.map((order) => (
            <AdminOrderRow key={order.id} order={order} onSelect={onSelect} />
          ))}
        </tbody>
      </Table>
    </div>
  );
}