// =============================================================================
// PATH: src/modules/admin/orders/AdminOrderFinancials.tsx
// =============================================================================
// Displays the financial breakdown (subtotal, tax, total) for an order.
// =============================================================================

import { Panel } from '@/features/admin/ui/AdminPrimitives';
import { formatCurrency } from '@/utils/currency';
import type { AdminOrder } from '../../types/admin-orders.types';

interface Props {
  order: AdminOrder;
}

function FinancialCell({ label, valueCents, prominent }: { label: string; valueCents: number; prominent?: boolean }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 text-center">
      <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">{label}</div>
      <div className={['mt-2 text-lg font-black', prominent ? 'text-white' : 'text-zinc-100'].join(' ')}>
        {formatCurrency(valueCents / 100)}
      </div>
    </div>
  );
}

export function AdminOrderFinancials({ order }: Props) {
  return (
    <Panel title="Financials" className="mt-5">
      <div className="grid grid-cols-3 gap-3">
        <FinancialCell label="Subtotal" valueCents={order.amountSubtotalCents} />
        <FinancialCell label="Tax"      valueCents={order.amountTaxCents} />
        <FinancialCell label="Total"    valueCents={order.amountTotalCents} prominent />
      </div>
    </Panel>
  );
}