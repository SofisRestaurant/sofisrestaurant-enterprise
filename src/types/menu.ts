// src/types/menu.ts
// Type-safe menu system with strict validation

export type MenuCategory = 'appetizers' | 'entrees' | 'desserts' | 'drinks';

export type ModifierGroupType = 'radio' | 'checkbox' | 'quantity';

export interface Modifier {
  id: string;
  modifier_group_id: string;
  name: string;
  price_adjustment: number;
  available: boolean;
  sort_order: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  description?: string;
  type: ModifierGroupType;
  min_selections: number;
  max_selections: number | null;
  required: boolean;
  sort_order: number;
  modifiers: Modifier[];
}

export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
  category: MenuCategory;
  featured: boolean;
  available: boolean;
  sort_order: number;
  
  // Dietary flags
  spicy_level?: number;
  is_vegetarian: boolean;
  is_vegan: boolean;
  is_gluten_free: boolean;
  allergens?: string[]
  
  // Inventory
  inventory_count?: number;
  low_stock_threshold: number;
  
  // Engagement
  popularity_score: number;
  pairs_with?: string[];
  
  // Modifiers (from database view)
  modifier_groups?: ModifierGroup[];
  
  created_at: string;
  updated_at: string;
}

export interface SelectedModifier {
  id: string;
  name: string;
  price_adjustment: number;
}

export interface CartItemModifier {
  group_id: string;
  group_name: string;
  selections: SelectedModifier[];
}

export interface CartItem {
  item_id: string;
  name: string;
  quantity: number;
  base_price: number;
  modifiers: CartItemModifier[];
  subtotal: number;
  special_instructions?: string;
  image_url?: string;
}

// Validation helpers
export const isValidModifierSelection = (
  group: ModifierGroup,
  selections: SelectedModifier[]
): { valid: boolean; error?: string } => {
  if (group.required && selections.length === 0) {
    return { valid: false, error: 'This selection is required' };
  }
  
  if (group.min_selections && selections.length < group.min_selections) {
    return { 
      valid: false, 
      error: `Please select at least ${group.min_selections}` 
    };
  }
  
  if (group.max_selections && selections.length > group.max_selections) {
    return { 
      valid: false, 
      error: `Maximum ${group.max_selections} selections allowed` 
    };
  }
  
  return { valid: true };
};

export const calculateItemPrice = (
  basePrice: number,
  modifiers: CartItemModifier[],
  quantity: number = 1
): number => {
  const modifierTotal = modifiers.reduce((sum, mod) => {
    return sum + mod.selections.reduce((s, sel) => s + sel.price_adjustment, 0);
  }, 0);
  
  return (basePrice + modifierTotal) * quantity;
};