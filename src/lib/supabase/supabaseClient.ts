// src/lib/supabase/supabaseClient.ts

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
  SUPABASE_URL!,
  SUPABASE_ANON_KEY!
)

console.log('🔗 Supabase connected to:', SUPABASE_URL)

declare global {
  interface Window {
    supabase: typeof supabase
  }
}

window.supabase = supabase