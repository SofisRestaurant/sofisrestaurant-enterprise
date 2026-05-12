// src/modules/orders/pages/order-success/OrderSuccessStates.tsx
// Terminal and transitional state display components for the OrderSuccess page.
// Each component is stateless — all data is passed via props or is self-contained.

import { Link } from 'react-router-dom';

// ---------------------------------------------------------------------------
// LoadingState
// ---------------------------------------------------------------------------

export function LoadingState({ attempt }: { attempt: number }) {
  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <div className="absolute inset-0 animate-ping rounded-full bg-amber-500/20" />
        <div className="absolute inset-2 animate-pulse rounded-full bg-amber-500/10" />
        <span className="relative text-3xl">🧾</span>
      </div>
      <div>
        <p className="text-lg font-semibold text-white">
          {attempt > 5 ? 'Almost there…' : 'Confirming your order'}
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          {attempt > 5
            ? 'Payment received — finalizing details.'
            : 'Verifying payment with Stripe.'}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ErrorState
// ---------------------------------------------------------------------------

export function ErrorState() {
  return (
    <div className="space-y-4 text-center">
      <div className="flex justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 ring-1 ring-red-500/20">
          <span className="text-2xl">⚠</span>
        </div>
      </div>
      <div>
        <h2 className="text-lg font-bold text-white">Something went wrong</h2>
        <p className="mt-1 text-sm text-neutral-500">Your payment may still have been processed.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Link
          to="/account/orders"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/8 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/12"
        >
          Check My Orders
        </Link>
        <Link
          to="/menu"
          className="text-sm text-neutral-600 underline underline-offset-2 hover:text-neutral-400"
        >
          Return to menu
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TimeoutState
// ---------------------------------------------------------------------------

export function TimeoutState() {
  return (
    <div className="space-y-4 text-center">
      <div className="flex justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-yellow-500/10 ring-1 ring-yellow-500/20">
          <span className="text-2xl">⏱</span>
        </div>
      </div>
      <div>
        <h2 className="text-lg font-bold text-white">Taking longer than usual</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Your payment was received. The order is being finalized.
        </p>
      </div>
      <Link
        to="/account/orders"
        className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-2.5 text-sm font-semibold text-amber-400 transition hover:bg-amber-500/15"
      >
        View My Orders
      </Link>
    </div>
  );
}