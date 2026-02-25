// src/components/checkout/PaymentStatus.tsx
import { PaymentStatus as Status, getPaymentStatusMessage, getPaymentStatusColor } from '@/features/payments/paymentStatus'
import Spinner from '@/components/ui/Spinner'

interface PaymentStatusProps {
  status: Status
}

export default function PaymentStatus({ status }: PaymentStatusProps) {
  const message = getPaymentStatusMessage(status)
  const colorClass = getPaymentStatusColor(status)

  if (status === Status.IDLE) return null

  return (
    <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
      {status === Status.PROCESSING && <Spinner size="sm" />}
      {status === Status.SUCCESS && (
        <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )}
      {status === Status.FAILED && (
        <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      <span className={`font-medium ${colorClass}`}>{message}</span>
    </div>
  )
}