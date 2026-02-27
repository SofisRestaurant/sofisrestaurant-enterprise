// src/contracts/menu.contract.ts
// Data Transfer Objects - Exactly what Supabase returns
// Prevents backend changes from silently breaking frontend

/**
 * Raw modifier from database
 */
export interface ModifierDTO {
  id: string;
  modifier_group_id: string;
  name: string;
  price_adjustment: number;
  available: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * Raw modifier group from database
 */
export interface ModifierGroupDTO {
  id: string;
  name: string;
  description: string | null;
  type: 'radio' | 'checkbox' | 'quantity';
  min_selections: number;
  max_selections: number | null;
  required: boolean;
  sort_order: number;
  modifiers: ModifierDTO[];
  created_at: string;
  updated_at: string;
}

/**
 * Raw menu item from database view (menu_items_full)
 */
export interface MenuItemDTO {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  category: string;
  featured: boolean;
  available: boolean;
  sort_order: number;
  
  // Dietary flags
  spicy_level: number | null;
  is_vegetarian: boolean;
  is_vegan: boolean;
  is_gluten_free: boolean;
  allergens?: string[]
  // Inventory
  inventory_count: number | null;
  low_stock_threshold: number;
  
  // Engagement
  popularity_score: number;
  pairs_with: string[] | null;
  
  // From view join
  modifier_groups: ModifierGroupDTO[] | null;
  
  created_at: string;
  updated_at: string;
}

/**
 * Order item structure sent to backend
 */
export interface OrderItemDTO {
  item_id: string;
  name: string;
  quantity: number;
  base_price: number;
  modifiers: {
    id: string;
    name: string;
    price: number;
  }[];
  subtotal: number;
  special_instructions?: string;
}

/**
 * Complete order payload for checkout
 */
export interface CreateOrderDTO {
  items: OrderItemDTO[];
  subtotal: number;
  tax: number;
  total: number;
  customer_email?: string;
  customer_phone?: string;
  delivery_address?: string;
  payment_method: 'card' | 'cash';
  special_instructions?: string;
}