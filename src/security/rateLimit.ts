interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

class RateLimiter {
  private requests: Map<string, number[]> = new Map()

  isAllowed(key: string, config: RateLimitConfig): boolean {
    const now = Date.now()
    const windowStart = now - config.windowMs

    // Get existing requests for this key
    let timestamps = this.requests.get(key) || []

    // Filter out old requests outside the window
    timestamps = timestamps.filter((ts) => ts > windowStart)

    // Check if limit exceeded
    if (timestamps.length >= config.maxRequests) {
      return false
    }

    // Add current request
    timestamps.push(now)
    this.requests.set(key, timestamps)

    return true
  }

  reset(key: string): void {
    this.requests.delete(key)
  }

  cleanup(): void {
    const now = Date.now()
    for (const [key, timestamps] of this.requests.entries()) {
      const validTimestamps = timestamps.filter((ts) => ts > now - 60000)
      if (validTimestamps.length === 0) {
        this.requests.delete(key)
      } else {
        this.requests.set(key, validTimestamps)
      }
    }
  }
}

export const rateLimiter = new RateLimiter()

// Cleanup old entries every minute
setInterval(() => rateLimiter.cleanup(), 60000)
