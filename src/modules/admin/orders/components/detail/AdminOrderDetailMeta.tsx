// =============================================================================
// PATH: src/modules/admin/orders/AdminOrderDetailMeta.tsx
// =============================================================================
// 2×2 metadata grid inside the order detail drawer.
// Shows: order id, created at, customer details, Stripe payment intent.
// =============================================================================

import type { AdminOrder } from '../../types/admin-orders.types';

interface Props {
  order: AdminOrder;
}

function MetaCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">{label}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function AdminOrderDetailMeta({ order }: Props) {
  return (
    <div className="mt-5 grid grid-cols-2 gap-3">
      <MetaCell label="Order id">
        <span className="break-all text-sm font-semibold text-zinc-100">{order.id}</span>
      </MetaCell>

      <MetaCell label="Created">
        <span className="text-sm font-semibold text-zinc-100">
          {new Date(order.createdAt).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </MetaCell>

      <MetaCell label="Customer">
        <span className="text-sm font-semibold text-zinc-100">
          {order.customerName ?? 'Guest'}
        </span>
        <p className="mt-1 text-xs text-zinc-500">
          {order.customerEmail ?? order.customerPhone ?? 'No contact provided'}
        </p>
      </MetaCell>

      <MetaCell label="Payment intent">
        <span className="break-all text-sm font-semibold text-zinc-100">
          {order.stripePaymentIntentId ?? '—'}
        </span>
      </MetaCell>
    </div>
  );
}