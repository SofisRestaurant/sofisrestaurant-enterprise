// src/tests/security/rateLimit.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { rateLimiter } from '@/security/rateLimit'

describe('Rate Limiter', () => {
  beforeEach(() => {
    rateLimiter.reset('test-key')
  })

  it('should allow requests within limit', () => {
    const config = { maxRequests: 5, windowMs: 60000 }
    
    for (let i = 0; i < 5; i++) {
      expect(rateLimiter.isAllowed('test-key', config)).toBe(true)
    }
  })

  it('should block requests exceeding limit', () => {
    const config = { maxRequests: 3, windowMs: 60000 }
    
    // First 3 should pass
    for (let i = 0; i < 3; i++) {
      expect(rateLimiter.isAllowed('test-key', config)).toBe(true)
    }
    
    // 4th should fail
    expect(rateLimiter.isAllowed('test-key', config)).toBe(false)
  })

  it('should allow requests after window expires', async () => {
    const config = { maxRequests: 2, windowMs: 100 }
    
    // Use up limit
    rateLimiter.isAllowed('test-key', config)
    rateLimiter.isAllowed('test-key', config)
    
    // Should be blocked
    expect(rateLimiter.isAllowed('test-key', config)).toBe(false)
    
    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 150))
    
    // Should allow again
    expect(rateLimiter.isAllowed('test-key', config)).toBe(true)
  })
})