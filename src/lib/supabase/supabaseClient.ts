import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { env } from '@/lib/config/env'

export const supabase = createClient<Database>(env.supabase.url, env.supabase.anonKey, {
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
})

// DEV-ONLY: expose supabase to browser console for debugging
if (import.meta.env.DEV && typeof window !== 'undefined') {
  console.log('🔗 Supabase connected to:', env.supabase.url)

  Object.defineProperty(window, 'supabase', {
    value: supabase,
    writable: false,
    configurable: false,
  })
}