// src/pages/OrderCanceled.tsx

import { useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { XCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export default function OrderCanceled() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Stripe sometimes sends session_id back
  const sessionId = useMemo(
    () => searchParams.get('session_id'),
    [searchParams]
  )

  // ==========================================================
  // OPTIONAL ANALYTICS / TRACKING
  // ==========================================================
  useEffect(() => {
    if (sessionId) {
      console.log('🛑 Stripe checkout canceled:', sessionId)

      // If later you want:
      // analytics.track('checkout_canceled', { sessionId })
      // or recovery email logic
    }
  }, [sessionId])

  return (
    <main
      className="min-h-screen bg-neutral-50 flex items-center justify-center px-4 py-16"
      role="main"
      aria-labelledby="order-canceled-title"
    >
      <section
        className="w-full max-w-xl rounded-2xl bg-white shadow-lg border border-neutral-200 p-10 text-center"
        aria-live="polite"
      >
        {/* Icon */}
        <div className="mb-6 flex justify-center">
          <XCircle
            className="h-16 w-16 text-red-500"
            aria-hidden="true"
          />
        </div>

        {/* Title */}
        <h1
          id="order-canceled-title"
          className="text-3xl font-bold text-neutral-900 mb-3"
        >
          Order Canceled
        </h1>

        {/* Message */}
        <p className="text-neutral-600 mb-8">
          Your checkout was canceled.
          <br />
          No charges were made to your card.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            variant="secondary"
            onClick={() => navigate('/checkout')}
          >
            Return to Checkout
          </Button>

          <Button
            variant="primary"
            onClick={() => navigate('/menu')}
          >
            Back to Menu
          </Button>
        </div>
      </section>
    </main>
  )
}