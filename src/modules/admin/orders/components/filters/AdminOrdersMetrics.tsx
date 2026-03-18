// =============================================================================
// PATH: src/modules/admin/orders/AdminOrdersMetrics.tsx
// =============================================================================
// Displays the four top-level KPI cards for the orders dashboard.
// Pure rendering — receives all values as props, no store access.
// =============================================================================

import { KPICard, MetricGrid } from '@/features/admin/ui/AdminPrimitives';
import { formatCurrency } from '@/utils/currency';
import { URGENT_PRIORITY_MINUTES } from '../../utils/admin-orders.constants';

interface Props {
  queueCount: number;
  newCount: number;
  preparingCount: number;
  readyCount: number;
  overdueCount: number;
  paidRevenueCents: number;
  lastUpdatedLabel: string;
}

export function AdminOrdersMetrics({
  queueCount,
  newCount,
  preparingCount,
  readyCount,
  overdueCount,
  paidRevenueCents,
  lastUpdatedLabel,
}: Props) {
  return (
    <MetricGrid columns={4}>
      <KPICard
        label="Active Queue"
        value={queueCount}
        sub={`${newCount} new · ${preparingCount} cooking`}
        accent="amber"
        trend={queueCount > 0 ? 'up' : 'flat'}
        trendLabel="Live workload"
        icon="🧾"
      />
      <KPICard
        label="Ready for handoff"
        value={readyCount}
        sub="Pickup or dispatch now"
        accent="emerald"
        trend={readyCount > 0 ? 'up' : 'flat'}
        trendLabel="Ready staging lane"
        icon="✅"
      />
      <KPICard
        label="Overdue tickets"
        value={overdueCount}
        sub={`>${URGENT_PRIORITY_MINUTES} minutes old`}
        accent={overdueCount > 0 ? 'red' : 'slate'}
        trend={overdueCount > 0 ? 'down' : 'flat'}
        trendLabel={overdueCount > 0 ? 'Needs intervention' : 'No queue slippage'}
        icon="⏱️"
      />
      <KPICard
        label="Collected revenue"
        value={formatCurrency(paidRevenueCents / 100)}
        sub={`Last refresh ${lastUpdatedLabel}`}
        accent="sky"
        trend="flat"
        trendLabel="Paid orders only"
        icon="💳"
      />
    </MetricGrid>
  );
}