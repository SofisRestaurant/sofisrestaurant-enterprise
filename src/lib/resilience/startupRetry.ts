export async function retryStartup<T>(
  fn: () => Promise<T>,
  options?: {
    retries?: number
    delay?: number
  }
): Promise<T> {
  const retries = options?.retries ?? 5
  const delay = options?.delay ?? 1500

  let lastError: unknown

  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      await new Promise(r =>
        setTimeout(r, delay * (i + 1))
      )
    }
  }

  throw lastError
}