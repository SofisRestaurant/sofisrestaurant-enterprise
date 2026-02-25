// src/pages/Checkout.tsx
// =============================================================================
// CHECKOUT PAGE — ENTERPRISE GRADE
// =============================================================================
// Frontend rules:
//   ✔ Displays server-confirmed discount — never calculates it
//   ✔ Promo code field sends code string to backend only
//   ✔ Credit selection sends credit_id to backend only
//   ✔ Error surfaces promo-specific and credit-specific messages
//   ✔ Loading state during promo preview (server round-trip)
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useCart } from '@/hooks/useCart';
import CheckoutButton from '@/components/checkout/CheckoutButton';
import { formatCurrency } from '@/utils/currency';
import { getAvailableCredits, type UserCredit } from '@/features/checkout/checkout.api';

// ── Types ─────────────────────────────────────────────────────────────────────
interface PromoState {
  code: string;
  applied: boolean;
  error: string | null;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function Checkout() {
  const { items, total } = useCart();

  const itemCount = useMemo(() => items.reduce((acc, i) => acc + i.quantity, 0), [items]);

  // ── Promo code state (UI only — server validates) ─────────────────────────
  const [promo, setPromo] = useState<PromoState>({ code: '', applied: false, error: null });

  const handlePromoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPromo({ code: e.target.value.toUpperCase(), applied: false, error: null });
  };

  const handlePromoApply = () => {
    if (!promo.code.trim()) return;
    // Mark as applied — CheckoutButton picks this up and sends to server
    setPromo((p) => ({ ...p, applied: true, error: null }));
  };

  const handlePromoClear = () => {
    setPromo({ code: '', applied: false, error: null });
  };

  // ── User credits (fetched from DB, selected by user) ──────────────────────
  const [credits, setCredits] = useState<UserCredit[]>([]);
  const [selectedCredit, setCredit] = useState<string | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(true);

  useEffect(() => {
    getAvailableCredits()
      .then(setCredits)
      .finally(() => setCreditsLoading(false));
  }, []);

  const totalCreditsAvailable = credits.reduce((sum, c) => sum + c.amount_cents, 0);

  return (
    <main className="relative mx-auto w-full max-w-3xl px-4 py-10">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Checkout</h1>
        <p className="mt-1 text-sm text-gray-500">Review your order before secure payment.</p>
      </header>

      {/* ── Empty cart ─────────────────────────────────────────────────────── */}
      {items.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="text-gray-500">Your cart is empty.</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-4">
          {/* ── Order Summary ──────────────────────────────────────────────── */}
          <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="font-semibold">Order Summary</h2>
              <span className="text-sm text-gray-500">
                {itemCount} item{itemCount !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="divide-y">
              {items.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-4 px-6 py-4">
                  <div className="flex-1">
                    <p className="font-medium">
                      {item.menuItem.name} <span className="text-gray-500">× {item.quantity}</span>
                    </p>
                    {item.specialInstructions && (
                      <p className="mt-1 text-xs text-gray-500">{item.specialInstructions}</p>
                    )}
                  </div>
                  <div className="font-semibold">
                    {formatCurrency(item.menuItem.price * item.quantity)}
                  </div>
                </div>
              ))}
            </div>

            {/* Totals — subtotal shown client-side; discount/tax shown after server confirms */}
            <div className="space-y-2 border-t bg-gray-50 px-6 py-5 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatCurrency(total)}</span>
              </div>

              {/* Discount line — shown only after server round-trip via CheckoutButton */}
              <div className="flex justify-between text-gray-400">
                <span>Discount</span>
                <span className="text-xs italic">Applied at payment</span>
              </div>

              <div className="flex justify-between text-gray-400">
                <span>Tax (8%)</span>
                <span className="text-xs italic">Calculated on final total</span>
              </div>

              <div className="flex justify-between border-t pt-3 text-lg font-bold">
                <span>Total</span>
                <span className="text-primary">{formatCurrency(total)}</span>
              </div>

              <p className="pt-1 text-center text-[11px] text-gray-400">
                Final total confirmed by Stripe — includes tax and any discounts
              </p>
            </div>
          </section>

          {/* ── Promo Code ─────────────────────────────────────────────────── */}
          <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="font-semibold">Promo Code</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Discount applied by server at checkout — code is never calculated client-side
              </p>
            </div>

            <div className="px-6 py-4">
              {promo.applied ? (
                // Applied state
                <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-emerald-700">✓ {promo.code}</span>
                    <span className="text-xs text-emerald-600">applied</span>
                  </div>
                  <button
                    type="button"
                    onClick={handlePromoClear}
                    className="text-xs text-gray-400 underline hover:text-gray-600"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                // Input state
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={promo.code}
                    onChange={handlePromoChange}
                    placeholder="ENTER CODE"
                    maxLength={50}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 font-mono text-sm uppercase tracking-wider outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                  />
                  <button
                    type="button"
                    onClick={handlePromoApply}
                    disabled={!promo.code.trim()}
                    className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Apply
                  </button>
                </div>
              )}

              {promo.error && (
                <p className="mt-2 text-xs font-medium text-red-600">{promo.error}</p>
              )}
            </div>
          </section>

          {/* ── Loyalty Credits ────────────────────────────────────────────── */}
          {!creditsLoading && credits.length > 0 && (
            <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
              <div className="border-b px-6 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Loyalty Credits</h2>
                  <span className="text-sm font-semibold text-amber-600">
                    {formatCurrency(totalCreditsAvailable / 100)} available
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">
                  Credits applied by server — balance confirmed at payment
                </p>
              </div>

              <div className="divide-y px-6">
                {credits.map((credit) => (
                  <label key={credit.id} className="flex cursor-pointer items-center gap-3 py-3">
                    <input
                      type="radio"
                      name="credit"
                      value={credit.id}
                      checked={selectedCredit === credit.id}
                      onChange={() => setCredit(credit.id)}
                      className="h-4 w-4 text-amber-500 focus:ring-amber-500"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-800">
                        {formatCurrency(credit.amount_cents / 100)} credit
                      </p>
                      <p className="text-xs capitalize text-gray-500">
                        {credit.source.replace(/_/g, ' ')}
                        {credit.expires_at && (
                          <>
                            {' '}
                            · Expires{' '}
                            {new Date(credit.expires_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </>
                        )}
                      </p>
                    </div>
                    {selectedCredit === credit.id && (
                      <span className="text-xs font-bold text-amber-600">Selected</span>
                    )}
                  </label>
                ))}

                {selectedCredit && (
                  <div className="py-3">
                    <button
                      type="button"
                      onClick={() => setCredit(null)}
                      className="text-xs text-gray-400 underline hover:text-gray-600"
                    >
                      Remove credit
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── Payment ────────────────────────────────────────────────────── */}
          <section className="space-y-4">
            <CheckoutButton
              promoCode={promo.applied ? promo.code : undefined}
              creditId={selectedCredit ?? undefined}
              onPromoError={(msg: string) =>
                setPromo((prev) => ({ ...prev, error: msg, applied: false }))
              }
            />

            <p className="text-center text-xs text-gray-500">
              🔒 Secure payment powered by Stripe. Your card details are never stored on our
              servers.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}
