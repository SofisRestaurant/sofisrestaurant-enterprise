// =============================================================================
// src/components/cart/CartDrawer.tsx
// CartDrawer — Production (2026) (Strict TS, no unknown leaks)
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
};

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

function isCartItemType(v: unknown): v is CartItemType {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;

  const hasId = typeof r.menuItemId === 'string' && r.menuItemId.length > 0;
  const hasName = typeof r.name === 'string';
  const hasQty = typeof r.quantity === 'number' && Number.isFinite(r.quantity);

  // modifiers is required in your cart.types
  const mods = r.modifiers;
  const hasMods = Array.isArray(mods);

  return hasId && hasName && hasQty && hasMods;
}

export function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // IMPORTANT: do not let items become unknown[] in this component
  const cart = useCart();
  const items: CartItemType[] = useMemo(() => {
    const raw = cart.items;
    if (!Array.isArray(raw)) return [];
    return raw.filter(isCartItemType);
  }, [cart.items]);

  const itemCount: number =
    typeof cart.itemCount === 'number' && Number.isFinite(cart.itemCount) ? cart.itemCount : 0;
  const clearCart = cart.clearCart;

  // Close drawer on route change (prevents overlay getting “stuck”)
  useEffect(() => {
    if (!isOpen) return;
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const computed: ComputedCart = useMemo(() => {
    // Validate minimal shape – we do NOT trust prices, only show them.
    const invalidCount = items.reduce((acc: number, item: CartItemType) => {
      const qty = clampInt(item.quantity, 0, 100);
      return acc + (!item.menuItemId || qty <= 0 ? 1 : 0);
    }, 0);

    // Prefer lineTotalCents (includes modifiers)
    const subtotalCents = items.reduce((sum: number, item: CartItemType) => {
      const qty = Math.max(1, clampInt(item.quantity, 1, 100));

      // lineTotalCents is the best source if present
      const line =
        typeof item.lineTotalCents === 'number' && Number.isFinite(item.lineTotalCents)
          ? Math.max(0, Math.round(item.lineTotalCents))
          : null;

      if (line !== null) return sum + line;

      // fallback: unitPriceCents * qty
      const unit =
        typeof item.unitPriceCents === 'number' && Number.isFinite(item.unitPriceCents)
          ? Math.max(0, Math.round(item.unitPriceCents))
          : 0;

      return sum + unit * qty;
    }, 0);

    const safeCount =
      itemCount > 0
        ? itemCount
        : items.reduce(
            (sum: number, item: CartItemType) => sum + clampInt(item.quantity, 0, 100),
            0,
          );

    return {
      safeCount,
      invalidCount,
      subtotalCents,
      subtotalLabel: formatDollarsFromCents(subtotalCents),
      hasItems: items.length > 0,
      safeItems: items,
    };
  }, [items, itemCount]);

  const handleCheckout = useCallback(() => {
    if (!computed.hasItems) return;

    if (computed.invalidCount > 0) {
      console.warn('[CartDrawer] blocked checkout: invalid cart items', {
        invalidCount: computed.invalidCount,
      });
      alert('Some items in your cart look invalid. Please remove them and try again.');
      return;
    }

    onClose();
    void navigate('/checkout');
  }, [computed.hasItems, computed.invalidCount, navigate, onClose]);

  const handleClear = useCallback(() => {
    const ok = window.confirm('Clear your cart?');
    if (!ok) return;
    clearCart();
  }, [clearCart]);

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
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
        {/* TEMP: check commit */}
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
                          {computed.safeItems.map((item) => (
                            <CartItem
                              key={cartItemKey(item.menuItemId, item.modifiers)}
                              item={item}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    {computed.hasItems && (
                      <div className="space-y-4 border-t border-gray-200 px-4 py-5">
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
                          className="w-full py-3 text-lg font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-lg shadow-lg"
                          disabled={computed.invalidCount > 0}
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