// =============================================================================
// PATH: src/modules/admin/orders/AdminOrdersSkeleton.tsx
// =============================================================================
// Loading skeleton displayed while the initial orders fetch is in-flight.
// =============================================================================

import { SkeletonBlock } from '@/features/admin/ui/AdminPrimitives';

export function AdminOrdersSkeleton() {
  return (
    <div className="space-y-3 p-4">
      <SkeletonBlock height={72} className="rounded-2xl" />
      <SkeletonBlock height={72} className="rounded-2xl" />
      <SkeletonBlock height={72} className="rounded-2xl" />
    </div>
  );
}