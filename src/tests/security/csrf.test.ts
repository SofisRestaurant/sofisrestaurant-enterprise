// src/tests/security/csrf.test.ts
import { describe, it, expect } from 'vitest'
import { generateCSRFToken, validateCSRFToken } from '@/security/csrf'

describe('CSRF Protection', () => {
  it('should generate a valid token', () => {
    const token = generateCSRFToken()
    expect(token).toBeDefined()
    expect(token.length).toBeGreaterThan(0)
  })

  it('should validate matching tokens', () => {
    const token = generateCSRFToken()
    expect(validateCSRFToken(token, token)).toBe(true)
  })

  it('should reject non-matching tokens', () => {
    const token1 = generateCSRFToken()
    const token2 = generateCSRFToken()
    expect(validateCSRFToken(token1, token2)).toBe(false)
  })

  it('should reject empty tokens', () => {
    expect(validateCSRFToken('', 'test')).toBe(false)
    expect(validateCSRFToken('test', '')).toBe(false)
  })
})
