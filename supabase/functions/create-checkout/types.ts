// supabase/functions/create-checkout/types.ts
// =============================================================================
// Authenticated checkout Edge Function types.
// =============================================================================

import { createServiceClient } from "../_shared/supabase.ts";
import type { Database, Json } from "../_shared/database.types.ts";
import type { OrderType } from "../_shared/pricing.ts";
import type { CheckoutUiMode } from "../_shared/checkout-ui-mode.ts";

export type Db = Database;
export type DbClient = ReturnType<typeof createServiceClient>;

export type CheckoutRateLimitInsert =
  Db["public"]["Tables"]["checkout_rate_limits"]["Insert"];

export type CheckoutRateLimitUpdate =
  Db["public"]["Tables"]["checkout_rate_limits"]["Update"];

export type PendingCartInsert =
  & Db["public"]["Tables"]["pending_carts"]["Insert"]
  & {
    pricing_snapshot?: Json;
    pricing_hash?: string | null;
    currency?: string | null;
    consumed_at?: string | null;
    guest_email?: string | null;
    guest_token?: string | null;
    pickup_time?: string | null;
  };

export type PendingCartUpdate =
  & Db["public"]["Tables"]["pending_carts"]["Update"]
  & {
    pricing_snapshot?: Json;
    pricing_hash?: string | null;
    currency?: string | null;
    consumed_at?: string | null;
    loyalty_account_id?: string | null;
    loyalty_reserved_points?: number | null;
    loyalty_discount_cents?: number | null;
    guest_email?: string | null;
    guest_token?: string | null;
  };

export type FraudLogInsert = Db["public"]["Tables"]["fraud_logs"]["Insert"];
export type SecurityEventInsert =
  Db["public"]["Tables"]["security_events"]["Insert"];

export type PromotionTableRow = Db["public"]["Tables"]["promotions"]["Row"];
export type MenuItemTableRow = Db["public"]["Tables"]["menu_items"]["Row"];
export type ModifierTableRow = Db["public"]["Tables"]["modifiers"]["Row"];
export type ModifierGroupTableRow =
  Db["public"]["Tables"]["modifier_groups"]["Row"];
export type MenuItemModifierGroupTableRow =
  Db["public"]["Tables"]["menu_item_modifier_groups"]["Row"];

export type PromotionLookupRow = Pick<
  PromotionTableRow,
  | "id"
  | "code"
  | "type"
  | "value"
  | "min_order_cents"
  | "max_uses"
  | "current_uses"
  | "starts_at"
  | "ends_at"
  | "expires_at"
  | "active"
  | "channel"
  | "per_user_limit"
>;

export type MenuItemLookupRow = Pick<
  MenuItemTableRow,
  "id" | "name" | "image_url" | "category" | "price" | "available"
>;

export type ModifierLookupRow = Pick<
  ModifierTableRow,
  | "id"
  | "modifier_group_id"
  | "name"
  | "price_adjustment"
  | "available"
  | "sort_order"
  | "created_at"
  | "updated_at"
>;

export type ModifierGroupLookupRow = Pick<
  ModifierGroupTableRow,
  | "id"
  | "name"
  | "required"
  | "min_selections"
  | "max_selections"
  | "active"
  | "type"
  | "description"
  | "sort_order"
  | "created_at"
  | "updated_at"
>;

export type MenuItemModifierGroupLookupRow = Pick<
  MenuItemModifierGroupTableRow,
  "id" | "menu_item_id" | "modifier_group_id" | "sort_order"
>;

export type RequestCartModifierInput = {
  id: string;
  groupId: string | null;
};

export type RequestCartItemInput = {
  id: string;
  quantity: number;
  notes: string | null;
  modifiers: RequestCartModifierInput[];
};

export type RequestBody = {
  items: RequestCartItemInput[];
  order_type: OrderType;
  notes: string | null;
  pickup_time?: string | null;
  promo_code: string | null;
  promo_id: string | null;
  credit_id: string | null;
  success_url: string | null;
  cancel_url: string | null;
  client_integrity_hash: string | null;
  loyalty_redeem_points: number | null;
  loyalty_reward_id: string | null;
  loyalty_redemption_id: string | null;
  loyalty_account_id: string | null;
  challenge_token?: string | null;
  guest_email?: string | null;

  /**
   * Stripe Checkout UI mode.
   *
   * Absent or null means the server defaults to hosted mode.
   * Only "hosted" and "embedded" are accepted by request validation.
   */
  ui_mode?: CheckoutUiMode | null;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterMs: number;
  reason: string;
};

export type PromoValidationResult =
  | { valid: true; promoId: string; discountCents: number }
  | { valid: false; error: string };

export type CreditValidationResult =
  | { valid: true; creditId: string; creditCents: number }
  | { valid: false; error: string };

export type JsonObject = { [key: string]: Json | undefined };

export type ReusablePendingCartRow = {
  id: string;
  stripeSessionId: string;
  expiresAt: string | null;
  pricingHash: string | null;
  currency: string | null;
};

export type ErrorCode =
  | "auth_not_permitted"
  | "authorization_required"
  | "body_read_failed"
  | "body_too_large"
  | "checkout_blocked"
  | "credit_invalid"
  | "discount_conflict"
  | "empty_body"
  | "internal_error"
  | "invalid_json"
  | "invalid_token"
  | "invalid_ui_mode"
  | "line_items_failed"
  | "loyalty_cooldown"
  | "loyalty_daily_limit"
  | "loyalty_order_limit"
  | "loyalty_reserve_conflict"
  | "method_not_allowed"
  | "origin_not_allowed"
  | "otp_required"
  | "pending_cart_persist_failed"
  | "pricing_failed"
  | "pricing_hash_failed"
  | "pricing_integrity_failed"
  | "promo_invalid"
  | "rate_limited"
  | "recent_order_exists"
  | "service_unavailable"
  | "stripe_session_failed"
  | "unsupported_content_type"
  | "validation_failed";

export type SuccessCode =
  | "checkout_session_created"
  | "checkout_session_reused";