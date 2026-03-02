// Backward compatibility layer

import type { Database } from '@/types/supabase'
export type OrderRow =
  Database['public']['Tables']['orders']['Row']