// Backward compatibility layer

import type { Database } from '@/lib/supabase/database.types'

export type OrderRow =
  Database['public']['Tables']['orders']['Row']