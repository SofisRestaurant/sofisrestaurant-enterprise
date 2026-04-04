
export type { SelectedModLike, SelectedByGroup } from './pricing.input.types';


export type MoneyUnit = 'cents' | 'dollars';

export type CartItemModifierCompat = {
  id: string;
  groupId: string;
  name: string;
  priceAdjustmentCents: number;
  modifier_group_id?: string;
  group_id?: string;
};


export type CartItemModifierGroupCompat = {
  groupId: string;
  modifier_group_id?: string;
  group_id?: string;
  selections: CartItemModifierCompat[];
};

export type CartItemModifiersCompat = Array<
  CartItemModifierCompat | CartItemModifierGroupCompat
>;

export type StockStatus = 'unknown' | 'in_stock' | 'low_stock' | 'out_of_stock';