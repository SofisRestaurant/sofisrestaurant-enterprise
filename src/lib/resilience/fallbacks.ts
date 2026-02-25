export async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await primary()
  } catch (error) {
    console.error('Primary failed, using fallback:', error)
    return fallback
  }
}

