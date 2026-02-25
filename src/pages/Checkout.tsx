import { useMemo } from 'react'
import { useCart } from '@/hooks/useCart'
import CheckoutButton from '@/components/checkout/CheckoutButton'
import { formatCurrency } from '@/utils/currency'

export default function Checkout() {
  const { items, total } = useCart()

  // ======================================================
  // DERIVED TOTALS (ready for tax / fees later)
  // ======================================================
  const itemCount = useMemo(
    () => items.reduce((acc, i) => acc + i.quantity, 0),
    [items]
  )

  return (
    <main className="relative mx-auto w-full max-w-3xl px-4 py-10">
      {/* ================================================= */}
      {/* HEADER */}
      {/* ================================================= */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          Checkout
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Review your order before secure payment.
        </p>
      </header>

      {/* ================================================= */}
      {/* EMPTY CART */}
      {/* ================================================= */}
      {items.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="text-gray-500">Your cart is empty.</p>
        </div>
      )}

      {/* ================================================= */}
      {/* ORDER SUMMARY */}
      {/* ================================================= */}
      {items.length > 0 && (
        <section className="mb-6 overflow-hidden rounded-2xl border bg-white shadow-sm">
          {/* title */}
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h2 className="font-semibold">Order Summary</h2>
            <span className="text-sm text-gray-500">
              {itemCount} item{itemCount !== 1 ? 's' : ''}
            </span>
          </div>

          {/* items */}
          <div className="divide-y">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-4 px-6 py-4"
              >
                <div className="flex-1">
                  <p className="font-medium">
                    {item.menuItem.name}{' '}
                    <span className="text-gray-500">
                      × {item.quantity}
                    </span>
                  </p>

                  {item.specialInstructions && (
                    <p className="mt-1 text-xs text-gray-500">
                      {item.specialInstructions}
                    </p>
                  )}
                </div>

                <div className="font-semibold">
                  {formatCurrency(item.menuItem.price * item.quantity)}
                </div>
              </div>
            ))}
          </div>

          {/* totals */}
          <div className="space-y-2 border-t bg-gray-50 px-6 py-5 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatCurrency(total)}</span>
            </div>

            {/* future ready */}
            <div className="flex justify-between text-gray-400">
              <span>Tax</span>
              <span>Calculated at payment</span>
            </div>

            <div className="flex justify-between text-gray-400">
              <span>Fees</span>
              <span>—</span>
            </div>

            <div className="flex justify-between border-t pt-3 text-lg font-bold">
              <span>Total</span>
              <span className="text-primary">
                {formatCurrency(total)}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* ================================================= */}
      {/* PAYMENT */}
      {/* ================================================= */}
      {items.length > 0 && (
        <section className="space-y-4">
          <CheckoutButton />

          <p className="text-center text-xs text-gray-500">
            🔒 Secure payment powered by Stripe.  
            Your card details are never stored on our servers.
          </p>
        </section>
      )}
    </main>
  )
}