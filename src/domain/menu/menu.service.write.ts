import { supabase } from '@/lib/supabase/supabaseClient'
import type {
  MenuItemInsert,
  MenuItemUpdate,
  MenuItemAdminRow,
} from './menu.db.types'
import type { MenuItemAdmin } from './menu.types'
import { MenuAdminMapper } from './menu.admin.mapper'

export class MenuWriteService {

  // ─────────────────────────────────────────────────────────────────────────
  // CREATE
  // ─────────────────────────────────────────────────────────────────────────

  static async create(
    payload: MenuItemInsert
  ): Promise<MenuItemAdmin> {

    const { data, error } = await supabase
      .from('menu_items')
      .insert(payload)
      .select('*')
      .single()

    if (error) throw error
    if (!data) throw new Error('Create failed')

    return MenuAdminMapper.map(data as MenuItemAdminRow)
  }


  // ─────────────────────────────────────────────────────────────────────────
  // UPDATE
  // ─────────────────────────────────────────────────────────────────────────

  static async update(
    id: string,
    payload: MenuItemUpdate
  ): Promise<MenuItemAdmin> {

    const { data, error } = await supabase
      .from('menu_items')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error
    if (!data) throw new Error('Update failed')

    return MenuAdminMapper.map(data as MenuItemAdminRow)
  }


  // ─────────────────────────────────────────────────────────────────────────
  // DELETE
  // ─────────────────────────────────────────────────────────────────────────

  static async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('menu_items')
      .delete()
      .eq('id', id)

    if (error) throw error
  }
}