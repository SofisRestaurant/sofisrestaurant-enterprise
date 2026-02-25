import type {
  Tables,
  TablesInsert,
  TablesUpdate,
} from '@/lib/supabase/types'

/* =========================================================
   DATABASE SOURCE OF TRUTH
========================================================= */

export type MenuItemRow = Tables<'menu_items'>
export type MenuItemInsert = TablesInsert<'menu_items'>
export type MenuItemUpdate = TablesUpdate<'menu_items'>

/* =========================================================
   UI CATEGORY UNION
   Controlled vocabulary for frontend filtering
========================================================= */

export const MENU_CATEGORIES = [
  'appetizers',
  'entrees',
  'desserts',
  'drinks',
] as const

export type MenuCategory = (typeof MENU_CATEGORIES)[number]

/* =========================================================
   UI DIETARY / BADGE ABSTRACTION
   Presentation helpers (NOT DB)
========================================================= */

export interface DietaryInfo {
  vegetarian?: boolean
  vegan?: boolean
  gluten_free?: boolean
  dairy_free?: boolean
  spicy?: boolean
  allergens?: string[]
}

/* =========================================================
   APPLICATION MODEL
   What the app guarantees exists after mapping
========================================================= */

export interface MenuItem extends MenuItemRow {
  /**
   * Runtime guarantees added by mapper
   */
  available: boolean

  /**
   * Optional visual helpers
   */
  featured?: boolean
  image_url?: string
  allergens?: string[]

  /**
   * Derived / marketing / AI tags
   */
  dietary_info?: DietaryInfo
}

/* =========================================================
   ADMIN / FORM TYPES
========================================================= */

export interface MenuItemFormData {
  name: string
  description: string | null
  price: number
  category: MenuCategory
}

/* =========================================================
   TYPE GUARDS
   Prevents "string is not assignable"
========================================================= */

export function isMenuCategory(value: string): value is MenuCategory {
  return (MENU_CATEGORIES as readonly string[]).includes(value)
}