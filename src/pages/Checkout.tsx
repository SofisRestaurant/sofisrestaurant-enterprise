// =============================================================================
// src/pages/Checkout.tsx
// =============================================================================
// CHECKOUT PAGE — ENTERPRISE GRADE (PRODUCTION READY, 2026)
//
// Goals:
// - Canonical cents display everywhere (no dollars/cents mismatch)
// - Strict UI-only promo/credit selection (server authoritative)
// - Defensive rendering against cart-shape drift (never crashes on nullish)
// - Stable list keys (menuItemId + modifiers hash)
// - Shows line totals correctly (uses lineTotalCents if present, else recompute)
// - Accessibility + keyboard-friendly controls
// - Clear “estimated vs server-confirmed” messaging
//
// IMPORTANT:
// - Frontend NEVER calculates promo discount amounts.
// - Frontend NEVER finalizes tax/total (server/Stripe is source of truth).
// =============================================================================

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import CheckoutButton from '@/components/checkout/CheckoutButton';
import { useCart } from '@/hooks/useCart';
import { getAvailableCredits, type UserCredit } from '@/features/checkout/checkout.api';

import { computeLineTotalCents, cartItemKey } from '@/features/cart/cart.types';
import type { CartItem } from '@/features/cart/cart.types';
import { formatCents } from '@/features/cart/cart.utils';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type PromoState = {
  code: string;
  applied: boolean;
  error: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (safe + cents-canonical)
// ─────────────────────────────────────────────────────────────────────────────

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function normalizePromo(code: string): string {
  // allow letters/numbers/dash only; keep strict to reduce junk inputs
  return code
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 50);
}

function safeText(v: unknown, maxLen = 500): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function safeMoneyCents(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function stableCartKey(item: CartItem): string {
  // Ensures multiple items with same menuItemId but different modifiers don't collide.
  // cartItemKey already canonicalizes modifiers; we include it for safety.
  return `${item.menuItemId}:${cartItemKey(item.menuItemId, item.modifiers)}`;
}

function computeDisplayLineTotalCents(item: CartItem): number {
  // Prefer store-computed if present and sane; otherwise compute locally.
  const fromStore = safeMoneyCents(
    (item as unknown as { lineTotalCents?: unknown }).lineTotalCents,
  );
  if (fromStore > 0) return fromStore;
  return computeLineTotalCents({
    unitPriceCents: safeMoneyCents(item.unitPriceCents),
    modifiers: item.modifiers ?? [],
    quantity: clampInt(item.quantity, 1, 100),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function Checkout() {
  const navigate = useNavigate();
  const { items } = useCart();

  // Canonical subtotal in cents (never dollars)
  const subtotalCents = useMemo(() => {
    return items.reduce((sum, i) => sum + computeDisplayLineTotalCents(i), 0);
  }, [items]);

  const itemCount = useMemo(() => {
    return items.reduce((acc, i) => acc + clampInt(i.quantity, 0, 10_000), 0);
  }, [items]);

  // ── Promo state (UI only — server validates) ───────────────────────────────
  const [promo, setPromo] = useState<PromoState>({
    code: '',
    applied: false,
    error: null,
  });

  const onPromoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const code = normalizePromo(e.target.value);
    setPromo({ code, applied: false, error: null });
  }, []);

  const onPromoApply = useCallback(() => {
    if (!promo.code.trim()) return;
    setPromo((p) => ({ ...p, applied: true, error: null }));
  }, [promo.code]);

  const onPromoClear = useCallback(() => {
    setPromo({ code: '', applied: false, error: null });
  }, []);

  // ── Credits ────────────────────────────────────────────────────────────────
  const [credits, setCredits] = useState<UserCredit[]>([]);
  const [selectedCredit, setSelectedCredit] = useState<string | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setCreditsLoading(true);

    getAvailableCredits()
      .then((rows) => {
        if (!alive) return;
        // Defensive: ignore malformed rows
        const clean = (rows ?? []).filter((c) => typeof c?.id === 'string' && c.id.length > 0);
        setCredits(clean);
      })
      .catch(() => {
        if (!alive) return;
        setCredits([]);
      })
      .finally(() => {
        if (!alive) return;
        setCreditsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const creditsAvailableCents = useMemo(() => {
    return credits.reduce((sum, c) => sum + safeMoneyCents(c.amount_cents), 0);
  }, [credits]);

  const hasItems = items.length > 0;

  return (
    <main className="relative mx-auto w-full max-w-3xl px-4 py-10">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Checkout</h1>
        <p className="mt-1 text-sm text-gray-500">Review your order before secure payment.</p>
      </header>

      {/* Empty cart */}
      {!hasItems ? (
        <section className="rounded-2xl border border-dashed bg-white p-10 text-center">
          <p className="text-gray-600">Your cart is empty.</p>
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => navigate('/menu')}
              className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-700"
            >
              Browse Menu
            </button>
          </div>
        </section>
      ) : (
        <div className="space-y-4">
          {/* Order Summary */}
          <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="font-semibold">Order Summary</h2>
              <span className="text-sm text-gray-500">
                {itemCount} item{itemCount !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="divide-y">
              {items.map((item) => {
                const notes = safeText(item.notes, 500);
                const lineTotalCents = computeDisplayLineTotalCents(item);

                return (
                  <div
                    key={stableCartKey(item)}
                    className="flex items-start justify-between gap-4 px-6 py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {item.name}{' '}
                        <span className="text-gray-500">× {clampInt(item.quantity, 1, 100)}</span>
                      </p>

                      {/* Modifiers */}
                      {item.modifiers?.length ? (
                        <ul className="mt-1 space-y-0.5 text-xs text-gray-500">
                          {item.modifiers.map((m) => (
                            <li key={`${m.groupId}:${m.id}`} className="truncate">
                              • {m.name}
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      {/* Notes */}
                      {notes ? <p className="mt-1 text-xs text-gray-500">{notes}</p> : null}
                    </div>

                    <div className="shrink-0 text-right font-semibold tabular-nums">
                      {formatCents(lineTotalCents)}
                      <div className="mt-0.5 text-[11px] font-normal text-gray-400">
                        {formatCents(safeMoneyCents(item.unitPriceCents))} ea
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Totals: only subtotal is client-side; everything else is server/Stripe */}
            <div className="space-y-2 border-t bg-gray-50 px-6 py-5 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatCents(subtotalCents)}</span>
              </div>

              <div className="flex justify-between text-gray-400">
                <span>Discount</span>
                <span className="text-xs italic">Applied at payment</span>
              </div>

              <div className="flex justify-between text-gray-400">
                <span>Tax</span>
                <span className="text-xs italic">Calculated on final total</span>
              </div>

              <div className="flex justify-between border-t pt-3 text-lg font-bold">
                <span>Total</span>
                <span className="tabular-nums text-primary">{formatCents(subtotalCents)}</span>
              </div>

              <p className="pt-1 text-center text-[11px] text-gray-400">
                Final total confirmed by Stripe — includes tax, promotions, and credits.
              </p>
            </div>
          </section>

          {/* Promo Code */}
          <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="font-semibold">Promo Code</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Discounts are verified and applied by the server at checkout.
              </p>
            </div>

            <div className="px-6 py-4">
              {promo.applied ? (
                <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-emerald-700">✓ {promo.code}</span>
                    <span className="text-xs text-emerald-600">queued</span>
                  </div>
                  <button
                    type="button"
                    onClick={onPromoClear}
                    className="text-xs text-gray-400 underline hover:text-gray-600"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={promo.code}
                    onChange={onPromoChange}
                    placeholder="ENTER CODE"
                    inputMode="text"
                    autoCapitalize="characters"
                    autoComplete="off"
                    maxLength={50}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 font-mono text-sm uppercase tracking-wider outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                  />
                  <button
                    type="button"
                    onClick={onPromoApply}
                    disabled={!promo.code.trim()}
                    className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Apply
                  </button>
                </div>
              )}

              {promo.error ? (
                <p className="mt-2 text-xs font-medium text-red-600">{promo.error}</p>
              ) : null}
            </div>
          </section>

          {/* Loyalty Credits */}
          {!creditsLoading && credits.length > 0 ? (
            <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
              <div className="border-b px-6 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Loyalty Credits</h2>
                  <span className="text-sm font-semibold text-amber-600 tabular-nums">
                    {formatCents(creditsAvailableCents)} available
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">
                  Credits are applied by the server — final balance confirmed at payment.
                </p>
              </div>

              <div className="divide-y px-6">
                {credits.map((credit) => {
                  const amt = safeMoneyCents(credit.amount_cents);
                  const exp = safeText(credit.expires_at, 64);

                  return (
                    <label key={credit.id} className="flex cursor-pointer items-center gap-3 py-3">
                      <input
                        type="radio"
                        name="credit"
                        value={credit.id}
                        checked={selectedCredit === credit.id}
                        onChange={() => setSelectedCredit(credit.id)}
                        className="h-4 w-4 text-amber-500 focus:ring-amber-500"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-800 tabular-nums">
                          {formatCents(amt)} credit
                        </p>
                        <p className="text-xs capitalize text-gray-500">
                          {String(credit.source ?? '').replace(/_/g, ' ') || 'credit'}
                          {exp ? (
                            <>
                              {' '}
                              · Expires{' '}
                              {new Date(exp).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </>
                          ) : null}
                        </p>
                      </div>
                      {selectedCredit === credit.id ? (
                        <span className="text-xs font-bold text-amber-600">Selected</span>
                      ) : null}
                    </label>
                  );
                })}

                {selectedCredit ? (
                  <div className="py-3">
                    <button
                      type="button"
                      onClick={() => setSelectedCredit(null)}
                      className="text-xs text-gray-400 underline hover:text-gray-600"
                    >
                      Remove credit
                    </button>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {/* Payment */}
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
