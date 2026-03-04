// src/features/payments/paymentGuards.ts
// =============================================================================
// PAYMENT GUARDS — Client-side validation (Enterprise-safe, 2026)
// =============================================================================
// Scope (IMPORTANT):
// - UX validation only (email + amount). NOT a security boundary.
// - Do NOT collect or validate raw card numbers in the app.
//   Stripe Checkout / Elements handles payment method validation.
// - We keep `isValidCardNumber` exported as a SAFE STUB for backwards compatibility.
//
// Design goals:
// - Hardened against untrusted inputs (unknown/string/number)
// - Deterministic results
// - Backwards compatible exports + signatures
// - No accidental acceptance of raw PANs (card numbers)
// =============================================================================

export type PaymentInput = {
  email: string
  amount: number // dollars
}

export type PaymentValidationResult = {
  valid: boolean
  errors: string[]
  normalized: PaymentInput
}

const CONFIG = {
  // UX validation in dollars (not cents)
  MIN_AMOUNT: 0.01,
  MAX_AMOUNT: 10_000,

  // RFC 5321/5322 practical limits
  MAX_EMAIL_LEN: 254,

  // Acceptable decimal places for dollar amounts
  AMOUNT_DECIMALS: 2,

  // Safety caps for untrusted inputs
  MAX_RAW_STRING_LEN: 2048,

  // If you ever display masked card values, allow only these (no raw PAN)
  MASKED_CARD_RE: /^(?:\*{4}|•{4})\s?\d{4}$/,

  // Reject obvious PAN-like inputs in a “card field” (should not exist in your app)
  PAN_LIKE_RE: /^\d{13,19}$/,
} as const

type UnknownRecord = Record<string, unknown>

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * IMPORTANT TS FIX:
 * Because CONFIG is `as const`, CONFIG.MAX_RAW_STRING_LEN becomes the literal type `2048`.
 * If we let TypeScript infer `max = CONFIG.MAX_RAW_STRING_LEN`, it narrows `max` to `2048`,
 * and then passing `254`/`256` fails.
 *
 * So: explicitly type `max` as `number`.
 */
function capString(s: string, max: number = CONFIG.MAX_RAW_STRING_LEN): string {
  if (s.length <= max) return s
  return s.slice(0, max)
}

function toFiniteNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

/**
 * Normalizes email for UX checks:
 * - trim
 * - cap length
 * - lower-case domain part only (preserves local-part case just in case)
 */
function normalizeEmail(email: unknown): string {
  if (typeof email !== 'string') return ''
  const trimmed = capString(email.trim(), CONFIG.MAX_EMAIL_LEN)
  if (!trimmed) return ''

  const at = trimmed.lastIndexOf('@')
  if (at <= 0 || at === trimmed.length - 1) return trimmed

  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1).toLowerCase()
  return `${local}@${domain}`
}

/**
 * Amount is in dollars.
 * Normalizes to 2 decimals and clamps non-finite/negative to 0.
 */
export function sanitizeAmount(amount: number): number {
  if (!Number.isFinite(amount)) return 0
  if (amount <= 0) return 0

  const factor = 10 ** CONFIG.AMOUNT_DECIMALS
  const rounded = Math.round(amount * factor) / factor
  return rounded > 0 ? rounded : 0
}

/**
 * Validation for UX only.
 * Server must validate totals, currency, and re-price items.
 */
export function validateAmount(amount: number): boolean {
  if (!Number.isFinite(amount)) return false
  const normalized = sanitizeAmount(amount)
  if (!normalized) return false
  return normalized >= CONFIG.MIN_AMOUNT && normalized <= CONFIG.MAX_AMOUNT
}

/**
 * RFC-lite email validation (UX-only).
 */
export function validateEmail(email: string): boolean {
  const s = normalizeEmail(email)
  if (!s) return false
  if (s.length > CONFIG.MAX_EMAIL_LEN) return false
  if (/\s/.test(s)) return false

  const at = s.indexOf('@')
  if (at <= 0) return false
  if (s.indexOf('@', at + 1) !== -1) return false

  const domain = s.slice(at + 1)
  if (domain.length < 3) return false
  if (!domain.includes('.')) return false
  if (domain.startsWith('.') || domain.endsWith('.')) return false
  if (domain.includes('..')) return false

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(s)
}

/**
 * BACKWARD COMPATIBILITY — SAFE STUB.
 * - Allows empty / masked values.
 * - Rejects any PAN-like input.
 */
export function isValidCardNumber(cardNumber: string): boolean {
  if (typeof cardNumber !== 'string') return false

  const raw = capString(cardNumber.trim(), 256)
  if (!raw) return true

  if (CONFIG.MASKED_CARD_RE.test(raw)) return true

  const digitsOnly = raw.replace(/\s+/g, '')
  if (CONFIG.PAN_LIKE_RE.test(digitsOnly)) return false

  return false
}

export function validatePaymentData(data: PaymentInput): { valid: boolean; errors: string[] } {
  const result = validateAndNormalizePaymentData(data)
  return { valid: result.valid, errors: result.errors }
}

export function validateAndNormalizePaymentData(data: PaymentInput): PaymentValidationResult {
  const errors: string[] = []

  const email = normalizeEmail(data?.email)
  if (!validateEmail(email)) errors.push('Invalid email address')

  const amount = sanitizeAmount(data?.amount)
  if (!validateAmount(amount)) errors.push('Invalid payment amount')

  return {
    valid: errors.length === 0,
    errors,
    normalized: { email, amount },
  }
}

/**
 * Optional: safely coerce unknown input (forms / query params) without `any`.
 */
export function coercePaymentInput(raw: unknown): PaymentInput {
  const r = isRecord(raw) ? raw : {}
  const email = normalizeEmail(r.email)
  const amount = sanitizeAmount(toFiniteNumber(r.amount) ?? 0)
  return { email, amount }
}