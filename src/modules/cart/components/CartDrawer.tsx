// =============================================================================
// src/modules/cart/components/CartDrawer.tsx
// CartDrawer — Premium Mobile-First (2026)
// =============================================================================
// Design direction: Warm, premium, feels like a high-end restaurant not a SaaS.
// Mobile-first with safe area insets, tactile buttons, loyalty teaser to convert.
// Buttons use inline styles so they are guaranteed visible regardless of CSS cascade.
// =============================================================================

import { Fragment, useCallback, useEffect, useMemo } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useCart } from '@/modules/cart/hooks/useCart';
import type { CartItem as CartItemType } from '@/modules/cart/types/cart.types';
import { cartItemKey } from '@/modules/cart/types/cart.types';

import CartItem from './CartItem';
import { CartSummary } from './CartSummary';
import { Button } from '@/components/ui/Button';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type CartDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
};

type ComputedCart = {
  safeCount: number;
  invalidCount: number;
  subtotalCents: number;
  subtotalLabel: string;
  hasItems: boolean;
  safeItems: CartItemType[];
  estimatedPoints: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function formatDollarsFromCents(cents: number): string {
  const safe = Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(safe / 100);
}

// Points preview: 1 pt per $1 spent (floor). Display-only — server is source of truth.
// Matches calculatePointsPreview base rate in checkout.api.ts: floor(amountCents / 100)
function estimateBasePoints(subtotalCents: number): number {
  return Math.max(Math.floor(subtotalCents / 100), 0);
}

function isCartItemType(v: unknown): v is CartItemType {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.menuItemId === 'string' &&
    r.menuItemId.length > 0 &&
    typeof r.name === 'string' &&
    typeof r.quantity === 'number' &&
    Number.isFinite(r.quantity) &&
    Array.isArray(r.modifiers)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const cart = useCart();
  const items: CartItemType[] = useMemo(() => {
    const raw = cart.items;
    if (!Array.isArray(raw)) return [];
    return raw.filter(isCartItemType);
  }, [cart.items]);

  const itemCount: number =
    typeof cart.itemCount === 'number' && Number.isFinite(cart.itemCount) ? cart.itemCount : 0;
  const clearCart = cart.clearCart;

  // Close on route change — prevents overlay getting stuck
  useEffect(() => {
    if (!isOpen) return;
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const computed: ComputedCart = useMemo(() => {
    const invalidCount = items.reduce((acc: number, item: CartItemType) => {
      const qty = clampInt(item.quantity, 0, 100);
      return acc + (!item.menuItemId || qty <= 0 ? 1 : 0);
    }, 0);

    const subtotalCents = items.reduce((sum: number, item: CartItemType) => {
      const qty = Math.max(1, clampInt(item.quantity, 1, 100));
      const line =
        typeof item.lineTotalCents === 'number' && Number.isFinite(item.lineTotalCents)
          ? Math.max(0, Math.round(item.lineTotalCents))
          : null;
      if (line !== null) return sum + line;
      const unit =
        typeof item.unitPriceCents === 'number' && Number.isFinite(item.unitPriceCents)
          ? Math.max(0, Math.round(item.unitPriceCents))
          : 0;
      return sum + unit * qty;
    }, 0);

    const safeCount =
      itemCount > 0
        ? itemCount
        : items.reduce((sum, item) => sum + clampInt(item.quantity, 0, 100), 0);

    return {
      safeCount,
      invalidCount,
      subtotalCents,
      subtotalLabel: formatDollarsFromCents(subtotalCents),
      hasItems: items.length > 0,
      safeItems: items,
      estimatedPoints: estimateBasePoints(subtotalCents),
    };
  }, [items, itemCount]);

  const handleCheckout = useCallback(() => {
    if (!computed.hasItems) return;
    if (computed.invalidCount > 0) {
      alert('Some items in your cart look invalid. Please remove them and try again.');
      return;
    }
    onClose();
    void navigate('/checkout');
  }, [computed.hasItems, computed.invalidCount, navigate, onClose]);

  const handleClear = useCallback(() => {
    if (!window.confirm('Clear your cart?')) return;
    clearCart();
  }, [clearCart]);

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        {/* Backdrop */}
        <Transition.Child
          as={Fragment}
          enter="ease-in-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in-out duration-300"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" />
        </Transition.Child>

        {/* Drawer */}
        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full">
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-350"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-300"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                <Dialog.Panel className="pointer-events-auto w-screen max-w-sm sm:max-w-md">
                  {/*
                    Full-height flex column. bg-[#faf8f5] = warm cream matching brand.
                    pb-safe ensures content clears iOS home indicator.
                  */}
                  <div
                    className="flex h-full flex-col shadow-2xl"
                    style={{ backgroundColor: '#faf8f5' }}
                  >
                    {/* ── Header ─────────────────────────────────────────── */}
                    <div
                      className="flex shrink-0 items-center justify-between px-5 py-4"
                      style={{
                        background: 'linear-gradient(135deg, #1c1915 0%, #2e2a24 100%)',
                        borderBottom: '1px solid rgba(212,175,55,0.2)',
                      }}
                    >
                      <div>
                        <Dialog.Title
                          className="text-base font-semibold text-white"
                          style={{ fontFamily: 'var(--font-sans, system-ui)' }}
                        >
                          Your Order
                          {computed.safeCount > 0 ? (
                            <span
                              className="ml-2 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold"
                              style={{ backgroundColor: '#d4af37', color: '#1c1915' }}
                            >
                              {computed.safeCount}
                            </span>
                          ) : null}
                        </Dialog.Title>
                        {computed.hasItems ? (
                          <p className="mt-0.5 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                            {computed.safeCount} item{computed.safeCount !== 1 ? 's' : ''} ·{' '}
                            {computed.subtotalLabel} subtotal
                          </p>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        onClick={onClose}
                        className="flex h-9 w-9 items-center justify-center rounded-full transition-colors"
                        style={{
                          backgroundColor: 'rgba(255,255,255,0.08)',
                          color: 'rgba(255,255,255,0.7)',
                        }}
                        aria-label="Close cart"
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    {/* ── Loyalty teaser banner — only when cart has items ── */}
                    {computed.hasItems && computed.estimatedPoints > 0 ? (
                      <div
                        className="shrink-0 flex items-center justify-between px-5 py-2.5"
                        style={{
                          background: 'linear-gradient(90deg, #d4af37 0%, #e8c46a 100%)',
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm" aria-hidden="true">
                            ✨
                          </span>
                          <p className="text-xs font-semibold" style={{ color: '#1c1915' }}>
                            Earn <span className="font-bold">+{computed.estimatedPoints} pts</span>{' '}
                            on this order
                          </p>
                        </div>
                        <p
                          className="text-[10px] font-medium"
                          style={{ color: 'rgba(28,25,21,0.65)' }}
                        >
                          $1 = 1 point
                        </p>
                      </div>
                    ) : null}

                    {/* ── Items scroll area ───────────────────────────────── */}
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      {!computed.hasItems ? (
                        /* Empty state */
                        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                          <div
                            className="mb-4 flex h-16 w-16 items-center justify-center rounded-full"
                            style={{ backgroundColor: 'rgba(212,175,55,0.1)' }}
                          >
                            <svg
                              width="28"
                              height="28"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="#d4af37"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
                              <line x1="3" y1="6" x2="21" y2="6" />
                              <path d="M16 10a4 4 0 01-8 0" />
                            </svg>
                          </div>
                          <h3 className="mb-1 text-base font-semibold text-gray-900">
                            Your cart is empty
                          </h3>
                          <p className="mb-6 text-sm text-gray-500">
                            Add something delicious from our menu.
                          </p>
                          <Button onClick={onClose} variant="primary">
                            Browse Menu
                          </Button>
                        </div>
                      ) : (
                        /* Item list */
                        <div>
                          {computed.invalidCount > 0 ? (
                            <div className="mx-4 mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5">
                              <p className="text-xs font-semibold text-red-700">
                                Some items look invalid — checkout is blocked until resolved.
                              </p>
                            </div>
                          ) : null}

                          <div className="divide-y divide-gray-100 px-2">
                            {computed.safeItems.map((item) => (
                              <CartItem
                                key={cartItemKey(item.menuItemId, item.modifiers)}
                                item={item}
                              />
                            ))}
                          </div>

                          {/* CartSummary (promos, discounts etc) */}
                          <div className="px-4 pb-2">
                            <CartSummary />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ── Footer — sticky at bottom ───────────────────────── */}
                    {computed.hasItems ? (
                      <div
                        className="shrink-0 px-4 pb-6 pt-4"
                        style={{
                          backgroundColor: '#ffffff',
                          borderTop: '1px solid #ede0ce',
                          paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
                        }}
                      >
                        {/* Subtotal row */}
                        <div className="mb-3 flex items-baseline justify-between">
                          <span className="text-sm text-gray-600">Subtotal</span>
                          <span className="text-base font-bold text-gray-900 tabular-nums">
                            {computed.subtotalLabel}
                          </span>
                        </div>

                        {/* Tax disclaimer */}
                        <p className="mb-4 text-[11px] text-gray-400">
                          Tax, fees & promos calculated at checkout via Stripe.
                        </p>

                        {/* Primary CTA — inline styles guarantee visibility */}
                        <button
                          type="button"
                          onClick={handleCheckout}
                          disabled={computed.invalidCount > 0}
                          aria-disabled={computed.invalidCount > 0}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            width: '100%',
                            padding: '1rem',
                            fontSize: '0.9375rem',
                            fontWeight: 700,
                            letterSpacing: '0.01em',
                            color: '#ffffff',
                            background:
                              computed.invalidCount > 0
                                ? '#d1d5db'
                                : 'linear-gradient(135deg, #1c1915 0%, #3e3830 100%)',
                            borderRadius: '0.875rem',
                            border: 'none',
                            cursor: computed.invalidCount > 0 ? 'not-allowed' : 'pointer',
                            boxShadow:
                              computed.invalidCount > 0 ? 'none' : '0 4px 20px rgba(28,25,21,0.35)',
                            transition: 'all 0.2s ease',
                            position: 'relative',
                            overflow: 'hidden',
                          }}
                          onMouseEnter={(e) => {
                            if (computed.invalidCount > 0) return;
                            (e.currentTarget as HTMLButtonElement).style.background =
                              'linear-gradient(135deg, #2e2a24 0%, #504840 100%)';
                            (e.currentTarget as HTMLButtonElement).style.boxShadow =
                              '0 6px 24px rgba(28,25,21,0.45)';
                          }}
                          onMouseLeave={(e) => {
                            if (computed.invalidCount > 0) return;
                            (e.currentTarget as HTMLButtonElement).style.background =
                              'linear-gradient(135deg, #1c1915 0%, #3e3830 100%)';
                            (e.currentTarget as HTMLButtonElement).style.boxShadow =
                              '0 4px 20px rgba(28,25,21,0.35)';
                          }}
                        >
                          {/* Gold shimmer accent */}
                          <span
                            aria-hidden="true"
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              right: 0,
                              height: '1px',
                              background:
                                'linear-gradient(90deg, transparent, rgba(212,175,55,0.6), transparent)',
                            }}
                          />
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <rect x="2" y="5" width="20" height="14" rx="2" />
                            <line x1="2" y1="10" x2="22" y2="10" />
                          </svg>
                          Review Order & Pay
                        </button>

                        {/* Points earn reminder below CTA */}
                        {computed.estimatedPoints > 0 ? (
                          <p className="mt-2.5 text-center text-[11px] text-gray-400">
                            ✨ You&apos;ll earn{' '}
                            <span className="font-semibold text-amber-600">
                              +{computed.estimatedPoints} loyalty pts
                            </span>{' '}
                            on this order
                          </p>
                        ) : null}

                        {/* Clear cart */}
                        <button
                          type="button"
                          onClick={handleClear}
                          className="mt-3 w-full text-xs text-gray-400 underline decoration-dotted underline-offset-2 hover:text-gray-600"
                        >
                          Clear cart
                        </button>
                      </div>
                    ) : null}
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}