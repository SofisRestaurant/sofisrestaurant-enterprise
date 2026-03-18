// =============================================================================
// PATH: src/modules/admin/orders/AdminOrdersLiveRegion.tsx
// =============================================================================
// Invisible ARIA live region that announces real-time order events to
// assistive technologies. Renders nothing visible.
// =============================================================================

interface Props {
  announcement: string;
  lastUpdatedLabel: string;
}

export function AdminOrdersLiveRegion({ announcement, lastUpdatedLabel }: Props) {
  return (
    <div className="sr-only" aria-live="polite">
      {announcement || `Orders page refreshed at ${lastUpdatedLabel}.`}
    </div>
  );
}