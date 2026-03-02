import { supabase } from '@/lib/supabase/supabaseClient'
import { MenuAdminMapper } from './menu.admin.mapper'
import type { MenuItemAdmin } from './menu.types'

export class MenuAdminService {

  static async getAllItems(): Promise<MenuItemAdmin[]> {
    const { data, error } = await supabase
      .from('menu_items_admin_full')
      .select('*')
      .order('sort_order', { ascending: true })

    if (error) throw error
    return MenuAdminMapper.mapMany(data ?? [])
  }
}