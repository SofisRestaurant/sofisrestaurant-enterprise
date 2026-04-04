
export type SelectedModLike = {
  id: string;
  name: string;
  price_adjustment?: number;
  priceAdjustment?: number;
};

export type SelectedByGroup = Record<string, SelectedModLike[]>;