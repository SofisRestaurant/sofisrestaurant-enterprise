// src/services/menu.service.ts
// ============================================================================
// MENU SERVICE — Complete CRUD layer
// ============================================================================
// Schema: menu_items table (database.types.ts)
//   Columns: id, name, category, price, available, featured, description,
//            image_url, allergens, is_vegan, is_vegetarian, is_gluten_free,
//            spicy_level, sort_order, created_at
//
// Methods:
//   getMenuItems()               — all available items
//   getMenuItem(id)              — single item by id
//   getMenuItemsByCategory(cat)  — items filtered by category
//   searchMenuItems(query)       — name/description fuzzy search
//   getFeaturedItems()           — featured items
//   getPopularItems(limit)       — top N featured items
//   createMenuItem(payload)      — INSERT new item
//   updateMenuItem(id, payload)  — UPDATE existing item
//   deleteMenuItem(id)           — DELETE (hard) item
//   toggleAvailability(id, bool) — flip available flag
// ============================================================================

import { supabase }         from '@/lib/supabase/supabaseClient'
import type { MenuItemDTO } from '@/contracts/menu.contract'
import type { MenuItem }    from '@/types/menu'
import { MenuMapper }       from '@/domain/menu/menu.mapper'
import type { Database }    from '@/lib/supabase/database.types'

// ─────────────────────────────────────────────────────────────────────────────
// Error class
// ─────────────────────────────────────────────────────────────────────────────

export class MenuServiceError extends Error {
  constructor(
    message: string,
    public code?:    string,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'MenuServiceError'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

type MenuItemInsert = Database['public']['Tables']['menu_items']['Insert']
type MenuItemUpdate = Database['public']['Tables']['menu_items']['Update']

// Subset used by AdminMenuEditor create/update form
export interface MenuItemWritePayload {
  name:          string
  category:      string
  price:         number
  description?:  string
  image_url?:    string
  available?:    boolean
  featured?:     boolean
  sort_order?:   number
  spicy_level?:  number
  is_vegan?:     boolean
  is_vegetarian?: boolean
  is_gluten_free?: boolean
  allergens?:    string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Service class
// ─────────────────────────────────────────────────────────────────────────────

export class MenuService {

  // ── READ ────────────────────────────────────────────────────────────────────

  static async getMenuItems(): Promise<MenuItem[]> {
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('available', true)
        .order('sort_order', { nullsFirst: false })
        .order('name')
        .returns<MenuItemDTO[]>()

      if (error) throw new MenuServiceError('Failed to fetch menu items', error.code, error)
      return MenuMapper.mapMenuItems(data ?? [])
    } catch (err) {
      if (err instanceof MenuServiceError) throw err
      console.error('Menu service error:', err)
      throw new MenuServiceError('Unexpected error loading menu')
    }
  }

  static async getMenuItem(itemId: string): Promise<MenuItem | null> {
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('id', itemId)
        .eq('available', true)
        .single<MenuItemDTO>()

      if (error) {
        if (error.code === 'PGRST116') return null
        throw new MenuServiceError('Failed to fetch menu item', error.code, error)
      }
      return MenuMapper.mapMenuItem(data)
    } catch (err) {
      if (err instanceof MenuServiceError) throw err
      console.error('Menu item fetch error:', err)
      return null
    }
  }

  static async getMenuItemsByCategory(category: string): Promise<MenuItem[]> {
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('category', category)
        .eq('available', true)
        .order('sort_order', { nullsFirst: false })
        .returns<MenuItemDTO[]>()

      if (error) throw new MenuServiceError('Failed to fetch category items', error.code, error)
      return MenuMapper.mapMenuItems(data ?? [])
    } catch (err) {
      if (err instanceof MenuServiceError) throw err
      console.error('Category fetch error:', err)
      return []
    }
  }

  static async searchMenuItems(query: string): Promise<MenuItem[]> {
    if (!query.trim()) return []
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('available', true)
        .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
        .order('sort_order', { nullsFirst: false })
        .limit(20)
        .returns<MenuItemDTO[]>()

      if (error) throw new MenuServiceError('Search failed', error.code, error)
      return MenuMapper.mapMenuItems(data ?? [])
    } catch (err) {
      if (err instanceof MenuServiceError) throw err
      console.error('Search error:', err)
      return []
    }
  }

  static async getFeaturedItems(): Promise<MenuItem[]> {
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('featured', true)
        .eq('available', true)
        .order('sort_order', { nullsFirst: false })
        .returns<MenuItemDTO[]>()

      if (error) throw new MenuServiceError('Failed to fetch featured items', error.code, error)
      return MenuMapper.mapMenuItems(data ?? [])
    } catch (err) {
      console.error('Featured items error:', err)
      return []
    }
  }

  static async getPopularItems(limit = 3): Promise<MenuItem[]> {
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('available', true)
        .eq('featured', true)
        .order('sort_order', { nullsFirst: false })
        .limit(limit)
        .returns<MenuItemDTO[]>()

      if (error) throw new MenuServiceError('Failed to fetch popular items', error.code, error)
      return MenuMapper.mapMenuItems(data ?? [])
    } catch (err) {
      console.error('Popular items error:', err)
      return []
    }
  }

  // ── WRITE ───────────────────────────────────────────────────────────────────

  /**
   * Create a new menu item.
   * Defaults: available = true, featured = false.
   */
  static async createMenuItem(payload: MenuItemWritePayload): Promise<MenuItem> {
    const insert: MenuItemInsert = {
      name:          payload.name,
      category:      payload.category,
      price:         payload.price,
      description:   payload.description   ?? null,
      image_url:     payload.image_url     ?? null,
      available:     payload.available     ?? true,
      featured:      payload.featured      ?? false,
      sort_order:    payload.sort_order    ?? null,
      spicy_level:   payload.spicy_level   ?? null,
      is_vegan:      payload.is_vegan      ?? null,
      is_vegetarian: payload.is_vegetarian ?? null,
      is_gluten_free: payload.is_gluten_free ?? null,
      allergens:     payload.allergens     ?? null,
    }

    const { data, error } = await supabase
      .from('menu_items')
      .insert(insert)
      .select()
      .single<MenuItemDTO>()

    if (error) throw new MenuServiceError('Failed to create menu item', error.code, error)
    return MenuMapper.mapMenuItem(data)
  }

  /**
   * Update an existing menu item by ID.
   * Only the fields supplied in payload are updated.
   */
  static async updateMenuItem(
    id:      string,
    payload: Partial<MenuItemWritePayload>,
  ): Promise<MenuItem> {
    const update: MenuItemUpdate = {}

    if (payload.name          !== undefined) update.name          = payload.name
    if (payload.category      !== undefined) update.category      = payload.category
    if (payload.price         !== undefined) update.price         = payload.price
    if (payload.description   !== undefined) update.description   = payload.description
    if (payload.image_url     !== undefined) update.image_url     = payload.image_url
    if (payload.available     !== undefined) update.available     = payload.available
    if (payload.featured      !== undefined) update.featured      = payload.featured
    if (payload.sort_order    !== undefined) update.sort_order    = payload.sort_order
    if (payload.spicy_level   !== undefined) update.spicy_level   = payload.spicy_level
    if (payload.is_vegan      !== undefined) update.is_vegan      = payload.is_vegan
    if (payload.is_vegetarian !== undefined) update.is_vegetarian = payload.is_vegetarian
    if (payload.is_gluten_free !== undefined) update.is_gluten_free = payload.is_gluten_free
    if (payload.allergens     !== undefined) update.allergens     = payload.allergens

    const { data, error } = await supabase
      .from('menu_items')
      .update(update)
      .eq('id', id)
      .select()
      .single<MenuItemDTO>()

    if (error) throw new MenuServiceError('Failed to update menu item', error.code, error)
    return MenuMapper.mapMenuItem(data)
  }

  /**
   * Hard-delete a menu item by ID.
   * For soft-delete (set available = false), use toggleAvailability instead.
   */
  static async deleteMenuItem(id: string): Promise<void> {
    const { error } = await supabase
      .from('menu_items')
      .delete()
      .eq('id', id)

    if (error) throw new MenuServiceError('Failed to delete menu item', error.code, error)
  }

  /**
   * Flip the available flag without touching any other fields.
   * Used by the availability checkbox in AdminMenuEditor.
   */
  static async toggleAvailability(id: string, available: boolean): Promise<void> {
    const { error } = await supabase
      .from('menu_items')
      .update({ available })
      .eq('id', id)

    if (error) throw new MenuServiceError('Failed to update availability', error.code, error)
  }
}

export const menuService = MenuService