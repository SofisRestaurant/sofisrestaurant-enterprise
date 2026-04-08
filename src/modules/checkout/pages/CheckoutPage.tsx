// src/modules/checkout/pages/CheckoutPage.tsx
// =============================================================================
// CHECKOUT PAGE — ENTERPRISE GRADE (PRODUCTION READY, 2026) — MAX UX + SAFE
//
// Security guarantees preserved:
// - Frontend NEVER calculates promo discount amounts.
// - Frontend NEVER finalizes tax/total (server/Stripe is source of truth).
// - Defensive rendering against cart-shape drift (never crashes on nullish).
// - Canonical cents display everywhere (no dollars/cents mismatch).
//
// Loyalty additions (2026):
// - getLoyaltyAccount() fetches live balance + accountId from loyalty-account fn
// - RewardsRedeem toggle lets user select points to redeem
// - loyaltyIntent passed to CheckoutButton → useCheckout → edge function
// - Server caps, validates, and atomically reserves before Stripe session
// =============================================================================

import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { useNavigate, Link } from 'react-router-dom';

import CheckoutButton from '@/modules/checkout/components/CheckoutButton';
import { PhoneVerification } from '@/modules/checkout/components/PhoneVerification';
import {
  RewardsRedeem,
  type LoyaltyRedeemValue,
} from '@/modules/checkout/components/RewardsRedeem';
import { useCart } from '@/modules/cart/hooks/useCart';
import {
  getAvailableCredits,
  getLoyaltyProfile,
  calculatePointsPreview,
  type UserCredit,
  type LoyaltyProfile,
  type LoyaltyPreview,
} from '@/modules/checkout/api/checkout.api';
import { useUserContext } from '@/contexts/useUserContext';
import { supabase } from '@/lib/supabase/supabaseClient';

import { computeLineTotalCents, cartItemKey } from '@/modules/cart/types/cart.types';
import type { CartItem } from '@/modules/cart/types/cart.types';
import { formatCents } from '@/modules/cart/utils/cart.utils';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type PromoState = {
  code: string;
  applied: boolean;
  error: string | null;
};

type OrderType = 'pickup' | 'delivery' | 'dine_in';

type OrderDetailsState = {
  orderType: OrderType;
  notes: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE = {
  CHECKOUT_ORDER_TYPE: 'sofis.checkout.orderType.v1',
  CHECKOUT_NOTES: 'sofis.checkout.notes.v1',
  CHECKOUT_PROMO: 'sofis.checkout.promo.v1',
  CHECKOUT_CREDIT: 'sofis.checkout.credit.v1',
} as const;

const LIMITS = {
  NOTES_MAX: 600,
  PROMO_MAX: 50,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (safe + cents-canonical) — identical to original
// ─────────────────────────────────────────────────────────────────────────────

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function normalizePromo(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, LIMITS.PROMO_MAX);
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
  return `${item.menuItemId}:${cartItemKey(item.menuItemId, item.modifiers)}`;
}

function computeDisplayLineTotalCents(item: CartItem): number {
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

function formatOrderTypeLabel(t: OrderType): string {
  return t === 'pickup' ? 'Pickup' : t === 'delivery' ? 'Delivery' : 'Dine-in';
}

function safeLocalGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function safeLocalRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Loyalty account fetch
// Calls the loyalty-account edge function which handles auth internally.
// Returns { accountId, balance } — the two values RewardsRedeem needs.
// ─────────────────────────────────────────────────────────────────────────────

async function getLoyaltyAccount(): Promise<{
  accountId: string;
  balance: number;
  lastRedeemAt: string | null;
} | null> {
  try {
    const { data, error } = await supabase.functions.invoke('loyalty-account');
    if (error || !data?.ok || !data?.account?.id) return null;
    return {
      accountId: String(data.account.id),
      balance: typeof data.account.balance === 'number' ? data.account.balance : 0,
      lastRedeemAt:
        typeof data.account.last_redeem_at === 'string' ? data.account.last_redeem_at : null,
    };
  } catch {
    return null;
  }
}
// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { items } = useCart();
  const { isAuthenticated } = useUserContext();

  const hasItems = Array.isArray(items) && items.length > 0;

  const subtotalCents = useMemo(() => {
    if (!hasItems) return 0;
    return items.reduce((sum, i) => sum + computeDisplayLineTotalCents(i), 0);
  }, [items, hasItems]);

  const estimatedTaxCents = useMemo(() => Math.round(subtotalCents * 0.095), [subtotalCents]);
  const estimatedTotalCents = useMemo(
    () => subtotalCents + estimatedTaxCents,
    [subtotalCents, estimatedTaxCents],
  );

  const itemCount = useMemo(() => {
    if (!hasItems) return 0;
    return items.reduce((acc, i) => acc + clampInt(i.quantity, 0, 10_000), 0);
  }, [items, hasItems]);

  // ── Order details ──────────────────────────────────────────────────────────
  const [orderDetails, setOrderDetails] = useState<OrderDetailsState>(() => {
    const storedType = safeLocalGet(STORAGE.CHECKOUT_ORDER_TYPE);
    const storedNotes = safeLocalGet(STORAGE.CHECKOUT_NOTES);
    const t: OrderType =
      storedType === 'pickup' || storedType === 'delivery' || storedType === 'dine_in'
        ? storedType
        : 'pickup';
    const notes = typeof storedNotes === 'string' ? storedNotes.slice(0, LIMITS.NOTES_MAX) : '';
    return { orderType: t, notes };
  });

  useEffect(() => {
    safeLocalSet(STORAGE.CHECKOUT_ORDER_TYPE, orderDetails.orderType);
  }, [orderDetails.orderType]);

  useEffect(() => {
    if (!orderDetails.notes) safeLocalRemove(STORAGE.CHECKOUT_NOTES);
    else safeLocalSet(STORAGE.CHECKOUT_NOTES, orderDetails.notes);
  }, [orderDetails.notes]);

  // ── Promo ──────────────────────────────────────────────────────────────────
  const [promo, setPromo] = useState<PromoState>(() => {
    const stored = safeLocalGet(STORAGE.CHECKOUT_PROMO);
    const code = stored ? normalizePromo(stored) : '';
    return { code, applied: false, error: null };
  });

  const onPromoChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const code = normalizePromo(e.target.value);
    setPromo({ code, applied: false, error: null });
    if (code) safeLocalSet(STORAGE.CHECKOUT_PROMO, code);
    else safeLocalRemove(STORAGE.CHECKOUT_PROMO);
  }, []);

  const onPromoApply = useCallback(() => {
    if (!promo.code.trim()) return;
    setPromo((p) => ({ ...p, applied: true, error: null }));
  }, [promo.code]);

  const onPromoClear = useCallback(() => {
    setPromo({ code: '', applied: false, error: null });
    safeLocalRemove(STORAGE.CHECKOUT_PROMO);
  }, []);

  const onPromoKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onPromoApply();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onPromoClear();
      }
    },
    [onPromoApply, onPromoClear],
  );

  // ── Credits ────────────────────────────────────────────────────────────────
  const [credits, setCredits] = useState<UserCredit[]>([]);
  const [selectedCredit, setSelectedCredit] = useState<string | null>(() => {
    const stored = safeLocalGet(STORAGE.CHECKOUT_CREDIT);
    return stored && typeof stored === 'string' ? stored : null;
  });
  const [creditsLoading, setCreditsLoading] = useState(true);
  const [creditsError, setCreditsError] = useState<string | null>(null);

  // ── Loyalty profile (points-to-earn preview) ───────────────────────────────
  const [loyaltyProfile, setLoyaltyProfile] = useState<LoyaltyProfile | null>(null);
  const [loyaltyPreview, setLoyaltyPreview] = useState<LoyaltyPreview | null>(null);
  const [recentlyRedeemed, setRecentlyRedeemed] = useState(false);
  useEffect(() => {
    if (!isAuthenticated) return;
    let alive = true;
    void getLoyaltyProfile().then((p) => {
      if (alive) setLoyaltyProfile(p);
    });
    return () => {
      alive = false;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    setLoyaltyPreview(
      subtotalCents > 0 ? calculatePointsPreview(subtotalCents, loyaltyProfile) : null,
    );
  }, [subtotalCents, loyaltyProfile]);

  // ── Loyalty account (live balance + accountId for redemption) ──────────────
  // Fetched separately from the profile — needs loyalty_accounts.id and
  // the live balance from the ledger, not the denormalized profiles.points.
  const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  const [loyaltyAccountId, setLoyaltyAccountId] = useState('');

  useEffect(() => {
    if (!isAuthenticated) return;
    let alive = true;
    void getLoyaltyAccount().then((acct) => {
      if (!alive || !acct) return;
      setLoyaltyBalance(acct.balance);
      setLoyaltyAccountId(acct.accountId);
      if (acct.lastRedeemAt) {
        const hoursSince = (Date.now() - new Date(acct.lastRedeemAt).getTime()) / 36e5;
        setRecentlyRedeemed(hoursSince < 24);
      }
    });
    return () => {
      alive = false;
    };
  }, [isAuthenticated]);

  // ── Loyalty redemption intent (ephemeral — never persisted to localStorage) ─
  const [loyaltyIntent, setLoyaltyIntent] = useState<LoyaltyRedeemValue>({
    applyPoints: false,
    pointsToRedeem: 0,
    loyaltyAccountId: '',
  });

  // ── Phone verification (optional — for SMS order updates) ─────────────────
  // verifiedPhone stores the canonical E.164 returned by the backend after OTP.
  // phoneSkipped tracks whether the user dismissed the widget.
  // Neither blocks checkout — both are purely additive.
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [phoneSkipped, setPhoneSkipped] = useState(false);

  // ── Credits loader ─────────────────────────────────────────────────────────
  const loadCredits = useCallback(async () => {
    setCreditsLoading(true);
    setCreditsError(null);
    try {
      const rows = await getAvailableCredits();
      const clean = (rows ?? []).filter((c) => typeof c?.id === 'string' && c.id.length > 0);
      setCredits(clean);
      if (selectedCredit && !clean.some((c) => c.id === selectedCredit)) {
        setSelectedCredit(null);
        safeLocalRemove(STORAGE.CHECKOUT_CREDIT);
      }
    } catch {
      setCredits([]);
      setCreditsError('Unable to load credits right now.');
    } finally {
      setCreditsLoading(false);
    }
  }, [selectedCredit]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!alive) return;
      await loadCredits();
    })().catch((error: unknown) => {
      console.error('Failed to load credits on checkout init:', error);
    });
    return () => {
      alive = false;
    };
  }, [loadCredits]);

  useEffect(() => {
    if (!selectedCredit) safeLocalRemove(STORAGE.CHECKOUT_CREDIT);
    else safeLocalSet(STORAGE.CHECKOUT_CREDIT, selectedCredit);
  }, [selectedCredit]);

  const creditsAvailableCents = useMemo(
    () => credits.reduce((sum, c) => sum + safeMoneyCents(c.amount_cents), 0),
    [credits],
  );

  // ── Copy summary ───────────────────────────────────────────────────────────
  const copySummary = useCallback(async () => {
    if (!hasItems) return;
    const lines: string[] = [];
    lines.push(`Sofi's Restaurant — Checkout Summary`);
    lines.push(`Order type: ${formatOrderTypeLabel(orderDetails.orderType)}`);
    lines.push(`Items:`);
    for (const item of items) {
      const qty = clampInt(item.quantity, 1, 100);
      const lineTotal = computeDisplayLineTotalCents(item);
      lines.push(`- ${item.name} x${qty} — ${formatCents(lineTotal)}`);
      if (Array.isArray(item.modifiers) && item.modifiers.length) {
        const mods = item.modifiers
          .map((m) => (typeof m?.name === 'string' ? m.name.trim() : ''))
          .filter(Boolean);
        if (mods.length) lines.push(`  • ${mods.join(', ')}`);
      }
      const notes = safeText(item.notes, 200);
      if (notes) lines.push(`  note: ${notes}`);
    }
    lines.push(`Subtotal (estimated): ${formatCents(subtotalCents)}`);
    if (promo.applied && promo.code) lines.push(`Promo queued: ${promo.code}`);
    if (selectedCredit) lines.push(`Credit selected: ${selectedCredit.slice(0, 8).toUpperCase()}`);
    if (loyaltyIntent.applyPoints && loyaltyIntent.pointsToRedeem > 0) {
      lines.push(`Loyalty: ${loyaltyIntent.pointsToRedeem.toLocaleString()} pts queued`);
    }
    if (orderDetails.notes.trim()) lines.push(`Checkout notes: ${orderDetails.notes.trim()}`);
    lines.push(`Final total is confirmed by Stripe at payment.`);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
    } catch {
      /* ignore */
    }
  }, [hasItems, items, subtotalCents, promo, selectedCredit, loyaltyIntent, orderDetails]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Render — identical structure to original, loyalty section added inside
  // the existing "Loyalty Rewards + Credits" section
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <main className="relative mx-auto w-full max-w-3xl px-3 py-6 sm:px-4 sm:py-10">
      {/* Header */}
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Checkout</h1>
        <p className="mt-1 text-sm text-gray-500">Review your order before secure payment.</p>
      </header>

      {/* Empty cart */}
      {!hasItems ? (
        <section className="rounded-2xl border border-dashed bg-white p-10 text-center">
          <p className="text-gray-600">Your cart is empty.</p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/menu')}
              className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-700"
            >
              Browse Menu
            </button>
            <Link
              to="/"
              className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50"
            >
              Home
            </Link>
          </div>
        </section>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {/* Order Details */}
          <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="border-b px-4 py-3 sm:px-6 sm:py-4">
              <h2 className="font-semibold">Order details</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                These details help us prepare your order. Pricing is confirmed by Stripe at payment.
              </p>
            </div>
            <div className="space-y-4 px-4 py-4 sm:px-6 sm:py-5">
              <div>
                <label className="block text-sm font-semibold text-gray-900">Order type</label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(['pickup', 'delivery', 'dine_in'] as const).map((t) => {
                    const active = orderDetails.orderType === t;
                    const comingSoon = t === 'delivery' || t === 'dine_in';
                    return (
                      <div key={t} className="relative">
                        <button
                          type="button"
                          disabled={comingSoon}
                          onClick={() =>
                            !comingSoon && setOrderDetails((s) => ({ ...s, orderType: t }))
                          }
                          className={cx(
                            'w-full rounded-xl border px-3 py-2.5 text-sm font-semibold transition',
                            comingSoon
                              ? 'cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300 select-none'
                              : active
                                ? 'border-gray-900 text-white'
                                : 'border-gray-200 bg-white text-gray-900 hover:border-gray-300 hover:bg-gray-50',
                          )}
                          style={
                            comingSoon
                              ? {}
                              : active
                                ? { backgroundColor: '#1c1915', color: '#ffffff' }
                                : {}
                          }
                          aria-pressed={active}
                          aria-disabled={comingSoon}
                        >
                          {formatOrderTypeLabel(t)}
                        </button>
                        {comingSoon ? (
                          <span
                            className="pointer-events-none absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-px text-[9px] font-bold uppercase text-white shadow-sm"
                            style={{ backgroundColor: '#d4af37', letterSpacing: '0.12em' }}
                          >
                            Soon
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label
                  htmlFor="checkout-notes"
                  className="block text-sm font-semibold text-gray-900"
                >
                  Notes for the kitchen{' '}
                  <span className="text-xs font-normal text-gray-400">(optional)</span>
                </label>
                <textarea
                  id="checkout-notes"
                  value={orderDetails.notes}
                  onChange={(e) => {
                    const next = String(e.target.value ?? '').slice(0, LIMITS.NOTES_MAX);
                    setOrderDetails((s) => ({ ...s, notes: next }));
                  }}
                  rows={3}
                  placeholder="Example: no onions, sauce on the side, mild salsa…"
                  className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                />
                <div className="mt-1 flex items-center justify-between text-[11px] text-gray-400">
                  <span>Keep it short for fastest prep.</span>
                  <span className="tabular-nums">
                    {orderDetails.notes.length}/{LIMITS.NOTES_MAX}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-900 hover:bg-gray-50"
                >
                  Print / Save PDF
                </button>
                <button
                  type="button"
                  onClick={() => void copySummary()}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-900 hover:bg-gray-50"
                >
                  Copy summary
                </button>
                <Link
                  to="/menu"
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-900 hover:bg-gray-50"
                >
                  Continue shopping
                </Link>
              </div>
            </div>
          </section>

          {/* Order Summary */}
          <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b px-4 py-3 sm:px-6 sm:py-4">
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
                    className="flex items-start justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {item.name}{' '}
                        <span className="text-gray-500">× {clampInt(item.quantity, 1, 100)}</span>
                      </p>
                      {item.modifiers?.length ? (
                        <ul className="mt-1 space-y-0.5 text-xs text-gray-500">
                          {item.modifiers.map((m) => (
                            <li key={`${m.groupId}:${m.id}`} className="truncate">
                              • {m.name}
                            </li>
                          ))}
                        </ul>
                      ) : null}
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
            <div className="space-y-2 border-t bg-gray-50 px-4 py-4 sm:px-6 sm:py-5 text-sm">
              <div className="flex justify-between">
                <span>Subtotal (estimated)</span>
                <span className="tabular-nums">{formatCents(subtotalCents)}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Estimated tax</span>
                <span className="tabular-nums">{formatCents(estimatedTaxCents)}</span>
              </div>
              <div className="flex justify-between border-t pt-3 text-lg font-bold">
                <span>Total (estimated)</span>
                <span className="tabular-nums text-primary">
                  {formatCents(estimatedTotalCents)}
                </span>
              </div>
              <p className="pt-1 text-center text-[11px] text-gray-400">
                Final total confirmed by Stripe — includes tax, promotions, and credits.
              </p>
            </div>
          </section>

          {/* Promo Code */}
          <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="border-b px-4 py-3 sm:px-6 sm:py-4">
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
                    onKeyDown={onPromoKeyDown}
                    placeholder="ENTER CODE"
                    inputMode="text"
                    autoCapitalize="characters"
                    autoComplete="off"
                    maxLength={LIMITS.PROMO_MAX}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 font-mono text-sm uppercase tracking-wider outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                    aria-label="Promo code"
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
              <p className="mt-2 text-[11px] text-gray-400">
                Tip: Press <span className="font-mono">Enter</span> to apply,{' '}
                <span className="font-mono">Esc</span> to clear.
              </p>
            </div>
          </section>

          {/* Loyalty Rewards + Credits */}
          <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="border-b px-4 py-3 sm:px-6 sm:py-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Loyalty & Credits</h2>
                {!creditsLoading && credits.length > 0 ? (
                  <span className="text-sm font-semibold text-amber-600 tabular-nums">
                    {formatCents(creditsAvailableCents)} available
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-gray-500">
                Credits are applied by the server — final balance confirmed at payment.
              </p>
            </div>

            {/* Points-to-earn preview */}
            {loyaltyPreview !== null && loyaltyPreview.pointsToEarn > 0 ? (
              <div className="border-b bg-amber-50 px-4 py-3 sm:px-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base" aria-hidden="true">
                      ✨
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-amber-900">
                        You'll earn{' '}
                        <span className="tabular-nums">+{loyaltyPreview.pointsToEarn} pts</span> on
                        this order
                      </p>
                      <p className="text-[11px] text-amber-700 mt-0.5">
                        {loyaltyPreview.willLevelUp
                          ? "🎉 You'll level up to the next tier!"
                          : loyaltyPreview.pointsToNextTier !== null
                            ? `${loyaltyPreview.pointsToNextTier} pts to next tier`
                            : "You're at the top tier — maximum rewards!"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
                    <span className="rounded-full bg-amber-400 px-2.5 py-0.5 text-sm font-bold text-white tabular-nums">
                      +{loyaltyPreview.pointsToEarn}
                    </span>
                    {(loyaltyPreview.tierMultiplier > 1 || loyaltyPreview.streakMultiplier > 1) && (
                      <div className="flex gap-1">
                        {loyaltyPreview.tierMultiplier > 1 && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-800">
                            ×{loyaltyPreview.tierMultiplier}
                          </span>
                        )}
                        {loyaltyPreview.streakMultiplier > 1 && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-800">
                            🔥×{loyaltyPreview.streakMultiplier}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="space-y-4 px-6 py-4">
              {/* ── LOYALTY REDEEM TOGGLE ──────────────────────────────────────
                  Only rendered when user has points. RewardsRedeem is a pure
                  presentational component — it receives live balance + accountId
                  and emits the user's intent. Server validates everything.
              ──────────────────────────────────────────────────────────────── */}

              {recentlyRedeemed && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-2">
                  ✨ You recently redeemed points. Your current balance reflects that redemption.
                </p>
              )}

              {isAuthenticated && loyaltyBalance > 0 && loyaltyAccountId && (
                <RewardsRedeem
                  balance={loyaltyBalance}
                  accountId={loyaltyAccountId}
                  subtotalCents={subtotalCents}
                  onChange={setLoyaltyIntent}
                />
              )}

              {/* ── CREDITS ──────────────────────────────────────────────────── */}
              {creditsLoading ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                  Loading credits…
                </div>
              ) : creditsError ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-semibold text-red-800">{creditsError}</p>
                  <button
                    type="button"
                    onClick={() => void loadCredits()}
                    className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-red-800 ring-1 ring-red-200 hover:bg-red-50"
                  >
                    Retry
                  </button>
                </div>
              ) : credits.length === 0 ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                  No credits available right now.
                </div>
              ) : (
                <div className="divide-y">
                  {credits.map((credit) => {
                    const amt = safeMoneyCents(credit.amount_cents);
                    const exp = safeText(credit.expires_at, 64);
                    return (
                      <label
                        key={credit.id}
                        className="flex cursor-pointer items-center gap-3 py-3"
                      >
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
                    <div className="pt-3">
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
              )}
            </div>
          </section>

          {/* SMS Updates — optional phone verification */}
          {/* Shows if user hasn't verified or skipped. Never blocks checkout. */}
          {!verifiedPhone && !phoneSkipped && (
            <section>
              <PhoneVerification
                onVerified={(phone) => setVerifiedPhone(phone)}
                onSkip={() => setPhoneSkipped(true)}
              />
            </section>
          )}

          {/* Verified confirmation chip */}
          {verifiedPhone && (
            <section>
              <div className="flex items-center justify-between rounded-xl border border-green-200 bg-green-50 px-4 py-2.5">
                <p className="text-sm font-medium text-green-800">
                  📱 SMS updates: {verifiedPhone.slice(-4).padStart(verifiedPhone.length, '•')}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setVerifiedPhone(null);
                    setPhoneSkipped(false);
                  }}
                  className="text-xs text-green-600 underline hover:text-green-800"
                >
                  Change
                </button>
              </div>
            </section>
          )}

          {/* Payment */}
          <section className="space-y-3 sm:space-y-4">
            <CheckoutButton
              promoCode={promo.applied ? promo.code : undefined}
              creditId={selectedCredit ?? undefined}
              orderType={orderDetails.orderType}
              notes={orderDetails.notes ? orderDetails.notes : null}
              loyalty={loyaltyIntent}
              onPromoError={(msg: string) =>
                setPromo((prev) => ({ ...prev, error: msg, applied: false }))
              }
            />

            <p className="text-center text-xs text-gray-500">
              🔒 Secure payment powered by Stripe. Your card details are never stored on our
              servers.
            </p>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
              <p className="font-semibold">Need help?</p>
              <p className="mt-1 text-xs text-gray-500">
                If anything looks off after payment, we'll fix it fast. Save your receipt and
                include your order ID.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-700"
                  href="mailto:sofisrestaurante@gmail.com"
                >
                  Email support
                </a>
                <Link
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-900 hover:bg-gray-50"
                  to="/contact"
                >
                  Contact form
                </Link>
                <Link
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-900 hover:bg-gray-50"
                  to="/account/orders"
                >
                  View order history
                </Link>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}