// src/compliance/pci/paymentCompliance.ts
export function maskCardNumber(cardNumber: string): string {
  const cleaned = cardNumber.replace(/\s/g, '')
  if (cleaned.length < 4) return '****'
  return `**** **** **** ${cleaned.slice(-4)}`
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (local.length <= 2) return `${local[0]}***@${domain}`
  return `${local[0]}${local[1]}***@${domain}`
}

export function validatePCICompliance(): {
  compliant: boolean
  issues: string[]
} {
  const issues: string[] = []

  // Check if running on HTTPS in production
  if (import.meta.env.PROD && window.location.protocol !== 'https:') {
    issues.push('Must use HTTPS in production')
  }

  // Check if Stripe is properly configured
  if (!import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY) {
    issues.push('Stripe publishable key not configured')
  }

  return {
    compliant: issues.length === 0,
    issues,
  }
}
