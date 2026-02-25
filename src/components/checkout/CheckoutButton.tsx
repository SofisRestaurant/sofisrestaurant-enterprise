// src/components/checkout/CheckoutButton.tsx
// ============================================================================
// 2026 PRODUCTION CHECKOUT BUTTON (PROMO + CREDIT READY)
// ============================================================================
// ✅ Typed props
// ✅ Promo + credit support
// ✅ No cart mutation before redirect
// ✅ Auth validation
// ✅ Retry handling
// ✅ Error propagation to parent
// ✅ No setError dependency internally
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { useCheckout } from '@/hooks/useCheckout'
import { useUserContext } from '@/contexts/useUserContext'
import { AlertCircle, Loader2, CreditCard, RefreshCw } from 'lucide-react'

// ============================================================================
// PROPS
// ============================================================================

interface CheckoutButtonProps {
  promoCode?: string
  creditId?: string
  onPromoError?: (msg: string) => void
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function CheckoutButton({
  promoCode,
  creditId,
  onPromoError,
}: CheckoutButtonProps) {
  const { user, loading: authLoading, isAuthenticated } = useUserContext();

  const { checkout, isLoading, error, errorCode, canRetry, retryAfter, reset, canCheckout } =
    useCheckout();

  const [countdown, setCountdown] = useState<number | null>(null);
  const mountedRef = useRef(true);

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ============================================================================
  // RETRY COUNTDOWN
  // ============================================================================

  useEffect(() => {
    if (!retryAfter) return;

    const endTime = Date.now() + retryAfter;

    const interval = setInterval(() => {
      const remaining = Math.ceil((endTime - Date.now()) / 1000);

      if (remaining <= 0) {
        setCountdown(null);
        reset();
        clearInterval(interval);
      } else {
        setCountdown(remaining);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [retryAfter, reset]);

  // ============================================================================
  // CHECKOUT HANDLER
  // ============================================================================

  const handleCheckout = useCallback(async () => {
    if (isLoading) return;

    if (!isAuthenticated || !user) {
      alert('Please log in to continue');
      return;
    }

    if (!canCheckout) return;

    try {
      await checkout({
        customer_uid: user.id,
        email: user.email,
        name: user.name ?? undefined,
        phone: user.phone ?? undefined,
        promo_code: promoCode,
        credit_id: creditId,
      });
    } catch (err) {
      // Forward promo-related errors to parent if provided
      if (onPromoError && err instanceof Error) {
        onPromoError(err.message);
      }
    }
  }, [checkout, isAuthenticated, user, canCheckout, isLoading, promoCode, creditId, onPromoError]);

  const handleRetry = useCallback(() => {
    reset();
  }, [reset]);

  // ============================================================================
  // AUTH LOADING
  // ============================================================================

  if (authLoading) {
    return (
      <button
        disabled
        className="w-full rounded-lg bg-gray-200 px-6 py-4 text-gray-500 cursor-not-allowed"
      >
        <div className="flex items-center justify-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-base font-semibold">Loading...</span>
        </div>
      </button>
    );
  }

  // ============================================================================
  // ERROR STATE
  // ============================================================================

  if (error) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-900">{error}</p>
            {errorCode && <p className="mt-1 text-xs text-red-700">Error code: {errorCode}</p>}
          </div>
        </div>

        {canRetry && (
          <button
            onClick={handleRetry}
            disabled={!!countdown}
            className={`
              w-full flex items-center justify-center gap-2 rounded-lg 
              border border-gray-300 bg-white px-4 py-3 font-semibold
              ${countdown ? 'cursor-not-allowed opacity-50' : 'hover:bg-gray-50'}
            `}
          >
            <RefreshCw className="h-4 w-4" />
            {countdown ? `Retry in ${countdown}s` : 'Try Again'}
          </button>
        )}

        <button onClick={reset} className="w-full text-sm text-gray-600 hover:text-gray-900">
          ← Back to checkout
        </button>
      </div>
    );
  }

  // ============================================================================
  // NORMAL STATE
  // ============================================================================

  return (
    <button
      onClick={handleCheckout}
      disabled={!canCheckout || isLoading || !isAuthenticated}
      className={`
        group relative w-full overflow-hidden rounded-lg px-6 py-4 text-white
        bg-linear-to-r from-blue-600 to-blue-700
        disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed
        hover:from-blue-700 hover:to-blue-800 transition-all
      `}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-blue-600/90">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}

      <div className="flex items-center justify-center gap-3">
        <CreditCard className="h-5 w-5" />
        <span className="text-base font-semibold">
          {isLoading ? 'Processing...' : 'Proceed to Payment'}
        </span>
      </div>
    </button>
  );
}