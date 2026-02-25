// src/features/payments/paymentGuards.ts
export function validateAmount(amount: number): boolean {
  return amount > 0 && amount < 10000 && Number.isFinite(amount)
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function sanitizeAmount(amount: number): number {
  return Math.round(amount * 100) / 100
}

export function isValidCardNumber(cardNumber: string): boolean {
  const cleaned = cardNumber.replace(/\s/g, '')
  if (!/^\d{13,19}$/.test(cleaned)) return false

  // Luhn algorithm
  let sum = 0
  let isEven = false

  for (let i = cleaned.length - 1; i >= 0; i--) {
    let digit = parseInt(cleaned[i], 10)

    if (isEven) {
      digit *= 2
      if (digit > 9) digit -= 9
    }

    sum += digit
    isEven = !isEven
  }

  return sum % 10 === 0
}

export function validatePaymentData(data: {
  email: string
  amount: number
}): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!validateEmail(data.email)) {
    errors.push('Invalid email address')
  }

  if (!validateAmount(data.amount)) {
    errors.push('Invalid payment amount')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}