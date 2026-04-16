// src/modules/cart/components/CartFooter.tsx
// =============================================================================
// Checkout footer strip.
//
// Owns:
//   • Gold CTA button with animated shimmer sweep
//   • Loyalty-points earn callout
//   • Clear-cart confirmation flow (two-step)
//
// Props are intentionally explicit — no store access inside this component.
// All data and callbacks are threaded in from CartDrawer so this file stays
// a pure presentational unit.
// =============================================================================

import type { useCartSummary } from '@/domain/cart/use-cart-summary';

// ─── Types ────────────────────────────────────────────────────────────────────

type SummaryTotals = ReturnType<typeof useCartSummary>['totals'];

export interface CartFooterProps {
  totals: SummaryTotals;
  /** Loyalty points the user will earn on this order (pts = floor(subtotal / 100)). */
  pts: number;
  /** Whether the two-step clear-cart confirmation is currently visible. */
  confirmClear: boolean;
  setConfirmClear: (v: boolean) => void;
  clearFn: () => void;
  onCheckout: () => void;
}

// ─── Formatting helper (local — mirrors CartLineItem's copy) ──────────────────

const fmt = (c: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Math.max(0, Number.isFinite(c) ? c : 0) / 100);

// ─── Component ────────────────────────────────────────────────────────────────

export function CartFooter({
  totals,
  pts,
  confirmClear,
  setConfirmClear,
  clearFn,
  onCheckout,
}: CartFooterProps) {
  return (
    <div
      className="shrink-0 px-4 pt-3"
      style={{
        background: '#fff',
        borderTop: '1px solid #ede0ce',
        paddingBottom: 'max(1.25rem,env(safe-area-inset-bottom))',
      }}
    >
      {/* ── CTA: Checkout button with shimmer sweep ── */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onCheckout();
        }}
        className="relative w-full overflow-hidden rounded-2xl py-4 text-sm font-black tracking-wide transition-all active:scale-[0.98]"
        style={{
          background: 'linear-gradient(135deg,#d4af37 0%,#e8c46a 50%,#c9a42e 100%)',
          color: '#1c1915',
          boxShadow: '0 4px 20px rgba(212,175,55,0.4),0 2px 8px rgba(212,175,55,0.25)',
          letterSpacing: '0.025em',
        }}
        aria-label={`Checkout — ${fmt(totals.totalCents)}`}
      >
        {/* Static highlight edge along the top of the button */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.6),transparent)',
          }}
        />

        {/* Animated shimmer sweep — runs on a 2.8 s loop */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 -left-full w-1/2"
          style={{
            background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.22),transparent)',
            animation: 'cart-shimmer 2.8s ease-in-out infinite',
          }}
        />

        {/* Keyframes live here so they are scoped to this component's render */}
        <style>{`
          @keyframes cart-shimmer {
            0%   { transform: translateX(0); }
            60%  { transform: translateX(600%); }
            100% { transform: translateX(600%); }
          }
        `}</style>

        <span className="relative flex items-center justify-center gap-2.5">
          {/* Credit-card icon */}
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
          Checkout · {fmt(totals.totalCents)}
        </span>
      </button>

      {/* ── Loyalty earn callout ── */}
      {pts > 0 && (
        <p className="mt-2 text-center text-[11px]" style={{ color: '#a89060' }}>
          ✨ Earn <strong>+{pts} loyalty points</strong> on this order
        </p>
      )}

      {/* ── Clear-cart (two-step confirmation) ── */}
      <div className="mt-3 flex justify-center" style={{ minHeight: '1.5rem' }}>
        {!confirmClear ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmClear(true);
            }}
            className="text-xs hover:underline"
            style={{ color: '#c0a888' }}
          >
            Clear cart
          </button>
        ) : (
          <div className="flex items-center gap-3 text-xs">
            <span style={{ color: '#8a7a6a' }}>Remove all items?</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clearFn();
                setConfirmClear(false);
              }}
              className="font-bold"
              style={{ color: '#c05030' }}
            >
              Yes, clear
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmClear(false);
              }}
              style={{ color: '#8a7a6a' }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}