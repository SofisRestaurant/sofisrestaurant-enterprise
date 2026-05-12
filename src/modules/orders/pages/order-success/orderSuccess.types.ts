// src/modules/orders/pages/order-success/orderSuccess.types.ts
// Page-local types for the OrderSuccess feature.
// Do not promote to shared domain types — these are specific to the
// success-page polling / loyalty pipeline and are intentionally scoped here.

export type PageState = 'loading' | 'found' | 'timeout' | 'error';
export type OrderServiceType = 'pickup' | 'delivery' | 'dine_in';

export type LoyaltyTxV2 = {
  entry_type: 'earn' | 'redeem' | 'bonus' | 'expired' | 'adjustment';
  amount: number;
  balance_after: number;
  tier_at_time: string;
  streak_at_time: number;
  created_at: string;
  source: string;
  reference_id: string | null;
  metadata: Record<string, unknown> | null;
};

export type LoyaltyAccountSnap = {
  balance: number;
  lifetime_earned: number;
  tier: string;
  streak: number;
  updated_at: string;
};

export type LoyaltyForOrderMeta = {
  requestId?: string;
  ts?: string;
  v2Found?: boolean;
  usedHeuristic?: boolean;
  matchMethod?: 'reference_id' | 'metadata.order_id' | 'idempotency_key' | 'heuristic' | 'none';
  legacy?: {
    v1Found: boolean;
    points_delta?: number;
    points_balance?: number;
    created_at?: string;
  };
};

export type LoyaltyForOrderResp = {
  ok?: boolean;
  loyalty?: LoyaltyTxV2 | null;
  account?: LoyaltyAccountSnap | null;
  meta?: LoyaltyForOrderMeta;
  error?: unknown;
  code?: unknown;
};

export type GetOrderResp = {
  ok?: boolean;
  order?: Record<string, unknown> | null;
  pending?: boolean;
  error?: unknown;
  code?: unknown;
};

export type UnknownRecord = Record<string, unknown>;
export type TimeoutHandle = ReturnType<typeof setTimeout>;