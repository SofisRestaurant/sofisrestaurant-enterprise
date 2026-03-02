// src/components/cart/CartDrawer.tsx
import { Fragment, useCallback, useEffect, useMemo } from 'react';
import { Dialog, Transition } from '@headlessui/react'
import { useLocation, useNavigate } from 'react-router-dom';

import { useCart } from '@/hooks/useCart'
import type { CartItem as CartItemType } from '@/types'

import CartItem from './CartItem'
import { CartSummary } from './CartSummary'
import { Button } from '@/components/ui/Button'
import { cartItemKey } from '@/features/cart/cart.types';

type CartDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
};

/** Safe helpers */
function asNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : fallback
}

function formatDollarsFromCents(cents: number): string {
  const safe = Number.isFinite(cents) ? cents : 0
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(safe / 100)
}

/**
 * CartDrawer — production hardened
 * - Never depends on admin endpoints
 * - Derives totals from cart state (server will re-validate at checkout)
 * - Defensive validation before navigating to /checkout
 */
export function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const navigate = useNavigate()
  const location = useLocation();

  const { items, itemCount, clearCart } = useCart();

  // Close drawer on route change (prevents overlay getting “stuck”)
  useEffect(() => {
    if (!isOpen) return;
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const computed = useMemo(() => {
    const safeItems = Array.isArray(items) ? items : [];

    // Validate minimal shape – we do NOT trust prices, only show them.
    const invalidCount = safeItems.reduce((acc, item) => {
      const hasId = Boolean(
        (item as any)?.menuItemId || (item as any)?.menu_item_id || (item as any)?.item_id,
      );
      const qty = asNumber((item as any)?.quantity, 0);
      return acc + (!hasId || qty <= 0 ? 1 : 0);
    }, 0);

    // These fields may differ in your type. We defensively probe common names.
    const subtotalCents = safeItems.reduce((sum, item) => {
      const qty = Math.max(1, Math.min(100, Math.round(asNumber((item as any)?.quantity, 1))));
      const unit =
        asNumber((item as any)?.price_cents, NaN) ?? asNumber((item as any)?.unit_price_cents, NaN);

      // If item doesn't have a price in cart state, display total as 0 here;
      // checkout server will compute real totals anyway.
      const unitSafe = Number.isFinite(unit) ? unit : 0;
      return sum + unitSafe * qty;
    }, 0);

    const safeCount =
      typeof itemCount === 'number' && Number.isFinite(itemCount)
        ? itemCount
        : safeItems.reduce((sum, item) => {
            const qty = asNumber((item as any)?.quantity, 0);
            return sum + (Number.isFinite(qty) ? Math.max(0, Math.round(qty)) : 0);
          }, 0);

    return {
      safeCount,
      invalidCount,
      subtotalCents,
      subtotalLabel: formatDollarsFromCents(subtotalCents),
      hasItems: safeItems.length > 0,
      safeItems,
    };
  }, [items, itemCount]);

  const handleCheckout = useCallback(() => {
    // Don’t proceed if cart state is clearly corrupted.
    if (!computed.hasItems) return;
    if (computed.invalidCount > 0) {
      console.warn('[CartDrawer] blocked checkout: invalid cart items', {
        invalidCount: computed.invalidCount,
      });
      // You can swap this for a toast/snackbar if you have one.
      alert('Some items in your cart look invalid. Please remove them and try again.');
      return;
    }

    onClose();
    navigate('/checkout');
  }, [computed.hasItems, computed.invalidCount, navigate, onClose]);

  const handleClear = useCallback(() => {
    // Optional: confirm destructive action
    const ok = window.confirm('Clear your cart?');
    if (!ok) return;
    clearCart();
  }, [clearCart]);

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        {/* Overlay */}
        <Transition.Child
          as={Fragment}
          enter="ease-in-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in-out duration-300"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50 backdrop-blur-[1px] transition-opacity" />
        </Transition.Child>

        {/* Drawer */}
        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-300"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-300"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                <Dialog.Panel className="pointer-events-auto w-screen max-w-md">
                  <div className="flex h-full flex-col bg-white shadow-2xl">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-gray-200 px-4 py-5">
                      <div className="flex flex-col">
                        <Dialog.Title className="text-lg font-semibold text-gray-900">
                          Your Cart ({computed.safeCount})
                        </Dialog.Title>
                        {/* Helpful hint for QA */}
                        {computed.invalidCount > 0 && (
                          <p className="mt-1 text-xs text-red-600">
                            Some cart items look invalid — checkout is blocked.
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
                        onClick={onClose}
                      >
                        <span className="sr-only">Close panel</span>
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>

                    {/* Items */}
                    <div className="grow overflow-y-auto px-4">
                      {!computed.hasItems ? (
                        <div className="flex h-full flex-col items-center justify-center text-center">
                          <svg
                            className="mb-4 h-20 w-20 text-gray-300"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                            />
                          </svg>

                          <h3 className="mb-2 text-lg font-medium text-gray-900">
                            Your cart is empty
                          </h3>
                          <p className="mb-6 text-gray-500">
                            Add some delicious items to get started!
                          </p>

                          <Button onClick={onClose} variant="primary">
                            Continue Shopping
                          </Button>
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-200">
                          {computed.safeItems.map((item: CartItemType) => (
                            <CartItem
                              key={cartItemKey(
                                (item as any).menuItemId ??
                                  (item as any).menu_item_id ??
                                  (item as any).item_id,
                                (item as any).modifiers,
                              )}
                              item={item}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    {computed.hasItems && (
                      <div className="space-y-4 border-t border-gray-200 px-4 py-5">
                        {/* Optional quick subtotal line for confidence */}
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Subtotal</span>
                          <span className="font-semibold text-gray-900 tabular-nums">
                            {computed.subtotalLabel}
                          </span>
                        </div>

                        <CartSummary />

                        <Button
                          onClick={handleCheckout}
                          variant="primary"
                          className="w-full"
                          disabled={computed.invalidCount > 0}
                          title={
                            computed.invalidCount > 0
                              ? 'Fix invalid cart items before checkout'
                              : 'Proceed to Checkout'
                          }
                        >
                          Proceed to Checkout
                        </Button>

                        <button
                          onClick={handleClear}
                          className="w-full text-sm text-gray-500 underline decoration-dotted hover:text-gray-700 hover:no-underline"
                        >
                          Clear Cart
                        </button>
                      </div>
                    )}
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