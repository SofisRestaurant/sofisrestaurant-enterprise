import type { SupabaseClient } from '@supabase/supabase-js'

declare global {
  interface Window {
    supabase: SupabaseClient<Database>
  }
}

export {}
export {}

declare global {
  interface Window {
    analytics?: {
      track: (event: string, properties?: Record<string, unknown>) => void
    }

    Sentry?: {
      captureMessage: (
        message: string,
        context?: { level?: string; extra?: Record<string, unknown> }
      ) => void
    }
  }
}