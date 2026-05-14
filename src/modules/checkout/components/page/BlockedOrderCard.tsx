// src/modules/checkout/components/page/BlockedOrderCard.tsx

import { ShieldOff, X } from 'lucide-react';

export function BlockedOrderCard({ onReset }: { onReset: () => void }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4">
      <div className="flex items-start gap-3">
        <ShieldOff className="h-5 w-5 shrink-0 text-red-500 mt-0.5" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-red-800">Order could not be processed</p>
          <p className="mt-1 text-xs text-red-600">
            This order was flagged by our security system. If you believe this is an error,
            please{' '}
            <a
              href="mailto:sofisrestaurante@gmail.com"
              className="underline font-medium hover:text-red-800"
            >
              contact support
            </a>
            .
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="shrink-0 text-red-400 hover:text-red-700 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}