// src/features/payments/paymentStatus.ts
export enum PaymentStatus {
  IDLE = 'idle',
  PROCESSING = 'processing',
  SUCCESS = 'success',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface PaymentState {
  status: PaymentStatus
  sessionId?: string
  error?: string
  amount?: number
}

export function getPaymentStatusMessage(status: PaymentStatus): string {
  switch (status) {
    case PaymentStatus.PROCESSING:
      return 'Processing your payment...'
    case PaymentStatus.SUCCESS:
      return 'Payment successful!'
    case PaymentStatus.FAILED:
      return 'Payment failed. Please try again.'
    case PaymentStatus.CANCELLED:
      return 'Payment was cancelled.'
    default:
      return ''
  }
}

export function getPaymentStatusColor(status: PaymentStatus): string {
  switch (status) {
    case PaymentStatus.PROCESSING:
      return 'text-blue-600'
    case PaymentStatus.SUCCESS:
      return 'text-green-600'
    case PaymentStatus.FAILED:
      return 'text-red-600'
    case PaymentStatus.CANCELLED:
      return 'text-gray-600'
    default:
      return 'text-gray-600'
  }
}