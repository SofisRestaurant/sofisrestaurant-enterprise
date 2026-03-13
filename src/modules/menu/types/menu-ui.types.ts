// src/types/menu-ui.types.ts
export type MenuTagKey = 'spicy' | 'vegetarian' | 'gluten_free' | 'kids';
export type MenuPriceRangeKey = 'any' | 'under_10' | '10_20' | '20_30' | '30_plus';

export type MenuSortKey =
  | 'recommended'
  | 'featured'
  | 'popular'
  | 'price_low'
  | 'price_high'
  | 'name_az'
  | 'name_za';
