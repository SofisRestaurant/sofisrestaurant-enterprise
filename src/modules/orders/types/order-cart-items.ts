export type StoredOrderCartItemModifier = {
  id: string;
  groupId: string | null;
  name: string;
  priceAdjustmentCents: number;
};

export type StoredOrderCartItem = {
  menuItemId: string;
  name: string;
  quantity: number;
  notes: string | null;
  modifiers: StoredOrderCartItemModifier[];
  unitPriceCents: number;
  lineTotalCents: number;
  category: string | null;
  imageUrl: string | null;
  pricingHash: string | null;
};

export type StoredOrderCartItems = StoredOrderCartItem[];