// src/services/menu.service.ts
// ============================================================================
// MENU SERVICE — Verified against real database.types.ts (Feb 2026)
// ============================================================================
//
// READ  → menu_items_full VIEW  (has modifier_groups: Json | null column)
// WRITE → menu_items TABLE      (no modifier_groups column — not writable there)
//
// Confirmed schema facts:
//   ✅ menu_items_full view EXISTS with modifier_groups Json column
//   ✅ popularity_score column EXISTS (on both table and view)
//   ✅ allergens column EXISTS on menu_items TABLE, NOT in view
//   ✅ getMenuItemWithModifiers() — used by modal before opening
// ============================================================================
import type { MenuCategory } from '@/domain/menu/menu.types'

import { supabase }           from '@/lib/supabase/supabaseClient'
import type { MenuItem }      from '@/domain/menu/menu.types'
import { MenuMapper }         from '@/domain/menu/menu.mapper'
import type { Database } from '@/lib/supabase/database.types'

type MenuItemInsert =
  Database['public']['Tables']['menu_items']['Insert']

type MenuItemUpdate =
  Database['public']['Tables']['menu_items']['Update']
// ─────────────────────────────────────────────────────────────────────────────
// Error class
// ─────────────────────────────────────────────────────────────────────────────

export class MenuServiceError extends Error {
  constructor(message: string, public code?: string, public details?: unknown) {
    super(message)
    this.name = 'MenuServiceError'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Write payload interface
// ─────────────────────────────────────────────────────────────────────────────

export interface MenuItemWritePayload {
  name:                string
  category:            MenuCategory
  price:               number
  description?:        string
  image_url?:          string
  available?:          boolean
  featured?:           boolean
  sort_order?:         number
  spicy_level?:        number
  is_vegan?:           boolean
  is_vegetarian?:      boolean
  is_gluten_free?:     boolean
  allergens?:          string[]
  inventory_count?:    number
  low_stock_threshold?: number
  popularity_score?:   number
  pairs_with?:         string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class MenuService {

  // ── READ — menu_items_full VIEW ─────────────────────────────────────────────

  /** All available items. modifier_groups Json populated by the view. */
  static async getMenuItems(): Promise<MenuItem[]> {
    try {
      const { data, error } = await supabase
        .from('menu_items_full')
        .select('*')
        .eq('available', true)
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true })

      if (error) throw new MenuServiceError('Failed to fetch menu items', error.code, error)
      return MenuMapper.mapMenuItems(data ?? [])
    } catch (err) {
      if (err instanceof MenuServiceError) throw err
      throw new MenuServiceError('Unexpected error loading menu')
    }
  }

  /**
   * Single item with full modifier graph — call this BEFORE opening the modal.
   * Uses menu_items_full view which has the modifier_groups Json column.
   */
  static async getMenuItemWithModifiers(itemId: string): Promise<MenuItem | null> {
    try {
      const { data, error } = await supabase
        .from('menu_items_full')
        .select('*')
        .eq('id', itemId)
        .eq('available', true)
        .maybeSingle()

      if (error) throw new MenuServiceError('Failed to fetch menu item', error.code, error)
      return data ? MenuMapper.mapMenuItem(data) : null
    } catch (err) {
      if (err instanceof MenuServiceError) throw err
      console.error('MenuService.getMenuItemWithModifiers:', err)
      return null
    }
  }

  /** Admin single-item lookup — includes unavailable items */
  static async getMenuItem(itemId: string): Promise<MenuItem | null> {
    try {
      const { data, error } = await supabase
        .from('menu_items_full')
        .select('*')
        .eq('id', itemId)
        .maybeSingle()

      if (error) throw new MenuServiceError('Failed to fetch menu item', error.code, error)
      return data ? MenuMapper.mapMenuItem(data) : null
    } catch (err) {
      if (err instanceof MenuServiceError) throw err
      return null
    }
  }

  static async getMenuItemsByCategory(category: MenuCategory): Promise<MenuItem[]>{
    try {
      const { data, error } = await supabase
        .from('menu_items_full')
        .select('*')
        .eq('category', category)
        .eq('available', true)
        .order('sort_order', { nullsFirst: false })

      if (error) throw new MenuServiceError('Failed to fetch category', error.code, error)
      return MenuMapper.mapMenuItems(data ?? [])
    } catch (err) {
      if (err instanceof MenuServiceError) throw err
      return []
    }
  }

  static async searchMenuItems(query: string): Promise<MenuItem[]> {
    if (!query.trim()) return []
    try {
      const { data, error } = await supabase
        .from('menu_items_full')
        .select('*')
        .eq('available', true)
        .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
        .order('popularity_score', { ascending: false, nullsFirst: false })
        .limit(20)

      if (error) throw new MenuServiceError('Search failed', error.code, error)
      return MenuMapper.mapMenuItems(data ?? [])
    } catch (err) {
      if (err instanceof MenuServiceError) throw err
      return []
    }
  }

  static async getFeaturedItems(): Promise<MenuItem[]> {
    try {
      const { data, error } = await supabase
        .from('menu_items_full')
        .select('*')
        .eq('featured', true)
        .eq('available', true)
        .order('sort_order', { nullsFirst: false })

      if (error) throw new MenuServiceError('Failed to fetch featured', error.code, error)
      return MenuMapper.mapMenuItems(data ?? [])
    } catch (err) {
  console.error('getFeaturedItems failed', err)
  return []
}
  }

  static async getPopularItems(limit = 6): Promise<MenuItem[]> {
  try {
    const { data, error } = await supabase
      .from('menu_items_full')
      .select('*')
      .eq('available', true)
      .order('popularity_score', { ascending: false, nullsFirst: false })
      .limit(limit)

    if (error) {
      throw new MenuServiceError('Failed to fetch popular', error.code, error)
    }

    return MenuMapper.mapMenuItems(data ?? [])
  } catch (err) {
    console.error('getPopularItems failed', err)
    return []
  }
}

  // ── WRITE — menu_items TABLE ────────────────────────────────────────────────

  static async createMenuItem(payload: MenuItemWritePayload): Promise<MenuItem> {
    const insert: MenuItemInsert = {
      name:                payload.name,
      category:            payload.category,
      price:               payload.price,
      description:         payload.description          ?? null,
      image_url:           payload.image_url            ?? null,
      available:           payload.available            ?? true,
      featured:            payload.featured             ?? false,
      sort_order:          payload.sort_order           ?? null,
      spicy_level:         payload.spicy_level          ?? null,
      is_vegan:            payload.is_vegan             ?? null,
      is_vegetarian:       payload.is_vegetarian        ?? null,
      is_gluten_free:      payload.is_gluten_free       ?? null,
      allergens:           payload.allergens            ?? null,
      inventory_count:     payload.inventory_count      ?? null,
      low_stock_threshold: payload.low_stock_threshold  ?? null,
      popularity_score:    payload.popularity_score     ?? null,
      pairs_with:          payload.pairs_with           ?? null,
    }

    const { data, error } = await supabase
      .from('menu_items')
      .insert(insert)
      .select()
      .single()

    if (error) throw new MenuServiceError('Failed to create menu item', error.code, error)

    // Re-fetch from view to return item with modifier_groups populated
    const full = await MenuService.getMenuItemWithModifiers(data.id)
    if (!full) throw new MenuServiceError('Item not found after create')
    return full
  }

  static async updateMenuItem(id: string, payload: Partial<MenuItemWritePayload>): Promise<MenuItem> {
    const update: MenuItemUpdate = {}

    if (payload.name             !== undefined) update.name             = payload.name
    if (payload.category         !== undefined) update.category         = payload.category
    if (payload.price            !== undefined) update.price            = payload.price
    if (payload.description      !== undefined) update.description      = payload.description ?? null
    if (payload.image_url        !== undefined) update.image_url        = payload.image_url ?? null
    if (payload.available        !== undefined) update.available        = payload.available
    if (payload.featured         !== undefined) update.featured         = payload.featured
    if (payload.sort_order       !== undefined) update.sort_order       = payload.sort_order ?? null
    if (payload.spicy_level      !== undefined) update.spicy_level      = payload.spicy_level ?? null
    if (payload.is_vegan         !== undefined) update.is_vegan         = payload.is_vegan ?? null
    if (payload.is_vegetarian    !== undefined) update.is_vegetarian    = payload.is_vegetarian ?? null
    if (payload.is_gluten_free   !== undefined) update.is_gluten_free   = payload.is_gluten_free ?? null
    if (payload.allergens        !== undefined) update.allergens        = payload.allergens ?? null
    if (payload.inventory_count  !== undefined) update.inventory_count  = payload.inventory_count ?? null
    if (payload.low_stock_threshold !== undefined) update.low_stock_threshold = payload.low_stock_threshold ?? null
    if (payload.popularity_score !== undefined) update.popularity_score = payload.popularity_score ?? null
    if (payload.pairs_with       !== undefined) update.pairs_with       = payload.pairs_with ?? null

    const { error } = await supabase
      .from('menu_items')
      .update(update)
      .eq('id', id)

    if (error) throw new MenuServiceError('Failed to update menu item', error.code, error)

    // Re-fetch from view to return updated item with modifiers
    const full = await MenuService.getMenuItemWithModifiers(id)
    if (!full) {
      // Item was set unavailable — fetch without available filter
      const admin = await MenuService.getMenuItem(id)
      if (!admin) throw new MenuServiceError('Item not found after update')
      return admin
    }
    return full
  }

  static async deleteMenuItem(id: string): Promise<void> {
    const { error } = await supabase.from('menu_items').delete().eq('id', id)
    if (error) throw new MenuServiceError('Failed to delete menu item', error.code, error)
  }

  static async toggleAvailability(id: string, available: boolean): Promise<void> {
    const { error } = await supabase
      .from('menu_items')
      .update({ available })
      .eq('id', id)
    if (error) throw new MenuServiceError('Failed to update availability', error.code, error)
  }
}