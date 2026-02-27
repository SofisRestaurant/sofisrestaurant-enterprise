// src/domain/menu/pricing.ts
// Pure business logic - 100% testable, zero dependencies

import type { 
  MenuItem, 
  ModifierGroup, 
  SelectedModifier, 
  CartItemModifier 
} from '@/types/menu';

/**
 * Validation result with detailed feedback
 */
interface ValidationResult {
  valid: boolean;
  error?: string;
  code?: string;
}

/**
 * All validation errors for a form
 */
interface ValidationErrors {
  valid: boolean;
  errors: Record<string, string>;
}

export class MenuPricingService {
  /**
   * Calculate total price for a menu item with modifiers
   * @returns Rounded to 2 decimal places
   */
  static calculateItemTotal(
    basePrice: number,
    modifiers: CartItemModifier[],
    quantity: number = 1
  ): number {
    if (quantity < 1) {
      console.warn('Invalid quantity, defaulting to 1');
      quantity = 1;
    }

    const modifierTotal = modifiers.reduce((sum, mod) => {
      return sum + mod.selections.reduce((s, sel) => {
        return s + (sel.price_adjustment || 0);
      }, 0);
    }, 0);
    
    return Number(((basePrice + modifierTotal) * quantity).toFixed(2));
  }

  /**
   * Validate a single modifier group selection
   */
  static validateModifierGroup(
    group: ModifierGroup,
    selections: SelectedModifier[]
  ): ValidationResult {
    // Required check
    if (group.required && selections.length === 0) {
      return { 
        valid: false, 
        error: 'This selection is required',
        code: 'REQUIRED_MISSING'
      };
    }
    
    // Non-required but empty is valid
    if (selections.length === 0) {
      return { valid: true };
    }
    
    // Minimum selections
    if (group.min_selections && selections.length < group.min_selections) {
      return { 
        valid: false, 
        error: `Please select at least ${group.min_selections} option${group.min_selections > 1 ? 's' : ''}`,
        code: 'MIN_NOT_MET'
      };
    }
    
    // Maximum selections
    if (group.max_selections && selections.length > group.max_selections) {
      return { 
        valid: false, 
        error: `Maximum ${group.max_selections} selection${group.max_selections > 1 ? 's' : ''} allowed`,
        code: 'MAX_EXCEEDED'
      };
    }
    
    return { valid: true };
  }

  /**
   * Validate all modifier groups for a menu item
   */
  static validateAllModifiers(
    item: MenuItem,
    selectedModifiers: Record<string, SelectedModifier[]>
  ): ValidationErrors {
    const errors: Record<string, string> = {};
    
    if (!item.modifier_groups || item.modifier_groups.length === 0) {
      return { valid: true, errors: {} };
    }
    
    item.modifier_groups.forEach(group => {
      const selections = selectedModifiers[group.id] || [];
      const validation = this.validateModifierGroup(group, selections);
      
      if (!validation.valid && validation.error) {
        errors[group.id] = validation.error;
      }
    });
    
    return {
      valid: Object.keys(errors).length === 0,
      errors
    };
  }

  /**
   * Format price for display with currency
   */
  static formatPrice(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  /**
   * Check if item is low stock
   */
  static isLowStock(item: MenuItem): boolean {
    if (!item.inventory_count) return false;
    return item.inventory_count <= item.low_stock_threshold;
  }

  /**
   * Check if item is out of stock
   */
  static isOutOfStock(item: MenuItem): boolean {
    if (!item.inventory_count) return false;
    return item.inventory_count === 0;
  }

  /**
   * Get urgency message for inventory status
   */
  static getStockMessage(item: MenuItem): string | null {
    if (!item.inventory_count) return null;
    
    const count = item.inventory_count;
    
    if (count === 0) return 'Out of Stock';
    if (count === 1) return 'Only 1 left!';
    if (this.isLowStock(item)) return `Only ${count} left!`;
    
    return null;
  }

  /**
   * Get stock status for display
   */
  static getStockStatus(item: MenuItem): 'available' | 'low' | 'out' {
    if (this.isOutOfStock(item)) return 'out';
    if (this.isLowStock(item)) return 'low';
    return 'available';
  }

  /**
   * Calculate modifier breakdown for display
   */
  static getModifierBreakdown(modifiers: CartItemModifier[]): string {
    if (modifiers.length === 0) return '';
    
    return modifiers
      .filter(mod => mod.selections.length > 0)
      .map(mod => {
        const selections = mod.selections
          .map(sel => {
            const price = sel.price_adjustment > 0 
              ? ` (+${this.formatPrice(sel.price_adjustment)})` 
              : '';
            return `${sel.name}${price}`;
          })
          .join(', ');
        
        return `${mod.group_name}: ${selections}`;
      })
      .join(' • ');
  }

  /**
   * Get short modifier summary for cart
   */
  static getModifierSummary(modifiers: CartItemModifier[]): string {
    if (modifiers.length === 0) return 'No customizations';
    
    const total = modifiers.reduce(
      (sum, mod) => sum + mod.selections.length, 
      0
    );
    
    return `${total} customization${total !== 1 ? 's' : ''}`;
  }

  /**
   * Calculate tax amount
   */
  static calculateTax(subtotal: number, taxRate: number = 0.0875): number {
    return Number((subtotal * taxRate).toFixed(2));
  }

  /**
   * Calculate grand total with tax
   */
  static calculateGrandTotal(subtotal: number, taxRate: number = 0.0875): number {
    return Number((subtotal + this.calculateTax(subtotal, taxRate)).toFixed(2));
  }

  /**
   * Validate special instructions
   */
  static validateSpecialInstructions(text: string): ValidationResult {
    if (text.length > 200) {
      return {
        valid: false,
        error: 'Special instructions must be 200 characters or less',
        code: 'TOO_LONG'
      };
    }
    
    return { valid: true };
  }
}

export const menuPricing = MenuPricingService;