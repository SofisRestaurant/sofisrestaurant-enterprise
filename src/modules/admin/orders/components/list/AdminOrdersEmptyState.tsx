// =============================================================================
// PATH: src/modules/admin/orders/AdminOrdersEmptyState.tsx
// =============================================================================
// Rendered when the filtered order list is empty.
// =============================================================================

import { EmptyState } from '@/features/admin/ui/AdminPrimitives';

export function AdminOrdersEmptyState() {
  return (
    <div className="p-4">
      <EmptyState
        title="No matching orders"
        description="Adjust filters or search terms to find a ticket."
        icon="📋"
      />
    </div>
  );
}