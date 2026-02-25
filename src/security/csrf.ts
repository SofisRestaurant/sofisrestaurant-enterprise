// src/security/csrf.ts

/**
 * Generate a cryptographically safe CSRF token
 */
export function generateCSRFToken(length = 32): string {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Validate a CSRF token against a known valid token
 */
export function validateCSRFToken(token: string, validToken: string): boolean {
  return token === validToken
}