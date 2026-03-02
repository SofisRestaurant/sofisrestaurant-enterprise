import { supabase } from '@/lib/supabase/supabaseClient'
import { MenuPublicMapper } from '@/domain/menu/menu.public.mapper'
import type { MenuItemPublic } from './menu.types'

export class MenuPublicService {

  static async getMenuItems(): Promise<MenuItemPublic[]> {
    const { data, error } = await supabase
      .from('menu_items_public')
      .select('*')
      .eq('available', true)
      .order('sort_order', { ascending: true })

    if (error) throw error
    return MenuPublicMapper.mapMany(data ?? [])
  }

  static async getMenuItem(id: string): Promise<MenuItemPublic | null> {
    const { data, error } = await supabase
      .from('menu_items_public')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    return data ? MenuPublicMapper.map(data) : null
  }
}