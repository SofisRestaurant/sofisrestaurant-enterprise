// =============================================================================
// PATH: src/modules/orders/components/kitchen/KitchenHandoffModal.tsx
// =============================================================================

import { useCallback, useState } from 'react';
import { CheckCircle, ClipboardList, User, X } from 'lucide-react';

import { KitchenEvidenceStrengthBar } from './KitchenEvidenceStrengthBar';
import type { KitchenHandoffModalProps } from './kitchen.types';

export function KitchenHandoffModal({ context, onConfirm, onCancel }: KitchenHandoffModalProps) {
  const [recipientName, setRecipientName] = useState('');
  const [handoffNotes, setHandoffNotes] = useState('');
  const [pinVerified, setPinVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isPickup = context.orderType === 'pickup';
  const isDelivery = context.orderType === 'delivery';

  const handleConfirm = useCallback(async (): Promise<void> => {
    setSubmitting(true);
    try {
      await onConfirm(context, recipientName, handoffNotes, pinVerified);
    } finally {
      setSubmitting(false);
    }
  }, [context, recipientName, handoffNotes, pinVerified, onConfirm]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kitchen-handoff-title"
        className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-6 w-6 text-green-400" />
            <h2 id="kitchen-handoff-title" className="text-xl font-bold">
              {isPickup ? 'Confirm Pickup' : isDelivery ? 'Confirm Delivery' : 'Confirm Handoff'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-white"
            aria-label="Cancel handoff"
            disabled={submitting}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {isPickup || isDelivery ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-300">
                <User className="mr-1 inline h-3.5 w-3.5" />
                {isPickup ? 'Picked up by' : 'Received by'}
                <span className="ml-1 text-neutral-500">(optional but strongly recommended)</span>
              </label>
              <input
                type="text"
                value={recipientName}
                onChange={(event) => setRecipientName(event.target.value)}
                placeholder={isPickup ? 'Customer name' : 'Recipient name'}
                maxLength={200}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-orange-500 focus:outline-none"
              />
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">
              <ClipboardList className="mr-1 inline h-3.5 w-3.5" />
              Handoff notes
              <span className="ml-1 text-neutral-500">(optional)</span>
            </label>
            <textarea
              value={handoffNotes}
              onChange={(event) => setHandoffNotes(event.target.value)}
              placeholder="e.g. Left at front desk, Customer showed ID..."
              maxLength={500}
              rows={2}
              className="w-full resize-none rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-orange-500 focus:outline-none"
            />
          </div>

          {isPickup ? (
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-3">
              <input
                type="checkbox"
                checked={pinVerified}
                onChange={(event) => setPinVerified(event.target.checked)}
                className="h-4 w-4 accent-orange-500"
              />
              <span className="text-sm text-neutral-300">Customer PIN verified at handoff</span>
            </label>
          ) : null}
        </div>

        <KitchenEvidenceStrengthBar
          orderType={context.orderType}
          hasRecipient={recipientName.trim().length > 0}
          hasPinVerified={pinVerified}
          hasNotes={handoffNotes.trim().length > 0}
        />

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 py-3 font-semibold text-neutral-300 transition-colors hover:bg-neutral-700"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              void handleConfirm();
            }}
            disabled={submitting}
            className="flex-1 rounded-lg bg-green-600 py-3 font-bold text-white transition-colors hover:bg-green-500 disabled:bg-neutral-700 disabled:text-neutral-500"
          >
            {submitting ? 'Saving...' : '✓ Confirm Handoff'}
          </button>
        </div>
      </div>
    </div>
  );
}