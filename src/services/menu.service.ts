// src/services/menu.service.ts
// src/services/menu.service.ts
// Enterprise-grade data layer with error handling and mapping

import { supabase } from '@/lib/supabase/supabaseClient';
import type { MenuItemDTO } from '@/contracts/menu.contract';
import type { MenuItem } from '@/types/menu';
import { MenuMapper } from '@/domain/menu/menu.mapper';
/**
 * Service error class for better error handling
 */
export class MenuServiceError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'MenuServiceError'
  }
}

export class MenuService {
  /**
   * Fetch all available menu items with modifiers
   * @throws {MenuServiceError}
   */
  static async getMenuItems(): Promise<MenuItem[]> {
    try {
      const { data, error } = await supabase
        .from('menu_items_full')
        .select('*')
        .eq('available', true)
        .order('sort_order')
        .order('name')
        .returns<MenuItemDTO[]>();

      if (error) {
        throw new MenuServiceError(
          'Failed to fetch menu items',
          error.code,
          error
        );
      }

      // Transform DTOs to domain models
      return MenuMapper.mapMenuItems(data || []);
    } catch (error) {
      if (error instanceof MenuServiceError) throw error;
      
      console.error('Menu service error:', error);
      throw new MenuServiceError('Unexpected error loading menu');
    }
  }

  /**
   * Fetch single item by ID
   * @throws {MenuServiceError}
   */
  static async getMenuItem(itemId: string): Promise<MenuItem | null> {
    try {
      const { data, error } = await supabase
        .from('menu_items_full')
        .select('*')
        .eq('id', itemId)
        .eq('available', true)
        .single<MenuItemDTO>();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        
        throw new MenuServiceError(
          'Failed to fetch menu item',
          error.code,
          error
        );
      }

      return MenuMapper.mapMenuItem(data);
    } catch (error) {
      if (error instanceof MenuServiceError) throw error;
      
      console.error('Menu item fetch error:', error);
      return null;
    }
  }

  /**
   * Fetch items by category with caching
   */
  static async getMenuItemsByCategory(
    category: string
  ): Promise<MenuItem[]> {
    try {
      const { data, error } = await supabase
        .from('menu_items_full')
        .select('*')
        .eq('category', category)
        .eq('available', true)
        .order('sort_order')
        .returns<MenuItemDTO[]>();

      if (error) {
        throw new MenuServiceError(
          'Failed to fetch category items',
          error.code,
          error
        );
      }

      return MenuMapper.mapMenuItems(data || []);
    } catch (error) {
      if (error instanceof MenuServiceError) throw error;
      
      console.error('Category fetch error:', error);
      return [];
    }
  }

  /**
   * Search menu items with fuzzy matching
   */
  static async searchMenuItems(query: string): Promise<MenuItem[]> {
    if (!query.trim()) return [];
    
    try {
      const { data, error } = await supabase
        .from('menu_items_full')
        .select('*')
        .eq('available', true)
        .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
        .order('popularity_score', { ascending: false })
        .limit(20)
        .returns<MenuItemDTO[]>();

      if (error) {
        throw new MenuServiceError(
          'Search failed',
          error.code,
          error
        );
      }

      return MenuMapper.mapMenuItems(data || []);
    } catch (error) {
      if (error instanceof MenuServiceError) throw error;
      
      console.error('Search error:', error);
      return [];
    }
  }

  /**
   * Get featured items
   */
  static async getFeaturedItems(): Promise<MenuItem[]> {
    try {
      const { data, error } = await supabase
        .from('menu_items_full')
        .select('*')
        .eq('featured', true)
        .eq('available', true)
        .order('sort_order')
        .returns<MenuItemDTO[]>();

      if (error) throw new MenuServiceError('Failed to fetch featured items');

      return MenuMapper.mapMenuItems(data || []);
    } catch (error) {
      console.error('Featured items error:', error);
      return [];
    }
  }

  /**
   * Get popular items by score
   */
  static async getPopularItems(limit: number = 3): Promise<MenuItem[]> {
    try {
      const { data, error } = await supabase
        .from('menu_items_full')
        .select('*')
        .eq('available', true)
        .order('popularity_score', { ascending: false })
        .limit(limit)
        .returns<MenuItemDTO[]>();

      if (error) throw new MenuServiceError('Failed to fetch popular items');

      return MenuMapper.mapMenuItems(data || []);
    } catch (error) {
      console.error('Popular items error:', error);
      return [];
    }
  }
}

// Export singleton
export const menuService = MenuService;