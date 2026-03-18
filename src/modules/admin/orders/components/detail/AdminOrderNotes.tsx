// =============================================================================
// PATH: src/modules/admin/orders/AdminOrderNotes.tsx
// =============================================================================
// Renders the kitchen notes panel when the order has notes.
// Returns null when notes is empty — the parent does not need to gate this.
// =============================================================================

import { Panel } from '@/features/admin/ui/AdminPrimitives';

interface Props {
  notes: string | null;
}

export function AdminOrderNotes({ notes }: Props) {
  if (!notes) return null;

  return (
    <Panel title="Notes" className="mt-5">
      <p className="text-sm leading-6 text-zinc-200">{notes}</p>
    </Panel>
  );
}