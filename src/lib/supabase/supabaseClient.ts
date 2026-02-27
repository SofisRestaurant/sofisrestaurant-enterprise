import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    '❌ Missing Supabase env vars. Check .env.local or .env.production'
  )
}

export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
    global: {
      headers: {
        'x-application-name': 'sofis-restaurant-v2',
      },
    },
  }
)

// DEV-ONLY: expose supabase to browser console for debugging
if (import.meta.env.DEV) {
  console.log('🔗 Supabase connected to:', SUPABASE_URL)

  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'supabase', {
      value: supabase,
      writable: false,
      configurable: false,
    })
  }
}