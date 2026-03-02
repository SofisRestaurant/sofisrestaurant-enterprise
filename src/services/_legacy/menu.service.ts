// src/services/_legacy/menu.service.ts
// ============================================================================
// MENU SERVICE (Legacy-compatible, 2026 hardened)
// - READ:  menu_items_public (customer-safe view)
// - READ+: menu_items_admin_full (admin view w/ modifier_groups JSON)
// - WRITE: menu_items table (canonical writable table)
// - Mapper: src/domain/menu/_legacy/menu.mapper.ts (MenuMapper object export)
// ============================================================================

import { supabase } from '@/lib/supabase/supabaseClient'
import type { PostgrestError } from '@supabase/supabase-js'

import { MenuMapper } from '@/domain/menu/_legacy/menu.mapper'
import type { Database, Tables, TablesInsert, TablesUpdate, Enums } from '@/types/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Domain types used by your app (keep aligned with mapper outputs)
// ─────────────────────────────────────────────────────────────────────────────

// These are the mapper's output shapes.
// If you already have MenuItem/MenuCategory types elsewhere, you can swap these
// imports to those types, but the service will work as-is.
export type MenuCategory = Enums<'menu_category'>

export type MenuItem = ReturnType<(typeof MenuMapper)['mapMenuItemPublic']>
export type MenuItemAdmin = ReturnType<(typeof MenuMapper)['mapMenuItemAdmin']>

// Writable shapes
type MenuItemInsert = TablesInsert<'menu_items'>
type MenuItemUpdate = TablesUpdate<'menu_items'>

// View row types
type MenuItemPublicRow = Database['public']['Views']['menu_items_public']['Row']
type MenuItemAdminRow = Database['public']['Views']['menu_items_admin_full']['Row']

// ─────────────────────────────────────────────────────────────────────────────
// Error class
// ─────────────────────────────────────────────────────────────────────────────

export class MenuServiceError extends Error {
  constructor(message: string, public code?: string, public details?: unknown) {
    super(message)
    this.name = 'MenuServiceError'
  }
}

function throwPg(message: string, e: PostgrestError): never {
  throw new MenuServiceError(message, e.code, e)
}

// ─────────────────────────────────────────────────────────────────────────────
// Write payload
// ─────────────────────────────────────────────────────────────────────────────

export interface MenuItemWritePayload {
  name: string
  category: MenuCategory
  price: number // dollars in DB (numeric)
  description?: string | null
  image_url?: string | null
  available?: boolean
  featured?: boolean
  sort_order?: number | null
  spicy_level?: number | null
  is_vegan?: boolean | null
  is_vegetarian?: boolean | null
  is_gluten_free?: boolean | null
  allergens?: string[] | null
  inventory_count?: number | null
  low_stock_threshold?: number | null
  popularity_score?: number | null
  pairs_with?: string[] | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class MenuService {
  // ── READ — PUBLIC VIEW ────────────────────────────────────────────────────

  /** All available items (public). */
  static async getMenuItems(): Promise<MenuItem[]> {
    const { data, error } = await supabase
      .from('menu_items_public')
      .select('*')
      .eq('available', true)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true })

    if (error) throwPg('Failed to fetch menu items', error)

    const rows = (data ?? []) as MenuItemPublicRow[]
    return MenuMapper.mapMenuItemsPublic(rows) as unknown as MenuItem[]
  }

  /** Admin-safe list (includes unavailable). */
  static async getMenuItemsAdmin(): Promise<MenuItemAdmin[]> {
    const { data, error } = await supabase
      .from('menu_items_admin_full')
      .select('*')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true })

    if (error) throwPg('Failed to fetch admin menu items', error)

    const rows = (data ?? []) as MenuItemAdminRow[]
    return MenuMapper.mapMenuItemsAdmin(rows) as unknown as MenuItemAdmin[]
  }

  /**
   * Single item WITH modifiers graph.
   * Uses admin view because that’s where modifier_groups JSON exists.
   */
  static async getMenuItemWithModifiers(itemId: string): Promise<MenuItemAdmin | null> {
    const { data, error } = await supabase
      .from('menu_items_admin_full')
      .select('*')
      .eq('id', itemId)
      .maybeSingle()

    if (error) throwPg('Failed to fetch menu item with modifiers', error)
    if (!data) return null

    return MenuMapper.mapMenuItemAdmin(data as MenuItemAdminRow) as unknown as MenuItemAdmin
  }

  /** Public single-item lookup (includes unavailable = false is handled by caller). */
  static async getMenuItem(itemId: string): Promise<MenuItem | null> {
    const { data, error } = await supabase
      .from('menu_items_public')
      .select('*')
      .eq('id', itemId)
      .maybeSingle()

    if (error) throwPg('Failed to fetch menu item', error)
    if (!data) return null

    return MenuMapper.mapMenuItemPublic(data as MenuItemPublicRow) as unknown as MenuItem
  }

  static async getMenuItemsByCategory(category: MenuCategory): Promise<MenuItem[]> {
    const { data, error } = await supabase
      .from('menu_items_public')
      .select('*')
      .eq('category', category)
      .eq('available', true)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true })

    if (error) throwPg('Failed to fetch category items', error)

    const rows = (data ?? []) as MenuItemPublicRow[]
    return MenuMapper.mapMenuItemsPublic(rows) as unknown as MenuItem[]
  }

  static async searchMenuItems(query: string): Promise<MenuItem[]> {
    const q = query.trim()
    if (!q) return []

    const { data, error } = await supabase
      .from('menu_items_public')
      .select('*')
      .eq('available', true)
      .or(`name.ilike.%${q}%,description.ilike.%${q}%`)
      .order('popularity_score', { ascending: false, nullsFirst: false })
      .limit(20)

    if (error) throwPg('Search failed', error)

    const rows = (data ?? []) as MenuItemPublicRow[]
    return MenuMapper.mapMenuItemsPublic(rows) as unknown as MenuItem[]
  }

  static async getFeaturedItems(): Promise<MenuItem[]> {
    const { data, error } = await supabase
      .from('menu_items_public')
      .select('*')
      .eq('featured', true)
      .eq('available', true)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true })

    if (error) throwPg('Failed to fetch featured items', error)

    const rows = (data ?? []) as MenuItemPublicRow[]
    return MenuMapper.mapMenuItemsPublic(rows) as unknown as MenuItem[]
  }

  static async getPopularItems(limit = 6): Promise<MenuItem[]> {
    const safeLimit = Math.max(1, Math.min(50, limit))

    const { data, error } = await supabase
      .from('menu_items_public')
      .select('*')
      .eq('available', true)
      .order('popularity_score', { ascending: false, nullsFirst: false })
      .limit(safeLimit)

    if (error) throwPg('Failed to fetch popular items', error)

    const rows = (data ?? []) as MenuItemPublicRow[]
    return MenuMapper.mapMenuItemsPublic(rows) as unknown as MenuItem[]
  }

  // ── WRITE — TABLE ─────────────────────────────────────────────────────────

  static async createMenuItem(payload: MenuItemWritePayload): Promise<MenuItemAdmin> {
    const insert: MenuItemInsert = {
      name: payload.name,
      category: payload.category,
      price: payload.price,
      description: payload.description ?? null,
      image_url: payload.image_url ?? null,
      available: payload.available ?? true,
      featured: payload.featured ?? false,
      sort_order: payload.sort_order ?? null,
      spicy_level: payload.spicy_level ?? null,
      is_vegan: payload.is_vegan ?? null,
      is_vegetarian: payload.is_vegetarian ?? null,
      is_gluten_free: payload.is_gluten_free ?? null,
      allergens: payload.allergens ?? null,
      inventory_count: payload.inventory_count ?? null,
      low_stock_threshold: payload.low_stock_threshold ?? null,
      popularity_score: payload.popularity_score ?? null,
      pairs_with: payload.pairs_with ?? null,
    }

    const { data, error } = await supabase
      .from('menu_items')
      .insert(insert)
      .select('id')
      .single()

    if (error) throwPg('Failed to create menu item', error)

    const full = await MenuService.getMenuItemWithModifiers(data.id)
    if (!full) throw new MenuServiceError('Item not found after create')
    return full
  }

  static async updateMenuItem(id: string, payload: Partial<MenuItemWritePayload>): Promise<MenuItemAdmin> {
    const update: MenuItemUpdate = {}

    if (payload.name !== undefined) update.name = payload.name
    if (payload.category !== undefined) update.category = payload.category
    if (payload.price !== undefined) update.price = payload.price
    if (payload.description !== undefined) update.description = payload.description ?? null
    if (payload.image_url !== undefined) update.image_url = payload.image_url ?? null
    if (payload.available !== undefined) update.available = payload.available
    if (payload.featured !== undefined) update.featured = payload.featured
    if (payload.sort_order !== undefined) update.sort_order = payload.sort_order ?? null
    if (payload.spicy_level !== undefined) update.spicy_level = payload.spicy_level ?? null
    if (payload.is_vegan !== undefined) update.is_vegan = payload.is_vegan ?? null
    if (payload.is_vegetarian !== undefined) update.is_vegetarian = payload.is_vegetarian ?? null
    if (payload.is_gluten_free !== undefined) update.is_gluten_free = payload.is_gluten_free ?? null
    if (payload.allergens !== undefined) update.allergens = payload.allergens ?? null
    if (payload.inventory_count !== undefined) update.inventory_count = payload.inventory_count ?? null
    if (payload.low_stock_threshold !== undefined) update.low_stock_threshold = payload.low_stock_threshold ?? null
    if (payload.popularity_score !== undefined) update.popularity_score = payload.popularity_score ?? null
    if (payload.pairs_with !== undefined) update.pairs_with = payload.pairs_with ?? null

    const { error } = await supabase.from('menu_items').update(update).eq('id', id)
    if (error) throwPg('Failed to update menu item', error)

    const full = await MenuService.getMenuItemWithModifiers(id)
    if (!full) throw new MenuServiceError('Item not found after update')
    return full
  }

  static async deleteMenuItem(id: string): Promise<void> {
    const { error } = await supabase.from('menu_items').delete().eq('id', id)
    if (error) throwPg('Failed to delete menu item', error)
  }

  static async toggleAvailability(id: string, available: boolean): Promise<void> {
    const { error } = await supabase.from('menu_items').update({ available }).eq('id', id)
    if (error) throwPg('Failed to update availability', error)
  }
}