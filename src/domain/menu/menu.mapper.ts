// src/domain/menu/menu.mapper.ts
// Maps backend DTOs to frontend domain types
// Protects UI from backend changes

import type {
  MenuItemDTO,
  ModifierGroupDTO,
  ModifierDTO,
} from '@/contracts/menu.contract';

import type {
  MenuItem,
  ModifierGroup,
  Modifier,
} from '@/types/menu';

export class MenuMapper {
  /**
   * Transform backend modifier to domain model
   */
  static mapModifier(dto: ModifierDTO): Modifier {
    return {
      id: dto.id,
      modifier_group_id: dto.modifier_group_id,
      name: dto.name,
      price_adjustment: Number(dto.price_adjustment),
      available: dto.available,
      sort_order: dto.sort_order,
    };
  }

  /**
   * Transform backend modifier group to domain model
   */
  static mapModifierGroup(dto: ModifierGroupDTO): ModifierGroup {
    return {
      id: dto.id,
      name: dto.name,
      description: dto.description || undefined,
      type: dto.type,
      min_selections: dto.min_selections,
      max_selections: dto.max_selections,
      required: dto.required,
      sort_order: dto.sort_order,
      modifiers: dto.modifiers.map((m) => this.mapModifier(m)),
    };
  }

  /**
   * Transform backend menu item to domain model
   */
  static mapMenuItem(dto: MenuItemDTO): MenuItem {
    return {
      id: dto.id,
      name: dto.name,
      description: dto.description || undefined,
      price: Number(dto.price),
      image_url: dto.image_url || undefined,
      category: this.validateCategory(dto.category),
      featured: dto.featured,
      available: dto.available,
      sort_order: dto.sort_order,

      spicy_level: dto.spicy_level || undefined,
      is_vegetarian: dto.is_vegetarian,
      is_vegan: dto.is_vegan,
      is_gluten_free: dto.is_gluten_free,
      allergens: dto.allergens,

      inventory_count: dto.inventory_count || undefined,
      low_stock_threshold: dto.low_stock_threshold,

      popularity_score: dto.popularity_score,
      pairs_with: dto.pairs_with || undefined,

      modifier_groups:
        dto.modifier_groups?.map((g) =>
          this.mapModifierGroup(g)
        ) || [],

      created_at: dto.created_at,
      updated_at: dto.updated_at,
    };
  }

  /**
   * Batch transform menu items
   */
  static mapMenuItems(dtos: MenuItemDTO[]): MenuItem[] {
    return dtos.map((dto) => this.mapMenuItem(dto));
  }

  /**
   * Validate and cast category
   */
  private static isValidCategory(
    value: string
  ): value is MenuItem['category'] {
    const validCategories = [
      'appetizers',
      'entrees',
      'desserts',
      'drinks',
    ] as const;

    return validCategories.includes(
      value as (typeof validCategories)[number]
    );
  }

  private static validateCategory(
    category: string
  ): MenuItem['category'] {
    if (this.isValidCategory(category)) {
      return category;
    }

    console.warn(
      `Invalid category: ${category}, defaulting to 'entrees'`
    );

    return 'entrees';
  }
}
