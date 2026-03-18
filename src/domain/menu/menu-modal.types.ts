// =============================================================================
// PATH: src/domain/menu/menu-modal.types.ts
// =============================================================================
// Types scoped to the MenuItemModal feature.
// MenuItemPublic itself lives in menu.types.ts — import from there.
// =============================================================================

export type CartPhase = 'idle' | 'adding' | 'success';

export type ModifierGroupType = 'radio' | 'checkbox';

export type ModifierLike = {
  id: string;
  name: string;
  price_adjustment: number;
  available: boolean;
  sort_order?: number | null;
};

export type ModifierGroupLike = {
  id: string;
  name: string;
  description: string | null;
  type: ModifierGroupType;
  required: boolean;
  min_selections: number | null;
  max_selections: number | null;
  sort_order?: number | null;
  active: boolean;

  // UI expects this:
  modifiers: ModifierLike[];

  // DB may send this instead:
  selections?: ModifierLike[];
};

export type SelectedModifier = {
  id: string;
  name: string;
  priceAdjustment: number; // cents
  groupId: string;
};

export type PreflightOk = {
  ok: true;
  item_id: string;
  available: boolean;
  unit_price_cents: number;
  stock_count: number | null;
  low_stock_threshold: number | null;
  max_qty: number;
};

export type PreflightErr = { ok: false; error: string };

export type PreflightResponse = PreflightOk | PreflightErr;