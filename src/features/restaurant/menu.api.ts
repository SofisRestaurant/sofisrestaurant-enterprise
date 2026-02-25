import { supabase } from '@/lib/supabase/supabaseClient'
import { mapProductToMenuItem } from './menu.mapper'
import type { MenuItem } from '@/types/menu'

export async function getMenuItems(): Promise<MenuItem[]> {
  const { data, error } = await supabase
    .from('menu_items')   // ✅ correct table
    .select('*')
    .order('name')

  if (error) throw error
  if (!data) return []

  return data.map(mapProductToMenuItem)
}