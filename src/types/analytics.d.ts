export {}

declare global {
  interface Window {
    analytics?: {
      track: (event: string, properties?: Record<string, unknown>) => void
    }
  }
}